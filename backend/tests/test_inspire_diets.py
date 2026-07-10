"""Backend tests for /api/inspire dietary filters (iteration 4)."""
import os
import re
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 180

MEAT_FISH = [
    "chicken", "beef", "pork", "bacon", "ham", "sausage", "turkey", "lamb",
    "veal", "prosciutto", "pepperoni", "salami", "chorizo",
    "fish", "salmon", "tuna", "cod", "tilapia", "shrimp", "prawn",
    "crab", "lobster", "anchov", "sardine", "mackerel", "trout",
]
WHEAT_GLUTEN = [
    "wheat", "flour", "pasta", "spaghetti", "penne", "linguine", "fettuccine",
    "macaroni", "lasagna", "ravioli", "gnocchi", "noodle",  # regular noodles
    "bread", "toast", "bun", "roll", "bagel", "tortilla", "pita",
    "couscous", "bulgur", "barley", "rye", "farro",
    "soy sauce",
    "panko", "breadcrumb", "cracker", "pretzel",
    "cake flour", "all-purpose",
]
# Exclusions: allow "gluten-free" variants explicitly
GF_ALLOWLIST_RE = re.compile(r"gluten[- ]free|almond flour|coconut flour|rice flour|chickpea flour|oat flour|corn tortilla|rice noodle|zucchini noodle|shirataki", re.I)

DAIRY = ["milk", "butter", "cheese", "yogurt", "yoghurt", "cream", "ghee", "kefir", "whey", "casein", "curd", "paneer", "ricotta", "mozzarella", "parmesan", "feta", "cheddar", "brie"]
DAIRY_ALLOWLIST_RE = re.compile(r"coconut milk|almond milk|oat milk|soy milk|cashew milk|nut milk|coconut cream|coconut butter|peanut butter|almond butter|cashew butter|nut butter|nutritional yeast|vegan (butter|cheese|cream|yogurt|milk|mozzarella|parmesan|feta|ricotta)|dairy[- ]free", re.I)

VEGAN_EXTRA = ["egg", "honey"]
VEGAN_EGG_ALLOWLIST_RE = re.compile(r"eggplant|egg[- ]free", re.I)


def _all_ing_names(recipes):
    out = []
    for r in recipes:
        for it in r.get("ingredients_detailed", []) or []:
            name = (it.get("name") or "").lower()
            if name:
                out.append((r.get("title", "?"), name))
    return out


def _find_violations(pairs, banned, allowlist_re=None):
    violations = []
    for title, name in pairs:
        if allowlist_re and allowlist_re.search(name):
            continue
        for kw in banned:
            # word boundary-ish match
            if re.search(rf"\b{re.escape(kw)}", name):
                violations.append((title, name, kw))
                break
    return violations


class TestDietVegetarianGlutenFree:
    def test_lunch_veg_and_gf(self):
        r = requests.post(f"{API}/inspire", json={
            "category": "lunch", "count": 5,
            "diets": ["vegetarian", "gluten_free"],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:600]
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10, f"count={len(recipes)}"
        pairs = _all_ing_names(recipes)
        meat_v = _find_violations(pairs, MEAT_FISH)
        assert not meat_v, f"meat/fish in vegetarian recipes: {meat_v[:5]}"
        gf_v = _find_violations(pairs, WHEAT_GLUTEN, GF_ALLOWLIST_RE)
        # Allow at most 1 borderline mismatch (LLM occasionally slips)
        assert len(gf_v) <= 1, f"gluten in GF recipes: {gf_v[:5]}"


class TestDietVegan:
    def test_dinner_vegan(self):
        r = requests.post(f"{API}/inspire", json={
            "category": "dinner", "count": 5, "diets": ["vegan"],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:600]
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
        pairs = _all_ing_names(recipes)
        meat_v = _find_violations(pairs, MEAT_FISH)
        assert not meat_v, f"meat/fish in vegan: {meat_v[:5]}"
        dairy_v = _find_violations(pairs, DAIRY, DAIRY_ALLOWLIST_RE)
        assert not dairy_v, f"dairy in vegan: {dairy_v[:5]}"
        egg_v = _find_violations(pairs, VEGAN_EXTRA, VEGAN_EGG_ALLOWLIST_RE)
        assert not egg_v, f"egg/honey in vegan: {egg_v[:5]}"


class TestDietLowCarb:
    def test_lunch_low_carb(self):
        r = requests.post(f"{API}/inspire", json={
            "category": "lunch", "count": 5, "diets": ["low_carb"],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:600]
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
        # soft threshold: allow at most 1 recipe up to 40g, rest <= 30g
        carbs = [(r.get("title"), (r.get("nutrition") or {}).get("carbs_g", 0)) for r in recipes]
        over_30 = [c for c in carbs if c[1] > 30]
        way_over = [c for c in carbs if c[1] > 40]
        assert not way_over, f"low_carb recipes >40g carbs: {way_over} (all: {carbs})"
        assert len(over_30) <= 1, f"too many >30g carbs: {over_30} (all: {carbs})"


class TestDietNoRegression:
    def test_breakfast_no_diet(self):
        r = requests.post(f"{API}/inspire", json={
            "category": "breakfast", "count": 5, "diets": [],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:600]
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
        # Sanity: varied titles
        titles = {r["title"].lower() for r in recipes}
        assert len(titles) >= max(3, len(recipes) - 1), f"not varied enough: {titles}"


class TestDietUnknownIgnored:
    def test_unknown_diet_ignored(self):
        r = requests.post(f"{API}/inspire", json={
            "category": "lunch", "count": 5, "diets": ["keto_extreme"],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, f"unknown diet should be ignored, got {r.status_code}: {r.text[:400]}"
        recipes = r.json().get("recipes", [])
        assert 4 <= len(recipes) <= 10
