# Tribal Wars Scavenge Helper

A readable, English userscript for Tribal Wars scavenging that supports:

- **Non-Premium single-village mode** (Collect tab)
- **Premium mass-scavenge mode** (if available on your account/server)
- Per-unit filters and limits
- Percentage-based sending
- Option selection (1–4)
- Distribution modes:
  - **Even split** (recommended default)
  - Weighted split (15/6/3/2)
- Calculation preview before sending
- Semi-manual send with confirmation per option (safer behavior)

---

## 1) What this script is for

This helper improves scavenging workflow by:

1. Reading available troop counts
2. Letting you choose how many troops to use
3. Splitting troops across selected scavenging options
4. Showing expected resources/time
5. Optionally sending actions with manual confirmations

It is designed to be understandable and configurable, unlike heavily obfuscated snippets.

---

## 2) Requirements

- A modern browser (Chrome/Edge/Firefox)
- Access to Tribal Wars scavenging screen
- A hosted `collect.js` file (GitHub repo is enough)

No paid API or external premium service is required for the script itself.

> Note: Premium game features are still controlled by the game itself.  
> Non-Premium users can still use the single-village mode.

---

## 3) File naming and hosting

1. Put the script in your repo as `collect.js`.
2. Keep the repo public (if loading directly by URL).
3. Commit and push changes.

Recommended structure:

- Repo: `https://github.com/<your-user>/<repo>`
- Script file: `collect.js` in repo root

---

## 4) Recommended loading method (cache-safe)

Use a **commit-pinned** bookmarklet, not `@main`, to avoid cache issues.

### Step-by-step

1. Open your latest GitHub commit.
2. Copy the commit SHA (7+ chars is fine).
3. Create/edit browser bookmark.
4. Set URL to:

```javascript
javascript:(()=>{const u='https://cdn.jsdelivr.net/gh/<your-user>/<repo>@<commit-sha>/collect.js';const s=document.createElement('script');s.src=u+'?v='+Date.now();s.onload=()=>console.log('Loaded',u);s.onerror=e=>console.error('Load failed',u,e);document.head.appendChild(s);})();
```

### Raw GitHub fallback

```javascript
javascript:(()=>{const u='https://raw.githubusercontent.com/<your-user>/<repo>/<commit-sha>/collect.js';const s=document.createElement('script');s.src=u+'?v='+Date.now();s.onload=()=>console.log('Loaded',u);s.onerror=e=>console.error('Load failed',u,e);document.head.appendChild(s);})();
```

---

## 5) Important: do **not** use `$.getScript(...)`

`$.getScript(...)` can fail due to CORS/CORB/XHR restrictions on some pages.

Use the `<script src=...>` bookmarklet format shown above.

---

## 6) How to use (Non-Premium, Collect tab)

Open: **Rally Point -> Collect**

When loaded correctly, a floating panel appears:

- `Non-Premium Scavenge Helper`

### Controls overview

- **Options (1–4)**: choose which scavenging options to include
- **Send %**: percent of enabled troops to use
- **Distribution**:
  - `Even (recommended)` -> equal split among selected options
  - `Weighted (15/6/3/2)` -> classic weighted split
- **Use troop limits (fine tuning)**:
  - enables per-unit caps (`1000` or `50%`)
- **Per troop checkboxes**:
  - include/exclude unit type
- **Per troop limit inputs**:
  - max number or percent
- **Calculate**:
  - preview estimated resources/time and troop split
- **Send (confirm each)**:
  - prepares each option and asks confirmation before sending
- **Hide panel**:
  - hides UI
- **Show Scavenge Panel**:
  - appears after hiding, to restore the panel

---

## 7) Suggested usage workflow (safe/semi-manual)

1. Select options you want to use.
2. Set `Distribution` to **Even (recommended)**.
3. Set send percentage (for example 50–80%).
4. (Optional) Enable fine tuning and add unit caps.
5. Click `Calculate` and review results.
6. Click `Send (confirm each)` and approve only options you want.
7. Leave short pauses between runs.

This keeps the process human-supervised and less aggressive.

---

## 8) Premium mode behavior

If the page contains mass-scavenge table elements, script auto-switches to mass mode.

It can:

- add extra columns
- calculate across villages
- run mass send logic

If Premium page is not available, script stays in non-Premium single-village mode.

---

## 9) Troubleshooting

## A) Script loads but old behavior remains

Cause: caching (`@main` CDN or browser cache).

Fix:

1. Use commit-pinned URL (`@<commit-sha>`)
2. Add `?v=` timestamp (already in bookmarklet)
3. Optionally purge jsDelivr:
   - `https://purge.jsdelivr.net/gh/<your-user>/<repo>@main/collect.js`

## B) Console shows `Load failed`

Possible causes:

- bad URL/path/filename
- script blocked by CSP/network

Fix:

1. Open script URL directly in browser tab and verify it returns JS text.
2. Try raw GitHub fallback bookmarklet.
3. If CSP blocks all remote scripts, use Tampermonkey (local userscript install).

## C) `Troop table not found`

This can happen if overview parsing layout differs by server.
The script includes fallback reading troop counts from current Collect page.

If still failing, inspect selectors for your world skin and adapt parsing.

## D) `Calculate` or `Send` stops working after hide/show

This has been fixed by binding button handlers on each panel render.
Update to latest `collect.js`.

---

## 10) Configuration storage

Settings are persisted in browser `localStorage` per world/server:

- selected options
- selected troop types
- per-troop limits
- percentage value
- fine-tuning toggle
- distribution mode

---

## 11) Risk and fair-use note

This project is intended for convenience and readability.
Automation can still be subject to game rules/policies.

Recommendations:

- prefer semi-manual mode (`Send (confirm each)`)
- avoid fully unattended repetitive behavior
- keep realistic pacing
- verify your server’s Terms of Service

---

## 12) Update process for maintainers

1. Edit `collect.js`
2. Commit changes
3. Copy latest commit SHA
4. Update bookmarklet URL (or keep generic and replace SHA as needed)
5. Reload game and verify version log in console

---

## 13) Credits

- Based on reverse engineering of an obfuscated scavenging helper
- Rewritten for clarity, maintainability, and English UI/log output
