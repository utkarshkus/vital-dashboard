// whoop.js — calls /api/whoop (serverless proxy)
// Auth is handled server-side via OAuth. This file calls the proxy — no token in browser.

const PROXY = '/api/whoop';

const Whoop = {
  async _get(endpoint) {
    const res = await fetch(`${PROXY}?path=${encodeURIComponent(endpoint)}`);
    if (res.status === 401) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'NO_SESSION') { window.location.replace('/login.html'); return null; }
      // Signal WHOOP auth errors distinctly so the UI can show reconnect prompt
      throw new Error(err.error === 'NOT_AUTHENTICATED' || err.error === 'REFRESH_FAILED'
        ? 'NOT_AUTHENTICATED'
        : 'HTTP 401');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // Latest sleep record
  async getSleep() {
    const data = await this._get('/activity/sleep?limit=1');
    const record = data.records?.[0];
    if (!record) return null;

    const s = record.score || {};
    const sp = s.stage_summary || {};
    const totalMs = record.end ? (new Date(record.end) - new Date(record.start)) : 0;
    const totalHours = totalMs / 3600000;
    const remMs = sp.total_rem_sleep_time_milli || 0;

    // Actual wake = end of sleep session; actual sleep onset = start
    const toHHMM = iso => {
      if (!iso) return null;
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    return {
      score:      Math.round(s.sleep_performance_percentage || 0),
      durationH:  totalHours.toFixed(1),
      efficiency: Math.round(s.sleep_efficiency_percentage || 0),
      remMin:     Math.round(remMs / 60000),
      deepMin:    Math.round((sp.total_slow_wave_sleep_time_milli || 0) / 60000),
      lightMin:   Math.round((sp.total_light_sleep_time_milli || 0) / 60000),
      startTime:  record.start,          // actual sleep onset (ISO)
      endTime:    record.end,            // actual wake time (ISO)
      wakeHHMM:   toHHMM(record.end),   // e.g. "06:47" — feeds caffeine window
      sleepHHMM:  toHHMM(record.start), // e.g. "22:31"
      nap:        record.nap || false,
      raw:        record,
    };
  },

  // Latest recovery record + skin-temperature trend in a single upstream call.
  // Returns { latest, trend } where latest is the most recent recovery record
  // (same shape as the old getRecovery) and trend is the per-day temp deviation
  // series (same shape as the old getSkinTempTrend).
  async getRecoveryBundle(days = 14) {
    const end = new Date();
    const start = new Date(end - days * 86400000);
    const fmt = d => d.toISOString();
    const data = await this._get(
      `/recovery?limit=${days}&start=${encodeURIComponent(fmt(start))}&end=${encodeURIComponent(fmt(end))}`
    );
    const records = (data.records || []).reverse(); // chronological

    let latest = null;
    if (records.length > 0) {
      const r = records[records.length - 1];
      const s = r.score || {};
      latest = {
        score: Math.round(s.recovery_score || 0),
        hrv: Math.round(s.hrv_rmssd_milli || 0),
        rhr: Math.round(s.resting_heart_rate || 0),
        spo2: ((s.spo2_percentage || 0)).toFixed(1),
        raw: r,
      };
    }

    const temps = records.map(r => r.score?.skin_temp_celsius || 0);
    const mean = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
    const trend = records.map((r, i) => ({
      date: r.created_at?.split('T')[0] || '—',
      temp: parseFloat((temps[i] - mean).toFixed(2)),
    }));

    return { latest, trend };
  },

  // Today's physiological cycle — strain, kilojoules, avg HR
  async getCycle() {
    const data = await this._get('/cycle?limit=1');
    const record = data.records?.[0];
    if (!record) return null;
    const s = record.score || {};
    return {
      strain:    s.strain ? parseFloat(s.strain.toFixed(1)) : null,
      kilojoule: s.kilojoule ? Math.round(s.kilojoule) : null,
      avgHr:     s.average_heart_rate ? Math.round(s.average_heart_rate) : null,
      start:     record.start,
      end:       record.end,
      raw:       record,
    };
  },

};

// Recovery score → color mapping
function recoveryColor(score) {
  if (score >= 67) return '#a0f0b0';
  if (score >= 34) return '#f0c070';
  return '#f07070';
}

function recoveryLabel(score) {
  if (score >= 67) return 'Green zone. Ready to push today.';
  if (score >= 34) return 'Yellow zone. Moderate effort recommended.';
  return 'Red zone. Prioritise rest and recovery.';
}

function sleepLabel(score) {
  if (score >= 85) return 'Excellent sleep. HRV and REM cycles fully restored.';
  if (score >= 70) return 'Good sleep. Minor deficits — consider an early night.';
  if (score >= 50) return 'Moderate sleep. Watch energy levels through the day.';
  return 'Poor sleep. High fatigue likely — limit intense training.';
}
