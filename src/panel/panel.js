'use strict';

const $ = id => document.getElementById(id);

let settings = null;
let prayerTimes = null;
let dhikrCount = 0;
let dhikrIdx = 0;
let currentAyahSurah = null;
let currentAyahAyah = null;
let countdownTimer = null;

const DHIKR_LIST = [
  { phrase: 'سُبْحَانَ اللَّهِ', trans: 'SubhanAllah — Glory be to Allah', target: 33 },
  { phrase: 'الْحَمْدُ لِلَّهِ', trans: 'Alhamdulillah — Praise be to Allah', target: 33 },
  { phrase: 'اللَّهُ أَكْبَرُ', trans: 'Allahu Akbar — Allah is the Greatest', target: 34 },
  { phrase: 'لَا إِلَٰهَ إِلَّا اللَّهُ', trans: 'La ilaha illallah — There is no god but Allah', target: 100 },
  { phrase: 'أَسْتَغْفِرُ اللَّهَ', trans: 'Astaghfirullah — I seek forgiveness from Allah', target: 100 },
];

const GUIDANCE_DESCS = {
  advisory: 'Falah observes and informs. Navigation is never interrupted.',
  caution: 'Panel auto-opens for haram/caution pages. Requires acknowledgement.',
  strict: 'Haram pages are fully blocked. Cannot be dismissed without leaving.'
};

const DEFAULT_SETTINGS = {
  guidanceLevel: 'caution', subbarEnabled: true,
  prayerNotifications: true, adhanSound: false,
  city: 'Kuala Lumpur', country: 'Malaysia',
  haulStart: null
};

// Real curated halal app directory — all links verified
const APP_DIRECTORY = [
  // Spirituality
  { id: 's1', name: 'Quran.com', cat: 'spirituality', icon: '📖', desc: 'Complete Quran with translations, tafsir and audio recitations', url: 'https://quran.com', free: true, rating: 4.9 },
  { id: 's2', name: 'Muslim Pro', cat: 'spirituality', icon: '🕌', desc: 'Prayer times, Quran, Qibla, Islamic calendar', url: 'https://www.muslimpro.com', free: true, rating: 4.8 },
  { id: 's3', name: 'Sunnah.com', cat: 'spirituality', icon: '📿', desc: 'Complete hadith collection — Bukhari, Muslim, Abu Dawud and more', url: 'https://sunnah.com', free: true, rating: 4.7 },
  { id: 's4', name: 'IslamQA', cat: 'spirituality', icon: '🤲', desc: 'Scholarly answers to Islamic jurisprudence questions', url: 'https://islamqa.info', free: true, rating: 4.6 },
  // Finance
  { id: 'f1', name: 'AAOIFI Standards', cat: 'finance', icon: '📜', desc: 'Official Shariah standards for Islamic finance', url: 'https://aaoifi.com', free: true, rating: 4.5 },
  { id: 'f2', name: 'Zoya — Halal Stocks', cat: 'finance', icon: '📈', desc: 'Screen stocks for Shariah compliance with scholar-approved methodology', url: 'https://www.zoya.finance', free: true, rating: 4.7 },
  { id: 'f3', name: 'Wahed Invest', cat: 'finance', icon: '💹', desc: 'Halal investing platform — fully Shariah-compliant portfolios', url: 'https://wahedinvest.com', free: false, rating: 4.6 },
  { id: 'f4', name: 'Bank Islam Malaysia', cat: 'finance', icon: '🏦', desc: 'Malaysia\'s first Islamic bank — full digital banking', url: 'https://www.bankislam.com', free: true, rating: 4.4 },
  // Lifestyle
  { id: 'l1', name: 'Zabihah', cat: 'lifestyle', icon: '🥩', desc: 'Find halal restaurants and food near you worldwide', url: 'https://www.zabihah.com', free: true, rating: 4.5 },
  { id: 'l2', name: 'HalalTrip', cat: 'lifestyle', icon: '✈️', desc: 'Muslim-friendly travel guide — hotels, restaurants, mosques', url: 'https://www.halaltrip.com', free: true, rating: 4.4 },
  { id: 'l3', name: 'Islamic Finder', cat: 'lifestyle', icon: '🗺️', desc: 'Mosque locator, prayer times and Islamic calendar globally', url: 'https://www.islamicfinder.org', free: true, rating: 4.6 },
  { id: 'l4', name: 'Halal.my', cat: 'lifestyle', icon: '✅', desc: 'JAKIM-certified halal product search for Malaysia', url: 'https://www.halal.gov.my', free: true, rating: 4.3 },
  // Education
  { id: 'e1', name: 'SeekersGuidance', cat: 'education', icon: '🎓', desc: 'Free Islamic education from qualified scholars worldwide', url: 'https://seekersguidance.org', free: true, rating: 4.8 },
  { id: 'e2', name: 'Bayyinah TV', cat: 'education', icon: '📚', desc: 'Quranic Arabic and Islamic studies by Nouman Ali Khan', url: 'https://bayyinahtv.com', free: false, rating: 4.9 },
  { id: 'e3', name: 'Yaqeen Institute', cat: 'education', icon: '🔬', desc: 'Research-based content combating doubts about Islam', url: 'https://yaqeeninstitute.org', free: true, rating: 4.7 },
  // Productivity
  { id: 'p1', name: 'Notion', cat: 'productivity', icon: '📋', desc: 'All-in-one workspace for notes, tasks and planning', url: 'https://notion.so', free: true, rating: 4.7 },
  { id: 'p2', name: 'Trello', cat: 'productivity', icon: '📌', desc: 'Visual project management boards for teams and individuals', url: 'https://trello.com', free: true, rating: 4.5 },
];

