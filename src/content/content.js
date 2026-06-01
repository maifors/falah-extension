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
    if (msg.type === 'TOGGLE_WIDGETS') toggleWidgetConfig();
  });

  function toggleWidgetConfig() {
    if (configPanel) {
      configPanel.classList.toggle('fw-config-open');
      updateConfigPanel();
    } else {
      initWidgetSystem();
    }
  }

  // ── Apply Verdict ─────────────────────────────────────────────────────────
  function applyVerdict(verdict) {
    currentVerdict = verdict;
    updateSubbar(verdict);
    if (panelIframe) {
      panelIframe.contentWindow?.postMessage({ type: 'VERDICT', verdict }, chrome.runtime.getURL('').replace(/\/$/, ''));
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
      evEl.textContent = '';
      // Prefer the brief explanation; fall back to the verse reference + snippet
      if (quran.briefExplanation) {
        const brief = quran.briefExplanation;
        const em = document.createElement('em');
        em.textContent = quran.ref + ': ';
        evEl.appendChild(em);
        evEl.appendChild(document.createTextNode(brief.substring(0, 120) + (brief.length > 120 ? '…' : '')));
      } else {
        const em = document.createElement('em');
        em.textContent = quran.ref;
        evEl.appendChild(em);
        evEl.appendChild(document.createTextNode(' — ' + quran.english.substring(0, 80) + (quran.english.length > 80 ? '…' : '')));
      }
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
    panelIframe.src = chrome.runtime.getURL('src/panel/panel.html') + '?origin=' + encodeURIComponent(location.origin);
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
    if (!e.data || e.source !== panelIframe?.contentWindow) return;
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
      panelIframe.contentWindow?.postMessage({ type: 'VERDICT', verdict: currentVerdict }, chrome.runtime.getURL('').replace(/\/$/, ''));
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

  // ── Widget System ─────────────────────────────────────────────────────────
  // Floating, draggable widgets with persistent position/state.
  const WIDGET_DEFS = [
    { id: 'prayer-times',  title: 'Prayer Times',    icon: '\u{1F54C}', defaultState: 'minimized' },
    { id: 'halal-checker', title: 'Halal Checker',   icon: '\u2705',    defaultState: 'hidden'    },
    { id: 'wallet-mini',   title: 'Wallet Balance',  icon: '\u{1F4B0}', defaultState: 'minimized' },
    { id: 'zakat-quick',   title: 'Zakat Calculator',icon: '\u{1F932}', defaultState: 'hidden'    },
    { id: 'verse',         title: 'Verse of the Day', icon: '\u{1F4D6}', defaultState: 'minimized' },
  ];

  const DAILY_VERSES = [
    { arabic: '\u0648\u064E\u0645\u064E\u0627 \u062A\u064E\u0648\u0652\u0641\u0650\u064A\u0642\u0650\u064A \u0625\u0650\u0644\u0651\u064E\u0627 \u0628\u0650\u0627\u0644\u0644\u0651\u064E\u0647\u0650', english: 'My success is only through Allah.', ref: 'Quran 11:88' },
    { arabic: '\u0625\u0650\u0646\u0651\u064E \u0645\u064E\u0639\u064E \u0627\u0644\u0652\u0639\u064F\u0633\u0652\u0631\u0650 \u064A\u064F\u0633\u0652\u0631\u064B\u0627', english: 'Indeed, with hardship will be ease.', ref: 'Quran 94:6' },
    { arabic: '\u0648\u064E\u0644\u064E\u0630\u0650\u0643\u0652\u0631\u064F \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0623\u064E\u0643\u0652\u0628\u064E\u0631\u064F', english: 'The remembrance of Allah is greater.', ref: 'Quran 29:45' },
    { arabic: '\u0625\u0650\u0646\u0651\u064E \u0627\u0644\u0644\u0651\u064E\u0647\u064E \u0645\u064E\u0639\u064E \u0627\u0644\u0635\u0651\u064E\u0627\u0628\u0650\u0631\u0650\u064A\u0646\u064E', english: 'Indeed, Allah is with the patient.', ref: 'Quran 2:153' },
    { arabic: '\u0648\u064E\u0642\u064F\u0644\u0652 \u0631\u0651\u064E\u0628\u0650\u0651 \u0632\u0650\u062F\u0652\u0646\u0650\u064A \u0639\u0650\u0644\u0652\u0645\u064B\u0627', english: 'And say: My Lord, increase me in knowledge.', ref: 'Quran 20:114' },
  ];

  let widgetState = null;
  let widgetEls = {};
  let widgetTimers = {};
  let widgetToggle = null;
  let configPanel = null;

  async function initWidgetSystem() {
    widgetState = await loadWidgetState();
    const isVisible = Object.values(widgetState).some(s => s.state !== 'hidden');
    if (!isVisible) { buildWidgetToggle(); return; }
    for (const def of WIDGET_DEFS) {
      if (widgetState[def.id].state !== 'hidden') buildWidgetEl(def);
    }
    buildWidgetToggle();
    startWidgetRefresh();
  }

  function loadWidgetState() {
    return new Promise(resolve => {
      chrome.storage.local.get('widgetStates', res => {
        const saved = res.widgetStates || {};
        const state = {};
        const stackX = window.innerWidth - 290;
        let stackY = 80;
        for (const def of WIDGET_DEFS) {
          const prev = saved[def.id];
          if (prev && typeof prev.x === 'number' && typeof prev.y === 'number') {
            state[def.id] = { state: prev.state || def.defaultState, x: prev.x, y: prev.y };
          } else {
            state[def.id] = { state: def.defaultState, x: stackX, y: stackY };
            stackY += 60;
          }
        }
        resolve(state);
      });
    });
  }

  function saveWidgetState() {
    chrome.storage.local.set({ widgetStates: widgetState });
  }

  function buildWidgetEl(def) {
    const s = widgetState[def.id];
    if (!s) return;
    const el = document.createElement('div');
    el.id = 'falah-widget-' + def.id;
    el.className = 'falah-widget' + (s.state === 'minimized' ? ' fw-minimized' : '') + (s.state === 'hidden' ? ' fw-hidden' : '');
    el.style.top = s.y + 'px';
    el.style.left = s.x + 'px';
    el.dataset.widgetId = def.id;

    el.innerHTML =
      '<div class="fw-header">' +
        '<span class="fw-icon">' + def.icon + '</span>' +
        '<span class="fw-title">' + def.title + '</span>' +
        '<div class="fw-actions">' +
          '<button class="fw-btn fw-sticky-btn' + (s.state === 'sticky' ? ' fw-sticky-active' : '') + '" title="Toggle sticky mode">\uD83D\uDCCC</button>' +
          '<button class="fw-btn fw-min-btn" title="Minimize">\u2212</button>' +
          '<button class="fw-btn fw-hide-btn" title="Hide">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="fw-body"></div>';

    const body = el.querySelector('.fw-body');
    renderWidgetContent(def, body);

    setupWidgetDrag(el, def);
    el.querySelector('.fw-sticky-btn').addEventListener('click', e => { e.stopPropagation(); toggleWidgetSticky(def.id); });
    el.querySelector('.fw-min-btn').addEventListener('click', e => { e.stopPropagation(); minimizeWidget(def.id); });
    el.querySelector('.fw-hide-btn').addEventListener('click', e => { e.stopPropagation(); hideWidget(def.id); });

    document.body.appendChild(el);
    widgetEls[def.id] = el;
  }

  function renderWidgetContent(def, body) {
    switch (def.id) {
      case 'prayer-times': renderPrayerWidget(body); break;
      case 'halal-checker': renderHalalWidget(body); break;
      case 'wallet-mini': renderWalletWidget(body); break;
      case 'zakat-quick': renderZakatWidget(body); break;
      case 'verse': renderVerseWidget(body); break;
    }
  }

  function renderPrayerWidget(body) {
    body.innerHTML =
      '<div class="fw-prayer-next">' +
        '<div class="fw-prayer-lbl">Next Prayer</div>' +
        '<div class="fw-prayer-name" id="fw-pn-name">\u2014</div>' +
        '<div class="fw-prayer-time" id="fw-pn-time">\u2014</div>' +
        '<div class="fw-prayer-countdown" id="fw-pn-countdown"></div>' +
      '</div>' +
      '<div class="fw-prayer-list" id="fw-prayer-list"></div>';

    updatePrayerWidget();
    startWidgetTimer('prayer-times', updatePrayerWidget, 10000);
  }

  function updatePrayerWidget() {
    chrome.runtime.sendMessage({ type: 'GET_PRAYER_TIMES' }, res => {
      if (!res || !res.ok || !res.data) return;
      const pt = res.data;
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
      let next = null;
      let nextIdx = -1;
      for (let i = 0; i < prayers.length; i++) {
        const t = (pt[prayers[i]] || '00:00').substring(0, 5);
        const [h, m] = t.split(':').map(Number);
        if (h * 60 + m > nowMins) { next = { name: prayers[i], time: t }; nextIdx = i; break; }
      }
      if (!next) {
        const t = (pt.Fajr || '05:30').substring(0, 5);
        next = { name: 'Fajr (tomorrow)', time: t };
      }

      const nameEl = document.getElementById('fw-pn-name');
      const timeEl = document.getElementById('fw-pn-time');
      const cdEl = document.getElementById('fw-pn-countdown');
      if (nameEl) nameEl.textContent = next.name;
      if (timeEl) timeEl.textContent = next.time;

      if (cdEl && next.name !== 'Fajr (tomorrow)') {
        const [h, m] = next.time.split(':').map(Number);
        const diff = (h * 60 + m - nowMins);
        if (diff > 0) {
          const hrs = Math.floor(diff / 60);
          const mins = diff % 60;
          cdEl.textContent = hrs > 0 ? hrs + 'h ' + mins + 'm remaining' : mins + 'm remaining';
        } else {
          cdEl.textContent = 'Now';
        }
      } else if (cdEl) {
        cdEl.textContent = '';
      }

      const listEl = document.getElementById('fw-prayer-list');
      if (!listEl) return;
      listEl.innerHTML = prayers.map((p, i) => {
        const isActive = i === nextIdx;
        return '<div class="fw-prayer-row' + (isActive ? ' fw-prayer-active' : '') + '">' +
          '<span class="fw-prayer-label">' + p + '</span>' +
          '<span class="fw-prayer-val">' + (pt[p] || '\u2014').substring(0, 5) + '</span>' +
        '</div>';
      }).join('');
    });
  }

  function renderHalalWidget(body) {
    body.innerHTML =
      '<div class="fw-halal-input">' +
        '<input class="fw-halal-field" id="fw-halal-url" type="text" placeholder="Enter URL to check\u2026">' +
        '<button class="fw-halal-check-btn" id="fw-halal-btn">Check</button>' +
      '</div>' +
      '<div id="fw-halal-result"></div>';

    document.getElementById('fw-halal-btn').addEventListener('click', () => checkHalalUrl());
    document.getElementById('fw-halal-url').addEventListener('keydown', e => {
      if (e.key === 'Enter') checkHalalUrl();
    });
  }

  function checkHalalUrl() {
    const input = document.getElementById('fw-halal-url');
    const result = document.getElementById('fw-halal-result');
    if (!input || !result) return;
    const url = input.value.trim();
    if (!url) return;
    const btn = document.getElementById('fw-halal-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking\u2026'; }

    const text = '';
    chrome.runtime.sendMessage({ type: 'CLASSIFY_URL', url, text }, res => {
      if (btn) { btn.disabled = false; btn.textContent = 'Check'; }
      if (res && res.ok && res.data) {
        const v = res.data.verdict;
        const cls = 'fw-halal-' + v;
        const labels = {
          safe: '\u2705 This page appears Islamically safe',
          caution: '\u26A0\uFE0F Proceed with caution',
          warning: '\u26D4 Warning: Islamically problematic content',
          blocked: '\uD83D\uDEAB Blocked: Haram content detected'
        };
        result.className = 'fw-halal-result ' + cls;
        let html = '<div>' + (labels[v] || 'Unknown') + '</div>';
        if (res.data.reason) {
          html += '<div class="fw-halal-reason">' + res.data.reason.substring(0, 80) + '</div>';
        }
        // Whisper brief explanation
        const brief = res.data.quran && res.data.quran.briefExplanation;
        if (brief) {
          html += '<div class="fw-halal-brief">' + brief.substring(0, 160) + (brief.length > 160 ? '\u2026' : '') + '</div>';
        }
        // Quran / Hadith citation
        if (res.data.quran) {
          const q = res.data.quran;
          html += '<div class="fw-halal-quran"><em>' + q.ref + '</em> \u2014 ' + q.english.substring(0, 80) + (q.english.length > 80 ? '\u2026' : '') + '</div>';
        }
        result.innerHTML = html;
      } else {
        result.className = 'fw-halal-result fw-halal-caution';
        result.innerHTML = '<div>\u26A0\uFE0F Could not analyze URL</div><div class="fw-halal-reason">API unavailable, try again later</div>';
      }
    });
  }

  function renderWalletWidget(body) {
    body.innerHTML =
      '<div class="fw-wallet-body">' +
        '<div class="fw-wallet-amount" id="fw-wallet-bal">\u2014</div>' +
        '<div class="fw-wallet-currency">FLH</div>' +
        '<div class="fw-wallet-addr" id="fw-wallet-addr"></div>' +
        '<div class="fw-wallet-status" id="fw-wallet-status">Checking wallet\u2026</div>' +
      '</div>';
    updateWalletWidget();
    startWidgetTimer('wallet-mini', updateWalletWidget, 30000);
  }

  function updateWalletWidget() {
    chrome.runtime.sendMessage({ type: 'FALAH_GET_WALLET' }, res => {
      const balEl = document.getElementById('fw-wallet-bal');
      const addrEl = document.getElementById('fw-wallet-addr');
      const statusEl = document.getElementById('fw-wallet-status');
      if (res && res.ok && res.data && typeof res.data.balance === 'number') {
        if (balEl) balEl.textContent = res.data.balance.toFixed(2);
        if (addrEl && res.data.address) {
          const a = res.data.address;
          addrEl.textContent = a.length > 24 ? a.substring(0, 10) + '\u2026' + a.substring(a.length - 6) : a;
        }
        if (statusEl) statusEl.textContent = 'Connected';
      } else {
        if (balEl) balEl.textContent = '\u2014';
        if (statusEl) statusEl.textContent = 'Sign in to view wallet';
      }
    });
  }

  function renderZakatWidget(body) {
    body.innerHTML =
      '<div class="fw-zakat-form">' +
        '<div class="fw-zakat-label">Total Wealth (MYR)</div>' +
        '<div class="fw-zakat-row">' +
          '<input class="fw-zakat-field" id="fw-zakat-input" type="number" placeholder="e.g. 50000">' +
          '<button class="fw-zakat-calc-btn" id="fw-zakat-btn">Calculate</button>' +
        '</div>' +
        '<div id="fw-zakat-result"></div>' +
      '</div>';

    document.getElementById('fw-zakat-btn').addEventListener('click', () => calcWidgetZakat());
    document.getElementById('fw-zakat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') calcWidgetZakat();
    });
  }

  function calcWidgetZakat() {
    const input = document.getElementById('fw-zakat-input');
    const wealth = parseFloat(input ? input.value : '0');
    if (!wealth || wealth <= 0) return;
    const btn = document.getElementById('fw-zakat-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Calculating\u2026'; }

    chrome.runtime.sendMessage({ type: 'FALAH_CALCULATE_ZAKAT', wealth }, res => {
      if (btn) { btn.disabled = false; btn.textContent = 'Calculate'; }
      const resultEl = document.getElementById('fw-zakat-result');
      if (!resultEl) return;
      if (res && res.ok && res.data) {
        if (res.data.eligible === false) {
          resultEl.innerHTML =
            '<div class="fw-zakat-result">' +
              '<div class="fw-zakat-detail">' + (res.data.message || 'Wealth below nisab. No zakat due.') + '</div>' +
            '</div>';
        } else {
          resultEl.innerHTML =
            '<div class="fw-zakat-result">' +
              '<div class="fw-zakat-amount">RM ' + res.data.amount.toFixed(2) + '</div>' +
              '<div class="fw-zakat-detail">Due at ' + (res.data.rate || 2.5) + '% rate</div>' +
            '</div>';
        }
      } else {
        resultEl.innerHTML =
          '<div class="fw-zakat-result">' +
            '<div class="fw-zakat-detail">Calculation failed. Try again.</div>' +
          '</div>';
      }
    });
  }

  function renderVerseWidget(body) {
    const idx = new Date().getDate() % DAILY_VERSES.length;
    const v = DAILY_VERSES[idx];
    body.innerHTML =
      '<div class="fw-verse-body">' +
        '<div class="fw-verse-arabic">' + v.arabic + '</div>' +
        '<div class="fw-verse-english">"' + v.english + '"</div>' +
        '<div class="fw-verse-ref">' + v.ref + '</div>' +
      '</div>';

    startVerseTimer();
  }

  function setupWidgetDrag(el, def) {
    const header = el.querySelector('.fw-header');
    let dragging = false, startX, startY, origX, origY;

    header.addEventListener('mousedown', e => {
      if (e.target.closest('.fw-actions')) return;
      dragging = true;
      el.classList.add('fw-dragging');
      startX = e.clientX;
      startY = e.clientY;
      origX = widgetState[def.id].x;
      origY = widgetState[def.id].y;
      e.preventDefault();
    });

    let rafId = null;
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = Math.max(0, origX + dx) + 'px';
        el.style.top = Math.max(0, origY + dy) + 'px';
      });
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      dragging = false;
      el.classList.remove('fw-dragging');
      const rect = el.getBoundingClientRect();
      widgetState[def.id].x = Math.round(rect.left);
      widgetState[def.id].y = Math.round(rect.top);
      saveWidgetState();
    });
  }

  function toggleWidgetSticky(id) {
    const s = widgetState[id];
    const el = widgetEls[id];
    if (!s || !el) return;
    if (s.state === 'sticky') {
      s.state = 'minimized';
      el.classList.add('fw-minimized');
      const btn = el.querySelector('.fw-sticky-btn');
      if (btn) btn.classList.remove('fw-sticky-active');
    } else {
      s.state = 'sticky';
      el.classList.remove('fw-minimized', 'fw-hidden');
      const btn = el.querySelector('.fw-sticky-btn');
      if (btn) btn.classList.add('fw-sticky-active');
    }
    saveWidgetState();
    updateConfigPanel();
  }

  function minimizeWidget(id) {
    const s = widgetState[id];
    const el = widgetEls[id];
    if (!s || !el) return;
    s.state = 'minimized';
    el.classList.add('fw-minimized');
    el.classList.remove('fw-hidden');
    const btn = el.querySelector('.fw-sticky-btn');
    if (btn) btn.classList.remove('fw-sticky-active');
    saveWidgetState();
    updateConfigPanel();
  }

  function clearWidgetTimer(id) {
    if (widgetTimers[id]) {
      clearInterval(widgetTimers[id]);
      delete widgetTimers[id];
    }
  }

  function startWidgetTimer(id, fn, ms) {
    clearWidgetTimer(id);
    widgetTimers[id] = setInterval(fn, ms);
  }

  function hideWidget(id) {
    const s = widgetState[id];
    const el = widgetEls[id];
    if (!s || !el) return;
    s.state = 'hidden';
    el.classList.add('fw-hidden');
    clearWidgetTimer(id);
    saveWidgetState();
    updateConfigPanel();
  }

  function showWidget(id) {
    const s = widgetState[id];
    const el = widgetEls[id];
    if (!s) return;
    if (!el) {
      const def = WIDGET_DEFS.find(d => d.id === id);
      if (def) buildWidgetEl(def);
      return;
    }
    s.state = 'minimized';
    el.classList.remove('fw-hidden');
    el.classList.add('fw-minimized');
    restartWidgetTimer(id);
    saveWidgetState();
    updateConfigPanel();
  }

  function restartWidgetTimer(id) {
    switch (id) {
      case 'prayer-times': startWidgetTimer('prayer-times', updatePrayerWidget, 10000); break;
      case 'wallet-mini': startWidgetTimer('wallet-mini', updateWalletWidget, 30000); break;
      case 'verse': startVerseTimer(); break;
    }
  }

  function startVerseTimer() {
    clearWidgetTimer('verse');
    widgetTimers['verse'] = setInterval(() => {
      const el = widgetEls['verse'];
      if (!el || el.classList.contains('fw-hidden')) return;
      const idx2 = new Date().getDate() % DAILY_VERSES.length;
      const v2 = DAILY_VERSES[idx2];
      const body = el.querySelector('.fw-body');
      if (!body) return;
      const arabic = body.querySelector('.fw-verse-arabic');
      const english = body.querySelector('.fw-verse-english');
      const ref = body.querySelector('.fw-verse-ref');
      if (arabic) arabic.textContent = v2.arabic;
      if (english) english.textContent = '"' + v2.english + '"';
      if (ref) ref.textContent = v2.ref;
    }, 3600000);
  }

  function buildWidgetToggle() {
    widgetToggle = document.createElement('button');
    widgetToggle.id = 'falah-widget-toggle';
    widgetToggle.textContent = '\u{1F9D0}';
    widgetToggle.title = 'Toggle Falah Widgets';
    document.body.appendChild(widgetToggle);

    configPanel = document.createElement('div');
    configPanel.className = 'fw-config-panel';
    configPanel.innerHTML =
      '<div class="fw-config-header">' +
        '<span>Falah Widgets</span>' +
        '<button class="fw-config-close" id="fw-config-close">&times;</button>' +
      '</div>' +
      '<div id="fw-config-list"></div>';
    document.body.appendChild(configPanel);

    widgetToggle.addEventListener('click', e => {
      e.stopPropagation();
      configPanel.classList.toggle('fw-config-open');
      updateConfigPanel();
    });

    document.getElementById('fw-config-close').addEventListener('click', () => {
      configPanel.classList.remove('fw-config-open');
    });

    document.addEventListener('click', e => {
      if (configPanel && !configPanel.contains(e.target) && e.target !== widgetToggle) {
        configPanel.classList.remove('fw-config-open');
      }
    });
  }

  function updateConfigPanel() {
    const list = document.getElementById('fw-config-list');
    if (!list) return;
    list.innerHTML = WIDGET_DEFS.map(def => {
      const s = widgetState[def.id];
      if (!s) return '';
      const badgeText = s.state === 'sticky' ? 'Sticky' : s.state === 'minimized' ? 'Minimized' : 'Hidden';
      const badgeCls = s.state === 'sticky' ? 'fw-badge-sticky' : s.state === 'minimized' ? 'fw-badge-minimized' : 'fw-badge-hidden';
      return '<div class="fw-config-item" data-widget="' + def.id + '">' +
        '<span class="fw-config-icon">' + def.icon + '</span>' +
        '<span class="fw-config-label">' + def.title + '</span>' +
        '<span class="fw-config-badge ' + badgeCls + '">' + badgeText + '</span>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.fw-config-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.widget;
        const s = widgetState[id];
        if (!s) return;
        if (s.state === 'hidden') {
          showWidget(id);
        } else if (s.state === 'minimized') {
          toggleWidgetSticky(id);
        } else {
          minimizeWidget(id);
        }
      });
    });
  }

  function startWidgetRefresh() {
    // Prayer times and wallet already have their own intervals
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Boot widgets separately after page is ready
  function bootWidgets() {
    initWidgetSystem();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWidgets);
  } else {
    bootWidgets();
  }
})();
