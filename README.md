# Falah OS Browser Extension

**Version 2.1.0** · Chrome MV3 · Shariah-compliant browsing companion

---

## What is Falah OS?

Falah OS is a Chrome side-panel extension that brings sovereign Islamic browsing intelligence to every page you visit. It classifies websites for Shariah compliance, shows prayer times, provides a Quran reader, Zakat calculator, Qibla direction, and a curated halal app directory — all without any login or subscription required.

---

## Features

### 🛡️ Shariah Verdict Engine
Every page you visit is automatically classified against a multi-layer rule set:
- **Local rules** — keyword and domain pattern matching (gambling, alcohol, adult content, riba, pork, occult)
- **Domain lists** — curated halal/makruh/haram domain databases (`data/*.json`)
- **User overrides** — you can manually classify any site as halal, makruh, or haram; synced across your devices via `chrome.storage.sync`
- Verdict displayed in the **subbar** (below address bar) and **traffic-light pill** (top-left corner of every page)
- Guidance modes: **Advisory** (observe only), **Caution** (panel auto-opens for flagged pages), **Strict** (haram pages blocked with overlay)

### 🌙 Subbar (Whisper)
A slim bar injected below the browser address bar on every page:
- Traffic-light verdict pill (🟢 Safe / 🟡 Caution / 🟠 Warning / 🔴 Blocked)
- Quran reference for the page verdict
- Next prayer countdown
- **Whisper** button to open/close the side panel

### 🏮 Traffic-Light Pill (v2.1 new)
A compact classification pill at the top-left of every page:
- Shows **Halal** / **Makruh** / **Haram** / **Unknown** with colour-coded border
- Click to open the classification mini-panel:
  - Override site classification with one tap
  - **Nearby tab** — find mosques and halal food within 3km using your location (OpenStreetMap/Overpass API)

### 🕌 Prayer Times
- Live prayer times via [aladhan.com](https://api.aladhan.com) — no API key required
- Full 6-prayer grid (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha) with Hijri date
- Current prayer highlighted in gold
- Auto-detect location via browser geolocation + Nominatim reverse geocoding
- Prayer notifications via `chrome.alarms` + `chrome.notifications`

### 📖 Quran Tab
- Verse of the Day — rotates daily via [alquran.cloud](https://api.alquran.cloud) API
- Full Surah browser — load any of 114 surahs with Arabic text + English translation (Muhammad Asad)
- **Dhikr Counter** — 5 Dhikr phrases, tap counter with target tracking and streak

### 💰 Zakat Calculator
- Multi-asset calculation: cash, gold, business inventory, investments, receivables
- Nisab threshold displayed (85g gold × market rate)
- **Haul Tracker** — set your Zakat year start date, counts days until haul is due
- 5 verified Zakat recipient organisations linked (Malaysia, UK, US, Global)

### 🧭 Qibla Direction
- Browser geolocation → bearing to Mecca (21.4225°N, 39.8262°E)
- Live compass arrow with degree display

### 🏪 iStore — Halal App Directory
- 17 curated halal apps across 5 categories: Spirituality, Finance, Lifestyle, Education, Productivity
- All links verified — clicking opens real external URLs in a new tab
- Search and category filter

### ⚙️ My Classifications (Options Page)
- View all your custom site classifications in one place
- Remove individual overrides or clear all
- Export your classifications as JSON

---

## Installation

### From ZIP (Developer)
1. Download and unzip `falah-extension-v4.zip`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `falah-extension-v4` folder
5. Visit any site — the subbar and traffic-light pill appear automatically

### Keyboard Shortcut
`Ctrl+Shift+F` (Windows/Linux) · `MacCtrl+Shift+F` (Mac) — toggle the side panel

---

## Architecture

```
falah-extension-v4/
├── manifest.json                 # MV3, v2.1.0
├── README.md
├── data/
│   ├── halal.json                # 38 curated halal domains
│   ├── makruh.json               # 13 makruh/questionable domains
│   └── haram.json                # 36 haram domains
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   ├── service-worker.js     # MV3 ES module SW — classify, prayer, alarms, domain lists
│   │   └── api-client.js         # Falah OS API client (reserved for authenticated features)
│   ├── content/
│   │   ├── content.js            # Subbar + side panel iframe + traffic-light pill (v2.1)
│   │   └── content.css           # Page-level styles (subbar, blocked overlay)
│   ├── panel/
│   │   ├── panel.html            # Side panel — 5 tabs
│   │   ├── panel.js              # Panel logic — prayer, quran, zakat, qibla, istore
│   │   └── panel.css             # Institutional Noir design system
│   ├── popup/
│   │   ├── popup.html            # Action popup — verdict + prayer + quick actions
│   │   └── popup.js
│   └── pages/
│       ├── blocked.html          # Full-page haram block overlay
│       ├── options.html          # Site classifications manager (v2.1)
│       └── options.js            # Options page logic (v2.1)
└── _locales/en/messages.json
```

---

## Data Sources

| Feature | Source | Auth |
|---|---|---|
| Prayer times | [aladhan.com](https://api.aladhan.com) | None |
| Quran text | [alquran.cloud](https://api.alquran.cloud) | None |
| Nearby mosques | [OpenStreetMap/Overpass](https://overpass-api.de) | None |
| Halal food nearby | [OpenStreetMap/Overpass](https://overpass-api.de) | None |
| Geocoding | [Nominatim](https://nominatim.openstreetmap.org) | None |
| Shariah classification | Local rules + domain lists | None |
| Wallet / Ummah ID | Falah OS backend (coming soon) | Ummah ID |

---

## Changelog

### v2.1.0 — Companion Merge
- **New:** Traffic-light classification pill on every page (`#falah-companion-host`, isolated Shadow DOM)
- **New:** Classify any site as Halal / Makruh / Haram — synced across devices via `chrome.storage.sync`
- **New:** Nearby mosques and halal restaurants via OpenStreetMap Overpass API with geolocation
- **New:** Site classifications manager (Options page) with export and clear-all
- **New:** Domain lists (`data/halal.json`, `data/makruh.json`, `data/haram.json`) — 87 curated entries
- **New:** `GET_CLASSIFICATION`, `SET_CLASSIFICATION`, `CLEAR_CLASSIFICATION` message handlers in service worker
- **Improved:** Expanded Shariah classifier — 7 rule categories, 75+ known haram/gambling/alcohol domains
- **Improved:** `loadDomainLists()` called on `onInstalled` and `onStartup` with per-file error handling
- **Fixed:** Subbar and traffic-light pill are fully isolated in separate Shadow DOM hosts

### v2.0.0
- Full rewrite: Prayer times, Quran reader, Dhikr counter, Zakat calculator, Qibla, iStore
- Institutional Noir design system
- Shariah verdict engine with local rules and Quran evidence
- Side panel with 5 tabs: Home, Prayer, iStore, Zakat, Quran, Config
- Prayer notifications via `chrome.alarms`

---

## Privacy

- No data leaves your device except for API calls to free public services (prayer times, Quran, OpenStreetMap)
- Your site classifications are stored in `chrome.storage.sync` (encrypted, synced via your Google account)
- No telemetry, no ads, no tracking

---

## Coming Soon (v3.0)

- 🔐 Ummah ID authentication
- 💰 FLH Wallet & transaction history  
- 📜 RAMZ Shariah contract execution
- 🏪 iStore in-app purchases
- 🌍 Multi-language support (Arabic, Malay, Urdu)

---

*Built by [Falah Consultancy Limited](https://falah-os.com) · London · بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ*
