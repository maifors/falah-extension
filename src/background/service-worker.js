import { FalahApiClient } from './api-client.js';

const CLASSIFY_URL = 'https://falah-os.netlify.app/.netlify/functions/classify';
const HEALTH_URL = 'https://falah-os.netlify.app/.netlify/functions/health';
const PRAYER_API = 'https://api.aladhan.com/v1/timingsByCity';
const CACHE_TTL_MS = 5 * 60 * 1000;
const ALARM_PRAYER = 'falah-prayer-check';
const ALARM_REFRESH = 'falah-prayer-refresh';
const FALAH_API = 'https://falah-os.com';

const BADGE_COLORS = {
  safe: '#10b981', caution: '#f59e0b', warning: '#ef4444',
  blocked: '#ef4444', loading: '#6b7280', error: '#6b7280'
};

const DEFAULT_SETTINGS = {
  guidanceLevel: 'caution', panelOpen: true, subbarEnabled: true,
  adBlocking: true, trackerBlocking: true, prayerNotifications: true,
  adhanSound: false, city: 'Kuala Lumpur', country: 'Malaysia',
  voiceStyle: 'scholar', hctVerification: true
};

const api = new FalahApiClient();

// ── Premium Gating Configuration ───────────────────────────────────────────
const PREMIUM_CONFIG = {
  nurbuddyDailyLimit: 20,       // Free tier: 20 messages/day
  nurbuddyResetHour: 0,         // Reset at midnight
  monitorHistoryDays: 1,        // Free tier: 1 day history
  premiumMonitorHistoryDays: 90  // Premium: 90 day history
};

// ── Startup ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, prayerTimes: null, verdictCache: {}, auth: null });
  }
  await schedulePrayerAlarms();
  await initSidePanel();
  await applyBlockingSettings();  // Initialize DNR rulesets
  await migrateUsageCounters();
});

async function migrateUsageCounters() {
  const { nurbuddyUsage } = await chrome.storage.local.get('nurbuddyUsage');
  if (!nurbuddyUsage) {
    await chrome.storage.local.set({ nurbuddyUsage: { count: 0, date: new Date().toDateString() } });
  }
}

chrome.runtime.onStartup.addListener(async () => {
  await schedulePrayerAlarms();
  await restoreAuth();
  await applyBlockingSettings();
});

// ── Ad Blocking / Tracker Blocking ──────────────────────────────────────────

/**
 * Enable or disable the declarativeNetRequest rulesets based on user settings.
 */
async function applyBlockingSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = settings || DEFAULT_SETTINGS;

  try {
    const adEnabled = s.adBlocking === true;
    const trackerEnabled = s.trackerBlocking === true;

    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [
        ...(adEnabled ? ['ad_blocking'] : []),
        ...(trackerEnabled ? ['tracker_blocking'] : [])
      ],
      disableRulesetIds: [
        ...(!adEnabled ? ['ad_blocking'] : []),
        ...(!trackerEnabled ? ['tracker_blocking'] : [])
      ]
    });

    console.log(`[Falah] Blocking updated — ad:${adEnabled}, tracker:${trackerEnabled}`);
  } catch (err) {
    console.warn('[Falah] Failed to update blocking rulesets:', err.message);
  }
}

// ── Premium Status ──────────────────────────────────────────────────────────

/**
 * Check whether the current user has an active premium subscription.
 * Returns { premium: boolean, tier: string|null, expiresAt: string|null }.
 *
 * Checks three sources (in order):
 * 1. API call to falah-os.com (if authenticated)
 * 2. chrome.storage.local cached premium status
 * 3. Demo mode = free tier
 */
