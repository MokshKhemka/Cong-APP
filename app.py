# app.py
import os

from flask import Flask

from application.disease_ranker import load_disease_profiles
from infrastructure import DEFAULT_HPOA_PATH, load_hpo_data
from interface.routes import create_routes


def create_app() -> Flask:
    """Create the Flask app and load the local HPO datasets once."""
    hpo_terms = load_hpo_data()
    disease_profiles = load_disease_profiles(DEFAULT_HPOA_PATH)
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
    app.register_blueprint(create_routes(hpo_terms, disease_profiles))
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "0") == "1")
