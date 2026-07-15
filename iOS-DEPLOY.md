# Manifeast — iOS App Store setup (iPhone-only friendly)

This is a step-by-step, one-time setup that gets **Manifeast on TestFlight and the App Store** without ever needing a Mac. Every step is doable from an iPhone in Safari.

Once complete, every push of a git tag like `ios-v1.0.4` (or a manual click in the GitHub Actions tab) builds a signed `.ipa` on a rented macOS runner and ships it straight to TestFlight for review.

---

## What you'll need

- An **iPhone** with Safari
- Your **credit card** for two things:
  - $99/year Apple Developer Program
  - A domain (already yours if you own `manifeast.ie`)
- **~2 hours** for the one-time setup. Every submission after that is a single tag push (~15 min build + Apple review).

Cost after setup: **$0 per submission** (GitHub Actions is free on public repos, ~$0.08/min on private, and iOS builds usually take ~15 min).

---

## Part 1 — Apple side (~45 min, all in Safari)

### 1.1 · Sign up for Apple Developer Program
- Open https://developer.apple.com/programs/enroll on your iPhone.
- Sign in with your Apple ID (create one if needed).
- Enrol as an **Individual** (fastest) or **Organization** (needs a D‑U‑N‑S number — only if you have a company).
- Pay $99. You'll get an email confirmation within a few hours.

### 1.2 · Create the app record in App Store Connect
- Open https://appstoreconnect.apple.com on your iPhone.
- Tap **My Apps → +** → **New App**.
- Fill in:
  - **Platform:** iOS
  - **Name:** `Manifeast`
  - **Primary language:** English (Ireland)
  - **Bundle ID:** `com.manifeast.app` ← must match `capacitor.config.json` exactly. If it's not in the picklist, first go to https://developer.apple.com/account/resources/identifiers/list and register it there.
  - **SKU:** `manifeast-ios-01` (any unique string, just for your bookkeeping)
- Tap **Create**.

### 1.3 · Create an App Store Connect API key
This lets your GitHub Actions upload builds without your Apple password.
- Still in appstoreconnect.apple.com → **Users and Access** → **Integrations** tab → **App Store Connect API**.
- Tap **+** → give it a name like `Manifeast CI` → **Access: App Manager**.
- Tap **Generate**.
- **Download the `.p8` file immediately** — Apple only lets you download it once. Airdrop it to yourself or save to iCloud Drive.
- Also copy the **Key ID** (10 chars, e.g. `ABC123XYZ0`) and **Issuer ID** (a UUID at the top of the page).

### 1.4 · Create signing certificate & provisioning profile
- Open https://developer.apple.com/account/resources/certificates/list on your iPhone.
- Tap **+** to create a new certificate → **Apple Distribution** → follow the prompts.
- Because you're on iPhone (no keychain), use **Fastlane Match**, **Codemagic's automatic signing**, or generate the CSR on the GitHub runner during first build. **Easiest option:** the workflow uses `-allowProvisioningUpdates` so Xcode + your ASC API key auto-generate the cert on the first run. Skip this step and revisit if the first build fails.

### 1.5 · Grab your Team ID
- Open https://developer.apple.com/account → **Membership** → **Team ID** (10 characters).

---

## Part 2 — GitHub side (~30 min)

### 2.1 · Push the code to GitHub
- In the **Emergent chat**, tap **Save to Github** — this creates a repo you own with the current code.
- Make note of the repo URL (e.g. `github.com/you/manifeast`).

### 2.2 · Add repository secrets
- On your iPhone, open the repo in Safari → tap **⋯ → Settings** (or navigate `github.com/you/manifeast/settings/secrets/actions`).
- Tap **New repository secret** and add each of these one at a time:

  | Name | Value |
  |---|---|
  | `APP_STORE_CONNECT_KEY_ID` | The 10-char Key ID from step 1.3 |
  | `APP_STORE_CONNECT_ISSUER_ID` | The Issuer UUID from step 1.3 |
  | `APP_STORE_CONNECT_KEY_BASE64` | The `.p8` file, base64-encoded (see 2.3 below) |
  | `IOS_TEAM_ID` | The 10-char Team ID from step 1.5 |
  | `REACT_APP_BACKEND_URL` | `https://manifeast.ie` (your production API host) |
  | `IOS_CERT_P12_BASE64` | (Only needed if 1.4 auto-signing fails — leave blank for now) |
  | `IOS_CERT_P12_PASSWORD` | (Only needed with `IOS_CERT_P12_BASE64`) |
  | `IOS_PROVISIONING_PROFILE_BASE64` | (Only needed with `IOS_CERT_P12_BASE64`) |

