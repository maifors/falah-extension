import { FalahApiClient } from './api-client.js';


// ── DOMAIN CLASSIFICATION LISTS (v2.1) ─────────────────────────
// Loaded from data/*.json — used by GET_CLASSIFICATION message handler
const _domainLists = { halal: [], makruh: [], haram: [] };

async function loadDomainLists() {
  const files = { halal: 'halal', makruh: 'makruh', haram: 'haram' };
  for (const [key, name] of Object.entries(files)) {
    try {
      const url = chrome.runtime.getURL(`data/${name}.json`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _domainLists[key] = await res.json();
    } catch (e) {
      console.warn('[Falah] Could not load domain list:', key, e.message);
      _domainLists[key] = [];
    }
  }
}

const CLASSIFY_URL = 'https://falah-os.com/.netlify/functions/classify';
const PRAYER_API = 'https://api.aladhan.com/v1/timingsByCity';
const CACHE_TTL_MS = 5 * 60 * 1000;
const ALARM_PRAYER = 'falah-prayer-check';
const ALARM_REFRESH = 'falah-prayer-refresh';

const BADGE_COLORS = {
  safe: '#10b981', caution: '#f59e0b', warning: '#ef4444',
  blocked: '#ef4444', loading: '#6b7280', error: '#6b7280'
};

const DEFAULT_SETTINGS = {
  guidanceLevel: 'caution', subbarEnabled: true,
  prayerNotifications: true, adhanSound: false,
  city: 'Kuala Lumpur', country: 'Malaysia',
  haulStart: null
};

const api = new FalahApiClient();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, prayerTimes: null, verdictCache: {} });
  }
  await schedulePrayerAlarms();
  await initSidePanel();
  await loadDomainLists(); // v2.1: load halal/haram/makruh lists
});

chrome.runtime.onStartup.addListener(async () => {
  await schedulePrayerAlarms();
  await loadDomainLists(); // v2.1: reload lists on SW restart
});

// v2.1: also load lists immediately on first parse
loadDomainLists();

