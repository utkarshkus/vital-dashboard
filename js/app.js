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
      WeightTracker.render();
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
      stepTarget:    parseInt(document.getElementById('stepTarget').value, 10)  || 10000,
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
  document.getElementById('stepTarget').value    = Config.get('stepTarget')    || '';
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
    document.getElementById('sleepCommentary').textContent = sleepLabel(s.score);
    const offset = 314 * (1 - s.score / 100);
    document.getElementById('sleepRingFill').style.strokeDashoffset = offset.toFixed(1);
    const scoreColor = s.score >= 85 ? '#a0f0b0' : s.score >= 60 ? '#f0c070' : '#f07070';
    document.getElementById('sleepRingFill').style.stroke = scoreColor;
  } catch (e) {
    console.warn('Sleep load error:', e.message);
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

// ─── Boot ──────────────────────────────────────────────────────
async function boot() {
  setSyncStatus('', 'loading config…');

  // Load server config first — tiles depend on these values
  await Config.init();

  // Render local tiles now that config is populated
  WeightTracker.render();
  StepTracker.render();
  CaffeineTracker.render();

  // Fetch WHOOP data
  setSyncStatus('', 'fetching WHOOP…');
  try {
    await Promise.all([loadSleep(), loadRecovery(), loadTempTrend()]);
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
  StepTracker.init();
  CaffeineTracker.init();
  boot();
  setInterval(boot, 15 * 60 * 1000);
});