const ZAKAT_RECIPIENTS = [
  { name: 'Lembaga Zakat Selangor', country: 'Malaysia', url: 'https://www.zakatselangor.com.my', verified: true },
  { name: 'LHDN — e-Zakat', country: 'Malaysia', url: 'https://www.hasil.gov.my', verified: true },
  { name: 'Islamic Relief', country: 'Global', url: 'https://www.islamic-relief.org', verified: true },
  { name: 'NZF — National Zakat Foundation', country: 'United Kingdom', url: 'https://nzf.org.uk', verified: true },
  { name: 'Zakat Foundation of America', country: 'United States', url: 'https://www.zakat.org', verified: true },
];

function msgBg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, res => resolve(res || null));
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── BOOT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupTabs();
  setupClose();
  setupSettings();
  setupQuickActions();
  loadPrayerTimes();
  setupDashboardZakat();
  setupQibla();
  setupZakatTab();
  setupQuranTab();
  setupStore();
  renderZakatRecipients();
  startCountdown();
});

// ── SETTINGS ───────────────────────────────────────────────
async function loadSettings() {
  const res = await msgBg({ type: 'GET_SETTINGS' });
  settings = res?.ok ? res.data : { ...DEFAULT_SETTINGS };
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
  if (cityEl) cityEl.value = settings.city || 'Kuala Lumpur';
  if (ctryEl) ctryEl.value = settings.country || 'Malaysia';
  const cityLabel = $('prayer-city-label');
  if (cityLabel) cityLabel.textContent = settings.city || 'Kuala Lumpur';
  // Haul tracker
  if (settings.haulStart) renderHaulStatus(settings.haulStart);
}

