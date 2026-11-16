"""Structured Cook Mode steps (CookStep model) tests for /suggest, /ask-recipes, /inspire.
Limited live LLM calls: 2 ask-recipes, 1 suggest, 1 inspire(dinner, refresh)."""
import os
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
VALID_HEATS = {"", "low", "medium-low", "medium", "medium-high", "high"}
DUMP_DIR = "/app/test_reports/pytest"


def _dump(name, data):
    os.makedirs(DUMP_DIR, exist_ok=True)
    with open(f"{DUMP_DIR}/{name}.json", "w") as f:
        json.dump(data, f, indent=1)


def _check_structured(recipes, min_steps=3):
    """Shared structured-steps assertions; returns stats."""
    assert recipes, "no recipes"
    stats = {"recipes": len(recipes), "steps": 0, "heat": 0, "duration": 0, "temp": 0, "ings": 0, "cue": 0}
    for r in recipes:
        steps = r.get("steps")
        assert isinstance(steps, list), f"{r['title']}: steps missing"
        assert len(steps) >= min_steps, f"{r['title']}: only {len(steps)} steps"
        # back-compat instructions
        instr = r.get("instructions")
        assert isinstance(instr, list) and len(instr) >= 2 and all(isinstance(x, str) for x in instr)
        for i, s in enumerate(steps, 1):
            assert s["number"] == i
            assert isinstance(s["instruction"], str) and s["instruction"].strip()
            assert isinstance(s["ingredients"], list)
            assert s["heat"] in VALID_HEATS, s["heat"]
            stats["steps"] += 1
            stats["heat"] += 1 if s["heat"] else 0
            stats["duration"] += 1 if (s.get("duration_minutes") or 0) > 0 else 0
            stats["temp"] += 1 if (s.get("temperature_c") or 0) > 0 else 0
            stats["ings"] += 1 if s["ingredients"] else 0
            stats["cue"] += 1 if s.get("doneness_cue") else 0
    print("STATS", stats)
    assert stats["duration"] >= 1, "no step with duration_minutes"
    return stats


class TestAskRecipesSteps:
    def test_chicken_stir_fry(self):
        r = requests.post(f"{API}/ask-recipes", json={"query": "chicken stir fry", "max_recipes": 2}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        recipes = r.json()["recipes"]
        _dump("ask_stirfry", recipes)
        stats = _check_structured(recipes)
        heat_ratio = stats["heat"] / stats["steps"]
        print(f"heat ratio {heat_ratio:.2f}")
        assert heat_ratio >= 0.6, f"heat ratio {heat_ratio:.2f} < 0.6"

    def test_chocolate_chip_cookies_oven_temp(self):
        r = requests.post(f"{API}/ask-recipes", json={"query": "chocolate chip cookies", "max_recipes": 2}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        recipes = r.json()["recipes"]
        _dump("ask_cookies", recipes)
        _check_structured(recipes)
        for rec in recipes:
            temps = [s["temperature_c"] for s in rec["steps"] if s.get("temperature_c")]
            print(rec["title"], temps)
            # no-bake variants are allowed to have no temperature
            if any("bake" in s["instruction"].lower() or "oven" in s["instruction"].lower() for s in rec["steps"]):
                assert temps, f"{rec['title']}: oven recipe without temperature_c"
                assert all(140 <= t <= 230 for t in temps), temps


class TestSuggestSteps:
    def test_suggest_structured(self):
        r = requests.post(f"{API}/suggest", json={"ingredients": ["chicken", "rice", "garlic", "onion", "soy sauce"]}, timeout=150)
        assert r.status_code == 200, r.text[:300]
        recipes = r.json()["recipes"]
        _dump("suggest", recipes)
        _check_structured(recipes)


class TestInspireSteps:
    def test_inspire_dinner_12(self):
        r = requests.post(f"{API}/inspire", json={"category": "dinner", "count": 12, "refresh": True}, timeout=180)
        assert r.status_code == 200, r.text[:300]
        recipes = r.json()["recipes"]
        _dump("inspire_dinner", recipes)
        print("inspire dinner count", len(recipes))
        _check_structured(recipes, min_steps=3)
        assert len(recipes) == 12, f"expected 12 recipes got {len(recipes)}"
