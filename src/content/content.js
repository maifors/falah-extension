/**
 * Falah Extension — Content Script
 * Injects: subbar (below address bar simulation), side panel iframe
 * Listens for VERDICT_READY from service worker
 */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__falahInjected) return;
  window.__falahInjected = true;

  // ── State ──────────────────────────────────────────────────────────────────
  let currentVerdict = null;
  let panelOpen = false;
  let settings = null;
  let subbarEl = null;
  let panelEl = null;
  let panelIframe = null;

  const PANEL_WIDTH = '292px';
  const SUBBAR_HEIGHT = '38px';

  // ── Boot ───────────────────────────────────────────────────────────────────
  async function boot() {
    settings = await getSettings();
    if (!settings.subbarEnabled && !settings.panelOpen) return;

    injectStyles();
    if (settings.subbarEnabled) buildSubbar();
    if (settings.panelOpen) buildPanel();

    // Ask background for this page's verdict
    classifyCurrentPage();
  }

  // ── Get Settings ──────────────────────────────────────────────────────────
  function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
        resolve((res && res.ok ? res.data : null) || {
          guidanceLevel: 'caution', panelOpen: true, subbarEnabled: true
        });
      });
    });
  }

  // ── Classify current page ─────────────────────────────────────────────────
  function classifyCurrentPage() {
    const text = document.body?.innerText?.substring(0, 3000) || '';
    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_URL', url: location.href, text },
      (res) => {
        if (res && res.ok) applyVerdict(res.data);
      }
    );
  }

  // ── Listen for verdict from service worker ────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'VERDICT_READY') applyVerdict(msg.verdict);
    if (msg.type === 'TOGGLE_PANEL')  togglePanel();
    if (msg.type === 'SETTINGS_UPDATED') {
      settings = msg.settings;
      updateSubbarVisibility();
    }
  });

  // ── Apply Verdict ─────────────────────────────────────────────────────────
  function applyVerdict(verdict) {
    currentVerdict = verdict;
    updateSubbar(verdict);
    if (panelIframe) {
      panelIframe.contentWindow?.postMessage({ type: 'VERDICT', verdict }, '*');
    }

    const { guidanceLevel } = settings;
    // Strict mode — block haram pages
    if (guidanceLevel === 'strict' && verdict.verdict === 'blocked') {
      showBlockedOverlay(verdict);
      return;
    }
    // Caution mode — auto-open panel for non-safe
    if (guidanceLevel === 'caution' && (verdict.verdict === 'caution' || verdict.verdict === 'warning')) {
      if (!panelOpen) openPanel();
    }
    if (guidanceLevel === 'strict' && verdict.verdict === 'warning') {
      if (!panelOpen) openPanel();
    }
  }

  // ── Subbar ────────────────────────────────────────────────────────────────
  function buildSubbar() {
    subbarEl = document.createElement('div');
    subbarEl.id = 'falah-subbar';
    subbarEl.setAttribute('data-falah', 'true');
    subbarEl.innerHTML = `
      <div class="fsb-left">
        <div class="fsb-lantern">
          <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
            <path d="M20 4L26 10H28V30H12V10H14L20 4Z" fill="rgba(201,152,60,0.25)" stroke="#c9983c" stroke-width="1.5"/>
            <circle cx="20" cy="19" r="4" fill="#c9983c" opacity="0.9"/>
          </svg>
        </div>
        <div class="fsb-verdict" id="fsb-verdict-pill">
          <span class="fsb-dot"></span>
          <span class="fsb-verdict-text">Analysing…</span>
        </div>
        <div class="fsb-evidence" id="fsb-evidence">Falah OS — Shariah compliance engine active</div>
      </div>
      <div class="fsb-right">
        <button class="fsb-pill fsb-pill-gold" id="fsb-toggle-panel" title="Toggle Falah Panel">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Whisper
        </button>
        <div class="fsb-prayer" id="fsb-prayer-pill">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span id="fsb-prayer-text">—</span>
        </div>
      </div>`;

    document.documentElement.prepend(subbarEl);
    document.documentElement.style.setProperty('--falah-subbar-h', SUBBAR_HEIGHT);

    document.getElementById('fsb-toggle-panel')?.addEventListener('click', togglePanel);
    loadPrayerTimes();
  }

  function updateSubbar(verdict) {
    const pill = document.getElementById('fsb-verdict-pill');
    const evEl = document.getElementById('fsb-evidence');
    if (!pill || !evEl) return;

    pill.className = `fsb-verdict fsb-verdict-${verdict.verdict}`;
    pill.querySelector('.fsb-verdict-text').textContent =
      verdict.verdict.charAt(0).toUpperCase() + verdict.verdict.slice(1);

    const quran = verdict.quran;
    if (quran) {
      evEl.innerHTML = `<em>${quran.ref}</em> — ${quran.english.substring(0, 80)}${quran.english.length > 80 ? '…' : ''}`;
    } else {
      evEl.textContent = verdict.reason?.substring(0, 100) || '';
    }
  }

  function updateSubbarVisibility() {
    if (subbarEl) subbarEl.style.display = settings.subbarEnabled ? 'flex' : 'none';
  }

  async function loadPrayerTimes() {
    chrome.runtime.sendMessage({ type: 'GET_PRAYER_TIMES' }, (res) => {
      if (!res || !res.ok || !res.data) return;
      const pt = res.data;
      const next = getNextPrayer(pt);
      const el = document.getElementById('fsb-prayer-text');
      if (el && next) el.textContent = `${next.name} ${next.time}`;
    });
  }

  function getNextPrayer(pt) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    for (const name of prayers) {
      const t = (pt[name] || '00:00').substring(0, 5);
      const [h, m] = t.split(':').map(Number);
      if (h * 60 + m > nowMins) return { name, time: t };
    }
    return { name: 'Fajr', time: pt.Fajr?.substring(0, 5) || '—' };
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  function buildPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'falah-panel-container';
    panelEl.setAttribute('data-falah', 'true');

    panelIframe = document.createElement('iframe');
    panelIframe.id = 'falah-panel-iframe';
    panelIframe.src = chrome.runtime.getURL('src/panel/panel.html');
    panelIframe.setAttribute('allowtransparency', 'true');

    panelEl.appendChild(panelIframe);
    document.documentElement.appendChild(panelEl);

    panelOpen = true;
    document.documentElement.style.setProperty('--falah-panel-w', PANEL_WIDTH);
    document.documentElement.classList.add('falah-panel-open');

    // Receive messages from panel iframe
    window.addEventListener('message', handlePanelMessage);
  }

  function handlePanelMessage(e) {
    if (!e.data || e.data.source !== 'falah-panel') return;
    switch (e.data.type) {
      case 'CLOSE_PANEL':    closePanel(); break;
      case 'SAVE_SETTINGS':  saveSettings(e.data.settings); break;
      case 'OPEN_URL':       window.open(e.data.url, '_blank', 'noopener'); break;
      case 'NAVIGATE':       location.href = e.data.url; break;
    }
  }

  function openPanel() {
    if (panelOpen) return;
    if (!panelEl) { buildPanel(); return; }
    panelEl.classList.add('falah-panel-open');
    document.documentElement.classList.add('falah-panel-open');
    document.documentElement.style.setProperty('--falah-panel-w', PANEL_WIDTH);
    panelOpen = true;
    if (currentVerdict && panelIframe) {
      panelIframe.contentWindow?.postMessage({ type: 'VERDICT', verdict: currentVerdict }, '*');
    }
  }

  function closePanel() {
    if (!panelOpen) return;
    panelEl?.classList.remove('falah-panel-open');
    document.documentElement.classList.remove('falah-panel-open');
    document.documentElement.style.removeProperty('--falah-panel-w');
    panelOpen = false;
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  // ── Blocked Overlay ───────────────────────────────────────────────────────
  function showBlockedOverlay(verdict) {
    const existing = document.getElementById('falah-blocked-overlay');
    if (existing) return;

    const quran = verdict.quran || {
      arabic: 'إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ',
      english: 'Intoxicants and gambling are but defilement from the work of Satan.',
      ref: 'Quran 5:90'
    };

    const overlay = document.createElement('div');
    overlay.id = 'falah-blocked-overlay';
    overlay.setAttribute('data-falah', 'true');
    overlay.innerHTML = `
      <div class="fbo-card">
        <div class="fbo-icon">🚫</div>
        <div class="fbo-title">Page Blocked</div>
        <div class="fbo-sub">Falah has blocked this content based on your Strict guidance setting.</div>
        <div class="fbo-arabic">${quran.arabic}</div>
        <div class="fbo-english">"${quran.english}"</div>
        <div class="fbo-ref">${quran.ref}</div>
        <button class="fbo-btn fbo-btn-primary" id="fbo-back">← Go Back to Safety</button>
        <button class="fbo-btn fbo-btn-ghost" id="fbo-override">I understand the risk</button>
      </div>`;

    document.documentElement.appendChild(overlay);
    document.getElementById('fbo-back')?.addEventListener('click', () => history.back());
    document.getElementById('fbo-override')?.addEventListener('click', () => overlay.remove());
  }

  // ── Save Settings ─────────────────────────────────────────────────────────
  function saveSettings(newSettings) {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings }, (res) => {
      if (res && res.ok) {
        settings = { ...settings, ...newSettings };
        updateSubbarVisibility();
      }
    });
  }

  // ── Inject styles ─────────────────────────────────────────────────────────
  function injectStyles() {
    // Styles are loaded via content.css — just set up CSS variables
    document.documentElement.style.setProperty('--falah-subbar-h', '0px');
    document.documentElement.style.setProperty('--falah-panel-w', '0px');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();


// ══════════════════════════════════════════════════════════════════
// v2.1 — TRAFFIC LIGHT CLASSIFIER (Falah Companion merge)
// Independent shadow host: #falah-companion-host (top-left pill)
// Queries GET_CLASSIFICATION from SW, renders status pill + mini-panel
// Does NOT modify any existing subbar, panel, or verdict logic.
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  let _compShadow, _compHost, _compPanelOpen = false;

  const COMPANION_STYLES = `
    .fc-pill {
      position: fixed; top: 10px; left: 10px;
      display: flex; align-items: center; gap: 5px;
      padding: 5px 9px; border-radius: 999px;
      font: 600 11px/1.2 'DM Sans', system-ui, sans-serif;
      background: rgba(13,13,16,0.92); color: rgba(255,255,255,0.85);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      cursor: pointer; z-index: 2147483640;
      user-select: none; transition: all 0.18s;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }
    .fc-pill:hover { transform: scale(1.06); box-shadow: 0 4px 16px rgba(0,0,0,0.45); }
    .fc-pill.halal  { border-color: rgba(34,197,94,0.45);  }
    .fc-pill.makruh { border-color: rgba(234,179,8,0.45);  }
    .fc-pill.haram  { border-color: rgba(239,68,68,0.45);  }
    .fc-pill.unknown{ border-color: rgba(107,114,128,0.35);}
    .fc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .fc-pill.halal  .fc-dot { background: #22c55e; box-shadow: 0 0 5px rgba(34,197,94,0.6); }
    .fc-pill.makruh .fc-dot { background: #eab308; box-shadow: 0 0 5px rgba(234,179,8,0.6); }
    .fc-pill.haram  .fc-dot { background: #ef4444; box-shadow: 0 0 5px rgba(239,68,68,0.6); }
    .fc-pill.unknown .fc-dot{ background: #6b7280; }

    .fc-panel {
      position: fixed; top: 44px; left: 10px;
      width: 230px; max-height: 420px; overflow-y: auto;
      background: rgba(13,13,16,0.97); color: rgba(255,255,255,0.88);
      border-radius: 10px; padding: 13px;
      font: 12px/1.5 'DM Sans', system-ui, sans-serif;
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      z-index: 2147483640;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
    }

    .fc-tabs { display: flex; gap: 4px; margin-bottom: 11px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; }
    .fc-tab { flex: 1; padding: 5px; background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font: 11px 'DM Sans',system-ui,sans-serif; border-radius: 5px; transition: all 0.15s; }
    .fc-tab:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); }
    .fc-tab.active { background: rgba(255,255,255,0.1); color: #fff; font-weight: 600; }
    .fc-tab-content.hidden { display: none; }

    .fc-status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 6px;
      font-size: 11px; font-weight: 600; margin-bottom: 5px;
    }
    .fc-status-badge.halal  { background: rgba(34,197,94,0.15);  color: #22c55e; border: 1px solid rgba(34,197,94,0.25);  }
    .fc-status-badge.makruh { background: rgba(234,179,8,0.15);  color: #eab308; border: 1px solid rgba(234,179,8,0.25);  }
    .fc-status-badge.haram  { background: rgba(239,68,68,0.15);  color: #ef4444; border: 1px solid rgba(239,68,68,0.25);  }
    .fc-status-badge.unknown{ background: rgba(107,114,128,0.12);color: #9ca3af; border: 1px solid rgba(107,114,128,0.2); }

    .fc-reason { font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 10px; }

    .fc-classify-title { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 6px; font-family: 'JetBrains Mono', monospace; }
    .fc-btns { display: flex; gap: 5px; margin-bottom: 7px; }
    .fc-btn { flex: 1; padding: 5px 4px; border: none; border-radius: 5px; cursor: pointer; font: 600 11px 'DM Sans',system-ui,sans-serif; color: #fff; transition: all 0.15s; }
    .fc-btn:hover { filter: brightness(1.15); }
    .fc-btn.halal  { background: #22c55e; }
    .fc-btn.makruh { background: #eab308; }
    .fc-btn.haram  { background: #ef4444; }
    .fc-remove { width: 100%; padding: 5px; background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 5px; color: rgba(255,255,255,0.45); cursor: pointer; font: 11px 'DM Sans',system-ui,sans-serif; transition: all 0.15s; margin-top: 2px; }
    .fc-remove:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.7); }

    .fc-nearby-title { font: 600 12px 'DM Sans',system-ui,sans-serif; margin-bottom: 6px; }
    .fc-nearby-section { margin-bottom: 10px; }
    .fc-place-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; }
    .fc-place-name { font-weight: 500; color: rgba(255,255,255,0.85); }
    .fc-place-dist { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 1px; }
    .fc-place-map { color: #60a5fa; text-decoration: none; font-size: 10px; flex-shrink: 0; margin-left: 6px; }
    .fc-place-map:hover { color: #93c5fd; }
    .fc-loading { text-align: center; color: rgba(255,255,255,0.4); padding: 14px 0; font-size: 11px; }
    .fc-empty { text-align: center; color: rgba(255,255,255,0.3); padding: 10px 0; font-size: 11px; font-style: italic; }
  `;

  function fcInit() {
    // Skip chrome internal pages
    if (!location.hostname || location.hostname === '') return;
    // Skip if already injected
    if (document.querySelector('#falah-companion-host')) return;
    // Wait for body
    if (!document.body) { document.addEventListener('DOMContentLoaded', fcInit, { once: true }); return; }

    chrome.runtime.sendMessage({ type: 'GET_CLASSIFICATION', hostname: location.hostname }, (res) => {
      if (chrome.runtime.lastError) return; // extension context may be invalid
      const data = (res?.ok && res.data) ? res.data : { status: 'unknown', reason: 'Not in Falah database' };
      fcBuildPill(data);
    });
  }

  function fcBuildPill(data) {
    _compHost = document.createElement('div');
    _compHost.id = 'falah-companion-host';
    _compShadow = _compHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = COMPANION_STYLES;
    _compShadow.appendChild(style);

    const pill = document.createElement('div');
    pill.className = `fc-pill ${data.status}`;
    pill.innerHTML = `<span class="fc-dot"></span>${fcLabel(data.status)}`;
    pill.addEventListener('click', (e) => { e.stopPropagation(); fcTogglePanel(data); });
    _compShadow.appendChild(pill);

    document.body.appendChild(_compHost);
  }

  function fcLabel(status) {
    return { halal: 'Halal', makruh: 'Makruh', haram: 'Haram', unknown: 'Unknown' }[status] || 'Unknown';
  }

  function fcTogglePanel(data) {
    if (_compPanelOpen) {
      _compShadow.querySelector('.fc-panel')?.remove();
      _compPanelOpen = false;
      return;
    }
    fcOpenPanel(data);
  }

  function fcOpenPanel(data) {
    const panel = document.createElement('div');
    panel.className = 'fc-panel';
    panel.innerHTML = `
      <div class="fc-tabs">
        <button class="fc-tab active" data-tab="classify">Classify</button>
        <button class="fc-tab" data-tab="nearby">Nearby</button>
      </div>
      <div class="fc-tab-content" id="fc-classify-tab">
        <div class="fc-status-badge ${data.status}">
          <span class="fc-dot"></span>${fcLabel(data.status)}
        </div>
        <div class="fc-reason">${fcEsc(data.reason || '')}</div>
        <div class="fc-classify-title">Override classification</div>
        <div class="fc-btns">
          <button class="fc-btn halal">Halal</button>
          <button class="fc-btn makruh">Makruh</button>
          <button class="fc-btn haram">Haram</button>
        </div>
        <button class="fc-remove">Remove my override</button>
      </div>
      <div class="fc-tab-content hidden" id="fc-nearby-tab">
        <div class="fc-loading">Tap to load location…</div>
      </div>
    `;

    // Tab switching
    panel.querySelectorAll('.fc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.fc-tab').forEach(t => t.classList.remove('active'));
        panel.querySelectorAll('.fc-tab-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        panel.querySelector('#fc-' + tab.dataset.tab + '-tab').classList.remove('hidden');
        if (tab.dataset.tab === 'nearby') fcLoadNearby(panel);
      });
    });

    // Classification buttons
    panel.querySelectorAll('.fc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const status = btn.className.replace('fc-btn ', '').trim();
        chrome.runtime.sendMessage({ type: 'SET_CLASSIFICATION', hostname: location.hostname, status });
        fcUpdatePill(status);
        panel.remove();
        _compPanelOpen = false;
      });
    });

    // Remove override
    panel.querySelector('.fc-remove').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_CLASSIFICATION', hostname: location.hostname });
      fcUpdatePill('unknown');
      panel.remove();
      _compPanelOpen = false;
    });

    _compShadow.appendChild(panel);
    _compPanelOpen = true;

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (_compHost && !_compHost.contains(e.target)) {
        panel.remove();
        _compPanelOpen = false;
      }
    }, { once: true });
  }

  function fcUpdatePill(status) {
    const pill = _compShadow?.querySelector('.fc-pill');
    if (!pill) return;
    pill.className = `fc-pill ${status}`;
    pill.innerHTML = `<span class="fc-dot"></span>${fcLabel(status)}`;
  }

  async function fcLoadNearby(panel) {
    const tab = panel.querySelector('#fc-nearby-tab');
    if (!tab) return;
    if (tab.dataset.loaded) return; // don't refetch
    tab.innerHTML = '<div class="fc-loading">Getting your location…</div>';

    if (!navigator.geolocation) {
      tab.innerHTML = '<div class="fc-empty">Geolocation not available</div>';
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      tab.innerHTML = '<div class="fc-loading">Searching nearby…</div>';
      try {
        const [mosques, food] = await Promise.all([
          fcFetchMosques(lat, lon),
          fcFetchHalalFood(lat, lon)
        ]);
        tab.innerHTML = `
          <div class="fc-nearby-section">
            <div class="fc-nearby-title">🕌 Mosques (${mosques.length})</div>
            ${mosques.length
              ? mosques.map(p => fcPlaceRow(p)).join('')
              : '<div class="fc-empty">None found within 3km</div>'}
          </div>
          <div class="fc-nearby-section">
            <div class="fc-nearby-title">🍽️ Halal Food (${food.length})</div>
            ${food.length
              ? food.map(p => fcPlaceRow(p)).join('')
              : '<div class="fc-empty">None found within 3km</div>'}
          </div>`;
        tab.dataset.loaded = '1';
      } catch (err) {
        tab.innerHTML = '<div class="fc-empty">Could not load nearby places. Try again.</div>';
      }
    }, () => {
      tab.innerHTML = '<div class="fc-empty">Location access denied</div>';
    }, { timeout: 8000 });
  }

  async function fcFetchMosques(lat, lon) {
    const q = `[out:json][timeout:20];(node["amenity"="mosque"](around:3000,${lat},${lon});way["amenity"="mosque"](around:3000,${lat},${lon}););out center 8;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: q, signal: AbortSignal.timeout(12000)
    });
    const d = await res.json();
    return d.elements.map(e => ({
      name: e.tags?.name || 'Masjid',
      dist: fcHaversine(lat, lon, e.lat ?? e.center?.lat, e.lon ?? e.center?.lon),
      lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon
    })).filter(p => p.dist != null).sort((a, b) => a.dist - b.dist).slice(0, 6);
  }

  async function fcFetchHalalFood(lat, lon) {
    const q = `[out:json][timeout:20];(node["cuisine"="halal"](around:3000,${lat},${lon});node["diet:halal"="yes"](around:3000,${lat},${lon});way["cuisine"="halal"](around:3000,${lat},${lon});way["diet:halal"="yes"](around:3000,${lat},${lon}););out center 8;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: q, signal: AbortSignal.timeout(12000)
    });
    const d = await res.json();
    return d.elements.map(e => ({
      name: e.tags?.name || 'Halal Restaurant',
      dist: fcHaversine(lat, lon, e.lat ?? e.center?.lat, e.lon ?? e.center?.lon),
      lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon
    })).filter(p => p.dist != null).sort((a, b) => a.dist - b.dist).slice(0, 6);
  }

  function fcPlaceRow(p) {
    const mapsUrl = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
    return `<div class="fc-place-row">
      <div>
        <div class="fc-place-name">${fcEsc(p.name)}</div>
        <div class="fc-place-dist">${p.dist.toFixed(2)} km away</div>
      </div>
      <a class="fc-place-map" href="${mapsUrl}" target="_blank" rel="noopener">Map ↗</a>
    </div>`;
  }

  function fcHaversine(lat1, lon1, lat2, lon2) {
    if (lat2 == null || lon2 == null) return null;
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function fcEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Boot — run after existing content script has finished
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fcInit, { once: true });
  } else {
    // Small delay so the main Falah subbar renders first
    setTimeout(fcInit, 300);
  }

})();
