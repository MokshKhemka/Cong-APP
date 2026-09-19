# Notice — Congressional App Challenge demo script

## Submission details

- School: **[ADD THE OFFICIAL SCHOOL NAME]**
- Team members: **[ADD NAMES]**
- App: **Notice**

Replace the bracketed fields before recording or submitting.

## 75-second product walkthrough

**0:00–0:12 — The problem**

“Rare-disease cases often involve clues spread across different symptoms and body systems. Notice helps a reviewer organize those clues and find disease profiles worth investigating. It is decision support, not a diagnosis.”

**0:12–0:28 — Enter and verify**

“First, we enter the observed findings in everyday clinical language. Notice translates the note into standardized Human Phenotype Ontology terms. Before any ranking happens, the user checks that translation and removes anything incorrect.”

**0:28–0:46 — Explain the backend**

“The backend loads the HPO ontology and disease annotations into local indexes. Our parser matches note phrases against official HPO names and synonyms, while filtering negated or uncertain statements. The ranking engine then compares the confirmed terms with thousands of disease profiles. More informative findings receive more weight, and age, sex, and explicitly absent findings can adjust the ranking.”

**0:46–1:03 — Show evidence**

“Instead of returning a black-box answer, Notice shows why each profile ranked: matched findings, unreported findings, conflicts, and source links. Users can compare the top three profiles or pin candidates to a shortlist.”

**1:03–1:15 — Handoff and close**

“Finally, Notice creates a clinician handoff with the case, standardized phenotype set, questions for review, suggested specialties, and research links. The note stays on the device. Notice helps people bring a clearer, evidence-linked case to a qualified professional.”

## Accurate backend talking points

- Flask serves the interface and validates analysis requests.
- The ontology index maps plain-language terms and synonyms to HPO identifiers.
- The extractor ignores negated or uncertain phrases instead of treating them as present findings.
- The ranker uses information-weighted phenotype overlap; its values are similarity scores, not probabilities.
- Candidate cards expose matches, gaps, conflicts, and trusted research links so the output can be audited.
- Clinical text is processed locally and is not sent to a generative-AI provider.

## What not to claim

- Do not call Notice a diagnostic system or say it “detects” a disease.
- Do not say the score is diagnostic confidence or probability.
- Do not claim a doctor or AI model has reviewed the case.
- Do not present an image classifier until it is integrated, tested, and its model/license are documented.
