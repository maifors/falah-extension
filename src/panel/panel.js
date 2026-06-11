'use strict';

const $ = id => document.getElementById(id);

let settings = null;
let prayerTimes = null;
let user = null;
let wallet = null;
let transactions = null;
let catalog = null;
let clockTimer = null;
const PARENT_ORIGIN = new URLSearchParams(location.search).get('origin') || '*';

const GUIDANCE_DESCS = {
  advisory: 'Falah observes and informs. Navigation is never interrupted.',
  caution: 'Panel auto-opens for haram/caution pages. Requires acknowledgement.',
  strict: 'Haram pages are fully blocked. Cannot be dismissed without leaving.'
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await restoreAuth();
  setupTabs();
  setupClose();
  setupAuth();
  setupSettings();
  setupWallet();
  setupStore();
  setupZakat();
  setupQuickActions();
  setupNurBuddy();
  checkNetworkStatus();
});

function msgBg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, res => resolve(res || null));
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function pad(n) { return String(n).padStart(2, '0'); }

async function restoreAuth() {
  const res = await msgBg({ type: 'FALAH_CHECK_AUTH' });
  if (res?.ok && res.data) {
    user = res.data.user;
    showProfile();
    loadWallet();
  } else {
    showLogin();
  }
}

function showLogin() {
  const av = $('auth-view');
  const pv = $('profile-view');
  if (av) av.style.display = 'block';
  if (pv) pv.style.display = 'none';
  const sub = $('brand-sub');
  if (sub) sub.textContent = 'Not connected';
}

function showProfile() {
  const av = $('auth-view');
  const pv = $('profile-view');
  if (av) av.style.display = 'none';
  if (pv) pv.style.display = 'block';
  const pn = $('profile-name');
  if (pn) pn.textContent = user?.name || user?.email || '—';
  const pu = $('profile-ummah');
  if (pu) pu.textContent = `Ummah ID: ${user?.id || '—'}`;
  const badge = $('profile-demo-badge');
  if (badge) badge.style.display = user?.demo ? 'inline-block' : 'none';
  const sub = $('brand-sub');
  if (sub) sub.textContent = user?.email ? `Connected — ${user.email}` : 'Connected';
}

