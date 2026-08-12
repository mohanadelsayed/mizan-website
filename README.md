# MIZAN · Landing Page

Egypt's proposed national platform for Extended Producer Responsibility.
Domain: **[mizan.eco](https://mizan.eco)**

---

## What's here

```
mizan-website/
├── public/
│   ├── index.html         ← main page (single-page storytelling)
│   ├── style.css          ← full brand palette + interactive states
│   ├── script.js          ← 14-click architecture state machine
│   └── assets/
│       └── favicon.svg    ← M-mark
├── server.js              ← Express static server for Railway
├── package.json           ← Node deps + start script
├── Procfile               ← Railway process definition
└── .gitignore
```

**No build step.** Pure HTML/CSS/JS, served by a 15-line Express server.

---

## Local preview

```bash
cd mizan-website
npm install
npm start
```

Open http://localhost:3000

---

## Deploy to Railway

### Option A: via Railway CLI (fastest)

```bash
# once
npm install -g @railway/cli
railway login

# in the mizan-website folder
railway init
railway up
```

Railway auto-detects Node · installs deps · runs `npm start` · gives you a `*.up.railway.app` URL immediately.

### Option B: via GitHub (recommended for iteration)

1. Create a new GitHub repo: `mizan-website`
2. `git init && git add . && git commit -m "initial"`
3. `git remote add origin git@github.com:YOUR_USER/mizan-website.git`
4. `git push -u origin main`
5. In Railway dashboard → **New Project → Deploy from GitHub Repo**
6. Select the repo. Railway detects the Node project. Deploys automatically.
7. Every push to `main` auto-deploys.

### Connect the custom domain (`mizan.eco`)

1. In Railway project → **Settings → Domains → Custom Domain**
2. Enter `mizan.eco` and `www.mizan.eco`
3. Railway gives you a CNAME target (something like `xyz.up.railway.app`)
4. In Porkbun DNS panel:
   - Add CNAME record: `@` → `xyz.up.railway.app` (or as instructed)
   - Add CNAME record: `www` → `xyz.up.railway.app`
5. Wait 5–30 minutes for DNS propagation
6. Railway auto-issues a Let's Encrypt SSL certificate

Total time to live: **~15 minutes**.

---

## What to fill in / customize

### Placeholders currently in the site

| Element | Where | What to swap in |
|---|---|---|
| `[LOGO: X]` tiles | Partners section | Real partner logos as PNG/SVG (upload to `public/assets/logos/`) |
| `[PHOTO: X]` avatars | Team section | Team headshots (upload to `public/assets/team/`) |
| `og-image.png` | `<meta property="og:image">` | Design a 1200x630 preview card |
| Email `info@mizan.eco` | Multiple places | Ensure this email address is created (via Porkbun Email Forwarding — free) |

### Suggested edits before launch

1. **Team photos** — even circular avatars with initials work if photos aren't ready
2. **Partner logos** — swap the `[LOGO: X]` divs with `<img>` tags once you have permission
3. **Add case studies** section if Dr.WEEE has photo documentation
4. **Consider adding Arabic version** — the site is currently English-primary; an Arabic switcher can be added later

---

## Interactive Architecture — how it works

The centrepiece section (`#architecture`) is a **14-state SVG animation** that mirrors slide 9 of the sponsor keynote. Each click reveals one element of the architecture, with a narrative panel that updates on the right.

- **Keyboard shortcuts** (when the section is in view):
  - `→` or `Space` — next click
  - `←` — previous click
  - `P` — play/pause auto-advance
  - `R` — reset to baseline
- **Auto-play speed:** 3.5 seconds per click (adjustable in `script.js`, `playInterval` timer)
- **Auto-trigger:** when the user scrolls the architecture section into view, click 1 fires after 900ms (a subtle nudge)

Every click state is defined in `script.js` in the `CLICKS` array. To edit narratives, change that array — no other changes needed.

---

## Honesty ribbon

The top ribbon and the "Real vs Proposed" section are **intentional**. The site does not claim Mizan is an operating PRO; it clearly distinguishes:

- **Operating today**: Dr.WEEE take-back (WMRA-licensed since 2018), REMIT alliance, ChemiCan legal + operational structure
- **Proposed**: The PRO role, the escrow architecture, the two-certificate mechanism — all pending WMRA authorisation and Article 17 sub-decree issuance

This positioning is required both by:
- The `.eco` public pledge (transparency about environmental claims)
- Basic due diligence — no false claim of official authority should appear anywhere

---

## Contact

Site maintenance: `info@mizan.eco` · General: `mohanad.elsayed@chemican.ca`
