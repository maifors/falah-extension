'use strict';

const $ = id => document.getElementById(id);

const DAILY_VERSES = [
  { arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ', english: 'My success is only through Allah.', ref: 'Quran 11:88' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', english: 'Indeed, with hardship will be ease.', ref: 'Quran 94:6' },
  { arabic: 'وَلَذِكْرُ اللَّهِ أَكْبَرُ', english: 'The remembrance of Allah is greater.', ref: 'Quran 29:45' },
  { arabic: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', english: 'Indeed, Allah is with the patient.', ref: 'Quran 2:153' }
];

document.addEventListener('DOMContentLoaded', async () => {
  setDailyVerse();
  await loadAuth();
  await loadCurrentTabVerdict();
  await loadPrayerTimes();
  setupButtons();
});

function setDailyVerse() {
  const idx = new Date().getDate() % DAILY_VERSES.length;
  const v = DAILY_VERSES[idx];
  const a = $('v-arabic'); const e = $('v-en'); const r = $('v-ref');
  if (a) a.textContent = v.arabic;
  if (e) e.textContent = `"${v.english}"`;
  if (r) r.textContent = v.ref;
}

async function loadAuth() {
  const res = await msgBg({ type: 'FALAH_CHECK_AUTH' });
  const dot = $('as-dot');
  const text = $('as-text');
  const action = $('as-action');
  if (!dot || !text || !action) return;
  if (res?.ok && res.data) {
    const isDemo = res.data.demo;
    dot.className = isDemo ? 'as-dot demo' : 'as-dot on';
    text.textContent = isDemo
      ? `Demo Mode — ${res.data.user?.name || 'User'}`
      : `Signed in as ${res.data.user?.email || res.data.user?.name || 'User'}`;
    action.textContent = 'Sign Out';
    action.onclick = async () => {
      await msgBg({ type: 'FALAH_LOGOUT' });
      loadAuth();
    };
    loadWallet();
  } else {
    dot.className = 'as-dot off';
    text.textContent = 'Not signed in';
    action.textContent = 'Sign In';
    action.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await msgBg({ type: 'OPEN_SIDE_PANEL', windowId: tab.windowId });
      window.close();
    };
  }
}

async function loadWallet() {
  const mini = $('wallet-mini');
  const bal = $('wm-balance');
  if (!mini || !bal) return;
  const res = await msgBg({ type: 'FALAH_GET_WALLET' });
  if (res?.ok && res.data && typeof res.data.balance === 'number') {
    mini.style.display = 'flex';
    bal.textContent = res.data.balance.toFixed(2);
  } else {
    mini.style.display = 'none';
  }
}

async function loadCurrentTabVerdict() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  const cacheRes = await msgBg({ type: 'GET_VERDICT_CACHE', url: tab.url });
  if (cacheRes?.ok) {
    renderVerdict(cacheRes.data);
    return;
  }
  renderVerdictLoading();
  const text = await getTabText(tab.id);
  const res = await msgBg({ type: 'CLASSIFY_URL', url: tab.url, text });
  if (res?.ok) renderVerdict(res.data);
}

function renderVerdictLoading() {
  const pill = $('vs-pill');
  if (pill) pill.className = 'vs-pill';
  const lbl = $('vs-label');
  if (lbl) lbl.textContent = 'Analysing…';
  const reason = $('vs-reason');
  if (reason) reason.textContent = 'Please wait…';
}

function renderVerdict(verdict) {
  const pill = $('vs-pill');
  if (pill) pill.className = `vs-pill ${verdict.verdict}`;
  const lbl = $('vs-label');
  if (lbl) lbl.textContent = capitalize(verdict.verdict);
  const reason = $('vs-reason');
  if (reason) reason.textContent = (verdict.reason || '').substring(0, 80);
}

async function loadPrayerTimes() {
  const res = await msgBg({ type: 'GET_PRAYER_TIMES' });
  if (!res?.ok || !res.data) return;
  const pt = res.data;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  for (const p of prayers) {
    const t = (pt[p] || '00:00').substring(0, 5);
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) {
      const n = $('pb-name'); const ti = $('pb-time');
      if (n) n.textContent = p;
      if (ti) ti.textContent = t;
      return;
    }
  }
  const n = $('pb-name');
  if (n) n.textContent = `Fajr (tomorrow) ${(pt.Fajr || '').substring(0, 5)}`;
}

function setupButtons() {
  async function openPanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await msgBg({ type: 'OPEN_SIDE_PANEL', windowId: tab.windowId });
    window.close();
  }

  $('btn-toggle-panel')?.addEventListener('click', openPanel);
  $('btn-istore')?.addEventListener('click', openPanel);
  $('btn-wallet')?.addEventListener('click', openPanel);
  $('btn-settings')?.addEventListener('click', openPanel);
  $('btn-open-falah')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://falah-os.com' });
    window.close();
  });
  $('btn-reload')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const { verdictCache } = await chrome.storage.local.get('verdictCache');
      if (verdictCache) {
        delete verdictCache[tab.url];
        await chrome.storage.local.set({ verdictCache });
      }
      await loadCurrentTabVerdict();
    }
  });
}

function msgBg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, res => resolve(res || null));
  });
}

async function getTabText(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body?.innerText?.substring(0, 3000) || ''
    });
    return result || '';
  } catch { return ''; }
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