async function checkPremiumStatus() {
  const { auth, premiumCache } = await chrome.storage.local.get(['auth', 'premiumCache']);

  // If authenticated with a real token, ask the server
  if (auth?.token && !auth.demo) {
    try {
      const resp = await fetch(`${FALAH_API}/api/subscription/status`, {
        headers: { 'Authorization': `Bearer ${auth.token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const result = {
          premium: data?.tier === 'pro' || data?.tier === 'family',
          tier: data?.tier || 'free',
          expiresAt: data?.expiresAt || null
        };
        // Cache for 1 hour
        await chrome.storage.local.set({ premiumCache: { ...result, ts: Date.now() } });
        return result;
      }
    } catch (_) {
      // Fall through to cached status
    }
  }

  // Check for locally stored premium token (license key override)
  if (auth?.premiumToken) {
    return { premium: true, tier: 'pro', expiresAt: null };
  }

  // Use cached status if fresh (< 1 hour old)
  if (premiumCache && (Date.now() - premiumCache.ts) < 3600000) {
    return { premium: premiumCache.premium, tier: premiumCache.tier, expiresAt: premiumCache.expiresAt };
  }

  // Demo mode = free
  if (auth?.demo) {
    return { premium: false, tier: 'free', expiresAt: null };
  }

  // Default: free tier
  return { premium: false, tier: 'free', expiresAt: null };
}

/**
 * For demo/testing purposes — activate premium status with a license key.
 * In production, this would verify against the Falah OS billing backend.
 */
async function activatePremium(licenseKey) {
  // Simple validation — in production this would call the billing API
  if (!licenseKey || licenseKey.length < 8) {
    return { ok: false, error: 'Invalid license key format.' };
  }

  // For demo purposes, any key matching "FALAH-PRO-XXXXXXXX" works
  const validFormat = /^FALAH-(PRO|FAMILY)-[A-Z0-9]{8,}$/i;
  if (!validFormat.test(licenseKey)) {
    return { ok: false, error: 'Invalid license key. Expected format: FALAH-PRO-XXXXXXXX' };
  }

  const tier = licenseKey.toUpperCase().startsWith('FALAH-FAMILY') ? 'family' : 'pro';
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600000).toISOString(); // 1 year

  await chrome.storage.local.set({
    premiumCache: { premium: true, tier, expiresAt, ts: Date.now(), licenseKey }
  });

  return { ok: true, data: { premium: true, tier, expiresAt } };
}

/**
 * Check if a premium feature is accessible.
 * @param {string} feature — 'nurbuddy', 'monitor', 'adBlocking', 'themes', 'cloudSync'
 */
async function isPremiumFeatureAvailable(feature) {
  const { premium } = await checkPremiumStatus();
  if (premium) return true;

  // Free tier limits per feature
  switch (feature) {
    case 'nurbuddy':
      return await checkNurBuddyDailyLimit();
    case 'monitor':
      return true; // Free tier has limited history (24h) but can view
    default:
      return false;
  }
}

// ── NurBuddy Daily Limit ────────────────────────────────────────────────────

async function checkNurBuddyDailyLimit() {
  const { nurbuddyUsage } = await chrome.storage.local.get('nurbuddyUsage');
  const usage = nurbuddyUsage || { count: 0, date: '' };
  const today = new Date().toDateString();

  // Reset counter if it's a new day
  if (usage.date !== today) {
    usage.count = 0;
    usage.date = today;
    await chrome.storage.local.set({ nurbuddyUsage: usage });
  }

  // Check if under daily limit
  return usage.count < PREMIUM_CONFIG.nurbuddyDailyLimit;
}

async function incrementNurBuddyCounter() {
  const { nurbuddyUsage } = await chrome.storage.local.get('nurbuddyUsage');
  const usage = nurbuddyUsage || { count: 0, date: '' };
  const today = new Date().toDateString();

  if (usage.date !== today) {
    usage.count = 1;
    usage.date = today;
  } else {
    usage.count += 1;
  }

  await chrome.storage.local.set({ nurbuddyUsage: usage });
}

// ── Side Panel Initialization ────────────────────────────────────────────────

async function initSidePanel() {
  try {
    await chrome.sidePanel.setOptions({ path: 'src/panel/panel.html', enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
}

async function restoreAuth() {
  const { auth } = await chrome.storage.local.get('auth');
  if (auth?.token) {
    api.setToken(auth.token);
  }
}

// ── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {

        // ── Existing handlers ──
        case 'CLASSIFY_URL': {
          const result = await classifyUrl(msg.url, msg.text || '');
          sendResponse({ ok: true, data: result });
          break;
        }
        case 'GET_SETTINGS': {
          const { settings } = await chrome.storage.local.get('settings');
          sendResponse({ ok: true, data: settings || DEFAULT_SETTINGS });
          break;
        }
        case 'SAVE_SETTINGS': {
          const { settings: cur } = await chrome.storage.local.get('settings');
          const merged = { ...DEFAULT_SETTINGS, ...cur, ...msg.settings };
          await chrome.storage.local.set({ settings: merged });
          // Apply ad/tracker blocking settings immediately
          if ('adBlocking' in msg.settings || 'trackerBlocking' in msg.settings) {
            await applyBlockingSettings();
          }
          if (msg.settings.city || msg.settings.country) {
            await fetchAndStorePrayerTimes(merged.city, merged.country);
          }
          sendResponse({ ok: true });
          break;
        }
        case 'GET_PRAYER_TIMES': {
          const { prayerTimes } = await chrome.storage.local.get('prayerTimes');
          if (prayerTimes && isTodaysPrayerData(prayerTimes)) {
            sendResponse({ ok: true, data: prayerTimes });
          } else {
            const { settings } = await chrome.storage.local.get('settings');
            const s = settings || DEFAULT_SETTINGS;
            const fresh = await fetchAndStorePrayerTimes(s.city, s.country);
            sendResponse({ ok: true, data: fresh });
          }
          break;
        }
        case 'GET_VERDICT_CACHE': {
          const { verdictCache } = await chrome.storage.local.get('verdictCache');
          const entry = (verdictCache || {})[msg.url];
          if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
            sendResponse({ ok: true, data: entry.result });
          } else { sendResponse({ ok: false }); }
          break;
        }
        case 'SET_BADGE': {
          await updateBadge(msg.tabId, msg.verdict);
          sendResponse({ ok: true });
          break;
        }
        case 'HEALTH_CHECK': {
          const health = await checkHealth();
          sendResponse({ ok: true, data: health });
          break;
        }

        // ── Premium Gating Handlers ────────────────────────────────────

        case 'CHECK_PREMIUM': {
          const status = await checkPremiumStatus();
          sendResponse({ ok: true, data: status });
          break;
        }
        case 'ACTIVATE_PREMIUM': {
          const result = await activatePremium(msg.licenseKey);
          sendResponse(result);
          break;
        }
        case 'IS_FEATURE_AVAILABLE': {
          const available = await isPremiumFeatureAvailable(msg.feature);
          const premium = (await checkPremiumStatus()).premium;
          sendResponse({ ok: true, data: { available, premium, feature: msg.feature } });
          break;
        }
        case 'NURBUDDY_SEND': {
          // Check premium or daily limit
          const premiumStatus = await checkPremiumStatus();
          if (!premiumStatus.premium) {
            const withinLimit = await checkNurBuddyDailyLimit();
            if (!withinLimit) {
              sendResponse({
                ok: false,
                error: `Daily NurBuddy message limit (${PREMIUM_CONFIG.nurbuddyDailyLimit}) reached. Upgrade to Falah Pro for unlimited chat.`,
                premiumRequired: true,
                dailyLimit: PREMIUM_CONFIG.nurbuddyDailyLimit
              });
              break;
            }
          }

          // Send the NurBuddy API request
          try {
            const resp = await fetch('http://13.140.161.244:3000/api/v1/mobile/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': msg.userId || 'cmpxlwxe7000012i02oegq55w' },
              body: JSON.stringify({ query: msg.query }),
              signal: AbortSignal.timeout(15000)
            });
            const data = await resp.json();
            if (resp.ok) {
              // Only increment counter for non-premium users
              if (!premiumStatus.premium) {
                await incrementNurBuddyCounter();
                const { nurbuddyUsage } = await chrome.storage.local.get('nurbuddyUsage');
                const remaining = Math.max(0, PREMIUM_CONFIG.nurbuddyDailyLimit - (nurbuddyUsage?.count || 0));
                sendResponse({ ok: true, data: data, remainingDaily: remaining });
              } else {
                sendResponse({ ok: true, data: data });
              }
            } else {
              sendResponse({ ok: false, error: data.error || `HTTP ${resp.status}` });
            }
          } catch (e) {
            console.error('[Falah] NurBuddy API Error:', e.message);
            sendResponse({ ok: false, error: 'Network error. Is the local Falah OS engine running?' });
          }
          break;
        }
        case 'GET_PREMIUM_CONFIG': {
          sendResponse({ ok: true, data: PREMIUM_CONFIG });
          break;
        }

        // ── Falah OS API handlers ──
        case 'FALAH_LOGIN': {
          const data = await api.login(msg.email, msg.password);
          if (data?.token) {
            await chrome.storage.local.set({ auth: { token: data.token, user: data.user } });
            sendResponse({ ok: true, data: { token: data.token, user: data.user } });
          } else {
            sendResponse({ ok: false, error: data?.error || 'Login failed' });
          }
          break;
        }
        case 'FALAH_DEMO_LOGIN': {
          const session = api.getDemoSession();
          api.setToken(session.token);
          await chrome.storage.local.set({
            auth: { token: session.token, user: session.user, demo: true },
            demoSession: session
          });
          sendResponse({ ok: true, data: { token: session.token, user: session.user, demo: true } });
          break;
        }
        case 'FALAH_LOGOUT': {
          api.setToken(null);
          await chrome.storage.local.remove(['auth', 'demoSession', 'premiumCache']);
          sendResponse({ ok: true });
          break;
        }
        case 'FALAH_CHECK_AUTH': {
          const { auth } = await chrome.storage.local.get('auth');
          if (auth?.token) {
            api.setToken(auth.token);
            sendResponse({ ok: true, data: auth });
          } else {
            sendResponse({ ok: false });
          }
          break;
        }
        case 'FALAH_GET_IDENTITY': {
          const { auth } = await chrome.storage.local.get('auth');
          if (!auth?.user?.id) { sendResponse({ ok: false, error: 'Not authenticated' }); break; }
          const identity = await api.getIdentity(auth.user.id);
          sendResponse({ ok: !!identity, data: identity });
          break;
        }
        case 'FALAH_CREATE_WALLET': {
          const { auth } = await chrome.storage.local.get('auth');
          const userId = msg.userId || auth?.user?.id || 'anonymous';
          const wallet = await api.createWallet(userId);
          if (wallet) { sendResponse({ ok: true, data: wallet }); }
          else { sendResponse({ ok: true, data: api.getMockWallet() }); }
          break;
        }
        case 'FALAH_GET_WALLET': {
          const { auth, demoSession } = await chrome.storage.local.get(['auth', 'demoSession']);
          if (auth?.demo && demoSession?.wallet) {
            sendResponse({ ok: true, data: demoSession.wallet }); break;
          }
          const walletId = msg.walletId || auth?.walletId;
          if (walletId) {
            const wallet = await api.getWallet(walletId);
            if (wallet) { sendResponse({ ok: true, data: wallet }); break; }
          }
          sendResponse({ ok: true, data: api.getMockWallet() });
          break;
        }
        case 'FALAH_GET_TRANSACTIONS': {
          const { auth, demoSession } = await chrome.storage.local.get(['auth', 'demoSession']);
          if (auth?.demo && demoSession?.transactions) {
            sendResponse({ ok: true, data: demoSession.transactions }); break;
          }
          const walletId = msg.walletId || auth?.walletId;
          if (walletId) {
            const txs = await api.getWalletTransactions(walletId);
            if (txs) { sendResponse({ ok: true, data: txs }); break; }
          }
          sendResponse({ ok: true, data: api.getMockTransactions() });
          break;
        }
        case 'FALAH_GET_WALLET_STATS': {
          const { auth } = await chrome.storage.local.get('auth');
          if (auth?.demo) {
            sendResponse({ ok: true, data: { totalWallets: 1284, totalTransactions: 15420, volume: '3456789.50', feePercentage: 1.5 } }); break;
          }
          const stats = await api.getWalletStats();
          if (stats) { sendResponse({ ok: true, data: stats }); }
          else { sendResponse({ ok: true, data: api.getMockWalletStats() }); }
          break;
        }
        case 'FALAH_GET_FEES': {
          const fees = await api.getFees();
          sendResponse({ ok: true, data: fees || { feePercentage: 1.5 } });
          break;
        }
        case 'FALAH_GET_CATALOG': {
          const catalog = await api.getCatalog();
          if (catalog) { sendResponse({ ok: true, data: catalog }); }
          else { sendResponse({ ok: true, data: api.getMockCatalog() }); }
          break;
        }
        case 'FALAH_GET_NETWORK_STATUS': {
          const { auth } = await chrome.storage.local.get('auth');
          if (auth?.demo) {
            sendResponse({ ok: true, data: { gateway: 'demo', ummah: 'demo', wallet: 'demo', mocknet: 'demo' } });
            break;
          }
          const status = await api.getNetworkStatus();
          sendResponse({ ok: true, data: status });
          break;
        }
        case 'FALAH_CALCULATE_ZAKAT': {
          const wealth = parseFloat(msg.wealth);
          if (!wealth || wealth <= 0) { sendResponse({ ok: false, error: 'Invalid wealth amount' }); break; }
          const result = await api.calculateZakat(wealth);
          if (result) { sendResponse({ ok: true, data: result }); }
          else { sendResponse({ ok: true, data: api.calculateMockZakat(wealth) }); }
          break;
        }
        case 'FALAH_PAY_ZAKAT': {
          const { auth } = await chrome.storage.local.get('auth');
          const result = await api.payZakat(msg.amount, msg.walletId || auth?.walletId);
          sendResponse({ ok: true, data: result || { status: 'completed', txId: 'mock-' + Date.now() } });
          break;
        }
        case 'FALAH_GET_ZAKAT_HISTORY': {
          const { auth, demoSession } = await chrome.storage.local.get(['auth', 'demoSession']);
          if (auth?.demo && demoSession?.zakatHistory) {
            sendResponse({ ok: true, data: demoSession.zakatHistory }); break;
          }
          const userId = auth?.user?.id || 'anonymous';
          const history = await api.getZakatHistory(userId);
          sendResponse({ ok: true, data: history || [] });
          break;
        }
        case 'FALAH_GET_MONITOR_STATS': {
          const { monitorStats } = await chrome.storage.local.get('monitorStats');
          sendResponse({ ok: true, data: monitorStats || { safe: 0, caution: 0, warning: 0, blocked: 0, history: [] } });
          break;
        }
        case 'FALAH_NURBUDDY_CHAT': {
          // Legacy handler — delegates to NURBUDDY_SEND logic
          try {
            const resp = await fetch('http://13.140.161.244:3000/api/v1/mobile/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': msg.userId || 'cmpxlwxe7000012i02oegq55w' },
              body: JSON.stringify({ query: msg.query }),
              signal: AbortSignal.timeout(15000)
            });
            const data = await resp.json();
            if (resp.ok) {
              sendResponse({ ok: true, data });
            } else {
              sendResponse({ ok: false, error: data.error || `HTTP ${resp.status}` });
            }
          } catch (e) {
            console.error('[Falah] NurBuddy API Error:', e.message);
            sendResponse({ ok: false, error: 'Network error. Is the local Falah OS engine running?' });
          }
          break;
        }
        case 'OPEN_SIDE_PANEL': {
          try {
            await chrome.sidePanel.open({ windowId: sender.tab?.windowId || msg.windowId });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }

        // ── Dhikr Counter Handlers ────────────────────────────────────
        case 'FALAH_GET_DHIKR_STATS': {
          const { auth } = await chrome.storage.local.get('auth');
          if (!auth?.token) { sendResponse({ ok: false, error: 'Not authenticated' }); break; }
          try {
            const resp = await fetch('https://ummahid.falahos.my/api/dhikr/stats', {
              headers: { 'Authorization': `Bearer ${auth.token}` },
              signal: AbortSignal.timeout(10000)
            });
            const data = await resp.json();
            sendResponse({ ok: true, data });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }
        case 'FALAH_POST_DHIKR': {
          const { auth } = await chrome.storage.local.get('auth');
          if (!auth?.token) { sendResponse({ ok: false, error: 'Not authenticated' }); break; }
          try {
            const resp = await fetch('https://ummahid.falahos.my/api/dhikr/stats', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(msg.data || {}),
              signal: AbortSignal.timeout(10000)
            });
            const data = await resp.json();
            sendResponse({ ok: true, data });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }

        case 'FALAH_GET_QIBLA': {
          const KAABA_LAT = 21.4225;
          const KAABA_LNG = 39.8262;
          function toRad(deg) { return (deg * Math.PI) / 180; }
          function toDeg(rad) { return (rad * 180) / Math.PI; }
          const lat = msg.lat, lng = msg.lng;
          const φ1 = toRad(lat);
          const φ2 = toRad(KAABA_LAT);
          const Δλ = toRad(KAABA_LNG - lng);
          const y = Math.sin(Δλ) * Math.cos(φ2);
          const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
          let bearing = toDeg(Math.atan2(y, x));
          bearing = (bearing + 360) % 360;
          const R = 6371;
          const dLat = toRad(KAABA_LAT - lat);
          const dLng = toRad(KAABA_LNG - lng);
          const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat)) * Math.cos(toRad(KAABA_LAT)) * Math.sin(dLng/2)**2;
          const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
          sendResponse({ ok: true, data: { bearing, distance } });
          break;
        }
        // ── Gamification ────────────────────────────────────────────────
        case 'FALAH_GET_GAMIFICATION': {
          const { auth } = await chrome.storage.local.get('auth');
          if (!auth?.token) { sendResponse({ ok: false, error: 'Not authenticated' }); break; }
          try {
            const resp = await fetch('https://falahos.my/mobile/api/gamification/xp', {
              headers: { 'Authorization': `Bearer ${auth.token}` },
              signal: AbortSignal.timeout(8000),
            });
            if (resp.ok) {
              const data = await resp.json();
              sendResponse({ ok: true, data });
            } else {
              sendResponse({ ok: false, error: `HTTP ${resp.status}` });
            }
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[Falah SW] Error:', err);
      try {
        if (sender?.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: 'FALAH_ERROR', error: err.message }).catch(() => {});
        }
      } catch (_) {}
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-panel') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (_) {}
  }
});

// ── Classify URL ────────────────────────────────────────────────────────────

async function classifyUrl(url, text) {
  const { verdictCache } = await chrome.storage.local.get('verdictCache');
  const cache = verdictCache || {};
  const cached = cache[url];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') || url.startsWith('about:') || url === '') {
    return { verdict: 'safe', reason: 'Browser internal page.', evidence: '', alternatives: [], quran: null };
  }

  let result;
  try {
    const resp = await fetch(CLASSIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, text: text.substring(0, 3000) }),
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    result = await resp.json();
  } catch (err) {
    console.warn('[Falah] API unreachable, using local rules:', err.message);
    result = localClassify(url, text);
  }

  result.quran = getQuranEvidence(result.verdict, result.reason);
  cache[url] = { ts: Date.now(), result };
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, 50);
    oldest.forEach(k => delete cache[k]);
  }

  // Track stats for Halal Monitor
  const { monitorStats } = await chrome.storage.local.get('monitorStats');
  const stats = monitorStats || { safe: 0, caution: 0, warning: 0, blocked: 0, history: [] };
  stats[result.verdict] = (stats[result.verdict] || 0) + 1;

  // Track flagged history
  if (result.verdict !== 'safe') {
    stats.history.unshift({ url, title: result.reason || 'Flagged Content', verdict: result.verdict, ts: Date.now() });
    // Premium: keep up to 50 entries, Free: keep last 24h worth (prune older)
    const { premium } = await checkPremiumStatus();
    if (premium) {
      if (stats.history.length > 50) stats.history.pop();
    } else {
      // Free tier: keep entries from last 24 hours
      const oneDayAgo = Date.now() - 24 * 3600000;
      stats.history = stats.history.filter(e => e.ts > oneDayAgo);
    }
  }

  await chrome.storage.local.set({ verdictCache: cache, monitorStats: stats });
  return result;
}

// ── Local Classification Rules ──────────────────────────────────────────────

const LOCAL_RULES = [
  { pattern: /\b(gambling|casino|bet|betting|poker|slots|lottery|wager|bookie)\b/i, verdict: 'blocked', reason: 'Gambling (Maysir) is explicitly prohibited in Islam.', evidence: 'Matched gambling keywords', alternatives: [{ title: 'Halal Entertainment', url: 'https://muslimkids.tv' }] },
  { pattern: /\b(porn|xxx|nude|onlyfans|adult\.content|sex\.video)\b/i, verdict: 'blocked', reason: 'Explicit content is prohibited in Islam.', evidence: 'Matched adult content keywords', alternatives: [{ title: 'Islamic content', url: 'https://islamqa.info' }] },
  { pattern: /\b(alcohol|beer|wine|whiskey|vodka|liquor|brewery|winery)\b/i, verdict: 'warning', reason: 'Intoxicants (Khamr) are prohibited in Islam.', evidence: 'Matched alcohol-related keywords', alternatives: [{ title: 'Halal Beverages', url: 'https://www.halalzilla.com' }] },
  { pattern: /\b(riba|interest\.rate|APR|payday\.loan|usury|loan\.shark)\b/i, verdict: 'caution', reason: 'This page may contain riba (interest-based) financial products.', evidence: 'Matched riba-related financial terms', alternatives: [{ title: 'Islamic Finance', url: 'https://www.islamic-relief.org.uk' }] },
  { pattern: /\b(pork|pig|swine|bacon|ham|lard|gelatin|haram\s*ingredient)\b/i, verdict: 'caution', reason: 'This page may reference pork or haram ingredients.', evidence: 'Matched prohibited food keywords', alternatives: [{ title: 'Halal Food Guide', url: 'https://www.halalfoodauthority.com' }] }
];

function localClassify(url, text) {
  const combined = (url + ' ' + text).toLowerCase();
  for (const rule of LOCAL_RULES) {
    if (rule.pattern.test(combined)) {
      return { verdict: rule.verdict, reason: rule.reason, evidence: rule.evidence, alternatives: rule.alternatives };
    }
  }
  return { verdict: 'safe', reason: 'No concerns detected. May Allah guide your journey.', evidence: 'Clean content scan.', alternatives: [] };
}

// ── Whisper Engine Evidence Bank ──────────────────────────────────────────────
const QURAN_EVIDENCE = {
  safe: {
    default: [
      {
        arabic: 'كُلُوا مِمَّا رَزَقَكُمُ اللَّهُ حَلَالًا طَيِّبًا',
        english: 'Eat of what Allah has provided for you as lawful and good.',
        ref: 'Quran 16:114',
        briefExplanation: 'This page has been assessed as permissible (halal). No content that conflicts with Islamic principles was detected. You may browse freely, but always remain mindful of your intentions (niyyah).'
      },
      {
        arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ',
        english: 'My success is only through Allah.',
        ref: 'Quran 11:88',
        briefExplanation: 'No Islamically problematic content was found on this page. The Whisper engine rates it GREEN — permissible for browsing. Remember that all beneficial knowledge comes from Allah.'
      },
      {
        arabic: 'الحَلَالُ بَيِّنٌ وَالحَرَامُ بَيِّنٌ',
        english: 'The halal is clear and the haram is clear.',
        ref: 'Hadith — Sahih Bukhari 52',
        briefExplanation: 'The Whisper engine found this content to be clean and within Islamic boundaries. This GREEN rating means you can engage with the material without known Shariah concerns.'
      }
    ]
  },

  caution: {
    riba: [
      {
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ وَذَرُوا مَا بَقِيَ مِنَ الرِّبَا',
        english: 'O you who believe! Fear Allah and give up what remains of riba, if you are indeed believers.',
        ref: 'Quran 2:278',
        briefExplanation: 'This page is rated AMBER because it may contain interest-based (riba) financial content. Riba is explicitly prohibited in Islam. Review any financial terms carefully and consider halal alternatives before committing.'
      },
      {
        arabic: 'وَأَحَلَّ اللَّهُ الْبَيْعَ وَحَرَّمَ الرِّبَا',
        english: 'Allah has permitted trade and forbidden riba.',
        ref: 'Quran 2:275',
        briefExplanation: 'AMBER rating: This page references financial products that may involve interest (riba). Islam permits trade but forbids usury. Proceed with caution and verify any financial commitment against Islamic finance principles.'
      }
    ],
    food: [
      {
        arabic: 'يَا أَيُّهَا النَّاسُ كُلُوا مِمَّا فِي الْأَرْضِ حَلَالًا طَيِّبًا',
        english: 'O mankind! Eat from what is lawful and good on earth.',
        ref: 'Quran 2:168',
        briefExplanation: 'AMBER rating: This page may reference pork, gelatin, or other potentially haram food ingredients. Islam requires Muslims to consume only halal and tayyib (pure) food. Check ingredient lists and halal certifications before purchasing.'
      },
      {
        arabic: 'حُرِّمَتْ عَلَيْكُمُ الْمَيْتَةُ وَالدَّمُ وَلَحْمُ الْخِنزِيرِ',
        english: 'Forbidden to you are carrion, blood, and pork.',
        ref: 'Quran 5:3',
        briefExplanation: 'AMBER rating: This page appears to reference prohibited foods such as pork or its derivatives. The Whisper engine urges caution — verify product ingredients and halal status before consumption or purchase.'
      }
    ],
    default: [
      {
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ',
        english: 'O you who believe, fear Allah.',
        ref: 'Quran 3:102',
        briefExplanation: 'This page has been rated AMBER — proceed with awareness. The Whisper engine detected content that may require careful consideration from an Islamic perspective. Review the content mindfully before engaging.'
      },
      {
        arabic: 'إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ',
        english: 'Indeed, Allah commands justice, good conduct, and generosity.',
        ref: 'Quran 16:90',
        briefExplanation: 'AMBER rating: The Whisper engine has flagged this page for cautious review. Some content here may not fully align with Islamic values. Reflect on what you engage with and ensure your actions remain consistent with justice and good conduct (ihsan).'
      }
    ]
  },

  warning: {
    alcohol: [
      {
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ فَاجْتَنِبُوهُ',
        english: 'O believers! Intoxicants and gambling are but defilement from the work of Satan, so avoid them.',
        ref: 'Quran 5:90',
        briefExplanation: 'RED rating: This page promotes or sells alcohol (khamr), which is explicitly forbidden in Islam. The Quran commands believers to completely avoid intoxicants. The Whisper engine strongly advises leaving this page.'
      },
      {
        arabic: 'كُلُّ مُسْكِرٍ خَمْرٌ وَكُلُّ خَمْرٍ حَرَامٌ',
        english: 'Every intoxicant is khamr, and every khamr is haram.',
        ref: 'Hadith — Sahih Muslim 2003',
        briefExplanation: 'RED rating: The Whisper engine detected alcohol-related content. The Prophet ﷺ declared all intoxicants forbidden regardless of quantity or form. Purchasing, promoting, or consuming alcohol is prohibited. Please navigate away.'
      }
    ],
    default: [
      {
        arabic: 'وَلَا تَقْرَبُوا الْفَوَاحِشَ مَا ظَهَرَ مِنْهَا وَمَا بَطَنَ',
        english: 'Do not approach immoralities — what is apparent and what is concealed.',
        ref: 'Quran 6:151',
        briefExplanation: 'RED rating: The Whisper engine has identified content on this page that is Islamically problematic. Islam warns against even approaching (let alone engaging with) things that lead to immorality. Exercise caution and consider navigating away.'
      },
      {
        arabic: 'إِنَّ الَّذِينَ يُحِبُّونَ أَن تَشِيعَ الْفَاحِشَةُ فِي الَّذِينَ آمَنُوا لَهُمْ عَذَابٌ أَلِيمٌ',
        english: 'Those who love that immorality should spread among the believers will have a painful punishment.',
        ref: 'Quran 24:19',
        briefExplanation: 'RED rating: This page contains content that propagates immorality or indecency. Islam firmly prohibits engaging with such material. The Whisper engine strongly recommends leaving this page immediately.'
      }
    ]
  },

  blocked: {
    gambling: [
      {
        arabic: 'إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ وَالْأَنصَابُ وَالْأَزْلَامُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ فَاجْتَنِبُوهُ لَعَلَّكُمْ تُفْلِحُونَ',
        english: "Intoxicants, gambling, idols, and divining arrows are defilement from Satan's work — avoid them so you may succeed.",
        ref: 'Quran 5:90',
        briefExplanation: 'BLOCKED: This page has been identified as a gambling (maysir) site. Gambling is explicitly listed alongside intoxicants as among the gravest prohibitions in Islam — it corrupts wealth, destroys families, and breeds enmity. The Whisper engine has blocked access in accordance with your Strict guidance setting.'
      },
      {
        arabic: 'إِنَّمَا يُرِيدُ الشَّيْطَانُ أَن يُوقِعَ بَيْنَكُمُ الْعَدَاوَةَ وَالْبَغْضَاءَ فِي الْخَمْرِ وَالْمَيْسِرِ',
        english: 'Satan only wants to cause between you animosity and hatred through intoxicants and gambling.',
        ref: 'Quran 5:91',
        briefExplanation: 'BLOCKED: Gambling (maysir) is haram. Allah explains its purpose — it sows hatred and enmity among people. This page has been blocked to protect you from engaging with prohibited financial games of chance.'
      }
    ],
    adult: [
      {
        arabic: 'قُل لِّلْمُؤْمِنِينَ يَغُضُّوا مِنْ أَبْصَارِهِمْ وَيَحْفَظُوا فُرُوجَهُمْ',
        english: 'Tell the believing men to lower their gaze and guard their chastity.',
        ref: 'Quran 24:30',
        briefExplanation: 'BLOCKED: This page contains explicit adult content. Islam commands believers to guard their gaze and protect their chastity. Such content corrupts the heart and distances one from Allah. The Whisper engine has blocked access to safeguard your spiritual wellbeing.'
      },
      {
        arabic: 'إِنَّ السَّمْعَ وَالْبَصَرَ وَالْفُؤَادَ كُلُّ أُولَٰئِكَ كَانَ عَنْهُ مَسْئُولًا',
        english: 'Indeed, the hearing, the sight, and the heart — about all of these you will be questioned.',
        ref: 'Quran 17:36',
        briefExplanation: 'BLOCKED: Explicit content has been detected. We will be held accountable for what our eyes see and what our hearts dwell on. This page has been blocked to help you maintain accountability before Allah on the Day of Judgement.'
      }
    ],
    default: [
      {
        arabic: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا',
        english: 'Whoever fears Allah, He will make a way out for them.',
        ref: 'Quran 65:2',
        briefExplanation: 'BLOCKED: This page has been blocked as it violates Islamic principles. Trust in Allah — His path is always better. The Whisper engine has prevented access to protect your faith (iman) and help you maintain righteous conduct.'
      },
      {
        arabic: 'وَلَا تَعَاوَنُوا عَلَى الْإِثْمِ وَالْعُدْوَانِ',
        english: 'Do not cooperate in sin and transgression.',
        ref: 'Quran 5:2',
        briefExplanation: 'BLOCKED: Access denied. By blocking this page, Falah is helping you avoid cooperating in sin. By Allah\'s mercy, we are reminded not to aid one another in transgression. Go forth with righteousness.'
      }
    ]
  }
};

function getQuranEvidence(verdict, reason) {
  const bank = QURAN_EVIDENCE[verdict];
  if (!bank) return null;

  if (verdict === 'safe') {
    const verses = bank.default;
    return verses[Math.floor(Math.random() * verses.length)];
  }

  // For non-safe verdicts, try to match topic
  const lower = (reason || '').toLowerCase();
  for (const [topic, verses] of Object.entries(bank)) {
    if (topic === 'default') continue;
    if (lower.includes(topic)) {
      return verses[Math.floor(Math.random() * verses.length)];
    }
  }
  return bank.default?.[Math.floor(Math.random() * bank.default.length)] || null;
}

// ── Prayer Times ────────────────────────────────────────────────────────────

async function schedulePrayerAlarms() {
  try {
    await chrome.alarms.create(ALARM_PRAYER, { periodInMinutes: 5 });
    await chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: 1440 });
  } catch (_) {}
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PRAYER) {
    const { settings, prayerTimes } = await chrome.storage.local.get(['settings', 'prayerTimes']);
    if (!prayerTimes) return;
    const s = settings || DEFAULT_SETTINGS;
    checkPrayerNotifications(prayerTimes, s);
  } else if (alarm.name === ALARM_REFRESH) {
    const { settings } = await chrome.storage.local.get('settings');
    const s = settings || DEFAULT_SETTINGS;
    await fetchAndStorePrayerTimes(s.city, s.country);
  }
});

async function fetchAndStorePrayerTimes(city, country) {
  try {
    const url = `${PRAYER_API}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const timings = data.data?.timings;
    if (timings) {
      const pt = {
        Fajr: timings.Fajr, Dhuhr: timings.Dhuhr, Asr: timings.Asr,
        Maghrib: timings.Maghrib, Isha: timings.Isha,
        date: data.data?.date?.readable || new Date().toDateString()
      };
      await chrome.storage.local.set({ prayerTimes: pt });
      return pt;
    }
  } catch (err) {
    console.warn('[Falah] Prayer API error:', err.message);
  }
  return null;
}

function isTodaysPrayerData(pt) {
  if (!pt || !pt.date) return false;
  return pt.date === new Date().toDateString() || pt.date === (new Date().toISOString().substring(0, 10));
}

function checkPrayerNotifications(pt, settings) {
  if (!settings.prayerNotifications) return;
  const now = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();
  const nowTotal = nowH * 60 + nowM;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  for (const p of prayers) {
    const t = (pt[p] || '').substring(0, 5);
    if (!t) continue;
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m;
    if (Math.abs(nowTotal - total) <= 2) {
      chrome.notifications.create(`prayer-${p}`, {
        type: 'basic', iconUrl: '/icons/icon128.png',
        title: `🕌 Time for ${p}`, message: `It's time for ${p} prayer.`,
        priority: 2
      }).catch(() => {});
      break;
    }
  }
}

// ── Health Check ────────────────────────────────────────────────────────────

async function checkHealth() {
  try {
    const resp = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      return { status: 'ok', version: data.version || '2.1.0' };
    }
  } catch (_) {}
  return { status: 'degraded', version: '2.1.0' };
}

// ── Badge ───────────────────────────────────────────────────────────────────

async function updateBadge(tabId, verdict) {
  if (!tabId) return;
  const color = BADGE_COLORS[verdict] || BADGE_COLORS.loading;
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    const txt = ({ safe: '✓', caution: '?', warning: '⚠', blocked: '✕' })[verdict] || '';
    await chrome.action.setBadgeText({ text: txt, tabId });
  } catch (_) {}
}
