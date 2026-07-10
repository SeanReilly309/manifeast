"""Verify /api/inspire honors new default count=4 & clamps correctly."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatieat.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module", autouse=True)
def clear_cache():
    from pymongo import MongoClient
    with open("/app/backend/.env") as f:
        env = f.read()
    url = env.split('MONGO_URL="')[1].split('"')[0]
    name = env.split('DB_NAME="')[1].split('"')[0]
    c = MongoClient(url)
    c[name].inspire_cache.delete_many({})
    yield
    c[name].inspire_cache.delete_many({})


REQUIRED_FIELDS = [
    "id", "title", "emoji", "difficulty", "time_minutes", "description",
    "ingredients_used", "ingredients_detailed", "missing_ingredients",
    "instructions", "nutrition", "yield_text", "image_query", "servings",
]


def _assert_recipe_schema(r):
    for f in REQUIRED_FIELDS:
        assert f in r, f"missing field {f}"
    assert isinstance(r["ingredients_detailed"], list) and len(r["ingredients_detailed"]) > 0
    for ing in r["ingredients_detailed"]:
        assert ing.get("name")
        assert ing.get("quantity")
    assert isinstance(r["instructions"], list)
    nut = r["nutrition"]
    for k in ("calories", "protein_g", "carbs_g", "fat_g"):
        assert isinstance(nut.get(k), int), f"nutrition.{k} not int: {nut.get(k)}"
    assert isinstance(r["yield_text"], str) and r["yield_text"]


def test_cold_dinner_count4():
    t0 = time.time()
    resp = requests.post(f"{API}/inspire", json={"category": "dinner", "count": 4}, timeout=90)
    dur = time.time() - t0
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["recipes"]) == 4, f"expected 4 got {len(data['recipes'])}"
    for r in data["recipes"]:
        _assert_recipe_schema(r)
    print(f"COLD dinner count=4 took {dur:.1f}s")


def test_cache_hit_dinner_count4():
    t0 = time.time()
    resp = requests.post(f"{API}/inspire", json={"category": "dinner", "count": 4}, timeout=90)
    dur = time.time() - t0
    assert resp.status_code == 200
    assert len(resp.json()["recipes"]) == 4
    assert dur < 2.0, f"cache HIT too slow: {dur:.2f}s"
    print(f"HIT dinner count=4 took {dur*1000:.0f}ms")


def test_count_clamp_up_to_4():
    # count=2 must clamp UP to 4
    resp = requests.post(f"{API}/inspire", json={"category": "breakfast", "count": 2}, timeout=90)
    assert resp.status_code == 200
    assert len(resp.json()["recipes"]) == 4


def test_count_clamp_down_to_10():
    resp = requests.post(f"{API}/inspire", json={"category": "snack", "count": 15}, timeout=120)
    assert resp.status_code == 200
    assert len(resp.json()["recipes"]) == 10


def test_count_8_snack():
    # Using snack (fresh, not yet cached with different count) — but cache is by category only
    # so this may return the count=15 clamped-to-10 result truncated to 8.
    resp = requests.post(f"{API}/inspire", json={"category": "snack", "count": 8}, timeout=90)
    assert resp.status_code == 200
    assert len(resp.json()["recipes"]) == 8
