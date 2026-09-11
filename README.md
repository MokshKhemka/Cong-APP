# Notice

Notice is a local Flask prototype that extracts Human Phenotype Ontology (HPO) terms from clinical text and ranks matching disease profiles from HPO annotations.

## How it works

1. `app.py` loads and indexes the local ontology and disease annotations once at startup.
2. `application/extractor.py` splits a note into short phrases, removes negated or uncertain findings, and fuzzy-matches the remaining phrases to HPO names and synonyms.
3. `application/disease_ranker.py` compares the extracted terms with disease profiles using information-weighted overlap and optional age, sex, and explicitly absent findings.
4. `interface/routes.py` validates API requests and adds explanations, resource links, and warning flags.
5. `static/app.js` renders the reviewable phenotype and disease shortlist.

Ontology matching uses a token index, and disease frequency statistics are precomputed at startup. Clinical text and feedback remain local; the page does not load third-party scripts or fonts.

## Interactive demonstration

Use **Try a sample case** to run a fictional connective-tissue example, or choose a neurological or skeletal example in the workspace. Existing input is preserved until you confirm loading another example.

Review the extracted HPO findings and remove incorrect matches to recompute the ranking. **Compare top 3** shows a finding-by-finding matrix and conflicts for the leading profiles. An unlisted annotation does not rule out a disease. Scores are weighted similarity values, not probabilities; weighting can produce values above 100.

**Review brief** opens a plain-text snapshot of the analyzed input, findings, candidates, and research links, with copy and download controls. Copy also provides a fallback for embedded browsers that do not support file downloads. Editing a case marks displayed results as outdated and hides export until a new analysis succeeds. Notes are not saved in browser storage.

The extraction and ranking are heuristic. They are useful for producing a shortlist for review, but they are not a validated diagnostic model.

## Requirements

- Python 3.10 or newer
- `data/hp.obo` for HPO terms and synonyms
- `data/phenotype.hpoa` for disease ranking

The annotation file is optional. Without it, phenotype extraction works but disease ranking is disabled. See [data/README.md](data/README.md) for its expected format.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

On Windows PowerShell, activate the environment with `.\.venv\Scripts\Activate.ps1`.

Open <http://127.0.0.1:5000>. Press Ctrl/Command + Enter from the clinical-note field to analyze.

## Tests

```bash
python -m unittest discover -s tests -v
```

## API smoke checks

```bash
curl http://127.0.0.1:5000/api/health
curl -X POST http://127.0.0.1:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"joint pain, hypertelorism, cutis laxa"}'
```

## Safety note

This is an assistive prototype, not a medical diagnostic system. Results require review by qualified clinicians and genetics professionals.
