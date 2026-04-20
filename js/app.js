// app.js — main orchestration
// WHOOP token: Netlify env var only. Config: server-side Blobs + localStorage.

// ─── Theme toggle ─────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('vital_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  document.getElementById('themeToggle').addEventListener('click', function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vital_theme', next);
    setTimeout(function() {
      WeightTracker.render();  // render() only — UI already bound by init()
      CaffeineTracker.render();
      renderTempChart(lastTempData);
    }, 50);
  });
}

// ─── Header date ──────────────────────────────────────────────
function initDate() {
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

// ─── Sync status ──────────────────────────────────────────────
function setSyncStatus(state, label) {
  const dot = document.getElementById('syncStatus').querySelector('.sync-dot');
  const lbl = document.getElementById('syncLabel');
  dot.className = 'sync-dot' + (state ? ' ' + state : '');
  lbl.textContent = label;
}

// ─── Config modal ─────────────────────────────────────────────
function initConfig() {
  const modal = document.getElementById('configModal');

  document.getElementById('configBtn').addEventListener('click', function() {
    populateModal();
    modal.classList.add('open');
  });
  document.getElementById('modalClose').addEventListener('click', function() {
    modal.classList.remove('open');
  });
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.classList.remove('open');
  });

  document.getElementById('saveConfig').addEventListener('click', async function() {
    const btn = document.getElementById('saveConfig');
    const statusEl = document.getElementById('configSaveStatus');

    btn.disabled = true;
    btn.textContent = 'Saving…';
    statusEl.textContent = '';
    statusEl.className = 'config-save-status';

    const result = await Config.saveAll({
      startWeight:   parseFloat(document.getElementById('startWeight').value)   || null,
      currentWeight: parseFloat(document.getElementById('currentWeight').value) || null,
      targetWeight:  parseFloat(document.getElementById('targetWeight').value)  || null,
      wakeTime:      document.getElementById('wakeTime').value,
      sleepTime:     document.getElementById('sleepTime').value,
    });

    btn.disabled = false;
    btn.textContent = 'Save & Refresh';

    if (result.ok) {
      statusEl.textContent = 'Saved to server.';
      statusEl.className = 'config-save-status status-ok';
      setTimeout(function() { modal.classList.remove('open'); boot(); }, 600);
    } else {
      statusEl.textContent = 'Server save failed — cached locally. Will sync when back online.';
      statusEl.className = 'config-save-status status-warn';
      setTimeout(function() { modal.classList.remove('open'); boot(); }, 1800);
    }
  });
}

function populateModal() {
  document.getElementById('startWeight').value   = Config.get('startWeight')   || '';
  document.getElementById('currentWeight').value = Config.get('currentWeight') || '';
  document.getElementById('targetWeight').value  = Config.get('targetWeight')  || '';
  document.getElementById('wakeTime').value      = Config.get('wakeTime')      || '06:30';
  document.getElementById('sleepTime').value     = Config.get('sleepTime')     || '22:30';
}

// ─── WHOOP: Sleep ──────────────────────────────────────────────
async function loadSleep() {
  try {
    const s = await Whoop.getSleep();
    if (!s) return;

    document.getElementById('sleepScoreText').textContent  = s.score;
    document.getElementById('sleepDuration').textContent   = s.durationH + 'h';
    document.getElementById('sleepEfficiency').textContent = s.efficiency + '%';
    document.getElementById('sleepRem').textContent        = s.remMin + 'min';

    // Show actual wake time if available
    if (s.wakeHHMM) {
      const wakeEl = document.getElementById('sleepWakeTime');
      if (wakeEl) wakeEl.textContent = 'Woke ' + s.wakeHHMM;
    }
    // Show actual sleep onset
    if (s.sleepHHMM) {
      const onsetEl = document.getElementById('sleepOnsetTime');
      if (onsetEl) onsetEl.textContent = 'Slept ' + s.sleepHHMM;
    }

    document.getElementById('sleepCommentary').textContent = sleepLabel(s.score);
    const offset = 314 * (1 - s.score / 100);
    document.getElementById('sleepRingFill').style.strokeDashoffset = offset.toFixed(1);
    const scoreColor = s.score >= 85 ? '#a0f0b0' : s.score >= 60 ? '#f0c070' : '#f07070';
    document.getElementById('sleepRingFill').style.stroke = scoreColor;

    // Feed actual wake time into caffeine window (overrides manual config)
    if (s.wakeHHMM && !s.nap) {
      window._whoopWakeTime = s.wakeHHMM;
      CaffeineTracker.render(); // re-render with actual wake time
    }
  } catch (e) {
    console.warn('Sleep load error:', e.message);
    if (e.message === 'NOT_AUTHENTICATED') { handleWhoopAuthError(); return; }
    document.getElementById('sleepCommentary').textContent = 'WHOOP data unavailable: ' + e.message;
  }
}

// ─── WHOOP: Recovery ──────────────────────────────────────────
async function loadRecovery() {
  try {
    const r = await Whoop.getRecovery();
    if (!r) return;
    document.getElementById('recoveryScoreText').textContent = r.score;
    document.getElementById('recoveryHrv').textContent       = r.hrv + 'ms';
    document.getElementById('recoveryRhr').textContent       = r.rhr + ' bpm';
    document.getElementById('recoverySpo2').textContent      = r.spo2 + '%';
    document.getElementById('recoveryCommentary').textContent = recoveryLabel(r.score);
    const color = recoveryColor(r.score);
    const offset = 314 * (1 - r.score / 100);
    document.getElementById('recoveryRingFill').style.strokeDashoffset = offset.toFixed(1);
    document.getElementById('recoveryRingFill').style.stroke = color;
    if (r.skinTemp) {
      document.getElementById('tempDelta').textContent =
        (r.skinTemp >= 0 ? '+' : '') + r.skinTemp.toFixed(2);
      document.getElementById('tempDelta').style.color =
        Math.abs(r.skinTemp) > 0.5 ? '#f07070' : '#a0f0b0';
    }
  } catch (e) {
    console.warn('Recovery load error:', e.message);
    if (e.message === 'NOT_AUTHENTICATED') { handleWhoopAuthError(); return; }
    document.getElementById('recoveryCommentary').textContent = 'WHOOP data unavailable: ' + e.message;
  }
}

