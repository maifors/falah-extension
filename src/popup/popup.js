'use strict';

const $ = id => document.getElementById(id);

const FEEDBACK_API = 'https://falahos.my/mobile/api/feedback';
const DAILY_VERSES = [
  { arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ', english: 'My success is only through Allah.', ref: 'Quran 11:88' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', english: 'Indeed, with hardship will be ease.', ref: 'Quran 94:6' },
  { arabic: 'وَلَذِكْرُ اللَّهِ أَكْبَرُ', english: 'The remembrance of Allah is greater.', ref: 'Quran 29:45' },
  { arabic: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', english: 'Indeed, Allah is with the patient.', ref: 'Quran 2:153' }
];

document.addEventListener('DOMContentLoaded', async () => {
  setDailyVerse();
  setupErrorBannerUI();
  await loadAuth();
  await loadCurrentTabVerdict();
  await loadPrayerTimes();
  setupButtons();
  setupDhikrButtons();
  loadDhikrStats();
  loadQibla();
});

function setDailyVerse() {
  const idx = new Date().getDate() % DAILY_VERSES.length;
  const v = DAILY_VERSES[idx];
  const a = $('v-arabic'); const e = $('v-en'); const r = $('v-ref');
  if (a) a.textContent = v.arabic;
  if (e) e.textContent = `"${v.english}"`;
  if (r) r.textContent = v.ref;
}

// ── Error Banner ────────────────────────────────────────────

let _currentError = null;
let _retryCallback = null;

function showError(message, retryCallback) {
  const banner = $('error-banner');
  const msgEl = $('eb-message');
  const retryBtn = $('eb-retry');
  if (!banner || !msgEl) return;

  _currentError = message;
  _retryCallback = retryCallback || null;

  msgEl.textContent = message;
  banner.classList.add('visible');

  if (retryBtn) {
    retryBtn.style.display = retryCallback ? 'inline-block' : 'none';
  }

  // Hide feedback form if it was open
  hideFeedback();
}

function hideError() {
  const banner = $('error-banner');
  const msgEl = $('eb-message');
  if (banner) banner.classList.remove('visible');
  if (msgEl) msgEl.textContent = '';
  _currentError = null;
  _retryCallback = null;
  hideFeedback();
}

function hideFeedback() {
  const form = $('feedback-form');
  const statusEl = $('ff-status');
  if (form) form.classList.remove('visible');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
}

async function sendFeedback(userComment) {
  const submitBtn = $('ff-submit');
  const statusEl = $('ff-status');
  if (!statusEl) return;

  try {
    if (submitBtn) submitBtn.disabled = true;
    statusEl.style.display = 'block';
    statusEl.textContent = 'Sending…';
    statusEl.style.color = '#fde68a';

    const payload = {
      url: window.location.href || '',
      error: _currentError || 'Unknown',
      message: userComment || '',
      userAgent: navigator.userAgent || ''
    };

    const resp = await fetch(FEEDBACK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      statusEl.textContent = '✓ Report sent. Thank you!';
      statusEl.style.color = '#6ee7b7';
      setTimeout(() => {
        hideFeedback();
        if (submitBtn) submitBtn.disabled = false;
      }, 2000);
    } else {
      statusEl.textContent = 'Could not send. You can email us at support@falahos.com.';
      statusEl.style.color = '#fcd34d';
      if (submitBtn) submitBtn.disabled = false;
    }
  } catch (_) {
    statusEl.textContent = 'Could not send. You can email us at support@falahos.com.';
    statusEl.style.color = '#fcd34d';
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setupErrorBannerUI() {
  // Retry button
  $('eb-retry')?.addEventListener('click', () => {
    if (typeof _retryCallback === 'function') {
      hideError();
      _retryCallback();
    }
  });

  // Report Issue button — shows the inline feedback form
  $('eb-report')?.addEventListener('click', () => {
    const form = $('feedback-form');
    if (form) form.classList.add('visible');
  });

  // Dismiss button
  $('eb-dismiss')?.addEventListener('click', hideError);

  // Feedback form Cancel
  $('ff-cancel')?.addEventListener('click', hideFeedback);

  // Feedback form Submit
  $('ff-submit')?.addEventListener('click', () => {
    const textarea = $('ff-textarea');
    sendFeedback(textarea?.value || '');
  });
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
  if (res?.ok) {
    renderVerdict(res.data);
  } else {
    // Show a friendly hint, not a scary error — classification failure is common offline
    const reason = $('vs-reason');
    if (reason) reason.textContent = 'Could not reach classification servers. Check your connection. 🌐';
  }
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
  const ti = $('pb-time');
  if (n) n.textContent = 'Fajr (tomorrow)';
  if (ti) ti.textContent = (pt.Fajr || '—').substring(0, 5);
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
  $('btn-widgets')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGETS' }).catch(() => {});
    }
    window.close();
  });
  $('btn-open-falah')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://falah-os.netlify.app' });
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

// ── Dhikr Counter ────────────────────────────────────────

let dhikrSessionCount = 0;

function setupDhikrButtons() {
  document.querySelectorAll('.dh-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dhikrSessionCount++;
      $('dh-session-count').textContent = dhikrSessionCount;
      $('dh-save-btn').disabled = false;
      // Visual feedback
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => btn.style.transform = '', 120);
    });
  });
  $('dh-save-btn')?.addEventListener('click', async () => {
    if (dhikrSessionCount === 0) return;
    $('dh-save-btn').disabled = true;
    $('dh-save-btn').textContent = 'Saving…';
    const res = await msgBg({ type: 'FALAH_POST_DHIKR', data: { count: dhikrSessionCount } });
    if (res?.ok) {
      dhikrSessionCount = 0;
      $('dh-session-count').textContent = '0';
      $('dh-save-btn').textContent = '✓ Saved';
      setTimeout(() => { $('dh-save-btn').textContent = 'Save'; }, 1500);
      loadDhikrStats();
    } else {
      $('dh-save-btn').textContent = 'Save';
      $('dh-save-btn').disabled = false;
      console.warn('[Falah] Dhikr save failed:', res?.error);
      showError('A small glitch while saving your dhikr. No worries — your local count is still here. 🙏', loadDhikrStats);
    }
  });
}