function saveSettings() {
  if (!settings) return;
  msgBg({ type: 'SAVE_SETTINGS', settings });
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
      if (key && settings) { settings[key] = sw.classList.contains('on'); saveSettings(); }
    });
  });
  $('btn-save-location')?.addEventListener('click', () => {
    const city = $('loc-city')?.value.trim();
    const country = $('loc-country')?.value.trim();
    if (!city || !country) return;
    settings.city = city; settings.country = country;
    saveSettings();
    loadPrayerTimes();
    const btn = $('btn-save-location');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Update Prayer Times', 1500); }
    const lbl = $('prayer-city-label');
    if (lbl) lbl.textContent = city;
  });
  $('btn-detect-location')?.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    const btn = $('btn-detect-location');
    btn.textContent = 'Detecting…'; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const d = await r.json();
        const city = d.address?.city || d.address?.town || d.address?.village || '';
        const country = d.address?.country || '';
        if (city) { $('loc-city').value = city; settings.city = city; }
        if (country) { $('loc-country').value = country; settings.country = country; }
        saveSettings(); loadPrayerTimes();
        const lbl = $('prayer-city-label');
        if (lbl) lbl.textContent = city;
      } catch(_) {}
      btn.textContent = '📍 Use My Location'; btn.disabled = false;
    }, () => { btn.textContent = '📍 Use My Location'; btn.disabled = false; });
  });
}

// ── TABS ───────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.p-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.p-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.p-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

function setupClose() {
  $('btn-close')?.addEventListener('click', async () => {
    try { await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }); } catch (_) {}
    window.parent.postMessage({ source: 'falah-panel', type: 'CLOSE_PANEL' }, '*');
  });
}

function setupQuickActions() {
  document.querySelectorAll('.qa-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// ── PRAYER TIMES ──────────────────────────────────────────
function loadPrayerTimes() {
  msgBg({ type: 'GET_PRAYER_TIMES' }).then(res => {
    if (res?.ok && res.data) { prayerTimes = res.data; renderPrayerTimes(); }
  });
}

function renderPrayerTimes() {
  if (!prayerTimes) return;
  ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'].forEach(p => {
    const el = $(`pt-${p}`);
    if (el && prayerTimes[p]) el.textContent = prayerTimes[p].substring(0, 5);
  });
  const hijriEl = $('hijri-date');
  if (hijriEl && prayerTimes.hijri) {
    const h = prayerTimes.hijri;
    hijriEl.textContent = `${h.day} ${h.month?.en || ''} ${h.year} AH`;
  }
  highlightCurrentPrayer();
  updateNextPrayerBanner();
}

function highlightCurrentPrayer() {
  if (!prayerTimes) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  document.querySelectorAll('.prayer-row').forEach(r => r.classList.remove('pr-current'));
  for (let i = 0; i < prayers.length; i++) {
    const t = (prayerTimes[prayers[i]] || '00:00').substring(0, 5);
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) {
      document.querySelector(`.prayer-row[data-prayer="${prayers[i]}"]`)?.classList.add('pr-current');
      return;
    }
  }
}

function updateNextPrayerBanner() {
  if (!prayerTimes) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  for (const p of prayers) {
    const t = (prayerTimes[p] || '00:00').substring(0, 5);
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) {
      const npName = $('np-name'); if (npName) npName.textContent = p;
      const npTime = $('np-time'); if (npTime) npTime.textContent = t;
      return;
    }
  }
  const npName = $('np-name'); if (npName) npName.textContent = 'Fajr (tomorrow)';
  const npTime = $('np-time'); if (npTime) npTime.textContent = (prayerTimes.Fajr||'—').substring(0,5);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (!prayerTimes) return;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    for (const p of prayers) {
      const t = (prayerTimes[p] || '00:00').substring(0, 5);
      const [h, m] = t.split(':').map(Number);
      const diffMins = h * 60 + m - nowMins;
      if (diffMins > 0) {
        const el = $('np-countdown');
        if (el) el.textContent = `in ${Math.floor(diffMins/60)}h ${diffMins%60}m`;
        return;
      }
    }
  }, 30000);
}

