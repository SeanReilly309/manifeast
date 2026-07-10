"""Tests for the yield_text + ingredients_detailed bug fix.

Verifies:
- POST /api/ask-recipes returns yield_text and ingredients_detailed for each recipe
- POST /api/suggest also returns those new fields (and keeps legacy fields intact)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _assert_recipe_has_detailed(r_obj):
    # yield_text present + non-empty string
    assert "yield_text" in r_obj, f"missing yield_text: keys={list(r_obj.keys())}"
    assert isinstance(r_obj["yield_text"], str)
    assert r_obj["yield_text"].strip(), f"yield_text is empty for '{r_obj.get('title')}'"

    # ingredients_detailed present, non-empty, each with name + non-empty quantity
    assert "ingredients_detailed" in r_obj
    det = r_obj["ingredients_detailed"]
    assert isinstance(det, list) and len(det) > 0, f"ingredients_detailed empty for '{r_obj.get('title')}'"
    empty_qty = []
    for item in det:
        assert isinstance(item, dict)
        assert "name" in item and isinstance(item["name"], str) and item["name"].strip()
        assert "quantity" in item and isinstance(item["quantity"], str)
        if not item["quantity"].strip():
            empty_qty.append(item["name"])
    # Allow at most 1 ingredient with a blank quantity (e.g., "salt to taste"),
    # but most items should have quantities.
    assert len(empty_qty) <= 1, (
        f"Too many ingredients with empty quantity in '{r_obj.get('title')}': {empty_qty}"
    )


class TestAskRecipesDetailed:
    def test_ask_cookies_has_yield_and_quantities(self):
        r = requests.post(
            f"{API}/ask-recipes",
            json={"query": "chocolate chip cookies", "max_recipes": 3},
            timeout=180,
        )
        assert r.status_code == 200, f"body={r.text[:600]}"
        data = r.json()
        recipes = data.get("recipes", [])
        assert 3 <= len(recipes) <= 6, f"want 3-6 recipes, got {len(recipes)}"
        for r_obj in recipes:
            _assert_recipe_has_detailed(r_obj)

    def test_ask_banana_bread_has_yield_and_quantities(self):
        r = requests.post(
            f"{API}/ask-recipes",
            json={"query": "banana bread", "max_recipes": 3},
            timeout=180,
        )
        assert r.status_code == 200, f"body={r.text[:600]}"
        data = r.json()
        recipes = data.get("recipes", [])
        assert 3 <= len(recipes) <= 6
        for r_obj in recipes:
            _assert_recipe_has_detailed(r_obj)


class TestSuggestRegression:
    def test_suggest_has_new_and_legacy_fields(self):
        payload = {
            "ingredients": ["chicken", "rice", "garlic", "onion", "tomato"],
            "max_recipes": 3,
        }
        r = requests.post(f"{API}/suggest", json=payload, timeout=180)
        assert r.status_code == 200, f"body={r.text[:600]}"
        data = r.json()
        recipes = data.get("recipes", [])
        assert 3 <= len(recipes) <= 5

        legacy_keys = {
            "ingredients_used", "missing_ingredients", "instructions",
            "nutrition", "image_query",
        }
        for r_obj in recipes:
            # new fields
            _assert_recipe_has_detailed(r_obj)
            # legacy fields still present
            missing = legacy_keys - set(r_obj.keys())
            assert not missing, f"legacy fields missing: {missing}"
            assert isinstance(r_obj["instructions"], list) and r_obj["instructions"]
            nut = r_obj["nutrition"]
            assert isinstance(nut, dict)
            for k in ("calories", "protein_g", "fat_g", "carbs_g"):
                assert k in nut and isinstance(nut[k], int)
