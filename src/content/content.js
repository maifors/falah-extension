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
