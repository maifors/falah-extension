# Falah OS — Browser Extension v2.4.0

> **Shariah-Compliant Browsing with 5-Prayer Grid, Live Countdown, Souq Marketplace, Halal Monitor, and Ummah ID.**

Falah OS is a sovereign, Shariah-native Chrome extension that protects the digital well-being of the global Muslim community. It integrates real-time Shariah compliance auditing, zero-knowledge identity protocols, and elegant Islamic mindfulness widgets into your browser — now connected live to the **Falah OS Mobile backend** for prayer, marketplace, and gamification data.

---

## ✨ Key Features

### 🕌 Enhanced Prayer Grid (NEW in v2.4.0)
| Feature | Description |
|---------|-------------|
| **5-Prayer Grid** | All five salah times (Fajr–Isha) displayed at a glance — next prayer highlighted in gold, passed prayers dimmed |
| **Live Countdown** | Real-time countdown to the next prayer, updating every second — `"34m 49s"` |
| **Day Progress Bar** | 3px gradient bar showing how much of the day has passed (e.g. `"83%"`) — visual grounding throughout the day |
| **Auto-fetch** | Times fetched live from `falahos.my/mobile/api/prayer/times` — no manual city config needed |

### 📡 Whisper Engine — Real-Time Page Classification
Every page you visit is audited against Shariah principles in real time:

| Verdict | Colour | Meaning |
|---------|--------|---------|
| **Safe** | 🟢 Green | Halal content — free to browse |
| **Caution** | 🟡 Amber | Potentially questionable content |
| **Warning** | 🔴 Red | Islamically problematic content |
| **Blocked** | 🚫 Red | Explicitly haram — access blocked in Strict mode |

Classification uses a two-tier engine: **local regex rules** (offline-capable) backed by a **serverless API** for enhanced detection. Each result includes Quranic evidence, Hadith references, and plain-language explanations.

### 📖 Contextual Islamic Guidance
Every verdict is backed by authentic Islamic principles with context-matched **Quranic verses** and **Hadith** evidence (*Maysir* for gambling, *Khamr* for alcohol, *Riba* for interest, etc.).

