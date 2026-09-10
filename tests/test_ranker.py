import unittest

from application.disease_ranker import DiseaseCatalog, rank_diseases


class RankerTests(unittest.TestCase):
    def test_precomputed_catalog_matches_plain_profiles(self):
        term = {"id": "HP:0002829", "name": "Arthralgia"}
        profiles = {
            ("TEST:1", "Example disease"): {
                "HP:0002829": {
                    "reference": "",
                    "evidence": "",
                    "onset": "",
                    "frequency": "",
                    "sex": "",
                },
            },
        }
        catalog = DiseaseCatalog(profiles, {"HP:0002829": 1})

        plain_result = rank_diseases([(term, 100)], profiles)
        indexed_result = rank_diseases([(term, 100)], catalog)

        self.assertEqual(indexed_result, plain_result)
        self.assertEqual(indexed_result[0]["id"], "TEST:1")


if __name__ == "__main__":
    unittest.main()