async function initSidePanel() {
  try {
    await chrome.sidePanel.setOptions({ path: 'src/panel/panel.html', enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {

        case 'CLASSIFY_URL': {
          const result = await classifyUrl(msg.url, msg.text || '');
          sendResponse({ ok: true, data: result });
          break;
        }

        case 'GET_SETTINGS': {
          const { settings } = await chrome.storage.local.get('settings');
          sendResponse({ ok: true, data: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
          break;
        }

        case 'SAVE_SETTINGS': {
          const { settings: cur } = await chrome.storage.local.get('settings');
          const merged = { ...DEFAULT_SETTINGS, ...cur, ...msg.settings };
          await chrome.storage.local.set({ settings: merged });
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
            const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
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

        case 'OPEN_SIDE_PANEL': {
          try {
            await chrome.sidePanel.open({ windowId: sender.tab?.windowId || msg.windowId });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }


        // ── v2.1: USER SITE CLASSIFICATION ────────────────────────
        case 'GET_CLASSIFICATION': {
          if (!msg.hostname) { sendResponse({ ok: false, error: 'hostname required' }); break; }
          const classification = await getDomainClassification(msg.hostname);
          sendResponse({ ok: true, data: classification });
          break;
        }

        case 'SET_CLASSIFICATION': {
          if (!msg.hostname || !msg.status) { sendResponse({ ok: false, error: 'hostname and status required' }); break; }
          await setDomainClassification(msg.hostname, msg.status);
          sendResponse({ ok: true });
          break;
        }

        case 'CLEAR_CLASSIFICATION': {
          if (!msg.hostname) { sendResponse({ ok: false, error: 'hostname required' }); break; }
          await clearDomainClassification(msg.hostname);
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[Falah SW] Error:', err);
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

// ── CLASSIFY ──────────────────────────────────────────────
async function classifyUrl(url, text) {
  const { verdictCache } = await chrome.storage.local.get('verdictCache');
  const cache = verdictCache || {};
  const cached = cache[url];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') || url.startsWith('about:') || url === '') {
    return { verdict: 'safe', reason: 'Browser internal page.', alternatives: [], quran: null };
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
    result = localClassify(url, text);
  }

  result.quran = getQuranEvidence(result.verdict);
  cache[url] = { ts: Date.now(), result };
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, 50);
    oldest.forEach(k => delete cache[k]);
  }
  await chrome.storage.local.set({ verdictCache: cache });
  return result;
}

// Known haram domain lists — catch brands not caught by keyword patterns
const GAMBLING_DOMAINS = ['williamhill','betvictor','paddypower','ladbrokes','coral','888sport','unibet','draftkings','fanduel','pointsbet','1xbet','bovada','betonline','betclic','betsson','bwin','pokerstars','partypoker','888casino','jackpot','casumo','betmgm','caesars','hardrock','resorts','foxbet'];
const ADULT_DOMAINS = ['pornhub','xvideos','xhamster','redtube','youporn','livejasmin','chaturbate','cam4','stripchat','brazzers','bangbros','mofos','realitykings','twistys','digitalplayground'];
const ALCOHOL_DOMAINS = ['heineken','budweiser','jackdaniels','johnniewalker','absolutvodka','smirnoff','coronabeer','guinness','carlsberg','stellaartois','fosters','becks','peroni','asahi','tigerbeer','changbeer','angkorbeer','erdinger','paulaner'];

const LOCAL_RULES = [
  {
    test: (url, text) => {
      const c = (url + ' ' + text).toLowerCase();
      return GAMBLING_DOMAINS.some(d => c.includes(d)) || /(gambling|casino|bet[0-9a-z]*|betting|poker|slots|lottery|wager|bookie|sportsbook)/i.test(c);
    },
    verdict: 'blocked',
    reason: 'Gambling (Maysir) is explicitly forbidden in Islam. This site appears to facilitate wagering or games of chance.',
    alternatives: [{ title: 'Halal Entertainment', url: 'https://muslimkids.tv' }, { title: 'Islamic Games', url: 'https://www.islamicfinder.org' }]
  },
  {
    test: (url, text) => {
      const c = (url + ' ' + text).toLowerCase();
      return ADULT_DOMAINS.some(d => c.includes(d)) || /(porn|xxx|nude|onlyfans|adult\.content|sex\.video|erotic|hentai|nsfw|camgirl|livecam)/i.test(c);
    },
    verdict: 'blocked',
    reason: 'Explicit or adult content is prohibited in Islam. Lowering the gaze is obligatory (Quran 24:30).',
    alternatives: [{ title: 'Islamic Content', url: 'https://islamqa.info' }, { title: 'Quran & Sunnah', url: 'https://sunnah.com' }]
  },
  {
    test: (url, text) => {
      const c = (url + ' ' + text).toLowerCase();
      return ALCOHOL_DOMAINS.some(d => c.includes(d)) || /(alcohol|beer|wine|whiskey|vodka|liquor|brewery|winery|spirits|bourbon|champagne|prosecco|gin|rum|tequila|brandy|mead|cider|lager|ale|draught)/i.test(c);
    },
    verdict: 'warning',
    reason: 'This page relates to intoxicants (Khamr), which are explicitly prohibited in Islam (Quran 5:90).',
    alternatives: [{ title: 'Halal Beverages', url: 'https://www.halalzilla.com' }, { title: 'Islamic Diet Guide', url: 'https://www.islamicfinder.org' }]
  },
  {
    test: (url, text) => /(riba|interest[- ]rate|APR|payday[- ]loan|usury|loan[- ]shark|high[- ]interest|subprime|predatory[- ]lend)/i.test(url + ' ' + text),
    verdict: 'caution',
    reason: 'This page may involve riba (interest/usury), which is forbidden in Islam. Seek halal financing alternatives.',
    alternatives: [{ title: 'Islamic Finance', url: 'https://www.islamic-relief.org.uk' }, { title: 'Wahed Invest', url: 'https://wahedinvest.com' }]
  },
  {
    test: (url, text) => /(pork|pig meat|swine|bacon|ham(?!as)|lard|pork gelatin|haram ingredient|non-halal)/i.test(url + ' ' + text),
    verdict: 'caution',
    reason: 'This page may reference pork or haram food ingredients. Verify halal certification before consuming.',
    alternatives: [{ title: 'Halal Food Guide', url: 'https://www.halalfoodauthority.com' }, { title: 'JAKIM Halal', url: 'https://www.halal.gov.my' }]
  },
  {
    test: (url, text) => /(escort|prostitut|brothel|strip[- ]club|hookup|sex[- ]work|sugar[- ]dad|sugar[- ]mom)/i.test(url + ' ' + text),
    verdict: 'blocked',
    reason: 'This page appears to involve immorality (fahisha). Islam strictly forbids these activities.',
    alternatives: [{ title: 'Marriage in Islam', url: 'https://islamqa.info/en/answers/2127' }]
  },
  {
    test: (url, text) => /(occult|witchcraft|tarot|ouija|astrology[- ]reading|fortune[- ]tell|black[- ]magic|sihr)/i.test(url + ' ' + text),
    verdict: 'warning',
    reason: 'This page involves occult or superstitious practices prohibited in Islam (seeking knowledge only from Allah).',
    alternatives: [{ title: 'Islamic Beliefs', url: 'https://islamqa.info' }]
  }
];

function localClassify(url, text) {
  for (const rule of LOCAL_RULES) {
    if (rule.test(url, text)) {
      return { verdict: rule.verdict, reason: rule.reason, alternatives: rule.alternatives };
    }
  }
  return { verdict: 'safe', reason: 'No concerns detected. May Allah bless your browsing.', alternatives: [] };
}

const QURAN_EVIDENCE = {
  safe: [
    { arabic: 'كُلُوا مِمَّا رَزَقَكُمُ اللَّهُ حَلَالًا طَيِّبًا', english: 'Eat of what Allah has provided for you as lawful and good.', ref: 'Quran 16:114' },
    { arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ', english: 'My success is only through Allah.', ref: 'Quran 11:88' }
  ],
  caution: [
    { arabic: 'وَذَرُوا مَا بَقِيَ مِنَ الرِّبَا', english: 'And leave what remains of riba.', ref: 'Quran 2:278' }
  ],
  warning: [
    { arabic: 'وَلَا تَقْرَبُوا الْفَوَاحِشَ', english: 'Do not approach immoralities.', ref: 'Quran 6:151' }
  ],
  blocked: [
    { arabic: 'إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ وَالْأَنصَابُ وَالْأَزْلَامُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ', english: 'Intoxicants, gambling, idols and divining arrows are defilement from the work of Satan.', ref: 'Quran 5:90' }
  ]
};

function getQuranEvidence(verdict) {
  const bank = QURAN_EVIDENCE[verdict] || QURAN_EVIDENCE.safe;
  return bank[Math.floor(Math.random() * bank.length)];
}

// ── BADGE ─────────────────────────────────────────────────
async function updateBadge(tabId, verdict) {
  if (!tabId) return;
  const color = BADGE_COLORS[verdict] || BADGE_COLORS.loading;
  const text = verdict === 'safe' ? '✓' : verdict === 'caution' ? '!' : (verdict === 'blocked' || verdict === 'warning') ? '✕' : '?';
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
  } catch (_) {}
}

// ── PRAYER TIMES ──────────────────────────────────────────
async function fetchAndStorePrayerTimes(city, country) {
  try {
    const today = new Date();
    const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    const url = `${PRAYER_API}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=3&date=${dateStr}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Prayer API ${resp.status}`);
    const json = await resp.json();
    const timings = json.data?.timings;
    const hijri = json.data?.date?.hijri;
    if (!timings) throw new Error('No timings');
    const prayerTimes = {
      date: dateStr, city, country,
      Fajr: timings.Fajr, Sunrise: timings.Sunrise, Dhuhr: timings.Dhuhr,
      Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha,
      hijri: hijri ? { day: hijri.day, month: hijri.month, year: hijri.year } : null
    };
    await chrome.storage.local.set({ prayerTimes });
    return prayerTimes;
  } catch (err) {
    console.warn('[Falah] Prayer API failed:', err.message);
    return {
      date: 'fallback', city, country,
      Fajr: '05:30', Sunrise: '07:00', Dhuhr: '13:15',
      Asr: '16:30', Maghrib: '19:15', Isha: '20:30', hijri: null
    };
  }
}

function isTodaysPrayerData(data) {
  if (!data?.date || data.date === 'fallback') return false;
  const today = new Date();
  return data.date === `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
}

async function schedulePrayerAlarms() {
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_PRAYER, { periodInMinutes: 1 });
  chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PRAYER) await checkPrayerNotification();
  else if (alarm.name === ALARM_REFRESH) {
    const { settings } = await chrome.storage.local.get('settings');
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    await fetchAndStorePrayerTimes(s.city, s.country);
  }
});

async function checkPrayerNotification() {
  const { settings, prayerTimes, lastNotified } = await chrome.storage.local.get(['settings', 'prayerTimes', 'lastNotified']);
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!s.prayerNotifications || !prayerTimes) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  for (const name of prayers) {
    const t = (prayerTimes[name] || '').substring(0, 5);
    if (t === hhmm && lastNotified !== `${name}-${hhmm}`) {
      await chrome.storage.local.set({ lastNotified: `${name}-${hhmm}` });
      chrome.notifications.create(`prayer-${name}`, {
        type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `🕌 Time for ${name}`,
        message: `Assalamu Alaikum — it is now ${name} prayer time (${t}). May Allah accept your Salah.`,
        priority: 2
      });
      break;
    }
  }
}

// ── TAB CLASSIFY ─────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) return;
  await updateBadge(tabId, 'loading');
  try {
    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body?.innerText?.substring(0, 3000) || ''
    }).catch(() => [{ result: '' }]);
    const verdict = await classifyUrl(tab.url, pageText || '');
    await updateBadge(tabId, verdict.verdict);
    chrome.tabs.sendMessage(tabId, { type: 'VERDICT_READY', verdict }).catch(() => {});
  } catch (err) {
    await updateBadge(tabId, 'error');
  }
});


// ── v2.1: DOMAIN CLASSIFICATION HELPERS ───────────────────────────────────

/**
 * Get Shariah classification for a hostname.
 * Priority: session cache → user override → domain list → unknown
 */
async function getDomainClassification(hostname) {
  // 1. Session cache (fast path for recently seen domains)
  try {
    const sessionData = await chrome.storage.session.get(hostname);
    if (sessionData[hostname]) return sessionData[hostname];
  } catch (_) { /* chrome.storage.session may not be available in all contexts */ }

  // 2. User-defined override (synced across devices)
  const { user_classifications = {} } = await chrome.storage.sync.get('user_classifications').catch(() => ({}));
  if (user_classifications[hostname]) {
    const entry = user_classifications[hostname];
    return { status: entry.status, reason: 'Classified by you' };
  }

  // 3. Built-in domain lists
  const domain = hostname.replace(/^www\./, '');
  if (_domainLists.haram.some(d => domain.includes(d))) {
    return { status: 'haram', reason: 'On Falah haram list' };
  }
  if (_domainLists.makruh.some(d => domain.includes(d))) {
    return { status: 'makruh', reason: 'On Falah makruh list' };
  }
  if (_domainLists.halal.some(d => domain.includes(d))) {
    return { status: 'halal', reason: 'On Falah halal list' };
  }

  return { status: 'unknown', reason: 'Not in Falah database' };
}

/**
 * Save a user-defined classification for a hostname.
 */
async function setDomainClassification(hostname, status) {
  const { user_classifications = {} } = await chrome.storage.sync.get('user_classifications').catch(() => ({}));
  user_classifications[hostname] = { status, timestamp: Date.now() };
  await chrome.storage.sync.set({ user_classifications }).catch(() => {});
  try {
    await chrome.storage.session.set({ [hostname]: { status, reason: 'Classified by you' } });
  } catch (_) {}
}

/**
 * Remove a user-defined classification, restoring list/unknown behaviour.
 */
async function clearDomainClassification(hostname) {
  const { user_classifications = {} } = await chrome.storage.sync.get('user_classifications').catch(() => ({}));
  delete user_classifications[hostname];
  await chrome.storage.sync.set({ user_classifications }).catch(() => {});
  try {
    await chrome.storage.session.remove(hostname);
  } catch (_) {}
}
