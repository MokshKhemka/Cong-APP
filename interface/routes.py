"""HTTP routes and response presentation for the clinical analysis app."""

import json
import re
from datetime import datetime, timezone
from urllib.parse import quote_plus

from flask import Blueprint, jsonify, render_template, request

from application.disease_ranker import rank_diseases
from application.extractor import extract_symptoms
from infrastructure import BASE_DIR, search_symptoms

FEEDBACK_PATH = BASE_DIR / "feedback.jsonl"
MAX_TEXT_LENGTH = 10_000
MAX_EXCLUDED_TERMS = 100
HPO_ID_PATTERN = re.compile(r"HP:\d{7}\Z")

SYSTEM_KEYWORDS = {
    "neurologic": (
        "brain",
        "cerebral",
        "seizure",
        "epilep",
        "neurolog",
        "developmental",
        "ataxia",
        "tremor",
        "intellectual disability",
    ),
    "cardiac": (
        "heart",
        "cardiac",
        "cardiomyopathy",
        "arrhythmia",
        "aortic",
        "ventricular",
    ),
    "skeletal": (
        "bone",
        "skeletal",
        "joint",
        "limb",
        "scoliosis",
        "short stature",
        "hypermobility",
    ),
    "ocular": (
        "eye",
        "ocular",
        "vision",
        "retinal",
        "optic",
        "strabismus",
        "hypertelorism",
    ),
    "immune": (
        "immune",
        "immunodeficien",
        "infection",
        "inflammation",
        "autoimmune",
    ),
    "skin": ("skin", "cutaneous", "dermal", "lax", "rash", "pigment", "hair"),
    "renal": ("kidney", "renal", "urinary", "nephro"),
    "gastrointestinal": (
        "intestinal",
        "bowel",
        "gastro",
        "liver",
        "hepatic",
        "pancreatic",
    ),
}

SPECIALTY_RULES = (
    (
        ("epilep", "seizure", "encephal", "ataxia", "neurolog", "intellectual"),
        "Neurology / medical genetics",
    ),
    (
        ("heart", "cardiac", "cardiomyopathy", "aortic", "arrhythmia"),
        "Cardiology / medical genetics",
    ),
    (("immune", "immunodefic", "inflammation"), "Immunology / rheumatology"),
    (("renal", "kidney", "nephro"), "Nephrology / medical genetics"),
    (
        ("skeletal", "bone", "cartilage", "short stature"),
        "Orthopedics / medical genetics",
    ),
)


def _read_text(payload, field, *, required=False):
    value = payload.get(field, "")
    if not isinstance(value, str):
        return None, f"{field} must be a string."
    value = value.strip()
    if required and not value:
        return None, f"JSON field '{field}' is required."
    if len(value) > MAX_TEXT_LENGTH:
        return None, f"{field} must be at most {MAX_TEXT_LENGTH:,} characters."
    return value, None


def _read_patient_context(payload):
    patient_age = payload.get("patient_age")
    if patient_age is not None:
        try:
            patient_age = float(patient_age)
        except (TypeError, ValueError):
            return None, None, "patient_age must be a non-negative number."
        if patient_age < 0 or patient_age > 120:
            return None, None, "patient_age must be between 0 and 120."

    patient_sex = payload.get("patient_sex")
    if patient_sex is not None:
        patient_sex = str(patient_sex).lower()
        if patient_sex not in {"male", "female", "unknown"}:
            return None, None, "patient_sex must be male, female, or unknown."
        if patient_sex == "unknown":
            patient_sex = None

    return patient_age, patient_sex, None


def _disease_metadata(name):
    name_lower = name.lower()
    for keywords, specialty in SPECIALTY_RULES:
        if any(keyword in name_lower for keyword in keywords):
            return specialty
    return "Medical genetics"


def _inheritance_hint(name):
    name_lower = name.lower()
    if "dominant" in name_lower:
        return "Often autosomal dominant; confirm with a geneticist."
    if any(word in name_lower for word in ("recessive", "deficiency", "metabolic")):
        return "May be autosomal recessive; ask about family history and consanguinity."
    if any(word in name_lower for word in ("x-linked", "x linked")):
        return "May be X-linked; ask about affected maternal relatives."
    return "Inheritance varies; confirm from a genetics source."


