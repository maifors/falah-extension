import { FalahApiClient } from './api-client.js';

const CLASSIFY_URL = 'https://falah-os.netlify.app/.netlify/functions/classify';
const HEALTH_URL = 'https://falah-os.netlify.app/.netlify/functions/health';
const PRAYER_API = 'https://api.aladhan.com/v1/timingsByCity';
const CACHE_TTL_MS = 5 * 60 * 1000;
const ALARM_PRAYER = 'falah-prayer-check';
const ALARM_REFRESH = 'falah-prayer-refresh';

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

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, prayerTimes: null, verdictCache: {}, auth: null });
  }
  await schedulePrayerAlarms();
  await initSidePanel();
});

chrome.runtime.onStartup.addListener(async () => {
  await schedulePrayerAlarms();
  await restoreAuth();
});

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
          sendResponse({ ok: true, data: settings || DEFAULT_SETTINGS });
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
          await chrome.storage.local.remove(['auth', 'demoSession']);
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
        case 'OPEN_SIDE_PANEL': {
          try {
            await chrome.sidePanel.open({ windowId: sender.tab?.windowId || msg.windowId });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[Falah SW] Error:', err);
      // Notify content script so user sees feedback
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
  await chrome.storage.local.set({ verdictCache: cache });
  return result;
}

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
// Each entry carries: arabic text, English translation, reference, and a
// briefExplanation explaining WHY this grade was assigned. Entries are
// organised by verdict level and then by topic keyword so getQuranEvidence()
// can pick the most contextually relevant citation.
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
        english: 'And whoever fears Allah — He will make for them a way out.',
        ref: 'Quran 65:2',
        briefExplanation: 'BLOCKED: The Whisper engine has determined this page contains haram content and has blocked it. Whoever maintains taqwa (God-consciousness) will find that Allah opens better paths. Trust in His guidance and navigate to something beneficial.'
      },
      {
        arabic: 'وَلَا تَقْرَبُوا الْفَوَاحِشَ مَا ظَهَرَ مِنْهَا وَمَا بَطَنَ',
        english: 'Do not approach immoralities — what is apparent and what is concealed.',
        ref: 'Quran 6:151',
        briefExplanation: 'BLOCKED: This page has been blocked by Falah Whisper. Islam forbids even approaching things that lead to sin. By blocking this content, Falah is helping you maintain the boundaries Allah has set for our protection and wellbeing.'
      }
    ]
  }
};

/**
 * getQuranEvidence — Whisper Engine core selector.
 * Picks the most contextually relevant Quran/Hadith citation AND briefExplanation
 * based on the verdict colour AND the reason text returned by the classifier.
 *
 * @param {string} verdict  - 'safe' | 'caution' | 'warning' | 'blocked'
 * @param {string} reason   - The reason string from the classifier
 * @returns {{ arabic, english, ref, briefExplanation }}
 */
function getQuranEvidence(verdict, reason) {
  const bank = QURAN_EVIDENCE[verdict] || QURAN_EVIDENCE.safe;
  const r = (reason || '').toLowerCase();

  // Topic-keyword matching for the most relevant citation
  let pool = null;
  if (verdict === 'blocked' || verdict === 'warning') {
    if (/gambl|maysir|casino|bet|poker|slot|lottery/.test(r)) pool = bank.gambling;
    else if (/porn|adult|explicit|nude|xxx|onlyfans|sex/.test(r)) pool = bank.adult;
    else if (/alcohol|beer|wine|khamr|whiskey|liquor|intoxicant/.test(r)) pool = bank.alcohol;
  }
  if (verdict === 'caution') {
    if (/riba|interest|usury|apr|loan|payday/.test(r)) pool = bank.riba;
    else if (/pork|pig|swine|bacon|ham|lard|gelatin|food|ingredient/.test(r)) pool = bank.food;
  }

  // Fallback to the verdict's default pool, then to safe default
  if (!pool || !pool.length) pool = bank.default || QURAN_EVIDENCE.safe.default;

  return pool[Math.floor(Math.random() * pool.length)];
}

async function updateBadge(tabId, verdict) {
  if (!tabId) return;
  const color = BADGE_COLORS[verdict] || BADGE_COLORS.loading;
  const text = verdict === 'safe' ? '✓' : verdict === 'caution' ? '!' : verdict === 'blocked' || verdict === 'warning' ? '✕' : '?';
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
  } catch (_) {}
}

async function fetchAndStorePrayerTimes(city, country) {
  try {
    const today = new Date();
    const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    const url = `${PRAYER_API}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=3&date=${dateStr}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Prayer API ${resp.status}`);
    const json = await resp.json();
    const timings = json.data?.timings;
    if (!timings) throw new Error('No timings in response');
    const prayerTimes = { date: dateStr, city, country, Fajr: timings.Fajr, Sunrise: timings.Sunrise, Dhuhr: timings.Dhuhr, Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha };
    await chrome.storage.local.set({ prayerTimes });
    return prayerTimes;
  } catch (err) {
    console.warn('[Falah] Prayer API failed:', err.message);
    return { date: 'fallback', city, country, Fajr: '05:30', Sunrise: '07:00', Dhuhr: '13:15', Asr: '16:30', Maghrib: '19:15', Isha: '20:30' };
  }
}

function isTodaysPrayerData(data) {
  if (!data || !data.date || data.date === 'fallback') return false;
  const today = new Date();
  const todayStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
  return data.date === todayStr;
}

async function schedulePrayerAlarms() {
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_PRAYER, { periodInMinutes: 5 });
  chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PRAYER) {
    await checkPrayerNotification();
  } else if (alarm.name === ALARM_REFRESH) {
    const { settings } = await chrome.storage.local.get('settings');
    const s = settings || DEFAULT_SETTINGS;
    await fetchAndStorePrayerTimes(s.city, s.country);
  }
});

async function checkPrayerNotification() {
  const { settings, prayerTimes, lastNotified } = await chrome.storage.local.get(['settings', 'prayerTimes', 'lastNotified']);
  const s = settings || DEFAULT_SETTINGS;
  if (!s.prayerNotifications || !prayerTimes) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
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

async function checkHealth() {
  try {
    const resp = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return { status: 'degraded', version: '?' };
    return await resp.json();
  } catch {
    return { status: 'offline', version: '?' };
  }
}

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
    console.error('[Falah SW] Tab classify error:', err);
    await updateBadge(tabId, 'error');
  }
});
