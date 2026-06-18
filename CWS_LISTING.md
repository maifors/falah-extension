# Falah OS — Chrome Web Store Listing Details

## Title
Falah OS — Shariah-Compliant Browser Extension

## Short Description (132 chars max)
Real-time halal/haram page classification, ad blocking, tracker blocking, prayer times, and Islamic AI — the first Shariah-compliant browser.

## Full Description
Falah OS is the world's first Shariah-compliant browser extension. It empowers the global Muslim community to browse the internet with confidence, knowing their faith is protected by an intelligent "Shariah firewall."

### 🌟 Key Features (FREE Tier)

**🛡️ Whisper Engine — Real-time Page Classification**
Automatically scans every page you visit for Shariah compliance. Each page gets a verdict:
- 🟢 Safe — Content is Islamically permissible
- 🟡 Caution — May contain riba, pork, or questionable content
- 🔴 Warning — Contains alcohol or haram material
- 🚫 Blocked — Explicit, gambling, or prohibited content

Each verdict comes with Quranic evidence and Islamic guidance.

**🚫 Ad & Tracker Blocking (NEW)**
Network-level blocking of ads, trackers, and haram content using Chrome's declarativeNetRequest API. Blocks:
- Major ad networks (Google, Facebook, Amazon, etc.)
- Cross-site trackers and analytics
- Gambling and adult content domains
- Malvertising domains

**🕌 Prayer Times**
- Automatic prayer time display based on your location
- Notifications at each salah time
- Next prayer countdown

**📖 Daily Verse**
A rotating selection of Quranic verses with translation and reference.

**🪟 Side Panel Dashboard**
Full-featured side panel with tabs for Home, iStore, Wallet, Zakat, NurBuddy AI, Monitor, and Config.

**🆔 Ummah ID & Demo Mode**
Create your Ummah ID or use demo mode to explore all features offline.

**💰 FLH Wallet**
Create and manage your FLH digital wallet (demo/test mode).

**🤲 Zakat Calculator**
Calculate and pay zakat based on your wealth.

**🏪 Halal iStore**
Browse curated Islamic apps and services.

### ⭐ Premium Features (Falah Pro — $3.99/mo)

| Feature | Free | Falah Pro |
|---------|------|-----------|
| Whisper Engine | ✅ Basic (regex) | ✅ Advanced (ML-based) |
| Ad & Tracker Blocking | ✅ | ✅ (Expanded rules) |
| Prayer Times | ✅ | ✅ |
| NurBuddy AI Chat | 20 msgs/day | ✅ Unlimited |
| Halal Monitor | 24h history | ✅ 90-day history |
| Adhan Audio Player | ❌ | ✅ |
| Custom Themes | ❌ | ✅ |
| Cloud Sync | ❌ | ✅ |

### Privacy First
- 🔒 Offline-first classification uses local rules
- 🔒 No browsing history leaves your device
- 🔒 Open-source code
- 🔒 No data sold or shared

### What Our Users Say
"Finally, a browser tool that helps me stay mindful of my faith while online." — Beta Tester

### Support
- Website: https://falah-os.com
- Email: support@falah-os.com

## Category
Productivity

## Language
English

## Screenshots
1. 1280x800: Popup with verdict strip showing page classification
2. 1280x800: Side panel dashboard with wallet and prayer times
3. 1280x800: Configuration screen showing guidance levels
4. 1280x800: Ad blocking in action (blocked content counter)
5. 1280x800: NurBuddy AI chat interface
6. 1280x800: Halal Monitor dashboard

## Promo Tiles
Small: Small promo tile (440x280)
Marquee: Marquee promo tile (1400x560)

## Permissions Justification
- storage: Save settings, auth tokens, verdict cache, and usage data locally
- alarms: Schedule prayer time checks and daily refresh
- notifications: Alert users at prayer times
- activeTab: Access current page URL for classification
- scripting: Extract page text for content analysis
- tabs: Access tab URLs for classification tracking
- sidePanel: Display the Falah OS side panel
- declarativeNetRequest: Block ads, trackers, and haram content at the network level
- host_permissions (<all_urls>): Required to classify any website the user visits for Shariah compliance

## Version Notes
v2.2.0 — June 14, 2026
- 🚫 Real ad & tracker blocking via declarativeNetRequest (62+ ad networks, 20+ trackers blocked)
- ⭐ Premium gating system with license key activation
- 💬 NurBuddy daily message limit (20/day free, unlimited premium)
- 📊 Halal Monitor premium upsell (24h free, 90-day premium)
- 🏪 Premium subscription tab with pricing and license key entry
- 🧹 Removed duplicate files (nurbuddy 2.html, README 2.md)
- 🐛 Fixed ad blocking and tracker blocking toggles now actually work
