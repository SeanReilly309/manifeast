"""Regression tests: /api/inspire must ALWAYS return recipes with non-empty instructions."""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")

CATEGORIES = ["breakfast", "lunch", "dinner", "snack", "dessert"]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def inspire_results(client):
    """Fetch each category once; share across tests."""
    out = {}
    for cat in CATEGORIES:
        r = client.post(f"{BASE_URL}/api/inspire", json={"category": cat}, timeout=120)
        out[cat] = r
    return out


@pytest.mark.parametrize("category", CATEGORIES)
def test_inspire_instructions_non_empty(inspire_results, category):
    r = inspire_results[category]
    assert r.status_code == 200, f"{category} -> {r.status_code}: {r.text[:400]}"
    data = r.json()
    assert isinstance(data.get("recipes"), list) and data["recipes"], f"no recipes for {category}"
    for rec in data["recipes"]:
        instr = rec.get("instructions")
        assert isinstance(instr, list), f"{category}/{rec.get('title')} instructions not a list"
        assert len(instr) > 0, f"{category}/{rec.get('title')} EMPTY instructions"
        assert all(isinstance(s, str) and s.strip() for s in instr), \
            f"{category}/{rec.get('title')} has blank step"
        assert 3 <= len(instr) <= 8, \
            f"{category}/{rec.get('title')} has {len(instr)} steps (expected 3-6ish)"


@pytest.mark.parametrize("category", CATEGORIES)
def test_inspire_required_fields(inspire_results, category):
    r = inspire_results[category]
    assert r.status_code == 200
    for rec in r.json()["recipes"]:
        t = rec.get("title")
        assert t and isinstance(t, str)
        assert rec.get("emoji")
        assert rec.get("difficulty") in ("easy", "medium", "hard"), f"{t}: {rec.get('difficulty')}"
        assert isinstance(rec.get("time_minutes"), int) and rec["time_minutes"] > 0
        assert rec.get("ingredients_detailed"), f"{t}: empty ingredients_detailed"
        for ing in rec["ingredients_detailed"]:
            assert ing.get("name")
        assert rec.get("yield_text"), f"{t}: missing yield_text"
        nut = rec.get("nutrition") or {}
        for k in ("calories", "protein_g", "fat_g", "carbs_g"):
            assert k in nut, f"{t}: nutrition missing {k}"
            assert isinstance(nut[k], int)
        assert "_id" not in rec


def test_inspire_cached_second_call_fast_and_valid(client):
    cat = "breakfast"
    t0 = time.time()
    r = client.post(f"{BASE_URL}/api/inspire", json={"category": cat}, timeout=120)
    elapsed = time.time() - t0
    assert r.status_code == 200
    recipes = r.json()["recipes"]
    assert recipes
    for rec in recipes:
        assert rec.get("instructions"), f"cached recipe {rec.get('title')} has empty instructions"
    assert elapsed < 5, f"cached call took {elapsed:.1f}s (expected <5s)"


def test_inspire_invalid_category():
    r = requests.post(f"{BASE_URL}/api/inspire", json={"category": "brunchy"}, timeout=30)
    assert r.status_code == 400
    assert "category" in r.text.lower()


def test_inspire_refresh_returns_valid_instructions(client):
    r = client.post(
        f"{BASE_URL}/api/inspire",
        json={"category": "snack", "refresh": True},
        timeout=120,
    )
    assert r.status_code == 200, r.text[:400]
    recipes = r.json()["recipes"]
    assert recipes
    for rec in recipes:
        assert rec.get("instructions"), f"refresh: {rec.get('title')} empty instructions"
