# Manifeast — Codemagic iOS setup (iPhone-friendly)

Codemagic handles all the tricky Apple signing behind the scenes through their web UI — no more base64-encoding `.p8` files or fighting 401 errors. Free tier: 500 build min/month (~10 iOS builds).

**Total setup time: ~15 minutes on iPhone.**

---

## Part 1 — Sign up (~2 min)

1. On your iPhone in Safari, open **[codemagic.io](https://codemagic.io)** → tap **"Sign up"**
2. Tap **"Sign up with GitHub"** → authorize Codemagic to see your repos
3. You'll land on the Codemagic dashboard

---

## Part 2 — Connect your Manifeast repo (~1 min)

1. In Codemagic dashboard, tap **"Add application"** (top-right, or a big + button)
2. Find **`SeanReilly309/manifeast`** in the list → tap **"Set up build"**
3. Choose **"Flutter/React Native/Ionic/Native Android/iOS"** → **"Continue"**
4. When asked how you want to configure the workflow → pick **"codemagic.yaml"** (not "Workflow Editor"). Our repo already has one.

---

## Part 3 — Set up the App Store Connect integration (~5 min)

This is where Codemagic replaces all the fiddly GitHub secrets stuff.

1. In Codemagic, tap your profile icon (top-right) → **"Teams"** → **"Personal Account"** → **"Integrations"** tab
2. Find **"Apple Developer Portal"** → tap **"Connect"**
3. Fill in:
   - **Integration name:** `manifeast_asc` (must match this exactly — the yaml references it)
   - **Issuer ID:** paste your Apple Issuer ID (`8ed137be-c86e-46fe-b53b-91627386a8ce` from earlier)
   - **Key ID:** `3RNY753876`
   - **API Key:** tap **"Choose file"** → pick your `AuthKey_3RNY753876.p8` from Files (iCloud → Downloads)
4. Tap **"Save"**

Codemagic tests the connection immediately and gives a green ✅ if it works.

---

## Part 4 — Create the environment group (~1 min)

1. Same page → **"Environment variables"** tab
2. Tap **"Add group"** → name it `manifeast_env` (must match the yaml)
3. Add these variables:
   | Variable | Value | Secure |
   |---|---|---|
   | `REACT_APP_BACKEND_URL` | `https://manifest.ie` | ✅ |
4. **Save**

---

## Part 5 — Trigger the first build (~30 sec)

1. Come back to your app in Codemagic (Home → your `manifeast` repo tile)
2. Tap **"Start new build"** → pick workflow **"iOS → TestFlight (Manifeast)"** → **"Start build"**
3. Watch the live log. First build: ~10-15 min.

Codemagic's automatic signing step handles all the certificate + provisioning profile stuff that GitHub Actions couldn't. When you see the final green ✅ **"Publishing to App Store Connect"** step, you'll get an Apple email within 5-15 min.

---

## Ongoing releases

Every `git push` to `main` (or every Emergent "Save to Github" to `main`) triggers a fresh iOS build automatically. No tags needed.

Or trigger manually anytime from Codemagic → your app → **"Start new build"**.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| First build fails on signing | In Codemagic → App Store Connect integration → click the ⋯ menu → **"Refresh"**. Then retry the build. |
| "manifeast_env not found" | You didn't name the env group exactly `manifeast_env` (case-sensitive). |
| "manifeast_asc not found" | Same story for the App Store Connect integration name. |
| Codemagic can't find `codemagic.yaml` | Make sure `codemagic.yaml` is at the ROOT of the repo (not inside `frontend/`). It should be at `github.com/SeanReilly309/manifeast/blob/main/codemagic.yaml`. |

---

## Good news 🎉

Once this works once, every future update is a **single git push** — no more clicking around in workflows. Codemagic auto-detects the changes and ships them to TestFlight in one shot.