// ── QIBLA ─────────────────────────────────────────────────
function setupQibla() {
  $('qibla-locate')?.addEventListener('click', () => {
    const btn = $('qibla-locate');
    btn.textContent = 'Locating…'; btn.disabled = true;
    if (!navigator.geolocation) { btn.textContent = 'Not available'; return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const qiblaDir = calcQibla(lat, lon);
      const degEl = $('qibla-deg');
      if (degEl) degEl.textContent = `${Math.round(qiblaDir)}°`;
      const arrow = $('qibla-arrow');
      if (arrow) arrow.style.transform = `rotate(${qiblaDir}deg)`;
      btn.textContent = 'Update';
      btn.disabled = false;
    }, () => { btn.textContent = 'Location denied'; btn.disabled = false; });
  });
}

function calcQibla(lat, lon) {
  const MECCA_LAT = 21.4225; const MECCA_LON = 39.8262;
  const φ1 = lat * Math.PI / 180; const φ2 = MECCA_LAT * Math.PI / 180;
  const Δλ = (MECCA_LON - lon) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ── DASHBOARD ZAKAT ────────────────────────────────────────
function setupDashboardZakat() {
  $('dash-zakat-calc')?.addEventListener('click', () => {
    const wealth = parseFloat($('dash-zakat-input')?.value) || 0;
    const result = $('dash-zakat-result');
    if (!result) return;
    if (wealth <= 0) { result.style.display = 'none'; return; }
    const NISAB = 22080;
    result.style.display = 'block';
    if (wealth < NISAB) {
      result.innerHTML = `<span style="color:var(--jade)">✓ Below nisab (RM ${NISAB.toLocaleString()}). No Zakat due.</span>`;
    } else {
      const due = (wealth * 0.025).toFixed(2);
      result.innerHTML = `<span style="color:var(--gold)">Zakat due: <strong>RM ${parseFloat(due).toLocaleString()}</strong> (2.5%)</span>`;
    }
  });
  $('dash-zakat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('dash-zakat-calc')?.click(); });
}

// ── ZAKAT TAB ─────────────────────────────────────────────
function setupZakatTab() {
  $('btn-zakat-calc')?.addEventListener('click', calculateZakatFull);
  // Haul tracker
  $('btn-set-haul')?.addEventListener('click', () => {
    const inp = $('haul-date-input');
    if (!inp) return;
    if (inp.style.display === 'none') {
      inp.style.display = 'block'; inp.focus();
      inp.addEventListener('change', () => {
        settings.haulStart = inp.value;
        saveSettings(); renderHaulStatus(inp.value);
        inp.style.display = 'none';
        $('btn-set-haul').textContent = 'Change Date';
      }, { once: true });
    }
  });
  if (settings?.haulStart) renderHaulStatus(settings.haulStart);
}

function renderHaulStatus(dateStr) {
  const start = new Date(dateStr);
  const haulEnd = new Date(start);
  haulEnd.setFullYear(haulEnd.getFullYear() + 1);
  const daysLeft = Math.ceil((haulEnd - new Date()) / 86400000);
  const startEl = $('haul-start');
  const daysEl = $('haul-days');
  if (startEl) startEl.textContent = start.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  if (daysEl) {
    if (daysLeft > 0) daysEl.textContent = `${daysLeft} days`;
    else { daysEl.textContent = 'Haul reached — calculate now'; daysEl.style.color = 'var(--gold)'; }
  }
  $('btn-set-haul').textContent = 'Change Date';
}

function calculateZakatFull() {
  const cash = parseFloat($('zf-cash')?.value) || 0;
  const gold = parseFloat($('zf-gold')?.value) || 0;
  const business = parseFloat($('zf-business')?.value) || 0;
  const invest = parseFloat($('zf-invest')?.value) || 0;
  const recv = parseFloat($('zf-recv')?.value) || 0;
  const total = cash + gold + business + invest + recv;
  const NISAB = 22080;
  const resultEl = $('zakat-result');
  const amtEl = $('zr-amount');
  const detailEl = $('zr-detail');
  const bdownEl = $('zr-breakdown');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  if (total < NISAB) {
    if (amtEl) amtEl.textContent = 'RM 0';
    if (detailEl) detailEl.innerHTML = `<span style="color:var(--jade)">Total wealth RM ${total.toLocaleString()} is below nisab (RM ${NISAB.toLocaleString()}). No Zakat is due.</span>`;
    if (bdownEl) bdownEl.innerHTML = '';
    return;
  }
  const due = total * 0.025;
  if (amtEl) amtEl.textContent = `RM ${due.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (detailEl) detailEl.innerHTML = `Total zakatable wealth: RM ${total.toLocaleString()} × 2.5%`;
  if (bdownEl) {
    const rows = [
      ['Cash & Savings', cash], ['Gold', gold], ['Business', business],
      ['Investments', invest], ['Receivables', recv]
    ].filter(([, v]) => v > 0).map(([k, v]) =>
      `<div class="zr-brow"><span>${k}</span><span>RM ${v.toLocaleString()}</span></div>`
    ).join('');
    bdownEl.innerHTML = rows;
  }
}

function renderZakatRecipients() {
  const el = $('zakat-recipients');
  if (!el) return;
  el.innerHTML = ZAKAT_RECIPIENTS.map(r => `
    <div class="zr-org" onclick="chrome.tabs.create({url:'${r.url}',active:true})" style="cursor:pointer">
      <div class="zro-name">${escHtml(r.name)}</div>
      <div class="zro-country">${escHtml(r.country)}</div>
      ${r.verified ? '<div class="zro-badge">✓ Verified</div>' : ''}
    </div>`).join('');
}

// ── QURAN TAB ─────────────────────────────────────────────
function setupQuranTab() {
  loadVerseOfDay();
  setupDhikr();
  $('btn-load-surah')?.addEventListener('click', () => {
    const num = parseInt($('surah-num')?.value);
    if (num >= 1 && num <= 114) loadSurah(num);
  });
  $('surah-num')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-load-surah')?.click(); });
  $('ayah-next')?.addEventListener('click', loadNextAyah);
}

async function loadVerseOfDay() {
  const loadingEl = $('ayah-loading');
  const arabicEl = $('ayah-arabic');
  const transEl = $('ayah-translation');
  const refEl = $('ayah-ref');
  const nextBtn = $('ayah-next');
  try {
    // Use day-of-year to pick a consistent daily ayah (1-6236)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const ayahNum = (dayOfYear % 6236) + 1;
    currentAyahAyah = ayahNum;
    const r = await fetch(`https://api.alquran.cloud/v1/ayah/${ayahNum}/editions/quran-uthmani,en.asad`);
    const d = await r.json();
    if (d.code !== 200) throw new Error('API error');
    const arabic = d.data[0]; const trans = d.data[1];
    if (loadingEl) loadingEl.style.display = 'none';
    if (arabicEl) { arabicEl.textContent = arabic.text; arabicEl.style.display = 'block'; }
    if (transEl) { transEl.textContent = trans.text; transEl.style.display = 'block'; }
    if (refEl) { refEl.textContent = `Surah ${arabic.surah.englishName} (${arabic.surah.number}:${arabic.numberInSurah})`; refEl.style.display = 'block'; }
    if (nextBtn) nextBtn.style.display = 'block';
    currentAyahSurah = arabic.surah.number;
    currentAyahAyah = arabic.numberInSurah;
  } catch(e) {
    if (loadingEl) loadingEl.textContent = 'Could not load verse. Check connection.';
  }
}

async function loadNextAyah() {
  if (!currentAyahSurah || !currentAyahAyah) return;
  const nextNum = currentAyahAyah + 1;
  const loadingEl = $('ayah-loading');
  const arabicEl = $('ayah-arabic');
  const transEl = $('ayah-translation');
  const refEl = $('ayah-ref');
  try {
    if (loadingEl) { loadingEl.textContent = 'Loading…'; loadingEl.style.display = 'block'; }
    if (arabicEl) arabicEl.style.display = 'none';
    if (transEl) transEl.style.display = 'none';
    if (refEl) refEl.style.display = 'none';
    const r = await fetch(`https://api.alquran.cloud/v1/ayah/${currentAyahSurah}:${nextNum}/editions/quran-uthmani,en.asad`);
    const d = await r.json();
    if (d.code !== 200) throw new Error('end of surah');
    const arabic = d.data[0]; const trans = d.data[1];
    if (loadingEl) loadingEl.style.display = 'none';
    if (arabicEl) { arabicEl.textContent = arabic.text; arabicEl.style.display = 'block'; }
    if (transEl) { transEl.textContent = trans.text; transEl.style.display = 'block'; }
    if (refEl) { refEl.textContent = `Surah ${arabic.surah.englishName} (${arabic.surah.number}:${arabic.numberInSurah})`; refEl.style.display = 'block'; }
    currentAyahAyah = arabic.numberInSurah;
    currentAyahSurah = arabic.surah.number;
  } catch(e) {
    if (loadingEl) { loadingEl.textContent = 'End of surah.'; loadingEl.style.display = 'block'; }
  }
}

async function loadSurah(num) {
  const el = $('surah-display');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px 0">Loading…</div>';
  try {
    const r = await fetch(`https://api.alquran.cloud/v1/surah/${num}/editions/quran-uthmani,en.asad`);
    const d = await r.json();
    if (d.code !== 200) throw new Error('API error');
    const arabic = d.data[0]; const trans = d.data[1];
    el.innerHTML = `
      <div class="surah-header">
        <div class="surah-name">${escHtml(arabic.englishName)}</div>
        <div class="surah-arabic-name">${escHtml(arabic.name)}</div>
        <div class="surah-meta">${escHtml(arabic.revelationType)} · ${arabic.numberOfAyahs} verses</div>
      </div>
      ${arabic.ayahs.slice(0, 10).map((a, i) => `
        <div class="surah-ayah">
          <div class="sa-num">${a.numberInSurah}</div>
          <div class="sa-content">
            <div class="sa-arabic">${escHtml(a.text)}</div>
            <div class="sa-trans">${escHtml(trans.ayahs[i]?.text || '')}</div>
          </div>
        </div>`).join('')}
      ${arabic.numberOfAyahs > 10 ? `<div style="text-align:center;margin:8px 0;font-size:11px;color:var(--text-3)">Showing first 10 of ${arabic.numberOfAyahs} verses</div>` : ''}
    `;
  } catch(e) {
    el.innerHTML = '<div style="color:var(--ruby);font-size:12px;padding:8px 0">Could not load surah. Check connection.</div>';
  }
}

// ── DHIKR COUNTER ──────────────────────────────────────────
function setupDhikr() {
  dhikrCount = 0; dhikrIdx = 0;
  renderDhikr();
  $('dhikr-tap')?.addEventListener('click', () => {
    dhikrCount++;
    const countEl = $('dhikr-count');
    if (countEl) countEl.textContent = dhikrCount;
    const dhikr = DHIKR_LIST[dhikrIdx];
    if (dhikrCount >= dhikr.target) {
      const btn = $('dhikr-tap');
      if (btn) { btn.textContent = '✓ Complete!'; btn.style.background = 'var(--jade-dim)'; btn.style.color = 'var(--jade)'; }
    }
  });
  $('dhikr-reset')?.addEventListener('click', () => {
    dhikrCount = 0;
    const countEl = $('dhikr-count');
    if (countEl) countEl.textContent = '0';
    const btn = $('dhikr-tap');
    if (btn) { btn.textContent = 'Tap'; btn.style.background = ''; btn.style.color = ''; }
  });
  $('dhikr-next-phrase')?.addEventListener('click', () => {
    dhikrIdx = (dhikrIdx + 1) % DHIKR_LIST.length;
    dhikrCount = 0;
    renderDhikr();
  });
}

function renderDhikr() {
  const dhikr = DHIKR_LIST[dhikrIdx];
  const pEl = $('dhikr-phrase'); if (pEl) pEl.textContent = dhikr.phrase;
  const tEl = $('dhikr-translation'); if (tEl) tEl.textContent = dhikr.trans;
  const cEl = $('dhikr-count'); if (cEl) cEl.textContent = '0';
  const trEl = $('dhikr-target'); if (trEl) trEl.textContent = `/ ${dhikr.target}`;
  const btn = $('dhikr-tap');
  if (btn) { btn.textContent = 'Tap'; btn.style.background = ''; btn.style.color = ''; }
}

// ── iSTORE ─────────────────────────────────────────────────
function setupStore() {
  renderApps('all');
  document.querySelectorAll('.scat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderApps(btn.dataset.cat);
    });
  });
  $('store-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.app-card').forEach(card => {
      const name = card.querySelector('.ac-name')?.textContent?.toLowerCase() || '';
      const desc = card.querySelector('.ac-desc')?.textContent?.toLowerCase() || '';
      card.style.display = (!q || name.includes(q) || desc.includes(q)) ? '' : 'none';
    });
  });
}