### 2.3 · How to base64-encode the .p8 on iPhone
- Open the **Shortcuts** app on iPhone.
- Create a new shortcut → add action **Get File** → pick the `.p8` from iCloud Drive → add action **Base64 Encode**.
- Copy the output and paste it into the GitHub secret box.

Alternative: open https://www.base64encode.org, upload the file, copy the encoded string.

### 2.4 · Enable Actions
- In the repo → **Actions** tab → **I understand my workflows, go ahead and enable them**.

---

## Part 3 — First build (10 min click, ~15 min wait)

Now you can trigger a build from your iPhone:

- Open the repo → **Actions** tab → **iOS Build & Submit** → **Run workflow** → **Run**.
- Watch it stream logs live. Total time: ~15 min.
- If the build fails on the signing step, follow the error hint (usually about the certificate). If it succeeds:
  - The `.ipa` is uploaded to **App Store Connect → TestFlight** as a new build.
  - You'll get an email: "New build for Manifeast" in 5–15 min after upload finishes.

### 3.1 · Test it yourself via TestFlight
- Install the **TestFlight** app on your iPhone from the App Store.
- Open App Store Connect → **My Apps → Manifeast → TestFlight** → your new build → **Internal Testing** → **+ Add Testers** → add your own Apple ID email.
- TestFlight app on your phone will show the build within a minute. Tap **Install**. It runs like a real App Store app.

### 3.2 · Submit to the public App Store
Once you're happy with the TestFlight build:
- App Store Connect → **App Store** tab → fill in:
  - **Screenshots** (I can generate these — ask me to create screenshot automation)
  - **Description** (~4000 chars)
  - **Keywords** (~100 chars)
  - **Support URL** (probably `https://manifeast.ie`)
  - **Privacy URL** (needs a `/privacy` page — I can build one)
  - **Category:** Food & Drink
  - **Age rating:** 4+ (probably)
- Attach the same build you tested → **Submit for Review**.
- Wait ~24–72 h for Apple's decision. Most rejections are for missing privacy policy or vague app descriptions — I can help polish either.

---

## Ongoing releases

Every time you want to ship an update to TestFlight/App Store:

```bash
git tag ios-v1.0.5
git push origin ios-v1.0.5
```

…or from iPhone Safari: repo → **Actions → iOS Build & Submit → Run workflow**. That's it.

The workflow auto-increments the build number using GitHub's run number, so you never have to babysit `Info.plist`.

---

## Troubleshooting quick reference

| Symptom | Fix |
|---|---|
| Workflow fails on "Import certificate" | Skip manual signing; the workflow's `-allowProvisioningUpdates` will use ASC API key to auto-generate. Delete the `IOS_CERT_*` secrets. |
| altool: "Invalid API Key" | Double-check `APP_STORE_CONNECT_KEY_BASE64` was pasted without extra newlines and matches the Key ID. |
| TestFlight build stuck in "Processing" | Apple takes 5–30 min. Longer means the build had missing symbols — check the Actions log for warnings. |
| Bundle ID mismatch | Every reference (App Store Connect app record, `capacitor.config.json`, workflow `APP_BUNDLE_ID`) must match `com.manifeast.app` exactly. |
| "Missing Push Notifications Entitlement" | Manifeast doesn't use push notifications yet — nothing to fix. If Apple's warning trips the CI, add `-allowProvisioningUpdates` (already in the workflow). |

---

## What lives in the repo

- `frontend/capacitor.config.json` — Capacitor app identity (`com.manifeast.app`, `Manifeast`, `webDir: build`).
- `frontend/ios/` — auto-generated Xcode project (created on first CI run, safe to commit or gitignore).
- `.github/workflows/ios-build.yml` — the whole CI pipeline.
- `iOS-DEPLOY.md` — this file.

## Contact & help

- Emergent chat → "Contact Support" for anything Emergent-side (domain DNS, deployment env vars, quota).
- For Apple-side issues, https://developer.apple.com/support is surprisingly fast on chat.

Good luck 🍎 — you'll ship your first TestFlight build tonight.
