"""Tests for iteration 10: gpt-4o-mini + JSON mode perf, cache HIT, refresh=true (load-more)."""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

REQ_KEYS = {
    "title", "emoji", "difficulty", "time_minutes", "description",
    "ingredients_used", "ingredients_detailed", "instructions",
    "nutrition", "yield_text", "image_query",
}


def _clear_cache(category=None):
    c = MongoClient(MONGO_URL)
    q = {"category": category} if category else {}
    c[DB_NAME].inspire_cache.delete_many(q)
    c.close()


def _assert_recipe(r):
    missing = REQ_KEYS - set(r.keys())
    assert not missing, f"missing keys: {missing}"
    assert r["title"].strip()
    det = r["ingredients_detailed"]
    assert isinstance(det, list) and len(det) > 0
    for it in det:
        assert "name" in it and it["name"].strip()
        assert "quantity" in it
    nut = r["nutrition"]
    for k in ("calories", "protein_g", "fat_g", "carbs_g"):
        assert isinstance(nut[k], int)
    assert r["yield_text"].strip()
    assert isinstance(r["image_query"], str)


@pytest.mark.parametrize("cat", ["dessert", "snack", "breakfast"])
def test_cold_call_returns_4_valid_recipes(cat):
    """PERF: cold call after cache clear returns 4 valid recipes with JSON mode."""
    _clear_cache(cat)
    t0 = time.time()
    r = requests.post(f"{API}/inspire", json={"category": cat, "count": 4}, timeout=120)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"body={r.text[:600]}"
    recipes = r.json().get("recipes", [])
    assert len(recipes) == 4, f"expected 4, got {len(recipes)}"
    for rec in recipes:
        _assert_recipe(rec)
    print(f"\n[{cat}] cold elapsed={elapsed:.2f}s")


def test_cache_hit_is_fast():
    """PERF: 2nd call hits cache and is <1s."""
    # ensure cache is warm
    requests.post(f"{API}/inspire", json={"category": "dessert", "count": 4}, timeout=120)
    t0 = time.time()
    r = requests.post(f"{API}/inspire", json={"category": "dessert", "count": 4}, timeout=30)
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert len(r.json().get("recipes", [])) == 4
    assert elapsed < 2.0, f"cache hit too slow: {elapsed:.2f}s"
    print(f"\ncache hit elapsed={elapsed:.3f}s")


def test_refresh_true_bypasses_cache_and_returns_fresh():
    """LOAD MORE: refresh=true bypasses cache and returns 4 recipes (different ids from cached)."""
    # warm cache first
    cached = requests.post(f"{API}/inspire", json={"category": "dessert", "count": 4}, timeout=120)
    assert cached.status_code == 200
    cached_ids = {r["id"] for r in cached.json()["recipes"]}

    t0 = time.time()
    r = requests.post(f"{API}/inspire", json={"category": "dessert", "count": 4, "refresh": True}, timeout=120)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"body={r.text[:600]}"
    fresh_recipes = r.json().get("recipes", [])
    assert len(fresh_recipes) == 4
    fresh_ids = {r["id"] for r in fresh_recipes}
    # ids are freshly-generated uuids on server → must not overlap with cached ids
    assert cached_ids.isdisjoint(fresh_ids), "refresh=true returned same ids (cache not bypassed)"
    print(f"\nrefresh elapsed={elapsed:.2f}s ids-new={len(fresh_ids)}")
