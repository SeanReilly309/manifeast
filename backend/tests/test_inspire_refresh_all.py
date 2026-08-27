"""Iteration 15: fresh (refresh=true) /api/inspire calls for all 5 categories.

Validates the _build_instructions() normalization fix:
- no HTTP 500
- every recipe has >=3 instruction steps
- no leading '1.' / 'Step 1:' / '2)' numbering left on steps
- second (cached) call keeps instructions intact
"""
import os
import re
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
LEADING = re.compile(r"^\s*(?:step\s*)?\d+\s*[\.\):\-]", re.IGNORECASE)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def fresh(client):
    """One forced-refresh call per category, shared across tests."""
    out = {}
    for cat in CATEGORIES:
        try:
            out[cat] = client.post(
                f"{BASE_URL}/api/inspire",
                json={"category": cat, "refresh": True},
                timeout=180,
            )
        except Exception as e:  # noqa: BLE001
            out[cat] = e
    return out


@pytest.mark.parametrize("category", CATEGORIES)
def test_fresh_no_500(fresh, category):
    r = fresh[category]
    assert not isinstance(r, Exception), f"{category} request raised: {r}"
    assert r.status_code == 200, f"{category} -> {r.status_code}: {r.text[:400]}"


@pytest.mark.parametrize("category", CATEGORIES)
def test_fresh_instructions_valid(fresh, category):
    r = fresh[category]
    assert not isinstance(r, Exception)
    assert r.status_code == 200, f"{category} -> {r.status_code}"
    recipes = r.json().get("recipes")
    assert isinstance(recipes, list) and recipes, f"{category}: no recipes"
    for rec in recipes:
        instr = rec.get("instructions")
        assert isinstance(instr, list), f"{category}/{rec.get('title')}: not a list"
        assert len(instr) >= 3, f"{category}/{rec.get('title')}: only {len(instr)} steps"
        for s in instr:
            assert isinstance(s, str) and s.strip(), f"{category}/{rec.get('title')}: blank step"
            assert not LEADING.match(s), f"{category}/{rec.get('title')}: leading numbering -> {s[:40]!r}"


@pytest.mark.parametrize("category", CATEGORIES)
def test_cached_second_call_keeps_instructions(fresh, client, category):
    assert not isinstance(fresh[category], Exception)
    if fresh[category].status_code != 200:
        pytest.skip(f"fresh call for {category} failed; cache not populated")
    t0 = time.time()
    r = client.post(f"{BASE_URL}/api/inspire", json={"category": category}, timeout=120)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text[:300]
    recipes = r.json()["recipes"]
    assert recipes
    for rec in recipes:
        assert len(rec.get("instructions") or []) >= 3, \
            f"cached {category}/{rec.get('title')} instructions={rec.get('instructions')}"
        assert "_id" not in rec
    assert elapsed < 8, f"cached {category} call took {elapsed:.1f}s"