async function loadDhikrStats() {
  const el = $('dh-total');
  if (!el) return;
  const res = await msgBg({ type: 'FALAH_GET_DHIKR_STATS' });
  if (res?.ok && res.data) {
    const total = res.data.total || res.data.count || 0;
    el.innerHTML = `<strong>${total.toLocaleString()}</strong> total`;
  } else {
    el.innerHTML = `<strong>—</strong> total`;
  }
}

// ── Qibla Direction ──────────────────────────────────────

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

function qiblaBearing(lat, lng) {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function distanceToMecca(lat, lng) {
  const R = 6371;
  const dLat = toRad(KAABA_LAT - lat);
  const dLng = toRad(KAABA_LNG - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(KAABA_LAT)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function bearingToCompass(bearing) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(bearing / 45) % 8;
  return dirs[idx];
}

function bearingArrow(bearing) {
  // Arrow rotates so it points toward Qibla (bearing clockwise from north)
  return `rotate(${bearing}deg)`;
}

async function loadQibla() {
  const bearingEl = $('qb-bearing');
  const distEl = $('qb-distance');
  const arrowEl = $('qb-arrow');
  if (!bearingEl) return;

  // Try geolocation first
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        renderQibla(latitude, longitude, bearingEl, distEl, arrowEl);
      },
      async () => {
        // Fallback: try stored location from settings
        await fallbackQibla(bearingEl, distEl, arrowEl);
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  } else {
    await fallbackQibla(bearingEl, distEl, arrowEl);
  }
}

async function fallbackQibla(bearingEl, distEl, arrowEl) {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings?.latitude && settings?.longitude) {
    renderQibla(settings.latitude, settings.longitude, bearingEl, distEl, arrowEl);
  } else {
    bearingEl.textContent = 'Qibla: Tap to locate';
    if (distEl) distEl.textContent = '';
    bearingEl.style.cursor = 'pointer';
    bearingEl.onclick = () => {
      bearingEl.onclick = null;
      bearingEl.style.cursor = '';
      bearingEl.textContent = 'Qibla: locating…';
      setTimeout(() => loadQibla(), 500);
    };
  }
}

function renderQibla(lat, lng, bearingEl, distEl, arrowEl) {
  const bearing = qiblaBearing(lat, lng);
  const distance = distanceToMecca(lat, lng);
  const dir = bearingToCompass(bearing);
  bearingEl.textContent = `Qibla: ${Math.round(bearing)}° ${dir}`;
  if (distEl) distEl.textContent = `· ${distance.toLocaleString()} km`;
  if (arrowEl) arrowEl.style.transform = bearingArrow(bearing);
}