def _system_flags(terms):
    matched_systems = [
        system
        for system, keywords in SYSTEM_KEYWORDS.items()
        if any(keyword in term["name"].lower() for term in terms for keyword in keywords)
    ]
    return {"systems": matched_systems, "multi_system": len(matched_systems) >= 2}


def create_routes(hpo_terms, disease_profiles):
    routes = Blueprint("routes", __name__)
    term_names = {term["id"]: term["name"] for term in hpo_terms}

    @routes.get("/")
    def index():
        return render_template("index.html")

    @routes.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "hpo_terms": len(hpo_terms),
                "disease_profiles": len(disease_profiles),
                "hpoa_available": bool(disease_profiles),
            }
        )

    @routes.get("/api/phenotypes/search")
    def search_phenotypes():
        query = request.args.get("q", "").strip()
        if not query:
            return jsonify({"results": []})
        if len(query) > 120:
            return jsonify({"error": "Search query must be at most 120 characters."}), 400

        normalized_id = query.upper()
        if HPO_ID_PATTERN.fullmatch(normalized_id):
            matches = [
                (term, 100.0) for term in hpo_terms if term["id"] == normalized_id
            ]
        else:
            matches = search_symptoms(query, hpo_terms)[:8]
        return jsonify(
            {
                "results": [
                    {
                        "id": term["id"],
                        "name": term["name"],
                        "score": round(score, 2),
                        "synonyms": term.get("synonyms", [])[:3],
                    }
                    for term, score in matches
                ]
            }
        )

    @routes.post("/api/analyze")
    def analyze():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "A JSON object is required."}), 400

        text, error = _read_text(payload, "text", required=True)
        if error:
            return jsonify({"error": error}), 400

        patient_age, patient_sex, error = _read_patient_context(payload)
        if error:
            return jsonify({"error": error}), 400

        additional_text, error = _read_text(payload, "additional_text")
        if error:
            return jsonify({"error": error}), 400

        absent_text, error = _read_text(payload, "absent_text")
        if error:
            return jsonify({"error": error}), 400

        excluded_ids = payload.get("excluded_term_ids", [])
        if (
            not isinstance(excluded_ids, list)
            or len(excluded_ids) > MAX_EXCLUDED_TERMS
            or not all(
                isinstance(term_id, str) and HPO_ID_PATTERN.fullmatch(term_id)
                for term_id in excluded_ids
            )
        ):
            return jsonify({"error": "excluded_term_ids must be a list of HPO IDs."}), 400

        results = extract_symptoms(f"{text} {additional_text}", hpo_terms)
        results = [(term, score) for term, score in results if term["id"] not in excluded_ids]
        absent_terms = extract_symptoms(absent_text, hpo_terms) if absent_text else []
        terms = [
            {"id": term["id"], "name": term["name"], "score": round(score, 2)}
            for term, score in results
        ]
        diseases = rank_diseases(
            results,
            disease_profiles,
            term_names,
            patient_age=patient_age,
            patient_sex=patient_sex.upper() if patient_sex else None,
            absent_terms=absent_terms,
        )

        for disease in diseases:
            disease["specialty"] = _disease_metadata(disease["name"])
            disease["inheritance"] = _inheritance_hint(disease["name"])
            disease["resources"] = {
                "GARD": (
                    "https://rarediseases.info.nih.gov/diseases/search?query="
                    f"{quote_plus(disease['name'])}"
                ),
                "NORD": f"https://rarediseases.org/?s={quote_plus(disease['name'])}",
            }

        return jsonify(
            {
                "text": text,
                "terms": terms,
                "diseases": diseases,
                "signals": {
                    **_system_flags(terms),
                    "refractory": payload.get("refractory") is True,
                },
                "patient_context": {
                    "age": patient_age,
                    "sex": patient_sex or "unknown",
                },
                "hpoa_available": bool(disease_profiles),
            }
        )

    @routes.post("/api/feedback")
    def feedback():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "A JSON object is required."}), 400
        if payload.get("useful") not in (True, False):
            return jsonify({"error": "JSON field 'useful' must be true or false."}), 400

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "useful": payload["useful"],
            "disease_id": payload.get("disease_id"),
        }
        with FEEDBACK_PATH.open("a", encoding="utf-8") as feedback_file:
            feedback_file.write(json.dumps(record) + "\n")
        return jsonify({"status": "recorded"}), 201

    return routes
