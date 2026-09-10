"""Load and search the local Human Phenotype Ontology dataset."""

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OBO_PATH = BASE_DIR / "data" / "hp.obo"
DEFAULT_HPOA_PATH = BASE_DIR / "data" / "phenotype.hpoa"


@dataclass(frozen=True)
class HpoCatalog:
    """Parsed HPO terms plus a token index used by the fuzzy matcher."""

    terms: tuple
    token_index: dict

    def __iter__(self):
        return iter(self.terms)

    def __len__(self):
        return len(self.terms)


def _normalize_phrase(value):
    return re.sub(r"[^a-z0-9 ]+", " ", value.lower()).strip()


def _build_catalog(terms):
    token_index = defaultdict(set)

    for term_index, term in enumerate(terms):
        indexed_phrases = []
        seen_phrases = set()
        for value in (term["name"], *term["synonyms"]):
            phrase = _normalize_phrase(value)
            if not phrase or phrase in seen_phrases:
                continue
            seen_phrases.add(phrase)
            phrase_words = frozenset(phrase.split())
            indexed_phrases.append((phrase, phrase_words))
            for word in phrase_words:
                token_index[word].add(term_index)
        term["_search_phrases"] = tuple(indexed_phrases)

    return HpoCatalog(
        terms=tuple(terms),
        token_index={word: tuple(sorted(indices)) for word, indices in token_index.items()},
    )


def load_hpo_data(obo_path=DEFAULT_OBO_PATH):
    """Parse HPO IDs, names, and synonyms from an OBO file."""
    all_terms = []
    current_term = {"synonyms": []}
    path = Path(obo_path)

    with path.open("r", encoding="utf-8") as obo_file:
        for line in obo_file:
            line = line.strip()

            if line == "[Term]":
                if "id" in current_term and "name" in current_term:
                    all_terms.append(current_term)

                current_term = {"synonyms": []}

            elif line.startswith("id:"):
                current_term["id"] = line.removeprefix("id:").strip()

            elif line.startswith("name:"):
                current_term["name"] = line.removeprefix("name:").strip()

            elif line.startswith("synonym:"):
                _, separator, remainder = line.partition('"')
                synonym, closing_quote, _ = remainder.partition('"')
                if separator and closing_quote:
                    current_term["synonyms"].append(synonym)

    if "id" in current_term and "name" in current_term:
        all_terms.append(current_term)

    return _build_catalog(all_terms)


def search_symptoms(user_input, terms):
    """Return HPO terms that confidently match a candidate symptom phrase."""
    matching_terms = []

    clean_input = _normalize_phrase(user_input)
    candidate_words = clean_input.split()

    if not candidate_words:
        return matching_terms

    candidate_word_set = set(candidate_words)
    if isinstance(terms, HpoCatalog):
        term_list = terms.terms
        term_indices = sorted(
            {
                term_index
                for word in candidate_word_set
                for term_index in terms.token_index.get(word, ())
            }
        )
    else:
        term_list = terms
        term_indices = range(len(term_list))

    for term_index in term_indices:
        term = term_list[term_index]
        phrases = term.get("_search_phrases")
        if phrases is None:
            phrases = tuple(
                (phrase, frozenset(phrase.split()))
                for phrase in {
                    _normalize_phrase(value) for value in (term["name"], *term.get("synonyms", []))
                }
                if phrase
            )

        best_score = 0

        for phrase, phrase_words in phrases:
            matching_words = len(candidate_word_set & phrase_words)

            # If NONE of the words match, reject it.
            if matching_words == 0:
                continue

            candidate_coverage = matching_words / len(candidate_word_set)
            phrase_coverage = matching_words / len(phrase_words)

            # Multi-word paraphrases may share one defining token, but a
            # single-word query must be an exact token match.
            minimum_candidate_coverage = 1.0 if len(candidate_words) == 1 else 0.5
            if len(candidate_words) == 1 and len(phrase_words) > 1:
                continue
            if candidate_coverage < minimum_candidate_coverage or phrase_coverage < 0.5:
                continue

            # Now use RapidFuzz only after the word-overlap
            # requirement has been satisfied.
            similarity = fuzz.token_sort_ratio(clean_input, phrase)

            # Single words need an exact token match; fuzzy matching a generic
            # word creates many clinically unrelated HPO results.
            if len(candidate_words) == 1 and candidate_words[0] not in phrase_words:
                continue

            if similarity < (60 if len(candidate_words) == 1 else 80):
                continue

            # Prefer exact phrases and phrases that cover more of the HPO name.
            weighted_score = similarity * (0.7 + 0.3 * phrase_coverage)

            best_score = max(best_score, weighted_score)

        if best_score > 0:
            matching_terms.append((term, best_score))

    # Best matches first
    matching_terms.sort(key=lambda x: x[1], reverse=True)

    return matching_terms
