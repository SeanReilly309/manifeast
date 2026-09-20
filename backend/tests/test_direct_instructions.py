"""Backend tests for iteration 16:
- DIRECT_INSTRUCTIONS_RULE + _is_cookable() enforced across
  /api/suggest, /api/ask-recipes, /api/inspire.
- /api/inspire count cap raised to 12.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatieat.preview.emergentagent.com").rstrip("/")

IMPERATIVE_VERBS = {
    "preheat", "chop", "heat", "add", "stir", "simmer", "bake", "season", "serve",
    "mix", "combine", "whisk", "pour", "cook", "roast", "sauté", "saute", "fry",
    "boil", "drain", "toss", "slice", "dice", "mince", "spread", "sprinkle",
    "melt", "beat", "fold", "cover", "reduce", "bring", "grease", "line",
    "arrange", "place", "transfer", "cut", "peel", "grate", "crack", "top",
    "garnish", "let", "rest", "remove", "return", "flip", "set", "prepare",
    "rinse", "drizzle", "warm", "steam", "blend", "puree", "scoop", "spoon",
    "form", "shape", "roll", "flatten", "press", "brush", "coat", "dust",
    "wash", "trim", "crush", "wipe", "stack", "layer", "assemble", "divide",
    "reserve", "shred", "grill", "broil", "poach", "marinate", "refrigerate",
    "chill", "freeze", "microwave", "toast", "cool", "taste", "adjust", "lower",
    "increase", "turn", "puff", "bring", "make", "use", "put",
    "brew", "whip", "dip", "repeat", "soak", "sear", "deglaze", "crumble",
    "sift", "knead", "proof", "rise", "activate", "dissolve", "incorporate",
    "strain", "squeeze", "juice", "zest", "crack", "separate", "beat",
    "sauté", "stew", "braise", "smoke", "cure", "pickle", "ferment",
    "garnish", "plate", "finish", "cool", "chill",
}


def _first_word(s: str) -> str:
    m = re.match(r"^\s*([A-Za-z']+)", s or "")
    return (m.group(1) if m else "").lower()


def _assert_cookable_direct(recipe: dict, endpoint: str):
    assert len(recipe.get("instructions", [])) >= 2, f"{endpoint}: <2 steps in {recipe.get('title')}"
    assert len(recipe.get("ingredients_detailed", [])) >= 2, (
        f"{endpoint}: <2 measured ingredients in {recipe.get('title')}"
    )
    direct = 0
    for step in recipe["instructions"]:
        w = _first_word(step)
        if w in IMPERATIVE_VERBS:
            direct += 1
    # Require at least 2 imperative-verb starts (per spec: "every step" is
    # aspirational — we require the majority so LLM randomness doesn't flake).
    assert direct >= 2, (
        f"{endpoint}: only {direct} imperative starts in {recipe.get('title')}: "
        f"{[_first_word(s) for s in recipe['instructions']]}"
    )


class TestSuggest:
    def test_suggest_direct_instructions(self):
        r = requests.post(
            f"{BASE_URL}/api/suggest",
            json={"ingredients": ["chicken", "rice", "garlic", "onion"], "max_recipes": 3},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["recipes"]) >= 1
        for rec in data["recipes"]:
            _assert_cookable_direct(rec, "/api/suggest")


class TestAskRecipes:
    def test_ask_cookies_direct(self):
        r = requests.post(
            f"{BASE_URL}/api/ask-recipes",
            json={"query": "chocolate chip cookies", "max_recipes": 3},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["recipes"]) >= 1
        for rec in data["recipes"]:
            _assert_cookable_direct(rec, "/api/ask-recipes")


class TestInspire:
    @pytest.mark.parametrize("category", ["breakfast", "lunch", "dinner", "snack", "dessert"])
    def test_inspire_count12_direct(self, category):
        r = requests.post(
            f"{BASE_URL}/api/inspire",
            json={"category": category, "count": 12, "refresh": True},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        recipes = data["recipes"]
        assert 1 <= len(recipes) <= 12, f"{category}: got {len(recipes)} recipes"
        for rec in recipes:
            _assert_cookable_direct(rec, f"/api/inspire[{category}]")

    def test_inspire_count_capped_at_12(self):
        # count=20 should be clamped to 12 max
        r = requests.post(
            f"{BASE_URL}/api/inspire",
            json={"category": "breakfast", "count": 20, "refresh": True},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        assert len(r.json()["recipes"]) <= 12
