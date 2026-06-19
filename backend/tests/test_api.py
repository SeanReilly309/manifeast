"""Backend API tests for 'What Can I Eat?' app.
Tests root, /api/scan (vision), and /api/suggest (recipe generation).
"""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatieat.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# A real fridge JPEG (downloaded from pexels in fixture setup)
FRIDGE_PATH = "/tmp/fridge.jpg"


@pytest.fixture(scope="session")
def fridge_b64():
    with open(FRIDGE_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# --------- Health ---------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "message" in data
        assert isinstance(data["message"], str)


# --------- Scan (vision) ---------
class TestScan:
    def test_scan_empty_payload_400(self):
        r = requests.post(f"{API}/scan", json={"image_base64": "", "mime_type": "image/jpeg"}, timeout=30)
        assert r.status_code == 400

    def test_scan_short_payload_400(self):
        r = requests.post(f"{API}/scan", json={"image_base64": "abc", "mime_type": "image/jpeg"}, timeout=30)
        assert r.status_code == 400

    def test_scan_real_image_returns_ingredients(self, fridge_b64):
        payload = {"image_base64": fridge_b64, "mime_type": "image/jpeg"}
        r = requests.post(f"{API}/scan", json=payload, timeout=120)
        assert r.status_code == 200, f"body={r.text[:500]}"
        data = r.json()
        assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0
        assert "ingredients" in data and isinstance(data["ingredients"], list)
        # We expect at least one ingredient identified
        assert len(data["ingredients"]) >= 1, f"Expected >=1 ingredient, got {data['ingredients']}"
        # All strings, lowercase
        for ing in data["ingredients"]:
            assert isinstance(ing, str) and ing == ing.lower()


# --------- Suggest (recipes) ---------
class TestSuggest:
    def test_suggest_empty_list_400(self):
        r = requests.post(f"{API}/suggest", json={"ingredients": [], "max_recipes": 5}, timeout=30)
        assert r.status_code == 400

    def test_suggest_returns_recipes(self):
        payload = {
            "ingredients": ["eggs", "bread", "cheese", "tomato", "pasta"],
            "max_recipes": 5,
        }
        r = requests.post(f"{API}/suggest", json=payload, timeout=180)
        assert r.status_code == 200, f"body={r.text[:500]}"
        data = r.json()
        assert "id" in data and isinstance(data["id"], str)
        assert "recipes" in data and isinstance(data["recipes"], list)
        recipes = data["recipes"]
        assert 3 <= len(recipes) <= 5, f"Expected 3-5 recipes got {len(recipes)}"

        required_keys = {
            "title", "emoji", "difficulty", "time_minutes",
            "description", "ingredients_used", "missing_ingredients", "instructions",
        }
        for r_obj in recipes:
            missing = required_keys - set(r_obj.keys())
            assert not missing, f"Recipe missing keys: {missing}"
            assert isinstance(r_obj["title"], str) and r_obj["title"].strip()
            assert isinstance(r_obj["emoji"], str) and r_obj["emoji"].strip()
            assert r_obj["difficulty"] in ("easy", "medium", "hard")
            assert isinstance(r_obj["time_minutes"], int) and r_obj["time_minutes"] > 0
            assert isinstance(r_obj["ingredients_used"], list)
            assert isinstance(r_obj["missing_ingredients"], list)
            assert isinstance(r_obj["instructions"], list) and len(r_obj["instructions"]) >= 1