// ─── WHOOP: Skin Temperature trend ────────────────────────────
let lastTempData = [];
let tempChart = null;

async function loadTempTrend() {
  try {
    const data = await Whoop.getSkinTempTrend(14);
    lastTempData = data;
    renderTempChart(data);
    if (data.length > 0) {
      document.getElementById('tempCommentary').textContent =
        '14-day skin temperature deviation. Normal range ±0.5°C.';
    }
  } catch (e) {
    console.warn('Temp trend error:', e.message);
    document.getElementById('tempCommentary').textContent =
      'Could not load temperature data: ' + e.message;
  }
}

function renderTempChart(data) {
  if (!data || !data.length) return;
  const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const labels    = data.map(function(d) { return d.date.slice(5); });
  const values    = data.map(function(d) { return d.temp; });
  const barColors = values.map(function(v) {
    return Math.abs(v) > 0.5
      ? (isDark ? '#f07070' : '#b03030')
      : (isDark ? '#68d9e0' : '#0e8090');
  });
  const ctx = document.getElementById('tempChart').getContext('2d');
  if (tempChart) { tempChart.destroy(); tempChart = null; }
  tempChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: barColors, borderRadius: 3, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 9, family: 'DM Mono' } }, grid: { display: false }, border: { display: false } },
        y: {
          ticks: { color: textColor, font: { size: 9, family: 'DM Mono' }, callback: function(v) { return (v > 0 ? '+' : '') + v + '°'; } },
          grid: { color: gridColor }, border: { display: false }
        }
      }
    }
  });
}

// ─── WHOOP: Today's cycle (strain) ────────────────────────────
async function loadCycle() {
  try {
    const cy = await Whoop.getCycle();
    if (!cy) return;

    const strainEl = document.getElementById('cycleStrain');
    const kjEl     = document.getElementById('cycleKj');
    const hrEl     = document.getElementById('cycleHr');
    if (strainEl && cy.strain !== null) strainEl.textContent = cy.strain;
    if (kjEl     && cy.kilojoule !== null) kjEl.textContent  = cy.kilojoule + ' kJ';
    if (hrEl     && cy.avgHr !== null)     hrEl.textContent  = cy.avgHr + ' bpm';
  } catch (e) {
    if (e.message === 'NOT_AUTHENTICATED') { handleWhoopAuthError(); return; }
    console.warn('Cycle load error:', e.message);
  }
}

// ─── Boot ──────────────────────────────────────────────────────
async function boot() {
  setSyncStatus('', 'loading config…');

  // Load server config first — tiles depend on these values
  await Config.init();

  // Render local tiles now that config is populated
  WeightTracker.render();   // re-render only; init() already bound UI at startup
  CaffeineTracker.render();

  // Check WHOOP auth before attempting API calls
  const isConnected = await checkAuthStatus();
  if (!isConnected) return;

  // Fetch WHOOP data
  setSyncStatus('', 'fetching WHOOP…');
  try {
    await Promise.all([loadSleep(), loadRecovery(), loadTempTrend(), loadCycle()]);
    setSyncStatus('live', 'synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSyncStatus('error', 'WHOOP sync error');
  }
}

// ─── Init ──────────────────────────────────────────────────────
initTheme();
initDate();
initConfig();

document.addEventListener('DOMContentLoaded', function() {
  handleAuthRedirect();
  WeightTracker.init();
  CaffeineTracker.init();
  boot();
  setInterval(boot, 15 * 60 * 1000);
});

// ─── WHOOP auth status ─────────────────────────────────────────
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth-status');
    const data = await res.json();

    const banner = document.getElementById('authBanner');
    const bannerText = document.getElementById('authBannerText');

    if (!data.connected) {
      banner.style.display = 'flex';
      bannerText.textContent = 'WHOOP not connected.';
      setSyncStatus('error', 'not connected');
      return false;
    }

    banner.style.display = 'none';
    return true;
  } catch (e) {
    console.warn('Auth status check failed:', e.message);
    return true; // assume connected if status check itself fails
  }
}

// ─── Handle ?auth= redirect from OAuth callback ───────────────
function handleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const auth   = params.get('auth');
  if (!auth) return;

  const banner     = document.getElementById('authBanner');
  const bannerText = document.getElementById('authBannerText');

  if (auth === 'success') {
    banner.style.display = 'flex';
    bannerText.textContent = 'WHOOP connected successfully.';
    banner.classList.add('auth-banner-success');
    setTimeout(function() { banner.style.display = 'none'; }, 4000);
  } else if (auth === 'error') {
    const reason = params.get('reason') || 'unknown error';
    banner.style.display = 'flex';
    bannerText.textContent = 'WHOOP connection failed: ' + reason + '.';
  }

  // Clean ?auth= from URL without page reload
  const clean = window.location.pathname;
  window.history.replaceState({}, '', clean);
}

// ─── Handle NOT_AUTHENTICATED from any WHOOP tile ─────────────
function handleWhoopAuthError() {
  const banner     = document.getElementById('authBanner');
  const bannerText = document.getElementById('authBannerText');
  banner.style.display = 'flex';
  bannerText.textContent = 'WHOOP session expired.';
  setSyncStatus('error', 'session expired');
}