function renderApps(cat) {
  const grid = $('app-grid');
  if (!grid) return;
  const apps = cat === 'all' ? APP_DIRECTORY : APP_DIRECTORY.filter(a => a.cat === cat);
  grid.innerHTML = apps.map(a => `
    <div class="app-card p-section" data-url="${escHtml(a.url)}">
      <div class="ac-icon">${a.icon}</div>
      <div class="ac-body">
        <div class="ac-name">${escHtml(a.name)}</div>
        <div class="ac-desc">${escHtml(a.desc)}</div>
        <div class="ac-meta">
          <span class="ac-rating">★ ${a.rating}</span>
          <span class="ac-price ${a.free ? 'free' : 'paid'}">${a.free ? 'Free' : 'Paid'}</span>
        </div>
      </div>
      <div class="ac-open">›</div>
    </div>`).join('');
  grid.querySelectorAll('.app-card').forEach(card => {
    card.addEventListener('click', () => {
      chrome.tabs.create({ url: card.dataset.url, active: true });
    });
  });
}

// ── VERDICT (from content script) ─────────────────────────
window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'VERDICT') {
    const verdict = e.data.verdict;
    const card = $('verdict-card');
    if (card) {
      card.className = `verdict-card vc-${verdict.verdict}`;
      const icons = { safe: '✓', caution: '!', warning: '⚠', blocked: '✕' };
      const labels = { safe: 'Safe', caution: 'Caution', warning: 'Warning', blocked: 'Blocked' };
      const subs = { safe: 'Permissible content', caution: 'Proceed with awareness', warning: 'Islamically problematic', blocked: 'Access blocked' };
      const icon = $('vc-icon'); if (icon) icon.textContent = icons[verdict.verdict] || '?';
      const lbl = $('vc-label'); if (lbl) lbl.textContent = labels[verdict.verdict] || verdict.verdict;
      const sub = $('vc-sublabel'); if (sub) sub.textContent = subs[verdict.verdict] || '';
      const desc = $('vc-desc'); if (desc) desc.textContent = verdict.reason || '';
    }
    if (verdict.quran) {
      const ar = $('ev-arabic'); if (ar) ar.textContent = verdict.quran.arabic || '';
      const q = $('ev-quote'); if (q) q.textContent = `"${verdict.quran.english}"`;
      const r = $('ev-ref'); if (r) r.textContent = verdict.quran.ref || '';
    }
    const alts = $('alts-list');
    if (alts && verdict.alternatives?.length) {
      alts.innerHTML = verdict.alternatives.map(a => `
        <div class="alt-row" data-url="${escHtml(a.url)}">
          <div class="alt-favicon">🔗</div>
          <div style="flex:1"><div class="alt-name">${escHtml(a.title)}</div></div>
          <svg class="alt-arr" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>`).join('');
      alts.querySelectorAll('.alt-row').forEach(row => {
        row.addEventListener('click', () => window.open(row.dataset.url, '_blank', 'noopener'));
      });
    } else if (alts) {
      alts.innerHTML = '';
    }
  }
});
