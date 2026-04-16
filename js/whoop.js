// whoop.js — calls /.netlify/functions/whoop (serverless proxy)
// Auth is handled server-side via OAuth. This file calls the proxy — no token in browser.

const PROXY = '/.netlify/functions/whoop';

const Whoop = {
  async _get(endpoint) {
    const res = await fetch(`${PROXY}?path=${encodeURIComponent(endpoint)}`);
    if (res.status === 401) {
      const err = await res.json().catch(() => ({}));
      // Signal auth errors distinctly so the UI can show reconnect prompt
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

    return {
      score: Math.round(s.sleep_performance_percentage || 0),
      durationH: totalHours.toFixed(1),
      efficiency: Math.round(s.sleep_efficiency_percentage || 0),
      remMin: Math.round(remMs / 60000),
      startTime: record.start,
      endTime: record.end,
      raw: record,
    };
  },

  // Latest recovery record
  async getRecovery() {
    const data = await this._get('/recovery?limit=1');
    const record = data.records?.[0];
    if (!record) return null;

    const s = record.score || {};
    return {
      score: Math.round(s.recovery_score || 0),
      hrv: Math.round(s.hrv_rmssd_milli || 0),
      rhr: Math.round(s.resting_heart_rate || 0),
      spo2: ((s.spo2_percentage || 0)).toFixed(1),
      skinTemp: parseFloat((s.skin_temp_celsius || 0).toFixed(2)),
      raw: record,
    };
  },

  // Skin temperature trend — last 14 days
  async getSkinTempTrend(days = 14) {
    const end = new Date();
    const start = new Date(end - days * 86400000);
    const fmt = d => d.toISOString().split('T')[0];
    const data = await this._get(
      `/recovery?limit=${days}&start=${fmt(start)}T00:00:00.000Z&end=${fmt(end)}T23:59:59.999Z`
    );
    const records = (data.records || []).reverse();
    return records.map(r => ({
      date: r.created_at?.split('T')[0] || '—',
      temp: parseFloat((r.score?.skin_temp_celsius || 0).toFixed(2)),
    }));
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
