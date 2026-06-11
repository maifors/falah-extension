# Falah OS — Browser Extension v2.1.0

> **Shariah-Compliant Browsing with Ummah ID, Wallet, iStore, Zakat, and AI-Driven Shariah Guidance.**

Falah OS is a sovereign, Shariah-native Chrome extension that protects the digital well-being of the global Muslim community. It integrates real-time Shariah compliance auditing, zero-knowledge identity protocols, and elegant Islamic mindfulness widgets into your browser.

---

## ✨ Key Features

### 📡 Whisper Engine — Real-Time Page Classification
Every page you visit is audited against Shariah principles in real time:

| Verdict | Colour | Meaning |
|---------|--------|---------|
| **Safe** | 🟢 Green | Halal content — free to browse |
| **Caution** | 🟡 Amber | Potentially questionable content |
| **Warning** | 🔴 Red | Islamically problematic content |
| **Blocked** | 🚫 Red | Explicitly haram — access blocked in Strict mode |

Classification uses a two-tier engine: **local regex rules** (offline-capable) backed by a **Netlify serverless API** for enhanced detection. Each result includes Quranic evidence, Hadith references, and plain-language explanations.

### 📖 Contextual Islamic Guidance
Every verdict is backed by authentic Islamic principles with context-matched **Quranic verses** and **Hadith** evidence (*Maysir* for gambling, *Khamr* for alcohol, *Riba* for interest, etc.).

### 🖥️ Premium Side Panel & Widgets
- **Verdict Side Panel** — Dark gold-themed panel with Arabic verses, English translation, and Whisper guidance
- **Floating Widgets** — Draggable, stateful mini-apps for Prayer Times, Halal Checker, Wallet Balance, Zakat Calculator, and Verse of the Day
- **Evidence Subbar** — Minimal floating bar showing active verdict and guidance text

### 🏦 Ummah ID & Digital Finance
- **Ummah ID** — Zero-knowledge identity with JWT auth
- **Sovereign Wallet** — Create, view balance, track transactions in FLH
- **Zakat Engine** — Calculate and pay Zakat with nisab threshold and Shariah evidence
- **Halal iStore** — Browse curated Islamic apps with search and categories

### 🤖 NurBuddy AI & Halal Monitor (Premium)
- **NurBuddy AI Companion** — Chat directly with your sovereign Islamic AI companion natively within the side panel. Ask questions on browsing or Islamic knowledge.
- **Halal Monitor Dashboard** — Track your weekly Halal Adherence Score with dynamic visualization. View your complete browsing history broken down by Safe, Caution, and Blocked activity.
### 🕌 Islamic Lifestyle
- Automatic **prayer time notifications** (alAdhan API)
- **Next Salah** countdown in popup and subbar
- Daily **Quranic verse** rotation
- **Guidance levels** — Advisory / Caution / Strict

---

## 🖼️ Screenshots

| Popup | Side Panel | Widgets |
|-------|-----------|---------|
| Verdict, wallet mini, prayer next, daily verse | Dashboard, iStore, Wallet, Zakat, Config | Draggable prayer/widget system |

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

---

## 📁 Project Structure

```
falah-extension-v2/
├── manifest.json              # Manifest V3 config
├── README.md
├── _locales/en/               # English i18n strings
├── icons/                     # 16/32/48/128px icons
└── src/
    ├── background/
    │   ├── service-worker.js  # Whisper engine, alarms, message router
    │   ├── api-client.js      # Falah OS Netlify API client
    │   └── mock-data.js       # Offline demo/sandbox data
    ├── content/
    │   ├── content.js         # Subbar, panel iframe, widget system injector
    │   └── content.css        # Floating UI styles with !important isolation
    ├── panel/
    │   ├── panel.html         # Side panel UI (dashboard, wallet, store, zakat, config)
    │   ├── panel.css          # Dark gold "Institutional Noir" design system
    │   └── panel.js           # Panel logic: auth, wallet, store, zakat, settings
    └── popup/
        ├── popup.html         # Quick-status popup (300px)
        └── popup.js           # Verdict display, wallet mini, prayer next
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

The extension includes a formal Node.js QA test suite (110 tests):

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

---

## 🔒 Security

- **CSP** enforced on extension pages: `script-src 'self'; object-src 'self'`
- **Context isolation**: `contextIsolation: true`, `nodeIntegration: false` in Electron
- **postMessage**: All cross-origin messages use explicit `targetOrigin` (extension origin)
- **Origin validation**: Incoming messages verified via `MessageEvent.source` reference check
- **Error propagation**: Service worker errors propagate to content script for user visibility
- **Minimal permissions**: Only the permissions required for functionality are requested

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
            └── Netlify serverless API → falah-os.com
```

---

## 🗺️ Roadmap

- [x] Whisper Engine (local + API)
- [x] Side panel with Dashboard, Wallet, iStore, Zakat, Config
- [x] Floating widget system (Prayer, Halal Checker, Wallet, Zakat, Verse)
- [x] Ummah ID with demo mode
- [x] Prayer times with notifications
- [x] QA test suite (110 tests)
- [x] NurBuddy AI Chat Integration
- [x] Halal Monitor Dashboard with Adherence Scoring
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

Please ensure all 110 QA tests pass before submitting.

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
