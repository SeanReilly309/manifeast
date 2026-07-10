"""Tests for LLMBudgetError (503) + regression on happy-path endpoints.
Iteration 7: verify budget-error-aware handlers pass through cleanly.
"""
import os
import re
import base64
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
SERVER_PY = "/app/backend/server.py"


# --- Static code checks (no LLM required) ---
class TestBudgetErrorSource:
    """Verify _run_chat + endpoints handle budget errors as 503, not 500."""

    def setup_class(cls):
        with open(SERVER_PY, "r") as f:
            cls.src = f.read()

    def test_llm_budget_error_class_exists(self):
        assert "class LLMBudgetError(HTTPException)" in self.src
        assert "status_code=503" in self.src

    def test_run_chat_catches_budget_keywords(self):
        # verify budget/insufficient/quota keywords are matched
        m = re.search(r"async def _run_chat.*?return \"\"\.join", self.src, re.S)
        assert m, "could not locate _run_chat body"
        body = m.group(0)
        assert "budget" in body.lower()
        assert "insufficient" in body.lower()
        assert "quota" in body.lower()
        assert "LLMBudgetError" in body

    @pytest.mark.parametrize(
        "endpoint",
        ["scan_fridge", "suggest_recipes", "ask_recipes", "inspire_meals", "analyze_meal"],
    )
    def test_each_endpoint_has_httpexception_first(self, endpoint):
        # Grab endpoint fn source and check `except HTTPException: raise` precedes generic
        pat = rf"async def {endpoint}\(.*?\n(?=\n@|\napp\.|\Z)"
        m = re.search(pat, self.src, re.S)
        assert m, f"could not locate {endpoint}"
        body = m.group(0)
        idx_http = body.find("except HTTPException")
        idx_generic = body.find("except Exception")
        assert idx_http != -1, f"{endpoint}: missing except HTTPException"
        assert idx_generic != -1, f"{endpoint}: missing except Exception"
        assert idx_http < idx_generic, (
            f"{endpoint}: `except HTTPException` must appear BEFORE `except Exception` "
            f"so LLMBudgetError (503) is not shadowed as 500."
        )


# --- Live regression: happy-path (budget expected OK) ---
class TestHappyPathRegression:
    def test_inspire_breakfast_count8(self):
        r = requests.post(
            f"{API}/inspire",
            json={"category": "breakfast", "count": 8},
            timeout=180,
        )
        assert r.status_code == 200, f"body={r.text[:400]}"
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
        for rc in recipes:
            assert isinstance(rc.get("yield_text"), str) and rc["yield_text"].strip()
            det = rc.get("ingredients_detailed")
            assert isinstance(det, list) and len(det) > 0
            for it in det:
                assert isinstance(it, dict) and it.get("name")

    def test_suggest_chicken_rice(self):
        payload = {
            "ingredients": ["chicken", "rice", "onion", "garlic", "tomato"],
            "max_recipes": 3,
        }
        r = requests.post(f"{API}/suggest", json=payload, timeout=180)
        assert r.status_code == 200, f"body={r.text[:400]}"
        recipes = r.json().get("recipes", [])
        assert len(recipes) >= 3

    def test_ask_recipes_cookies(self):
        r = requests.post(
            f"{API}/ask-recipes",
            json={"query": "cookies", "max_recipes": 3},
            timeout=180,
        )
        assert r.status_code == 200, f"body={r.text[:400]}"
        recipes = r.json().get("recipes", [])
        assert len(recipes) >= 3

    def test_analyze_meal_small_image(self):
        # 1x1 red pixel JPEG (base64) - minimum valid image; model may say "not food"
        # We only care the endpoint doesn't 500 on a plausibly-sized image.
        with open("/tmp/fridge.jpg", "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        r = requests.post(
            f"{API}/analyze-meal",
            json={"image_base64": b64, "mime_type": "image/jpeg"},
            timeout=180,
        )
        assert r.status_code == 200, f"body={r.text[:400]}"
        data = r.json()
        assert "meal_name" in data
        assert "nutrition" in data


# --- Size + query limit regressions ---
class TestSizeAndLengthLimits:
    def test_scan_over_size_returns_413(self):
        # >10M chars base64
        huge = "A" * (10 * 1024 * 1024 + 10)
        r = requests.post(
            f"{API}/scan",
            json={"image_base64": huge, "mime_type": "image/jpeg"},
            timeout=60,
        )
        assert r.status_code == 413, f"got {r.status_code} body={r.text[:200]}"

    def test_ask_recipes_query_over_500_returns_400(self):
        r = requests.post(
            f"{API}/ask-recipes",
            json={"query": "a" * 501, "max_recipes": 3},
            timeout=30,
        )
        assert r.status_code == 400