function setupAuth() {
  const loginBtn = $('btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }
  const pwField = $('login-password');
  if (pwField) {
    pwField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
  const demoBtn = $('btn-demo');
  if (demoBtn) {
    demoBtn.addEventListener('click', handleDemoLogin);
  }
  const logoutBtn = $('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

async function handleLogin() {
  const email = $('login-email')?.value.trim();
  const password = $('login-password')?.value.trim();
  if (!email || !password) return;
  const btn = $('btn-login');
  const errEl = $('login-error');
  if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
  if (errEl) errEl.textContent = '';
  const res = await msgBg({ type: 'FALAH_LOGIN', email, password });
  if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
  if (res?.ok && res.data) {
    user = res.data.user;
    showProfile();
    loadWallet();
    if (errEl) errEl.textContent = '';
  } else {
    if (errEl) errEl.textContent = res?.error || 'Login failed. Check credentials or gateway may be offline.';
  }
}

async function handleDemoLogin() {
  const btn = $('btn-demo');
  const errEl = $('login-error');
  if (btn) { btn.textContent = 'Starting demo…'; btn.disabled = true; }
  if (errEl) errEl.textContent = '';
  const res = await msgBg({ type: 'FALAH_DEMO_LOGIN' });
  if (btn) { btn.textContent = 'Demo Mode (Offline Sandbox)'; btn.disabled = false; }
  if (res?.ok && res.data) {
    user = res.data.user;
    user.demo = true;
    showProfile();
    loadWallet();
    loadZakatHistory();
    if (errEl) errEl.textContent = '';
  } else {
    if (errEl) errEl.textContent = 'Demo mode failed to start.';
  }
}

async function handleLogout() {
  await msgBg({ type: 'FALAH_LOGOUT' });
  user = null;
  wallet = null;
  transactions = null;
  showLogin();
  const wb = $('wallet-balance');
  if (wb) wb.textContent = '—';
  const wlb = $('wl-balance');
  if (wlb) wlb.textContent = '—';
  const wa = $('wallet-address');
  if (wa) wa.textContent = '—';
  const wla = $('wl-address');
  if (wla) wla.textContent = '—';
  const txEl = $('tx-list');
  if (txEl) txEl.innerHTML = '<div class="tx-empty">Sign in to view transactions</div>';
}

async function loadSettings() {
  const res = await msgBg({ type: 'GET_SETTINGS' });
  settings = res?.ok ? res.data : {
    guidanceLevel: 'caution', subbarEnabled: true, prayerNotifications: true,
    adhanSound: false, adBlocking: true, trackerBlocking: true,
    hctVerification: true, city: 'Kuala Lumpur', country: 'Malaysia', voiceStyle: 'scholar'
  };
  applySettingsToUI();
}

function applySettingsToUI() {
  if (!settings) return;
  document.querySelectorAll('#guidance-row .g-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === settings.guidanceLevel);
  });
  const gDesc = $('guidance-desc');
  if (gDesc) gDesc.textContent = GUIDANCE_DESCS[settings.guidanceLevel] || '';
  document.querySelectorAll('.toggle-row').forEach(row => {
    const key = row.dataset.key;
    const sw = row.querySelector('.toggle-sw');
    if (sw && key in settings) sw.classList.toggle('on', !!settings[key]);
  });
  const cityEl = $('loc-city');
  const ctryEl = $('loc-country');
  if (cityEl) cityEl.value = settings.city || '';
  if (ctryEl) ctryEl.value = settings.country || '';
}

function saveSettings() {
  if (!settings) return;
  msgBg({ type: 'SAVE_SETTINGS', settings });
}

function setupTabs() {
  document.querySelectorAll('.p-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
  document.querySelectorAll('[data-action="prayer"]').forEach(el => {
    el.addEventListener('click', () => {
      const tab = $('tab-dashboard');
      if (tab) tab.scrollTop = 0;
    });
  });
}

function switchTab(name) {
  document.querySelectorAll('.p-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.p-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
  if (name === 'store') loadCatalog();
  if (name === 'wallet') { if (user) loadWallet(); }
  if (name === 'monitor') loadMonitorStats();
  if (name === 'settings') checkApiHealth();
}

function setupClose() {
  $('btn-close')?.addEventListener('click', () => {
    window.parent.postMessage({ source: 'falah-panel', type: 'CLOSE_PANEL' }, PARENT_ORIGIN);
  });
}

async function loadCatalog() {
  const res = await msgBg({ type: 'FALAH_GET_CATALOG' });
  if (res?.ok && res.data) {
    catalog = res.data;
    renderCatalog();
  }
}

function renderCatalog() {
  const flagshipsEl = $('flagship-list');
  if (flagshipsEl && catalog.flagships?.length) {
    flagshipsEl.innerHTML = catalog.flagships.map(f => `
      <div class="store-item" data-app-id="${escHtml(f.id)}">
        <div class="store-thumb">${f.icon || '📦'}</div>
        <div style="flex:1">
          <div class="store-name">${escHtml(f.name)}</div>
          <div style="font-size:10px;color:var(--text-3)">${escHtml(f.developer)}</div>
          <div style="font-size:10.5px;color:var(--text-2);margin-top:2px">${escHtml(f.tagline)}</div>
        </div>
      </div>
    `).join('');
  }

  const catGrid = $('cat-grid');
  if (catGrid && catalog.categories?.length) {
    catGrid.innerHTML = catalog.categories.map(c => `
      <button class="cat-btn" data-slug="${escHtml(c.slug)}">
        <span class="cat-name">${escHtml(c.name)}</span>
        <span class="cat-count">${c.count}</span>
      </button>
    `).join('');
    catGrid.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.slug;
        const search = $('store-search');
        if (search) search.value = slug;
        filterApps(slug);
      });
    });
  }

  const appGrid = $('app-grid');
  if (appGrid && catalog.apps?.length) {
    appGrid.innerHTML = catalog.apps.map(a => `
      <div class="store-item" data-app-id="${escHtml(a.id)}" data-category="${escHtml((a.category||'').toLowerCase())}">
        <div class="store-thumb">${a.icon || '📦'}</div>
        <div style="flex:1">
          <div class="store-name">${escHtml(a.name)}</div>
          ${a.verified ? '<div class="store-cert">✓ Falah Verified</div>' : ''}
          <div style="font-size:10px;color:var(--text-3)">${escHtml(a.developer)}</div>
          <div style="display:flex;gap:8px;margin-top:3px">
            <span class="store-price">${a.price === 0 ? 'Free' : `RM ${(a.price||0).toFixed(2)}`}</span>
            <span style="font-size:10px;color:var(--text-3)">★ ${a.rating || '—'}</span>
            <span style="font-size:10px;color:var(--text-3)">${(a.downloads||0).toLocaleString()}+</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  setupStoreSearch();
}

function setupStoreSearch() {
  const search = $('store-search');
  if (!search) return;
  search.addEventListener('input', () => filterApps(search.value.toLowerCase()));
}

function filterApps(query) {
  document.querySelectorAll('#app-grid .store-item').forEach(item => {
    const name = item.querySelector('.store-name')?.textContent?.toLowerCase() || '';
    const cat = item.dataset.category || '';
    const match = !query || name.includes(query) || cat.includes(query);
    item.style.display = match ? '' : 'none';
  });
}

async function loadWallet() {
  const walletRes = await msgBg({ type: 'FALAH_GET_WALLET' });
  if (walletRes?.ok && walletRes.data) {
    wallet = walletRes.data;
    const bal = typeof wallet.balance === 'number' ? wallet.balance.toFixed(2) : '—';
    const wb = $('wallet-balance');
    if (wb) wb.textContent = bal;
    const wlb = $('wl-balance');
    if (wlb) wlb.textContent = bal;
    const addr = wallet.address || '—';
    const wa = $('wallet-address');
    if (wa) wa.textContent = addr.length > 20 ? addr.substring(0, 18) + '…' : addr;
    const wla = $('wl-address');
    if (wla) wla.textContent = addr.length > 20 ? addr.substring(0, 18) + '…' : addr;
  }

  const txRes = await msgBg({ type: 'FALAH_GET_TRANSACTIONS' });
  if (txRes?.ok && txRes.data) {
    transactions = txRes.data;
    renderTransactions();
  }

  const statsRes = await msgBg({ type: 'FALAH_GET_WALLET_STATS' });
  if (statsRes?.ok && statsRes.data) {
    const s = statsRes.data;
    const setVal = (id, val) => { const el = $(id); if (el) el.textContent = val ?? '—'; };
    setVal('ws-total', s.totalWallets ?? '—');
    setVal('ws-volume', s.volume ? `${parseFloat(s.volume).toFixed(2)}` : '—');
    setVal('ws-total-wallets', s.totalWallets ?? '—');
    setVal('ws-total-tx', s.totalTransactions ?? '—');
    setVal('ws-total-volume', s.volume ? `${parseFloat(s.volume).toFixed(2)}` : '—');
  }
}

function renderTransactions() {
  const txList = $('tx-list');
  if (!txList) return;
  if (!transactions?.length) {
    txList.innerHTML = '<div class="tx-empty">No transactions yet</div>';
    return;
  }
  const labels = { TRANSFER_IN: 'Received', TRANSFER_OUT: 'Sent', MINT: 'Minted' };
  txList.innerHTML = transactions.map(tx => {
    const isIn = tx.type === 'TRANSFER_IN' || tx.type === 'MINT';
    const cls = isIn ? 'tx-in' : 'tx-out';
    const icon = isIn ? '↓' : '↑';
    const date = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '';
    return `<div class="tx-row ${cls}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-type">${labels[tx.type] || tx.type}</div>
        <div class="tx-date">${date}</div>
      </div>
      <div class="tx-amount">${isIn ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)} ${tx.currency || 'FLH'}</div>
    </div>`;
  }).join('');
}

function setupWallet() {
  $('wl-create')?.addEventListener('click', async () => {
    const res = await msgBg({ type: 'FALAH_CREATE_WALLET' });
    if (res?.ok && res.data) {
      wallet = res.data;
      const bal = typeof wallet.balance === 'number' ? wallet.balance.toFixed(2) : '—';
      const wb = $('wallet-balance');
      if (wb) wb.textContent = bal;
      const wlb = $('wl-balance');
      if (wlb) wlb.textContent = bal;
      const addr = wallet.address || '—';
      const wa = $('wallet-address');
      if (wa) wa.textContent = addr.length > 20 ? addr.substring(0, 18) + '…' : addr;
      const wla = $('wl-address');
      if (wla) wla.textContent = addr.length > 20 ? addr.substring(0, 18) + '…' : addr;
    }
  });
  $('wl-refresh')?.addEventListener('click', () => { if (user) loadWallet(); });
}

function setupZakat() {
  $('btn-zakat-calc')?.addEventListener('click', calculateZakat);
  const wealthInput = $('zakat-wealth');
  if (wealthInput) {
    wealthInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') calculateZakat();
    });
  }
  $('btn-zakat-pay')?.addEventListener('click', async () => {
    const amount = parseFloat($('zr-amount')?.textContent?.replace('RM ', '') || '0');
    if (!amount || amount <= 0) return;
    const res = await msgBg({ type: 'FALAH_PAY_ZAKAT', amount });
    if (res?.ok) {
      const btn = $('btn-zakat-pay');
      if (btn) { btn.textContent = 'Paid ✓'; btn.disabled = true; }
      setTimeout(() => { if (btn) { btn.textContent = 'Pay Zakat'; btn.disabled = false; } }, 3000);
      loadZakatHistory();
    }
  });
  loadZakatHistory();
}

async function calculateZakat() {
  const wealth = parseFloat($('zakat-wealth')?.value);
  if (!wealth || wealth <= 0) return;
  const btn = $('btn-zakat-calc');
  if (btn) { btn.textContent = 'Calculating…'; btn.disabled = true; }
  const res = await msgBg({ type: 'FALAH_CALCULATE_ZAKAT', wealth });
  if (btn) { btn.textContent = 'Calculate'; btn.disabled = false; }
  const zr = $('zakat-result');
  const za = $('zr-amount');
  const zd = $('zr-detail');
  const nisabEl = $('zf-nisab');
  if (res?.ok && res.data) {
    if (zr) zr.style.display = 'block';
    if (za) za.textContent = `RM ${res.data.amount.toFixed(2)}`;
    if (zd) {
      if (res.data.eligible === false) {
        zd.innerHTML = `<span style="color:var(--amber)">${escHtml(res.data.message)}</span>`;
      } else {
        zd.innerHTML = `Wealth: RM ${wealth.toFixed(2)}<br>Rate: ${res.data.rate || 2.5}%<br>Due: RM ${res.data.amount.toFixed(2)}`;
      }
    }
    if (nisabEl) nisabEl.textContent = `RM ${(res.data.nisab || 20000).toLocaleString()}`;
    const payBtn = $('btn-zakat-pay');
    if (payBtn) payBtn.style.display = res.data.eligible !== false ? '' : 'none';
  } else {
    if (zr) zr.style.display = 'none';
  }
}

async function loadZakatHistory() {
  const res = await msgBg({ type: 'FALAH_GET_ZAKAT_HISTORY' });
  const zh = $('zakat-history');
  if (!zh) return;
  if (res?.ok && res.data?.length) {
    zh.innerHTML = res.data.map(p => `
      <div class="tx-row tx-in">
        <div class="tx-icon">🤲</div>
        <div class="tx-info">
          <div class="tx-type">Zakat Paid</div>
          <div class="tx-date">${p.timestamp ? new Date(p.timestamp).toLocaleDateString() : ''}</div>
        </div>
        <div class="tx-amount">-${parseFloat(p.amount).toFixed(2)} ${p.currency || 'MYR'}</div>
      </div>
    `).join('');
  } else {
    zh.innerHTML = '<div class="tx-empty">No zakat payments yet</div>';
  }
}

async function checkNetworkStatus() {
  const res = await msgBg({ type: 'FALAH_GET_NETWORK_STATUS' });
  if (res?.ok && res.data) {
    const map = { gateway: 'nr-gateway', ummah: 'nr-ummah', wallet: 'nr-wallet', mocknet: 'nr-mocknet' };
    for (const [key, elId] of Object.entries(map)) {
      const el = $(elId);
      if (!el) continue;
      const s = res.data[key];
      if (s === 'online') { el.textContent = 'Online'; el.className = 'nr-status nr-online'; }
      else if (s === 'offline' || s === 'unknown') { el.textContent = 'Offline'; el.className = 'nr-status nr-offline'; }
      else if (s === 'demo') { el.textContent = 'Sandbox'; el.className = 'nr-status nr-demo'; }
      else { el.textContent = 'Unknown'; el.className = 'nr-status'; }
    }
  }
}

function setupQuickActions() {
  document.querySelectorAll('.qa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
}

function setupSettings() {
  document.querySelectorAll('#guidance-row .g-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#guidance-row .g-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.guidanceLevel = btn.dataset.level;
      const d = $('guidance-desc');
      if (d) d.textContent = GUIDANCE_DESCS[btn.dataset.level] || '';
      saveSettings();
    });
  });

  document.querySelectorAll('.toggle-row').forEach(row => {
    const sw = row.querySelector('.toggle-sw');
    sw?.addEventListener('click', () => {
      sw.classList.toggle('on');
      const key = row.dataset.key;
      if (key && settings) {
        settings[key] = sw.classList.contains('on');
        saveSettings();
      }
    });
  });

  $('btn-save-location')?.addEventListener('click', () => {
    const city = $('loc-city')?.value.trim();
    const country = $('loc-country')?.value.trim();
    if (!city || !country) return;
    settings.city = city;
    settings.country = country;
    saveSettings();
    loadPrayerTimes();
    const btn = $('btn-save-location');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Location', 1500); }
  });

  document.querySelectorAll('#voice-row .v-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#voice-row .v-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.voiceStyle = btn.dataset.voice;
      saveSettings();
    });
  });
}

function loadPrayerTimes() {
  msgBg({ type: 'GET_PRAYER_TIMES' }).then(res => {
    if (res?.ok && res.data) {
      prayerTimes = res.data;
      renderPrayerTimes();
    }
  });
}

function renderPrayerTimes() {
  if (!prayerTimes) return;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  prayers.forEach(p => {
    const el = $(`pt-${p}`);
    if (el) el.textContent = (prayerTimes[p] || '—').substring(0, 5);
  });
  highlightCurrentPrayer();
  updateNextPrayerPill();
}

function highlightCurrentPrayer() {
  if (!prayerTimes) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  document.querySelectorAll('.prayer-row').forEach(r => {
    r.classList.remove('pr-current');
    r.querySelector('.pr-next')?.remove();
  });
  for (let i = 0; i < prayers.length; i++) {
    const t = (prayerTimes[prayers[i]] || '00:00').substring(0, 5);
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) {
      const row = document.querySelector(`.prayer-row[data-prayer="${prayers[i]}"]`);
      if (row) {
        row.classList.add('pr-current');
        const badge = document.createElement('span');
        badge.className = 'pr-next';
        badge.textContent = 'Next';
        row.appendChild(badge);
      }
      return;
    }
  }
}

function updateNextPrayerPill() {
  if (!prayerTimes) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  for (const p of prayers) {
    const t = (prayerTimes[p] || '00:00').substring(0, 5);
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) {
      const el = $('next-prayer-text');
      if (el) el.textContent = `${p} at ${t}`;
      return;
    }
  }
  const el = $('next-prayer-text');
  if (el) el.textContent = `Fajr at ${(prayerTimes.Fajr || '—').substring(0, 5)} (tomorrow)`;
}

function checkApiHealth() {
  const dot = document.querySelector('.as-dot');
  const text = $('as-text');
  if (!dot || !text) return;
  text.textContent = 'Checking API…';
  msgBg({ type: 'HEALTH_CHECK' }).then(res => {
    if (res?.ok && res.data) {
      const online = res.data.status === 'ok';
      dot.className = `as-dot ${online ? 'online' : 'offline'}`;
      text.textContent = online ? `API Online — v${res.data.version}` : 'API Degraded — Using local rules';
    } else {
      dot.className = 'as-dot offline';
      text.textContent = 'API Offline — Using local rules';
    }
  });
}

window.addEventListener('message', (e) => {
  if (!e.data) return;
  // Only accept messages from the content script (web page origin)
  if (e.data.type === 'VERDICT') {
    const verdict = e.data.verdict;
    const card = $('verdict-card');
    if (card) {
      card.className = `verdict-card vc-${verdict.verdict}`;
      const icons = { safe: '✓', caution: '!', warning: '⚠', blocked: '✕' };
      const icon = $('vc-icon');
      if (icon) icon.textContent = icons[verdict.verdict] || '?';
      const labels = { safe: 'Safe', caution: 'Caution', warning: 'Warning', blocked: 'Blocked' };
      const subs = { safe: 'Permissible content', caution: 'Proceed with awareness', warning: 'Islamically problematic', blocked: 'Access blocked' };
      const lbl = $('vc-label');
      if (lbl) lbl.textContent = labels[verdict.verdict] || verdict.verdict;
      const sub = $('vc-sublabel');
      if (sub) sub.textContent = subs[verdict.verdict] || '';
      const desc = $('vc-desc');
      if (desc) desc.textContent = verdict.reason || '';
    }

    const quran = verdict.quran;
    if (quran) {
      const ar = $('ev-arabic');
      if (ar) ar.textContent = quran.arabic || '';
      const q = $('ev-quote');
      if (q) q.textContent = `"${quran.english}"`;
      const r = $('ev-ref');
      if (r) r.textContent = quran.ref || '';

      // ── Whisper Guidance: brief explanation of WHY this grade was given ──
      const briefEl = $('ev-brief-explanation');
      if (briefEl && quran.briefExplanation) {
        briefEl.textContent = quran.briefExplanation;
        briefEl.style.display = '';
      } else if (briefEl) {
        briefEl.style.display = 'none';
      }
    }

    const alts = $('alts-list');
    if (alts && verdict.alternatives?.length) {
      alts.innerHTML = verdict.alternatives.map(a => `
        <div class="alt-row" data-url="${escHtml(a.url)}">
          <div class="alt-favicon">🔗</div>
          <div style="flex:1;"><div class="alt-name">${escHtml(a.title)}</div></div>
          <svg class="alt-arr" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>`).join('');
      alts.querySelectorAll('.alt-row').forEach(row => {
        row.addEventListener('click', () => window.open(row.dataset.url, '_blank', 'noopener'));
      });
    } else if (alts) {
      alts.innerHTML = '<div style="font-size:11px;color:var(--text-3);padding:4px 0;">No alternatives to suggest for this page.</div>';
    }
  }
});

async function loadMonitorStats() {
  const res = await msgBg({ type: 'FALAH_GET_MONITOR_STATS' });
  if (!res?.ok || !res.data) return;
  const stats = res.data;

  // Render stats
  const safeEl = document.querySelector('.ms-safe .ms-val');
  const cautionEl = document.querySelector('.ms-caution .ms-val');
  const blockedEl = document.querySelector('.ms-blocked .ms-val');
  
  if (safeEl) safeEl.textContent = (stats.safe || 0).toLocaleString();
  if (cautionEl) cautionEl.textContent = (stats.caution || 0).toLocaleString();
  if (blockedEl) blockedEl.textContent = ((stats.blocked || 0) + (stats.warning || 0)).toLocaleString();

  // Calculate adherence score
  const total = (stats.safe || 0) + (stats.caution || 0) + (stats.warning || 0) + (stats.blocked || 0);
  const scoreEl = $('mc-score');
  if (scoreEl) {
    if (total === 0) {
      scoreEl.textContent = '100%';
    } else {
      const score = Math.round(((stats.safe || 0) / total) * 100);
      scoreEl.textContent = score + '%';
      
      // Change color based on score
      if (score < 70) scoreEl.style.color = 'var(--ruby)';
      else if (score < 90) scoreEl.style.color = 'var(--amber)';
      else scoreEl.style.color = 'var(--jade)';
    }
  }

  // Render history
  const historyList = $('hm-recent-list');
  if (historyList) {
    if (!stats.history || stats.history.length === 0) {
      historyList.innerHTML = '<div class="tx-empty">No flagged activity found. Alhamdullilah!</div>';
    } else {
      historyList.innerHTML = stats.history.slice(0, 10).map(item => {
        const isBlocked = item.verdict === 'blocked' || item.verdict === 'warning';
        const colorVar = isBlocked ? '--ruby' : '--amber';
        const icon = isBlocked ? '✕' : '!';
        const date = new Date(item.ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        
        return `
          <div class="tx-row tx-out" title="${escHtml(item.url)}">
            <div class="tx-icon" style="background:var(${colorVar}-dim);color:var(${colorVar})">${icon}</div>
            <div class="tx-info">
              <div class="tx-type">${escHtml(item.title)}</div>
              <div class="tx-date">${date}</div>
            </div>
            <div class="tx-amount" style="color:var(--text-3);font-size:10px">${isBlocked ? 'Auto-blocked' : 'Caution given'}</div>
          </div>
        `;
      }).join('');
    }
  }
}

function setupNurBuddy() {
  const nbInput = $('nb-input');
  const nbSendBtn = $('nb-send-btn');
  const nbChatArea = $('nb-chat-area');

  if (!nbInput || !nbSendBtn || !nbChatArea) return;

  const TEST_USER_ID = "cmpxlwxe7000012i02oegq55w";
  const API_URL = "http://localhost:3000/api/v1/mobile/chat";

  async function sendMsg() {
    const text = nbInput.value.trim();
    if (!text) return;

    nbChatArea.innerHTML += `
      <div class="nb-msg nb-msg-user">
        <div class="nb-msg-icon">👤</div>
        <div class="nb-msg-bubble">${escHtml(text)}</div>
      </div>
    `;
    nbInput.value = '';
    scrollToBottom();

    // Show loading indicator
    const loadingId = 'nb-loading-' + Date.now();
    nbChatArea.innerHTML += `
      <div class="nb-msg nb-msg-ai" id="${loadingId}">
        <div class="nb-msg-icon">🤖</div>
        <div class="nb-msg-bubble" style="opacity:0.6">Thinking...</div>
      </div>
    `;
    scrollToBottom();

    try {
      const res = await msgBg({ type: 'FALAH_NURBUDDY_CHAT', query: text });
      
      const loadingEl = $(loadingId);
      if (loadingEl) loadingEl.remove();

      if (res?.ok && res.data) {
        nbChatArea.innerHTML += `
          <div class="nb-msg nb-msg-ai">
            <div class="nb-msg-icon">🤖</div>
            <div class="nb-msg-bubble">${escHtml(res.data.response)}</div>
          </div>
        `;
      } else {
        nbChatArea.innerHTML += `
          <div class="nb-msg nb-msg-ai">
            <div class="nb-msg-icon">⚠️</div>
            <div class="nb-msg-bubble" style="color:var(--ruby)">${escHtml(res?.error || 'Failed to get response.')}</div>
          </div>
        `;
      }
    } catch (e) {
      const loadingEl = $(loadingId);
      if (loadingEl) loadingEl.remove();
      
      nbChatArea.innerHTML += `
        <div class="nb-msg nb-msg-ai">
          <div class="nb-msg-icon">⚠️</div>
          <div class="nb-msg-bubble" style="color:var(--ruby)">Panel messaging error.</div>
        </div>
      `;
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    nbChatArea.scrollTop = nbChatArea.scrollHeight;
  }

  nbSendBtn.addEventListener('click', sendMsg);
  nbInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMsg();
  });
}
