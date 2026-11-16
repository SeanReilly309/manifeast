# Reference copy of Playwright snippet used for Cook Mode structured-steps E2E (iteration 18)
import json, re, time

async def run_category(page, cat):
    out = {"cat": cat}
    await page.goto("https://whatieat.preview.emergentagent.com/inspire")
    await page.wait_for_selector(f'[data-testid="inspire-tab-{cat}"]', timeout=20000)
    await page.click(f'[data-testid="inspire-tab-{cat}"]')
    await page.wait_for_selector('[data-testid="recipe-card-0"]', timeout=150000)
    await page.click('[data-testid="recipe-card-0"]')
    await page.wait_for_selector('[data-testid="start-cook-mode-btn"]', timeout=15000)
    detail_url = page.url
    await page.click('[data-testid="start-cook-mode-btn"]')
    await page.wait_for_selector('[data-testid="cook-mode"]', timeout=15000)
    rid = page.url.split("/recipe/")[1].split("/")[0]
    recipe = await page.evaluate("""(rid) => {
        const c = JSON.parse(localStorage.getItem('manifeast_inspire_cache') || '{}');
        for (const k of Object.keys(c)) { const arr = Array.isArray(c[k]) ? c[k] : (c[k]?.recipes || []);
          for (const r of arr) if (r.id === rid) return r; }
        return null; }""", rid)
    out["title"] = await page.locator('[data-testid="cook-recipe-title"]').inner_text()
    out["prev_disabled_step1"] = await page.locator('[data-testid="cook-prev-btn"]').is_disabled()
    body = await page.inner_text("body")
    out["no_recipe_text"] = "No recipe to cook" in body
    steps_seen = []
    issues = []
    for i in range(30):
        txt = await page.locator('[data-testid="cook-step-text"]').inner_text()
        def g(tid):
            return tid
        meta = {}
        for k in ["heat", "temp", "duration", "cue"]:
            loc = page.locator(f'[data-testid="cook-step-{k}"]')
            meta[k] = (await loc.text_content()).strip() if await loc.count() else ""
        clock = page.locator('[data-testid="cook-timer-clock"]')
        meta["clock"] = (await clock.text_content()) if await clock.count() else ""
        ing0 = page.locator('[data-testid="cook-step-ingredient-0"]')
        meta["ing0"] = (await ing0.text_content()) if await ing0.count() else ""
        s = (recipe or {}).get("steps", [])
        if i < len(s):
            st = s[i]
            if st.get("duration_minutes"):
                exp = f"{st['duration_minutes']:02d}:00" if st['duration_minutes'] < 100 else None
                if exp and meta["clock"] != exp:
                    issues.append(f"step{i+1} clock {meta['clock']} != {exp}")
                if meta["duration"] != f"{st['duration_minutes']} min":
                    issues.append(f"step{i+1} duration chip {meta['duration']}")
            if st.get("ingredients") and meta["ing0"].strip() != st["ingredients"][0]:
                issues.append(f"step{i+1} ing0 '{meta['ing0']}' != '{st['ingredients'][0]}'")
            if st.get("heat") and not meta["heat"].lower().startswith(st["heat"]):
                issues.append(f"step{i+1} heat chip {meta['heat']} vs {st['heat']}")
        steps_seen.append((txt[:70], meta))
        if await page.locator('[data-testid="cook-finish-btn"]').count():
            break
        await page.click('[data-testid="cook-next-btn"]')
        await page.wait_for_timeout(150)
    out["n_steps_ui"] = len(steps_seen)
    out["n_steps_data"] = len((recipe or {}).get("steps", []))
    out["any_heat_or_dur"] = any(m["heat"] or m["duration"] for _, m in steps_seen)
    out["issues"] = issues
    out["steps"] = steps_seen
    await page.click('[data-testid="cook-finish-btn"]')
    await page.wait_for_timeout(800)
    out["finish_returns_detail"] = page.url == detail_url
    return out
