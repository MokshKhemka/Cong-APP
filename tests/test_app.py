import unittest

from app import app


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_health_reports_loaded_data(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertGreater(payload["hpo_terms"], 0)

    def test_analyze_requires_text(self):
        response = self.client.post("/api/analyze", json={})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "JSON field 'text' is required.")

    def test_analyze_rejects_non_object_json(self):
        response = self.client.post("/api/analyze", json=[])

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "A JSON object is required.")

    def test_analyze_limits_note_length(self):
        response = self.client.post("/api/analyze", json={"text": "x" * 10_001})

        self.assertEqual(response.status_code, 400)
        self.assertIn("at most 10,000 characters", response.get_json()["error"])

    def test_analyze_returns_terms_and_diseases(self):
        response = self.client.post(
            "/api/analyze",
            json={"text": "joint pain, hypertelorism, and cutis laxa"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["terms"])
        self.assertTrue(payload["diseases"])

    def test_phenotype_search_returns_ranked_hpo_terms(self):
        response = self.client.get("/api/phenotypes/search?q=joint+pain")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["results"])
        self.assertEqual(payload["results"][0]["id"], "HP:0002829")
        self.assertEqual(payload["results"][0]["name"], "Arthralgia")

    def test_phenotype_search_accepts_an_empty_query(self):
        response = self.client.get("/api/phenotypes/search")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"results": []})


if __name__ == "__main__":
    unittest.main()
