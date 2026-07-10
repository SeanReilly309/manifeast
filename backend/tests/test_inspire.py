"""Tests for POST /api/inspire (Inspire Me feature)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

REQ_KEYS = {
    "title", "emoji", "difficulty", "time_minutes", "description",
    "ingredients_used", "ingredients_detailed", "instructions",
    "nutrition", "yield_text", "image_query",
}


def _assert_recipe_shape(r_obj):
    missing = REQ_KEYS - set(r_obj.keys())
    assert not missing, f"missing keys: {missing}"
    assert isinstance(r_obj["title"], str) and r_obj["title"].strip()
    assert isinstance(r_obj["emoji"], str) and r_obj["emoji"].strip()
    assert r_obj["difficulty"] in ("easy", "medium", "hard")
    assert isinstance(r_obj["time_minutes"], int) and r_obj["time_minutes"] > 0
    assert isinstance(r_obj["description"], str) and r_obj["description"].strip()
    assert isinstance(r_obj["ingredients_used"], list)
    det = r_obj["ingredients_detailed"]
    assert isinstance(det, list) and len(det) > 0
    for it in det:
        assert isinstance(it, dict)
        assert "name" in it and it["name"].strip()
        assert "quantity" in it
    assert isinstance(r_obj["instructions"], list) and len(r_obj["instructions"]) >= 1
    nut = r_obj["nutrition"]
    assert isinstance(nut, dict)
    for k in ("calories", "protein_g", "fat_g", "carbs_g"):
        assert k in nut and isinstance(nut[k], int)
    assert isinstance(r_obj["yield_text"], str) and r_obj["yield_text"].strip()
    assert isinstance(r_obj["image_query"], str)


class TestInspireBasic:
    def test_breakfast_count6(self):
        r = requests.post(f"{API}/inspire", json={"category": "breakfast", "count": 6}, timeout=180)
        assert r.status_code == 200, f"body={r.text[:600]}"
        data = r.json()
        recipes = data.get("recipes", [])
        assert 4 <= len(recipes) <= 10, f"got {len(recipes)}"
        for r_obj in recipes:
            _assert_recipe_shape(r_obj)

    def test_invalid_category_400(self):
        r = requests.post(f"{API}/inspire", json={"category": "invalid", "count": 6}, timeout=30)
        assert r.status_code == 400


@pytest.mark.parametrize("cat", ["lunch", "dinner", "snack", "dessert"])
class TestInspireCategories:
    def test_each_category_returns_valid(self, cat):
        r = requests.post(f"{API}/inspire", json={"category": cat, "count": 6}, timeout=180)
        assert r.status_code == 200, f"body={r.text[:600]}"
        data = r.json()
        recipes = data.get("recipes", [])
        assert 4 <= len(recipes) <= 10
        # spot-check the first recipe fully
        _assert_recipe_shape(recipes[0])


class TestInspireCoach:
    def test_lunch_with_coach_hint(self):
        payload = {
            "category": "lunch",
            "count": 6,
            "coach": {"target_kcal": 1600, "protein_g": 140, "goal": "lose"},
        }
        r = requests.post(f"{API}/inspire", json=payload, timeout=180)
        assert r.status_code == 200, f"body={r.text[:600]}"
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
        for r_obj in recipes:
            _assert_recipe_shape(r_obj)
