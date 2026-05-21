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
      startDate:     document.getElementById('startDate').value                 || null,
      currentWeight: parseFloat(document.getElementById('currentWeight').value) || null,
      targetWeight:  parseFloat(document.getElementById('targetWeight').value)  || null,
      targetDate:    document.getElementById('targetDate').value                || null,
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
  document.getElementById('startDate').value     = Config.get('startDate')     || '';
  document.getElementById('currentWeight').value = Config.get('currentWeight') || '';
  document.getElementById('targetWeight').value  = Config.get('targetWeight')  || '';
  document.getElementById('targetDate').value    = Config.get('targetDate')    || '';
  document.getElementById('wakeTime').value      = Config.get('wakeTime')      || '06:30';
  document.getElementById('sleepTime').value     = Config.get('sleepTime')     || '22:30';
}

// ─── WHOOP: Sleep ──────────────────────────────────────────────
let lastSleepData = null;

async function loadSleep() {
  try {
    const s = await Whoop.getSleep();
    if (!s) return;
    lastSleepData = s;

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

// ─── WHOOP: Recovery + skin-temp trend (single upstream call) ─
let lastTempData = [];
let lastRecoveryData = null;
let tempChart = null;

async function loadRecoveryAndTemp() {
  let bundle;
  try {
    bundle = await Whoop.getRecoveryBundle(14);
  } catch (e) {
    console.warn('Recovery/temp load error:', e.message);
    if (e.message === 'NOT_AUTHENTICATED') { handleWhoopAuthError(); return; }
    document.getElementById('recoveryCommentary').textContent = 'WHOOP data unavailable: ' + e.message;
    document.getElementById('tempCommentary').textContent     = 'Could not load temperature data: ' + e.message;
    return;
  }

  const r = bundle.latest;
  lastRecoveryData = r;
  if (r) {
    document.getElementById('recoveryScoreText').textContent  = r.score;
    document.getElementById('recoveryHrv').textContent        = r.hrv + 'ms';
    document.getElementById('recoveryRhr').textContent        = r.rhr + ' bpm';
    document.getElementById('recoverySpo2').textContent       = r.spo2 + '%';
    document.getElementById('recoveryCommentary').textContent = recoveryLabel(r.score);
    const color  = recoveryColor(r.score);
    const offset = 314 * (1 - r.score / 100);
    document.getElementById('recoveryRingFill').style.strokeDashoffset = offset.toFixed(1);
    document.getElementById('recoveryRingFill').style.stroke           = color;
  }

  const trend = bundle.trend;
  lastTempData = trend;
  renderTempChart(trend);
  if (trend.length > 0) {
    document.getElementById('tempCommentary').textContent =
      '14-day skin temperature deviation. Normal range ±0.5°C.';
    const latest = trend[trend.length - 1].temp;
    document.getElementById('tempDelta').textContent =
      (latest >= 0 ? '+' : '') + latest.toFixed(2);
    document.getElementById('tempDelta').style.color =
      Math.abs(latest) > 0.5 ? '#f07070' : '#a0f0b0';
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

// ─── Sleep Apnea Risk ──────────────────────────────────────────
// Composite 0–100 score (higher = more risk). Built from WHOOP signals
// associated with obstructive sleep apnea: overnight SpO2 desaturation
// (primary), elevated resting HR, suppressed HRV, fragmented sleep, and
// reduced REM share. Educational only — not a clinical screening tool.
function computeApneaRisk(sleep, recovery) {
  if (!sleep || !recovery) return null;

  const spo2 = parseFloat(recovery.spo2);
  const rhr = recovery.rhr;
  const hrv = recovery.hrv;
  const efficiency = sleep.efficiency;
  const durationH = parseFloat(sleep.durationH);
  const remShare = durationH > 0 ? (sleep.remMin / (durationH * 60)) * 100 : 0;

  const clamp = v => Math.max(0, Math.min(100, v));

  // SpO2 ≥97% clean; each 1% drop scales risk steeply (≤92% saturates).
  const spo2Risk = clamp((97 - spo2) * 20);
  // RHR: 55 bpm baseline; 80+ saturates.
  const rhrRisk  = clamp((rhr - 55) * 4);
  // HRV: depressed autonomic tone — 60ms clean, ≤10ms saturates.
  const hrvRisk  = clamp((60 - hrv) * 2);
  // Sleep efficiency: 92%+ clean, ≤67% saturates.
  const effRisk  = clamp((92 - efficiency) * 4);
  // REM share: ~20% typical; suppressed REM is an OSA signature.
  const remRisk  = clamp((20 - remShare) * 5);

  const score = Math.round(
    0.45 * spo2Risk +
    0.15 * rhrRisk +
    0.15 * hrvRisk +
    0.15 * effRisk +
    0.10 * remRisk
  );

  return { score, spo2, rhr, hrv, efficiency, remShare };
}

function apneaTier(score) {
  if (score >= 60) return { label: 'elevated', color: '#f07070',
    msg: 'Elevated risk signals. Consider discussing screening (e.g. STOP-BANG, home sleep study) with a clinician — especially if you snore, wake gasping, or feel unrested.' };
  if (score >= 30) return { label: 'moderate', color: '#f0c070',
    msg: 'Some risk markers present. Watch overnight SpO2 trend across multiple nights — single low readings can be positional.' };
  return { label: 'low', color: '#a0f0b0',
    msg: 'Risk markers within normal range. Educational estimate — not a diagnostic tool.' };
}

function renderApneaRisk() {
  const result = computeApneaRisk(lastSleepData, lastRecoveryData);
  if (!result) return;

  document.getElementById('apneaScoreText').textContent = result.score;
  document.getElementById('apneaSpo2').textContent = result.spo2.toFixed(1) + '%';
  document.getElementById('apneaRhr').textContent  = result.rhr + ' bpm';
  document.getElementById('apneaHrv').textContent  = result.hrv + ' ms';
  document.getElementById('apneaEff').textContent  = result.efficiency + '%';
  document.getElementById('apneaRem').textContent  = result.remShare.toFixed(0) + '%';

  const tier = apneaTier(result.score);
  document.getElementById('apneaTierText').textContent = tier.label + ' risk';
  document.getElementById('apneaCommentary').textContent = tier.msg;

  // Higher score = more risk → ring fills more.
  const offset = 314 * (1 - result.score / 100);
  const ring = document.getElementById('apneaRingFill');
  ring.style.strokeDashoffset = offset.toFixed(1);
  ring.style.stroke = tier.color;
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
    await Promise.all([loadSleep(), loadRecoveryAndTemp(), loadCycle()]);
    renderApneaRisk();
    PRC.renderFromCache(lastSleepData, lastRecoveryData);
    setSyncStatus('live', 'synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSyncStatus('error', 'WHOOP sync error');
  }
}

// ─── User info + admin panel ───────────────────────────────────
async function initUserPanel() {
  let me;
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.replace('/login.html'); return; }
    me = await res.json();
  } catch (e) {
    console.warn('Could not load user info:', e.message);
    return;
  }

  if (!me.isAdmin) return;

  const usersBtn   = document.getElementById('usersBtn');
  const usersModal = document.getElementById('usersModal');
  usersBtn.style.display = '';

  usersBtn.addEventListener('click', function() {
    loadUsersList();
    usersModal.classList.add('open');
  });
  document.getElementById('usersModalClose').addEventListener('click', function() {
    usersModal.classList.remove('open');
  });
  usersModal.addEventListener('click', function(e) {
    if (e.target === usersModal) usersModal.classList.remove('open');
  });

  document.getElementById('addUserBtn').addEventListener('click', async function() {
    const btn       = this;
    const statusEl  = document.getElementById('addUserStatus');
    const username  = document.getElementById('newUsername').value.trim();
    const password  = document.getElementById('newPassword').value;
    const isAdmin   = document.getElementById('newIsAdmin').checked;

    statusEl.textContent = '';
    statusEl.className = 'config-save-status';

    if (!username || !password) {
      statusEl.textContent = 'Username and password required.';
      statusEl.className = 'config-save-status status-warn';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
      const res = await fetch('/api/admin-users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password, isAdmin }),
      });
      const data = await res.json();
      if (res.ok) {
        statusEl.textContent = 'User "' + username + '" created.';
        statusEl.className = 'config-save-status status-ok';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newIsAdmin').checked = false;
        loadUsersList();
      } else {
        statusEl.textContent = data.error || 'Failed to create user.';
        statusEl.className = 'config-save-status status-warn';
      }
    } catch (e) {
      statusEl.textContent = 'Network error.';
      statusEl.className = 'config-save-status status-warn';
    }

    btn.disabled = false;
    btn.textContent = 'Add user';
  });
}

async function loadUsersList() {
  const listEl = document.getElementById('usersList');
  listEl.textContent = 'Loading…';
  try {
    const res  = await fetch('/api/admin-users');
    const data = await res.json();
    if (!res.ok) { listEl.textContent = 'Error: ' + (data.error || res.status); return; }

    if (!data.users.length) { listEl.textContent = 'No users found.'; return; }

    listEl.innerHTML = '';
    data.users.forEach(function(u) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border)';

      const info = document.createElement('div');
      info.style.cssText = 'display:flex;align-items:center;gap:.5rem;font-size:.85rem';
      info.innerHTML = '<span style="color:var(--text)">' + escHtml(u.displayName || u.username) + '</span>'
        + '<span style="font-size:.7rem;color:var(--text3)">@' + escHtml(u.username) + '</span>'
        + (u.isAdmin ? '<span style="font-size:.65rem;background:var(--accent);color:var(--bg);border-radius:4px;padding:1px 5px">admin</span>' : '')
        + (u.isSelf  ? '<span style="font-size:.65rem;color:var(--text3)">(you)</span>' : '');

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:.4rem';

      if (!u.isSelf) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'btn-config';
        adminBtn.style.cssText = 'font-size:.7rem;padding:.25rem .5rem';
        adminBtn.textContent = u.isAdmin ? 'Revoke admin' : 'Make admin';
        adminBtn.addEventListener('click', async function() {
          adminBtn.disabled = true;
          const res = await fetch('/api/admin-users', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username: u.username, isAdmin: !u.isAdmin }),
          });
          if (res.ok) loadUsersList();
          else adminBtn.disabled = false;
        });
        actions.appendChild(adminBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-config';
        delBtn.style.cssText = 'font-size:.7rem;padding:.25rem .5rem;color:var(--danger);border-color:var(--danger)';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async function() {
          if (!confirm('Delete user "' + u.username + '"? This cannot be undone.')) return;
          delBtn.disabled = true;
          const res = await fetch('/api/admin-users', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username: u.username }),
          });
          if (res.ok) loadUsersList();
          else delBtn.disabled = false;
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(info);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  } catch (e) {
    listEl.textContent = 'Could not load users: ' + e.message;
  }
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

// ─── Init ──────────────────────────────────────────────────────
initTheme();
initDate();
initConfig();

document.addEventListener('DOMContentLoaded', function() {
  handleAuthRedirect();
  WeightTracker.init();
  CaffeineTracker.init();
  PRC.init();                  // draws demo zones immediately
  initUserPanel();
  boot();
  setInterval(boot, 15 * 60 * 1000);
  // Independent PRC refresh every 30 minutes (per spec).
  setInterval(function() {
    PRC.renderFromCache(lastSleepData, lastRecoveryData);
  }, 30 * 60 * 1000);
});

// ─── WHOOP auth status ─────────────────────────────────────────
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth-status');
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.error === 'NO_SESSION') { window.location.replace('/login.html'); return false; }
    }
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
