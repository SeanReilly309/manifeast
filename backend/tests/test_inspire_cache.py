"""Tests for /api/inspire server-side MongoDB cache (30-min TTL) and refresh bypass."""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatieat.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

REQUIRED_FIELDS = {
    "id", "title", "emoji", "difficulty", "time_minutes", "description",
    "ingredients_used", "ingredients_detailed", "missing_ingredients",
    "instructions", "nutrition", "yield_text", "image_query", "servings",
}


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def clear_cache(db):
    db.inspire_cache.delete_many({})
    yield
    # leave cache warm for cross-test use


def _post_inspire(payload, timeout=60):
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/inspire", json=payload, timeout=timeout)
    return r, time.time() - t0


def _assert_schema(recipes):
    assert isinstance(recipes, list) and len(recipes) >= 1
    for rec in recipes:
        missing = REQUIRED_FIELDS - set(rec.keys())
        assert not missing, f"Recipe missing fields: {missing} — got {list(rec.keys())}"
        # nutrition macros
        nut = rec["nutrition"]
        for k in ("calories", "protein_g", "fat_g", "carbs_g"):
            assert k in nut and isinstance(nut[k], int), f"nutrition.{k} bad: {nut}"
        # yield_text non-empty
        assert isinstance(rec["yield_text"], str) and rec["yield_text"].strip()
        # ingredients_detailed structure
        assert isinstance(rec["ingredients_detailed"], list) and len(rec["ingredients_detailed"]) >= 1
        for ing in rec["ingredients_detailed"]:
            assert "name" in ing and "quantity" in ing


class TestInspireValidation:
    def test_invalid_category_returns_400(self):
        r, _ = _post_inspire({"category": "brunch", "count": 6})
        assert r.status_code == 400
        assert "category must be one of" in r.text.lower()


class TestInspireColdAndCacheHit:
    def test_dinner_cold_then_hit(self, db, clear_cache):
        # Cold call
        r1, t1 = _post_inspire({"category": "dinner", "count": 6}, timeout=90)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert len(d1["recipes"]) == 6
        _assert_schema(d1["recipes"])
        print(f"COLD dinner: {t1:.2f}s")
        assert t1 >= 3, "Cold call suspiciously fast — cache may not have been cleared"

        # Cache HIT
        r2, t2 = _post_inspire({"category": "dinner", "count": 6}, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert len(d2["recipes"]) == 6
        print(f"HIT dinner: {t2:.3f}s")
        assert t2 < 2.0, f"Cache HIT too slow: {t2:.3f}s"
        # Same suggestion id -> came from cache
        assert d1["id"] == d2["id"], "Cache hit returned a different id — not from cache"
        # Verify Mongo doc exists
        doc = db.inspire_cache.find_one({"category": "dinner"})
        assert doc and doc["id"] == d1["id"]


class TestInspireCrossCategoryIsolation:
    def test_lunch_cold_then_dinner_still_hot(self, db):
        # Ensure lunch is cold, dinner cached from previous test
        db.inspire_cache.delete_many({"category": "lunch"})
        assert db.inspire_cache.find_one({"category": "dinner"}) is not None

        r_lunch_cold, t_lc = _post_inspire({"category": "lunch", "count": 6}, timeout=90)
        assert r_lunch_cold.status_code == 200
        print(f"COLD lunch: {t_lc:.2f}s")
        assert t_lc >= 3, "Lunch cold call suspiciously fast"

        r_lunch_hit, t_lh = _post_inspire({"category": "lunch", "count": 6}, timeout=15)
        assert r_lunch_hit.status_code == 200
        print(f"HIT lunch: {t_lh:.3f}s")
        assert t_lh < 2.0

        # Dinner still instant
        r_dinner_hit, t_dh = _post_inspire({"category": "dinner", "count": 6}, timeout=15)
        assert r_dinner_hit.status_code == 200
        print(f"HIT dinner (after lunch cold): {t_dh:.3f}s")
        assert t_dh < 2.0


class TestInspireRefreshBypass:
    def test_refresh_true_bypasses_and_replaces_cache(self, db):
        # Precondition: dinner should be cached from earlier
        pre = db.inspire_cache.find_one({"category": "dinner"})
        assert pre, "Precondition failed: dinner cache missing"
        pre_id = pre["id"]

        r_refresh, t_r = _post_inspire(
            {"category": "dinner", "count": 6, "refresh": True}, timeout=90
        )
        assert r_refresh.status_code == 200
        d_ref = r_refresh.json()
        print(f"REFRESH dinner: {t_r:.2f}s")
        assert t_r >= 3, "refresh=true should bypass cache and be slow"
        assert d_ref["id"] != pre_id, "refresh=true did not produce a new id"

        # Plain call now returns the refreshed content
        r_after, t_a = _post_inspire({"category": "dinner", "count": 6}, timeout=15)
        assert r_after.status_code == 200
        d_after = r_after.json()
        print(f"HIT after refresh dinner: {t_a:.3f}s")
        assert t_a < 2.0
        assert d_after["id"] == d_ref["id"], "Cache was not replaced by refresh call"


class TestInspireCachePersistence:
    def test_cache_survives_backend_restart(self, db):
        pre = db.inspire_cache.find_one({"category": "dinner"})
        assert pre, "Need cached dinner for restart test"
        pre_id = pre["id"]

        # Restart backend
        os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
        # Wait for backend to come back
        for _ in range(30):
            try:
                h = requests.get(f"{BASE_URL}/api/", timeout=3)
                if h.status_code < 500:
                    break
            except Exception:
                pass
            time.sleep(1)

        r, t = _post_inspire({"category": "dinner", "count": 6}, timeout=15)
        assert r.status_code == 200
        print(f"HIT after restart dinner: {t:.3f}s")
        assert t < 2.0, f"Cache did not survive restart, {t:.3f}s"
        assert r.json()["id"] == pre_id
