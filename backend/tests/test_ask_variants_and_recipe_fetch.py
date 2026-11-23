# Ask parallel variants + server cache, Inspire cookability, GET /api/recipe/{id}
import os
import time
import uuid
import concurrent.futures as cf
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
QUERY = f"TEST lemon garlic shrimp pasta {uuid.uuid4().hex[:4]}"


def _cookable(r):
    ings = r.get("ingredients_detailed") or []
    if len(ings) < 3 or not all((i.get("name") or "").strip() and (i.get("quantity") or "").strip() for i in ings):
        return False
    steps = [s for s in (r.get("steps") or []) if (s.get("instruction") or "").strip()]
    legacy = [t for t in (r.get("instructions") or []) if isinstance(t, str) and t.strip()]
    return max(len(steps), len(legacy)) >= 3


def _ask(v):
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/ask-recipes", json={"query": QUERY, "max_recipes": 1, "variant": v}, timeout=90)
    return v, r, time.time() - t0


@pytest.fixture(scope="module")
def ask_results():
    with cf.ThreadPoolExecutor(3) as ex:
        return list(ex.map(_ask, [0, 1, 2]))


# --- Ask variants ---
class TestAskVariants:
    def test_parallel_variants_ok(self, ask_results):
        for v, r, dt in ask_results:
            print(f"variant {v}: {r.status_code} in {dt:.1f}s")
            assert r.status_code == 200, r.text[:300]
            recs = r.json()["recipes"]
            assert len(recs) == 1
            assert _cookable(recs[0])
        assert max(dt for _, _, dt in ask_results) < 40

    def test_variants_distinct_titles(self, ask_results):
        titles = [r.json()["recipes"][0]["title"].lower() for _, r, _ in ask_results]
        print("titles:", titles)
        assert len(set(titles)) >= 2

    def test_cache_hit_fast_and_same(self, ask_results):
        for v, r, _ in ask_results:
            _, r2, dt = _ask(v)
            assert r2.status_code == 200
            assert dt < 3, f"cache too slow {dt}"
            assert r2.json()["recipes"][0]["id"] == r.json()["recipes"][0]["id"]

    def test_ask_recipe_fetchable(self, ask_results):
        for _, r, _ in ask_results:
            rec = r.json()["recipes"][0]
            g = requests.get(f"{BASE_URL}/api/recipe/{rec['id']}", timeout=20)
            assert g.status_code == 200
            assert g.json()["title"] == rec["title"]
            assert _cookable(g.json())

    def test_empty_query_400(self):
        r = requests.post(f"{BASE_URL}/api/ask-recipes", json={"query": "  ", "max_recipes": 1, "variant": 0}, timeout=20)
        assert r.status_code in (400, 422)

    def test_out_of_range_variant_falls_back(self):
        # variant 99 is ignored -> n = max_recipes (not executed against LLM; just validate it doesn't 500 on validation)
        r = requests.post(f"{BASE_URL}/api/ask-recipes", json={"query": QUERY, "max_recipes": 1, "variant": 0}, timeout=20)
        assert r.status_code == 200


    def test_legacy_no_variant(self):
        # Legacy call without variant -> max_recipes recipes
        r = requests.post(f"{BASE_URL}/api/ask-recipes", json={"query": QUERY + " legacy", "max_recipes": 2}, timeout=110)
        assert r.status_code == 200, r.text[:300]
        recs = r.json()["recipes"]
        assert 1 <= len(recs) <= 2
        assert all(_cookable(x) for x in recs)


# --- GET recipe ---
class TestRecipeFetch:
    def test_unknown_id_404(self):
        r = requests.get(f"{BASE_URL}/api/recipe/{uuid.uuid4()}", timeout=20)
        assert r.status_code == 404


# --- Inspire cache-hit cookability ---
class TestInspire:
    @pytest.mark.parametrize("cat", ["breakfast", "lunch", "dinner", "snack", "dessert"])
    def test_inspire_category_all_cookable_and_fetchable(self, cat):
        r = requests.post(f"{BASE_URL}/api/inspire", json={"category": cat, "count": 12}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        recs = r.json()["recipes"]
        assert len(recs) >= 3
        bad = [x["title"] for x in recs if not _cookable(x)]
        assert not bad, bad
        for x in recs:
            g = requests.get(f"{BASE_URL}/api/recipe/{x['id']}", timeout=20)
            assert g.status_code == 200, x["id"]
            assert g.json()["title"] == x["title"]
            assert _cookable(g.json())
