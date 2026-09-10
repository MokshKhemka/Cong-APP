"""Extract likely positive HPO findings from free-text clinical notes."""

import re

from infrastructure import search_symptoms

CLAUSE_PATTERN = re.compile(r"[,;.!?]|\band\b")
UNCERTAIN_PATTERN = re.compile(
    r"\b(?:possible|possibly|suspected|rule out|rule-out|family history of|familial)\b"
)
POSITIVE_PATTERN = re.compile(r"\b(?:presents?|reports?|has|have|shows?)\b")
NEGATION_PATTERN = re.compile(r"\b(?:no|without|denies|denied|negative for)\b")
STOP_WORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "patient",
    "presents",
    "with",
    "has",
    "have",
    "had",
    "is",
    "are",
    "was",
    "were",
    "in",
    "on",
    "of",
    "to",
    "for",
    "from",
    "at",
    "by",
    "as",
    "into",
    "without",
    "symptom",
    "symptoms",
    "male",
    "female",
    "boy",
    "girl",
    "man",
    "woman",
    "year",
    "years",
    "old",
    "severe",
    "mild",
    "moderate",
}


def extract_symptoms(user_input, hpo_terms):
    """Extract non-negated, non-uncertain HPO terms from clinical text."""
    clauses = CLAUSE_PATTERN.split(user_input.lower())
    candidates = {}

    # -------------------------
    # Generate candidates
    # -------------------------

    # Keep only contiguous spans. Disconnected pairs turn unrelated words
    # into plausible-looking symptoms.
    negation_active = False
    for clause in clauses:
        # Uncertain or family-history findings should not become patient positives.
        if UNCERTAIN_PATTERN.search(clause):
            continue

        if POSITIVE_PATTERN.search(clause):
            negation_active = False

        if NEGATION_PATTERN.search(clause):
            negation_active = True

        if negation_active:
            continue

        clean_words = [word for word in re.findall(r"[a-z]+", clause) if word not in STOP_WORDS]
        for span_length in range(1, min(4, len(clean_words) + 1)):
            for start in range(len(clean_words) - span_length + 1):
                candidate = " ".join(clean_words[start : start + span_length])
                candidates.setdefault(candidate, None)

    # ------------------------------------------------
    # Find the BEST candidate for each HPO term
    # ------------------------------------------------

    best_matches = {}

    for candidate in candidates:
        results = search_symptoms(candidate, hpo_terms)

        if not results:
            continue

        # search_symptoms already ranks the HPO matches for this candidate.
        term, similarity = results[0]

        candidate_length = len(candidate.split())

        # Longer exact spans are more informative than isolated words.
        length_bonus = (candidate_length - 1) * 3

        final_score = similarity + length_bonus

        term_id = term["id"]

        # Only keep the best candidate for this HPO term
        if term_id not in best_matches or final_score > best_matches[term_id]["score"]:
            best_matches[term_id] = {
                "term": term,
                "score": final_score,
                "candidate": candidate,
            }

    # ---------------------------------------------
    # Convert dictionary into a list
    # ---------------------------------------------

    matched_terms = list(best_matches.values())

    # Do not return a generic sub-span when a longer span already produced a
    # more specific HPO concept (for example, pain within joint pain).
    matched_terms = [
        match
        for match in matched_terms
        if not any(
            len(match["candidate"].split()) < len(other["candidate"].split())
            and set(match["candidate"].split()).issubset(other["candidate"].split())
            and other["score"] >= match["score"]
            for other in matched_terms
        )
    ]

    # Highest score first
    matched_terms.sort(key=lambda x: (x["score"], len(x["candidate"].split())), reverse=True)

    # ---------------------------------------------
    # Return format expected by app.py
    # ---------------------------------------------

    return [(match["term"], match["score"]) for match in matched_terms]
