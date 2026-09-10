"""Load HPO annotations and rank diseases for extracted phenotype terms."""

import math
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DiseaseCatalog:
    """Disease profiles and statistics that are expensive to recompute."""

    profiles: dict
    term_frequency: dict

    def __len__(self):
        return len(self.profiles)


def load_disease_profiles(annotation_path):
    """Return disease profiles from a tab-separated phenotype.hpoa file."""
    annotations = defaultdict(dict)
    path = Path(annotation_path)
    if not path.exists():
        return DiseaseCatalog({}, {})

    with path.open("r", encoding="utf-8") as annotation_file:
        for line in annotation_file:
            if not line.strip() or line.startswith(("#", "database_id\t")):
                continue
            columns = line.rstrip("\n").split("\t")
            if len(columns) < 4:
                continue

            disease_id, disease_name, qualifier, hpo_id = columns[:4]
            if "NOT" in qualifier.split("|"):
                continue

            disease_key = (disease_id, disease_name)
            annotations[disease_key][hpo_id] = {
                "reference": columns[4].strip() if len(columns) > 4 else "",
                "evidence": columns[5].strip() if len(columns) > 5 else "",
                "onset": columns[6].strip() if len(columns) > 6 else "",
                "frequency": columns[7].strip() if len(columns) > 7 else "",
                "sex": columns[8].strip().upper() if len(columns) > 8 else "",
            }

    profiles = dict(annotations)
    term_frequency = defaultdict(int)
    for profile in profiles.values():
        for hpo_id in profile:
            term_frequency[hpo_id] += 1

    return DiseaseCatalog(profiles, dict(term_frequency))


def _frequency_factor(value):
    """Convert HPO frequency IDs, fractions, and percentages to a score factor."""
    if not value:
        return 1.0
    frequency_terms = {
        "HP:0040281": 1.25,  # Very frequent
        "HP:0040282": 1.15,  # Frequent
        "HP:0040283": 0.95,  # Occasional
        "HP:0040284": 0.75,  # Very rare
    }
    if value in frequency_terms:
        return frequency_terms[value]
    percentage = re.fullmatch(r"(\d+(?:\.\d+)?)%", value)
    if percentage:
        return 0.75 + float(percentage.group(1)) / 100 * 0.5
    fraction = re.fullmatch(r"(\d+)\s*/\s*(\d+)", value)
    if fraction and int(fraction.group(2)):
        return 0.75 + (int(fraction.group(1)) / int(fraction.group(2))) * 0.5
    return 1.0


def _onset_compatible(onset, patient_age):
    if not onset or patient_age is None:
        return True
    maximum_age = {
        "HP:0030674": 1,
        "HP:0011461": 1,
        "HP:0034197": 1,
        "HP:0003577": 1,
        "HP:0003623": 1,
        "HP:0003593": 5,
        "HP:0011463": 16,
        "HP:0003621": 18,
        "HP:0011462": 40,
        "HP:0003581": 120,
        "HP:0003596": 120,
        "HP:0003584": 120,
        "HP:0025708": 30,
        "HP:0025709": 40,
        "HP:0025710": 40,
    }
    return patient_age <= maximum_age.get(onset, 120)


def rank_diseases(
    matched_terms,
    disease_profiles,
    term_names=None,
    limit=10,
    patient_age=None,
    patient_sex=None,
    absent_terms=None,
):
    """Rank profiles using information-weighted Jaccard similarity."""
    if not matched_terms or not disease_profiles:
        return []

    term_names = term_names or {}
    absent_terms = absent_terms or []
    term_ids = {term["id"] for term, _ in matched_terms}
    absent_ids = {term["id"] for term, _ in absent_terms}
    if isinstance(disease_profiles, DiseaseCatalog):
        profiles = disease_profiles.profiles
        frequency = disease_profiles.term_frequency
    else:
        profiles = disease_profiles
        frequency = defaultdict(int)
        for profile in profiles.values():
            for hpo_id in profile:
                frequency[hpo_id] += 1

    disease_count = len(profiles)

    def weight(hpo_id):
        return math.log((disease_count + 1) / (frequency.get(hpo_id, 0) + 1)) + 1

    total_weight = sum(weight(term_id) for term_id in term_ids)
    ranked = []
    for (disease_id, disease_name), profile in profiles.items():
        profile_ids = set(profile)
        matched_ids = term_ids & profile_ids
        if not matched_ids:
            continue

        matched_breakdown = []
        for term, _ in matched_terms:
            if term["id"] not in matched_ids:
                continue
            annotation = profile[term["id"]]
            frequency_factor = _frequency_factor(annotation["frequency"])
            matched_breakdown.append(
                {
                    "id": term["id"],
                    "name": term["name"],
                    "frequency": annotation["frequency"],
                    "frequency_factor": round(frequency_factor, 3),
                    "information_weight": round(weight(term["id"]), 3),
                    "reference": annotation["reference"],
                    "evidence": annotation["evidence"],
                    "onset": annotation["onset"],
                    "sex": annotation["sex"],
                }
            )
        matched_weight = sum(
            item["information_weight"] * item["frequency_factor"] for item in matched_breakdown
        )
        union_weight = total_weight + sum(weight(term_id) for term_id in profile_ids - term_ids)
        matched = [
            {"id": term["id"], "name": term["name"]}
            for term, _ in matched_terms
            if term["id"] in matched_ids
        ]
        missing = [
            {"id": hpo_id, "name": term_names.get(hpo_id, hpo_id)}
            for hpo_id in profile
            if hpo_id not in term_ids
        ][:8]
        matched_annotations = [profile[hpo_id] for hpo_id in matched_ids]
        onset_mismatch = bool(
            patient_age is not None
            and matched_annotations
            and all(
                not _onset_compatible(annotation["onset"], patient_age)
                for annotation in matched_annotations
            )
        )
        sex_mismatch = bool(
            patient_sex
            and any(
                annotation["sex"] in {"MALE", "FEMALE"} and annotation["sex"] != patient_sex
                for annotation in matched_annotations
            )
        )
        absent_expected = [
            {"id": term_id, "name": term_names.get(term_id, term_id)}
            for term_id in absent_ids & profile_ids
        ]
        absent_penalty = 0.8 ** min(len(absent_expected), 3)
        adjustment = (
            (0.7 if onset_mismatch else 1.0) * (0.7 if sex_mismatch else 1.0) * absent_penalty
        )
        flags = ["onset mismatch"] if onset_mismatch else []
        flags += ["sex-limited feature mismatch"] if sex_mismatch else []
        if absent_expected:
            flags.append("explicitly absent expected feature")
        ranked.append(
            {
                "id": disease_id,
                "name": disease_name,
                "score": round((matched_weight / union_weight) * adjustment, 4),
                "matched_terms": matched,
                "missing_term_ids": missing,
                "expected_terms": [
                    {"id": hpo_id, "name": term_names.get(hpo_id, hpo_id)} for hpo_id in profile
                ][:30],
                "matched_breakdown": matched_breakdown,
                "absent_expected": absent_expected,
                "flags": flags,
                "why_ranked": f"{len(matched_ids)} matched feature(s); {len(absent_expected)} explicitly absent expected feature(s).",
            }
        )

    ranked.sort(key=lambda disease: disease["score"], reverse=True)
    return ranked[:limit]
