"""Security hardening verification tests (SEC-001/002/003 + CORS + deps)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatieat.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
# CORS must be tested against the app layer directly (ingress adds its own CORS headers)
LOCAL_API = "http://localhost:8001/api"


# ---- SEC-001 SIZE CAPS ----
class TestSizeCaps:
    def test_scan_image_too_large_413(self):
        payload = {"image_base64": "a" * 10_000_001}
        t0 = time.time()
        r = requests.post(f"{API}/scan", json=payload, timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:200]}"
        assert r.json().get("detail") == "Image too large"
        # must reject before LLM call (fast)
        assert elapsed < 5, f"took too long ({elapsed}s), might have hit LLM"

    def test_analyze_meal_image_too_large_413(self):
        payload = {"image_base64": "a" * 10_000_001}
        r = requests.post(f"{API}/analyze-meal", json=payload, timeout=30)
        assert r.status_code == 413
        assert r.json().get("detail") == "Image too large"

    def test_ask_recipes_query_too_long_400(self):
        r = requests.post(f"{API}/ask-recipes", json={"query": "x" * 501}, timeout=30)
        assert r.status_code == 400
        assert "too long" in r.json().get("detail", "").lower()

    def test_suggest_too_many_ingredients_400(self):
        r = requests.post(f"{API}/suggest", json={"ingredients": ["egg"] * 61}, timeout=30)
        assert r.status_code == 400
        assert r.json().get("detail") == "Too many ingredients"

    def test_suggest_ingredient_name_too_long_400(self):
        r = requests.post(f"{API}/suggest", json={"ingredients": ["a" * 81]}, timeout=30)
        assert r.status_code == 400
        assert r.json().get("detail") == "Ingredient name too long"


# ---- SEC-002 gitignore ----
class TestGitignore:
    def test_gitignore_covers_env(self):
        with open("/app/.gitignore") as f:
            content = f.read()
        assert ".env" in content
        assert ".env.*" in content
        assert "*.env" in content

    def test_git_check_ignore_backend_env(self):
        import subprocess
        # Run from /app which is a git repo
        result = subprocess.run(
            ["git", "-C", "/app", "check-ignore", "/app/backend/.env"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0, f"backend/.env not ignored: stderr={result.stderr}"
        assert "backend/.env" in result.stdout


# ---- SEC-003 Generic error messages ----
class TestGenericErrors:
    def test_ask_recipes_empty_query_no_stack(self):
        r = requests.post(f"{API}/ask-recipes", json={"query": ""}, timeout=30)
        # Empty query hits 'query is required' 400 - that's fine, ensure no traceback exposed
        body = r.text
        assert "Traceback" not in body
        assert "Exception" not in body


# ---- CORS (app-layer, tested against localhost:8001 to bypass ingress) ----
class TestCORS:
    def test_cors_evil_origin_not_allowed(self):
        r = requests.options(
            f"{LOCAL_API}/inspire",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=15,
        )
        # App must NOT emit an allow-origin header for a disallowed origin
        assert "access-control-allow-origin" not in {k.lower() for k in r.headers.keys()}, \
            f"unexpected ACAO for evil origin: {dict(r.headers)}"

    @pytest.mark.parametrize("origin", [
        "https://manifest.ie",
        "https://www.manifest.ie",
        "https://whatieat.preview.emergentagent.com",
    ])
    def test_cors_allowed_origin(self, origin):
        r = requests.options(
            f"{LOCAL_API}/inspire",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=15,
        )
        assert r.headers.get("access-control-allow-origin") == origin
        # credentials must NOT be true
        assert r.headers.get("access-control-allow-credentials", "").lower() != "true"
        # methods limited to GET/POST/OPTIONS
        methods = r.headers.get("access-control-allow-methods", "")
        for m in ["GET", "POST", "OPTIONS"]:
            assert m in methods
        # no DELETE/PUT/PATCH
        for m in ["DELETE", "PUT", "PATCH"]:
            assert m not in methods, f"{m} unexpectedly allowed: {methods}"

    def test_cors_guard_rejects_wildcard_in_code(self):
        """Verify server.py has a defensive guard against CORS_ORIGINS='*'."""
        with open("/app/backend/server.py") as f:
            src = f.read()
        assert '_DEFAULT_ORIGINS' in src
        assert 'in ("", "*")' in src or "in ('', '*')" in src, "guard against wildcard missing"
        assert "allow_credentials=False" in src


# ---- DEPS ----
class TestDeps:
    def test_requirements_removed_and_added(self):
        with open("/app/backend/requirements.txt") as f:
            reqs = f.read().lower()
        for bad in ["python-jose", "passlib", "pyjwt"]:
            assert bad not in reqs, f"{bad} still present"
        # bcrypt as its own line
        for line in reqs.splitlines():
            stripped = line.strip()
            assert not stripped.startswith("bcrypt"), f"bcrypt still present: {line}"
        assert "slowapi" in reqs

    def test_slowapi_installed(self):
        import slowapi  # noqa
        assert slowapi is not None


# ---- REGRESSION: happy paths (limited to avoid burning limiter budget) ----
class TestRegression:
    def test_suggest_happy(self):
        r = requests.post(f"{API}/suggest",
                          json={"ingredients": ["egg", "milk", "flour", "sugar", "butter"], "max_recipes": 3},
                          timeout=90)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "recipes" in data and len(data["recipes"]) >= 1
        r0 = data["recipes"][0]
        assert "yield_text" in r0
        assert "ingredients_detailed" in r0

    def test_ask_recipes_happy(self):
        r = requests.post(f"{API}/ask-recipes", json={"query": "pancakes", "max_recipes": 3}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert len(data["recipes"]) >= 1
        assert "yield_text" in data["recipes"][0]

    def test_inspire_happy(self):
        r = requests.post(f"{API}/inspire", json={"category": "breakfast", "count": 3}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        assert len(r.json()["recipes"]) >= 1


# ---- SEC-001 RATE LIMIT (run LAST — exhausts limiter) ----
# Note: keyed by IP. Preview requests share IP. Do NOT run these before happy-path tests.
class TestRateLimit:
    def test_ask_recipes_rate_limit_429(self):
        # 60/hour budget for ask-recipes. Send tiny invalid queries (400) quickly.
        # First fire ~63 requests; expect 429 to appear once budget exhausted.
        # Use empty query -> 400 quickly.
        seen_429 = False
        codes = []
        for i in range(65):
            try:
                r = requests.post(f"{API}/ask-recipes", json={"query": ""}, timeout=10)
                codes.append(r.status_code)
                if r.status_code == 429:
                    seen_429 = True
                    break
            except requests.RequestException as e:
                codes.append(f"err:{e}")
        # Log for debugging
        print(f"ask-recipes codes: {codes}")
        assert seen_429, f"never saw 429 in {len(codes)} requests; codes={codes[-10:]}"

    def test_scan_rate_limit_429(self):
        # 30/hour for /scan. Fire ~33 tiny invalid requests.
        seen_429 = False
        codes = []
        for i in range(35):
            try:
                r = requests.post(f"{API}/scan", json={"image_base64": "a" * 50}, timeout=10)
                codes.append(r.status_code)
                if r.status_code == 429:
                    seen_429 = True
                    break
            except requests.RequestException as e:
                codes.append(f"err:{e}")
        print(f"scan codes: {codes}")
        assert seen_429, f"never saw 429; codes={codes[-10:]}"