### 🖥️ Premium Side Panel & Widgets
- **Verdict Side Panel** — Panel harmonised with the [Ummah FalahOS](https://ummah.falahos.my) design system: deep green (`#1a472a`), Islamic gold (`#c9a84c`), cream (`#f5e6c8`), Playfair Display headings, 12px card radii
- **Floating Widgets** — Draggable, stateful mini-apps for Prayer Times, Halal Checker, Wallet Balance, Zakat Calculator, and Verse of the Day
- **Evidence Subbar** — Minimal floating bar showing active verdict and guidance text

### 🏦 Ummah ID & Digital Finance
- **Ummah ID** — Zero-knowledge identity with JWT auth
- **Sovereign Wallet** — Create, view balance, track transactions in FLH
- **Zakat Engine** — Calculate and pay Zakat with nisab threshold and Shariah evidence
- **Souq Marketplace** (formerly iStore) — Browse curated Islamic products with live prices from the Falah OS marketplace API

### 🛍️ Souq Quick-Actions (NEW in v2.4.0)
- **Souq Button** — One-click launch of `falahos.my/mobile/souq` in a new tab
- **Souq Mini-Feed** — Popup displays 1-2 featured marketplace listings with prices (live from `/mobile/api/marketplace/listings`)
- **Souq Products:** Digital items like Tafsir al-Quran (2,500 FLH), Premium Hijabs (350 FLH), Miswak (150 FLH), Prayer Mat (800 FLH)

### 🕌 Halal Monitor Quick-Action (NEW in v2.4.0)
- **Halal Button** — One-click launch of `falahos.my/mobile/halal-monitor` in a new tab
- Opens the Overpass-powered map showing 45+ halal places around Kuala Lumpur with user-contributed yellow markers

### 🤖 NurBuddy AI & Halal Monitor (Premium)
- **NurBuddy AI Companion** — Chat directly with your sovereign Islamic AI companion natively within the side panel. Ask questions on browsing or Islamic knowledge.
- **Halal Monitor Dashboard** — Track your weekly Halal Adherence Score with dynamic visualization. View your complete browsing history broken down by Safe, Caution, and Blocked activity.

### ⭐ Gamification Mini (NEW in v2.4.0)
- **XP & Level display** — Shows `Lv.1 0 XP` in the popup auth bar (live from the mobile gamification API)
- **Progression tracking** — Mirrors the Falah OS mobile experience points system

### 📲 PWA Install Banner (NEW in v2.4.0)
- **"Install on your phone"** link at the bottom of the popup
- Opens `PWA-INSTALL.md` guide for Android (Chrome → Install app) and iOS (Safari → Add to Home Screen)
- Full-screen experience with offline fallback and auto-update

### 🕌 Islamic Lifestyle
- Automatic **prayer time notifications** (alAdhan API)
- **Next Salah countdown** in popup with live second-by-second timer
- **5-prayer grid** showing all daily salah times
- **Day progress bar** — visual sense of the passing day
- Daily **Quranic verse** rotation
- **Guidance levels** — Advisory / Caution / Strict

### 🎨 UI Design System
The extension UI is harmonised with **[Ummah FalahOS](https://ummah.falahos.my)** (WordPress + Astra theme):

| Token | Hex | Usage |
|-------|-----|-------|
| `--gold` | `#c9a84c` | Primary accent — active tabs, prayer highlights, prices, gold button |
| `--gold-light` | `#dfc06a` | Hover state, brand name glow |
| `--emerald` | `#1a472a` | Positive indicators, safe verdicts (alongside jade `#10b981`) |
| `--cream` | `#f5e6c8` | Light accent text on dark surfaces |
| `--dark` | `#0d1a0d` | Deepest background — near-black green tint |
| **Headings** | Playfair Display | Side panel brand name, clock, wallet balances, score displays |
| **Body** | DM Sans | All UI text, buttons, inputs |
| **Card radius** | `12px` | Verdict, wallet, monitor, zakat cards |
| **Button radius** | `6px` | All interactive buttons, pills |

### 🔗 Live App Integration
- All extension data sources now point to the **live Falah OS Mobile backend** (`falahos.my/mobile`) instead of static Netlify pages
- Backend: Next.js 16 (Turbopack), Prisma v5 SQLite, hosted on Contabo VPS behind Cloudflare Tunnel → Traefik
- **Hot-swappable fallback** — Contabo production (primary) with Synology staging on standby

---

## 🖼️ Screenshots

| Popup | Side Panel | Widgets |
|-------|-----------|---------|
| 5-prayer grid, Souq mini-feed, day progress bar, gamification XP | Dashboard, Souq, Wallet, Zakat, Config | Draggable prayer/widget system |

---

## 🛠️ Installation

### From Chrome Web Store *(coming soon)*
1. Visit the [Falah OS Chrome Web Store listing](https://chromewebstore.google.com)
2. Click **Add to Chrome**

### 📥 Download & Manual Installation
For developers and early adopters, you can load the extension directly:

1. **Download the code**  
   Clone the repository or download the ZIP from GitHub:
   ```bash
   git clone https://github.com/maifors/falah-extension.git
   cd falah-extension
   ```
2. **Open Extensions Page**  
   Open Google Chrome and navigate to `chrome://extensions/` in your address bar.
3. **Enable Developer Mode**  
   Toggle the **Developer mode** switch in the top-right corner.
4. **Load the Extension**  
   Click the **Load unpacked** button. Select the `falah-extension-v2/` directory from the folder you downloaded.
5. **Pin it**  
   Click the puzzle piece icon in the Chrome toolbar and click the pin icon next to Falah OS.

### ⚡ Quick Start (Development)
```bash
# Build packed extension (requires zip)
cd falah-extension-v2
zip -r ../falah-extension-v2.4.0.zip . -x ".git/*" "*.DS_Store" "test*" "*.md"
```

---

## 📁 Project Structure

```
falah-extension-v2/
├── manifest.json              # Manifest V3 — v2.4.0
├── README.md
├── PWA-INSTALL.md             # PWA install guide (NEW)
├── _locales/en/               # English i18n strings
├── icons/                     # 16/32/48/128px icons
└── src/
    ├── background/
    │   ├── service-worker.js  # Whisper engine, alarms, message router, gamification handler
    │   ├── api-client.js      # Falah OS API client (Contabo backend)
    │   └── mock-data.js       # Offline demo/sandbox data
    ├── content/
    │   ├── content.js         # Subbar, panel iframe, widget system injector
    │   └── content.css        # Floating UI styles with !important isolation
    ├── panel/
    │   ├── panel.html         # Side panel UI (dashboard, wallet, souq, zakat, config)
    │       ├── panel.css          # Ummah FalahOS-harmonised design system (emerald/gold/cream)
    │   └── panel.js           # Panel logic: auth, wallet, souq, zakat, settings
    └── popup/
        ├── popup.html         # Quick-status popup (300px) — prayer grid, Souq feed, verse
        └── popup.js           # Enhanced prayer countdown, Souq API, gamification, day progress
```

---

## 🔐 Permissions Explained

| Permission | Why It's Needed |
|-----------|-----------------|
| `storage` | Persist settings, auth token, verdict cache, widget state |
| `alarms` | Prayer time checks every 5 min |
| `notifications` | Prayer time alerts |
| `activeTab` | Access current tab URL for page classification |
| `scripting` | Extract page text for classification |
| `tabs` | Tab-level badge updates (verdict indicator) |
| `sidePanel` | Chrome side panel API |
| `<all_urls>` | Content script runs on every page for real-time auditing |

All classification runs **locally by default**. Page text is only sent to the Falah OS API when the local engine is inconclusive.

---

## 🧪 QA Testing

The extension includes a formal Node.js QA test suite (110+ tests):

```bash
node qa-test.js
```

**Test coverage:**

| Area | Tests |
|------|-------|
| File integrity | 18 — all source files present and non-empty |
| Manifest validation | 9 — MV3 structure, permissions, commands |
| Security fixes | 7 — postMessage origin, FALAH_ERROR, origin validation |
| Classification logic | 12 — 12 test cases across all verdict levels |
| HTML structure | 14 — panel, popup, blocked page |
| CSS integrity | 6 — content.css + panel.css |
| Module chain | 4 — import/export correctness |
| Version consistency | 2 — manifest vs. panel version |

### Visual QA (Production)
A Playwright-based visual QA suite verifies the live Falah OS Mobile production site:

```bash
python tests/qa-visual.py
```

**Production status (2025):** 85 Pass, 0 Fail, 1 Warn across all mobile features — Home, Prayer, Dhikr, Qibla, Halal Monitor (45 KL places), Souq (4 listings).

---

## 🔒 Security

- **CSP** enforced on extension pages: `script-src 'self'; object-src 'self'`
- **Context isolation**: `contextIsolation: true`, `nodeIntegration: false` in Electron
- **postMessage**: All cross-origin messages use explicit `targetOrigin` (extension origin)
- **Origin validation**: Incoming messages verified via `MessageEvent.source` reference check
- **Error propagation**: Service worker errors propagate to content script for user visibility
- **Minimal permissions**: Only the permissions required for functionality are requested
- **Error Feedback**: Amber `ErrorFeedback` card with "Try Again" and feedback link on API failures

---

## 🏗️ Architecture

```
Website Page
    │
    ├── Content Script (content.js)
    │   ├── Subbar ── shows real-time verdict
    │   ├── Panel iframe ── chrome-extension:// origin
    │   │   └── panel.html/js/css
    │   └── Widget system ── draggable floating widgets
    │
    └── Service Worker (service-worker.js)
        ├── Chrome.runtime message router
        ├── Whisper classification engine
        ├── Prayer time alarms (5 min interval)
        └── FalahApiClient
            ├── Local rules (offline fallback)
            └── Falah OS API → falahos.my/mobile/api/...
                ├── /prayer/times       ← Enhanced 5-prayer grid + live countdown
                ├── /marketplace/listings  ← Souq mini-feed (NEW)
                ├── /gamification       ← XP & Level display (NEW)
                └── Netlify serverless  ← Legacy classification API
```

### Data Flow (New Features)

```
Popup opens
    │
    ├── Fetch prayer times → GET /mobile/api/prayer/times
    │   └── Render 5-prayer grid, start countdown timer
    │
    ├── Fetch gamification → GET /mobile/api/gamification
    │   └── Display "Lv.1 0 XP" in auth bar
    │
    ├── Fetch Souq listings → GET /mobile/api/marketplace/listings?limit=2
    │   └── Render mini-feed cards with prices
    │
    └── Start day progress bar (local JS, updates every 60s)
```

### Infrastructure

| Component | Host | Role |
|-----------|------|------|
| **Extension** | Chrome (local) | Popup, side panel, widgets, classification |
| **Falah OS API** | Contabo VPS (Traefik) | Prayer, marketplace, gamification, auth |
| **Fallback** | Synology (Tailscale) | Staging/failover for all API routes |
| **Static fallback** | Netlify | falah-os.com marketing SPAs (unchanged) |

---

## 🗺️ Roadmap

- [x] Whisper Engine (local + API)
- [x] Side panel with Dashboard, Wallet, Souq, Zakat, Config
- [x] Floating widget system (Prayer, Halal Checker, Wallet, Zakat, Verse)
- [x] Ummah ID with demo mode
- [x] Prayer times with notifications
- [x] QA test suite (110 tests)
- [x] NurBuddy AI Chat Integration
- [x] Halal Monitor Dashboard with Adherence Scoring
- [x] Enhanced 5-prayer grid with live countdown & day progress (v2.4.0)
- [x] Souq marketplace quick-action & mini-feed (v2.4.0)
- [x] Halal Monitor quick-action button (v2.4.0)
- [x] Gamification mini (XP/Level display) (v2.4.0)
- [x] PWA install banner (v2.4.0)
- [x] ErrorFeedback with "Try Again" on API failures
- [x] UI harmonisation with Ummah FalahOS design system (gold/emerald/cream palette, Playfair Display headings, 12px card radii)
- [ ] Chrome Web Store publication
- [ ] Edge/Firefox compatibility
- [ ] Encrypted bookmark sync
- [ ] Multi-language support (beyond English)
- [ ] Rule update via signed Falah Registry stream

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Run the QA suite: `node qa-test.js`
4. Commit your changes
5. Open a Pull Request

Please ensure all QA tests pass before submitting.

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 📞 Contact

**WM Jauhari Ismail** — Principal Consultant, Falah Consultancy Limited

Project Link: [https://github.com/maifors/falah-extension](https://github.com/maifors/falah-extension)

---

<p align="center">
  Built with ❤️ and ☪️ for the Ummah
</p>
