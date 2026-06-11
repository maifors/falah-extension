# Falah OS Browser ExtensionCE (v2.1.0)

> **Shariah-Compliant Browsing with Ummah ID, Wallet, iStore, Zakat, and AI-Driven Shariah Guidance.**

Falah OS is a sovereign, Shariah-native browser extension designed to protect the digital well-being of the global Muslim community. By integrating real-time Shariah compliance auditing, zero-knowledge identity protocols, and elegant Islamic mindfulness widgets, Falah helps you maintain values-aligned habits while navigating the modern web.

---

## ✨ Key Features

### 📡 Shariah-Native Whisper Engine
The core safety system dynamically audits and grades every webpage in real time, assigning a colored compliance verdict:
*   🟢 **Green (Safe):** Lawful (Halal) content. Free to browse.
*   🟡 **Amber (Caution):** Content that may involve questionable items (e.g., interest-bearing financial options, gelatin/food ingredients).
*   🔴 **Red (Warning / Blocked):** Immoral content, active gambling, or alcohol sales. Access is flagged or blocked according to your guidance level settings.

### 📖 Contextual Islamic Guidance
Every grading is backed by authentic Islamic principles. The engine contextually selects the most relevant evidence from a curated bank of **Quranic verses** and **Hadiths** matching the site's profile (e.g., *Maysir* for gambling, *Khamr* for intoxicants, *Riba* for interest rates, or *Halal Food* requirements) along with plain-language, practical advice explaining **why** the grade was assigned.

### 🖥️ Premium UI Side Panel & Widgets
*   **Verdict Side Panel:** A premium, dark gold-themed side panel that renders Arabic verses with custom font rendering, English translations, and a dedicated **Whisper Says** block containing the guidance explanation.
*   ** Halal Checker Widget:** An on-page floating interactive card that scans the DOM and lets you instantly analyze questionable links.
*   **Evidence Subbar:** A minimal floating bar at the bottom of the page showing the active verdict and a summary of the Shariah guidance text.

---

## 🛠️ Installation Instructions

To install Falah Browser Extension locally in Developer Mode:

1.  **Clone or Open the Folder:**
    Locate the extension root directory:
    `/browser/FalahWidget/falah-extension-v2`
2.  **Open Chrome Extensions:**
    Launch Google Chrome and navigate to: `chrome://extensions/`
3.  **Enable Developer Mode:**
    Toggle the **Developer mode** switch in the top-right corner to **ON**.
4.  **Load Unpacked Extension:**
    Click the **Load unpacked** button in the top-left corner.
5.  **Select the Directory:**
    Select the `/Users/wanjauhari24/Desktop/Projects/falah-os 2/browser/FalahWidget/falah-extension-v2` directory.
6.  **Pin Extension:**
    Click the extensions puzzle icon in your Chrome toolbar and pin **Falah OS**.

---

## 📁 Codebase Directory Structure

```filepath
falah-extension-v2/
├── manifest.json            # Extension configuration (Manifest V3)
├── _locales/                # Internationalization strings
├── icons/                   # Extension icons (16, 32, 48, 128px)
└── src/
    ├── background/
    │   ├── service-worker.js # Main background script, Whisper categorizer & alarms
    │   └── api-client.js     # API connector for Falah netlify serverless functions
    ├── content/
    │   ├── content.js        # DOM page scraper, Halal Checker & Subbar injector
    │   └── content.css       # Premium floating widget and subbar styling
    ├── panel/
    │   ├── panel.html        # Verdict panel user interface
    │   ├── panel.css         # Dark gold luxury layout styling
    │   └── panel.js          # Live verdict updates listener and renderer
    └── popup/
        ├── popup.html        # Extension quick status popup UI
        └── popup.js          # Controls and options event handlers
```

---

## 🧪 Quality Assurance & Testing

The extension includes a highly robust, isolated Node.js QA test suite that programmatically extracts and validates the service worker's classification engine and Shariah evidence selectors.

To run the automated test suite locally:
```bash
node "../../../../../.gemini/antigravity-cli/brain/ae628f8e-1371-473f-8061-82c4a69e61db/scratch/qa_test.js"
```

The test runner will validate **12 different strict test cases** (including Gambling, Riba, Alcohol, Haram Foods, Safe fallbacks, and selector routing integrity) and generate a markdown report file at `/qa_test_report.md`.
