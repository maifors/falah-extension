'use strict';

const $ = id => document.getElementById(id);

const FEEDBACK_API = 'https://falahos.my/mobile/api/feedback';
const PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DAILY_VERSES = [
  { arabic: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ', english: 'My success is only through Allah.', ref: 'Quran 11:88' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', english: 'Indeed, with hardship will be ease.', ref: 'Quran 94:6' },
  { arabic: 'وَلَذِكْرُ اللَّهِ أَكْبَرُ', english: 'The remembrance of Allah is greater.', ref: 'Quran 29:45' },
  { arabic: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', english: 'Indeed, Allah is with the patient.', ref: 'Quran 2:153' }
];

let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  setDailyVerse();
  setupErrorBannerUI();
  await loadAuth();
  await loadCurrentTabVerdict();
  await loadEnhancedPrayer();
  setupButtons();
  setupDhikrButtons();
  loadDhikrStats();
  loadQibla();
  await loadSouqMini();
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
  const xpEl = $('as-xp');
  const lvlEl = $('as-level');
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
    loadGamificationMini(xpEl, lvlEl);
  } else {
    dot.className = 'as-dot off';
    text.textContent = 'Not signed in';
    action.textContent = 'Sign In';
    if (xpEl) xpEl.style.display = 'none';
    action.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await msgBg({ type: 'OPEN_SIDE_PANEL', windowId: tab.windowId });
      window.close();
    };
  }
}

async function loadGamificationMini(xpEl, lvlEl) {
  if (!xpEl || !lvlEl) return;
  try {
    const res = await msgBg({ type: 'FALAH_GET_GAMIFICATION' });
    if (res?.ok && res.data) {
      const level = res.data.level || 1;
      const xp = res.data.xp || 0;
      lvlEl.textContent = `Lv.${level}`;
      xpEl.style.display = 'inline-flex';
      const label = $('as-xp-label');
      if (label) label.textContent = `${xp} XP`;
    }
  } catch {}
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

async function loadEnhancedPrayer() {
  const res = await msgBg({ type: 'GET_PRAYER_TIMES' });
  if (!res?.ok || !res.data) return;
  const pt = res.data;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Render the 5-prayer grid
  const grid = $('ps-grid');
  if (!grid) return;
  grid.innerHTML = '';
  let nextIdx = -1;

  PRAYER_ORDER.forEach((name, i) => {
    const timeStr = (pt[name] || '00:00').substring(0, 5);
    const [h, m] = timeStr.split(':').map(Number);
    const prayerMins = h * 60 + m;
    const isPassed = prayerMins <= nowMins;
    const isNext = !isPassed && nextIdx === -1;

    if (isNext) nextIdx = i;

    const div = document.createElement('div');
    div.className = `ps-item${isNext ? ' next' : ''}${isPassed ? ' passed' : ''}`;
    div.innerHTML = `<div class="ps-item-name">${name}</div><div class="ps-item-time">${timeStr}</div>`;
    grid.appendChild(div);
  });

  // If all prayers passed, highlight Fajr as next (tomorrow)
  if (nextIdx === -1) {
    const items = grid.querySelectorAll('.ps-item');
    if (items[0]) items[0].classList.add('next');
  }

  // Countdown timer
  function updateCountdown() {
    const cd = $('ps-countdown');
    const pf = $('ps-progress-fill');
    const pl = $('ps-progress-label');
    if (!cd) return;

    const n = new Date();
    const nMins = n.getHours() * 60 + n.getMinutes();
    const nSec = nMins * 60 + n.getSeconds();

    // Find next prayer
    let nextPrayer = null;
    let nextTimeStr = '';
    for (const name of PRAYER_ORDER) {
      const t = (pt[name] || '00:00').substring(0, 5);
      const [h, m] = t.split(':').map(Number);
      if (h * 60 + m > nMins) {
        nextPrayer = name;
        nextTimeStr = t;
        break;
      }
    }
    if (!nextPrayer) {
      // Next is tomorrow's Fajr
      const fajr = (pt.Fajr || '05:00').substring(0, 5);
      const [fh, fm] = fajr.split(':').map(Number);
      const remainingSec = ((24 - n.getHours() - 1) * 3600) + ((60 - n.getMinutes() - 1) * 60) + (60 - n.getSeconds()) + fh * 3600 + fm * 60;
      const hrs = Math.floor(remainingSec / 3600);
      const mins = Math.floor((remainingSec % 3600) / 60);
      const secs = remainingSec % 60;
      cd.textContent = `${hrs}h ${mins}m ${secs}s`;
    } else {
      const [nh, nm] = nextTimeStr.split(':').map(Number);
      const targetSec = nh * 3600 + nm * 60;
      const currentSec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
      let remainingSec = targetSec - currentSec;
      if (remainingSec > 0) {
        const hrs = Math.floor(remainingSec / 3600);
        const mins = Math.floor((remainingSec % 3600) / 60);
        const secs = remainingSec % 60;
        if (hrs > 0) cd.textContent = `${hrs}h ${mins}m`;
        else if (mins > 0) cd.textContent = `${mins}m ${secs}s`;
        else cd.textContent = `${secs}s`;
      } else {
        cd.textContent = 'Due soon';
      }
    }

    // Day progress
    if (pf && pl) {
      const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0).getTime();
      const dayEnd = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59).getTime();
      const progress = Math.min(100, ((n.getTime() - dayStart) / (dayEnd - dayStart)) * 100);
      pf.style.width = `${progress}%`;
      pl.textContent = `${Math.round(progress)}% day`;
    }
  }

  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

async function loadSouqMini() {
  try {
    const res = await fetch('https://falahos.my/mobile/api/marketplace/listings');
    if (!res.ok) return;
    const data = await res.json();
    const listings = data.listings || [];
    if (!listings.length) return;

    const container = $('souq-mini');
    const itemsEl = $('sm-items');
    const countEl = $('sm-count');
    if (!container || !itemsEl) return;

    container.style.display = 'block';
    if (countEl) countEl.textContent = `${listings.length} listings`;

    // Show up to 2 featured listings
    const featured = listings.filter(l => l.featured).slice(0, 2);
    const show = featured.length ? featured : listings.slice(0, 2);

    itemsEl.innerHTML = show.map(item => `
      <a class="sm-item" href="https://falahos.my/mobile/souq" target="_blank">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span>${item.title.substring(0, 30)}${item.title.length > 30 ? '…' : ''}</span>
        <span class="sm-price">${item.priceFlh} FLH</span>
      </a>
    `).join('');
  } catch { /* silently fail — Souq feed is non-critical */ }
}

function setupButtons() {
  async function openPanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await msgBg({ type: 'OPEN_SIDE_PANEL', windowId: tab.windowId });
    window.close();
  }

  async function openUrl(url) {
    chrome.tabs.create({ url });
    window.close();
  }

  async function openFalahMobile(path) {
    chrome.tabs.create({ url: `https://falahos.my/mobile${path || ''}` });
    window.close();
  }

  $('btn-toggle-panel')?.addEventListener('click', openPanel);
  $('btn-souq')?.addEventListener('click', () => openFalahMobile('/souq'));
  $('btn-wallet')?.addEventListener('click', () => openFalahMobile('/wallet'));
  $('btn-halal')?.addEventListener('click', () => openFalahMobile('/halal-monitor'));
  $('btn-widgets')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGETS' }).catch(() => {});
    }
    window.close();
  });
  $('btn-settings')?.addEventListener('click', openPanel);
  $('btn-open-falah')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://falahos.my/mobile' });
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
