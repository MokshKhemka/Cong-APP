import unittest

from application.extractor import extract_symptoms

TERMS = [
    {"id": "HP:0001250", "name": "Seizure", "synonyms": []},
    {"id": "HP:0002829", "name": "Arthralgia", "synonyms": ["Joint pain"]},
]


class ExtractorTests(unittest.TestCase):
    def test_extracts_positive_finding(self):
        matches = extract_symptoms("Patient has joint pain.", TERMS)

        self.assertEqual([term["id"] for term, _ in matches], ["HP:0002829"])

    def test_ignores_negated_finding(self):
        matches = extract_symptoms("Patient has no seizure.", TERMS)

        self.assertEqual(matches, [])

    def test_ignores_uncertain_finding(self):
        matches = extract_symptoms("Possible seizure.", TERMS)

        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
