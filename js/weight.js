// weight.js — Daily weight logging with server-side persistence

const WeightTracker = {
  _chart: null,

  init() {
    this._bindUI();
    this.render();
  },

  // Local YYYY-MM-DD string (avoids UTC-offset date shift from toISOString)
  _todayStr() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  },

  _bindUI() {
    const btn     = document.getElementById('logWeightBtn');
    const inp     = document.getElementById('logWeightInput');
    const dateInp = document.getElementById('logWeightDate');

    if (dateInp) dateInp.value = this._todayStr();
    if (btn) btn.addEventListener('click', () => this._logEntry());
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') this._logEntry(); });
  },

  async _logEntry() {
    const inp     = document.getElementById('logWeightInput');
    const dateInp = document.getElementById('logWeightDate');
    if (!inp) return;

    const val = parseFloat(inp.value);
    if (isNaN(val) || val <= 0 || val > 500) return;

    const today   = this._todayStr();
    const dateStr = (dateInp && dateInp.value) ? dateInp.value : today;

    const logs = (Config.get('weightLogs') || []).slice();

    // Upsert: overwrite if same date already logged
    const idx = logs.findIndex(l => l.date === dateStr);
    if (idx >= 0) {
      logs[idx] = { date: dateStr, weight: val };
    } else {
      logs.push({ date: dateStr, weight: val });
    }
    logs.sort((a, b) => a.date.localeCompare(b.date));

    // Keep at most 365 entries
    if (logs.length > 365) logs.splice(0, logs.length - 365);

    await Config.set('weightLogs', logs);

    // Keep currentWeight in sync with the most recent entry
    const latest = logs[logs.length - 1];
    if (latest) await Config.set('currentWeight', latest.weight);

    inp.value = '';
    if (dateInp) dateInp.value = this._todayStr();

    this.render();
  },

  render() {
    const start  = parseFloat(Config.get('startWeight'));
    const target = parseFloat(Config.get('targetWeight'));
    const logs   = (Config.get('weightLogs') || []).slice()
                   .sort((a, b) => a.date.localeCompare(b.date));

    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const curr    = lastLog ? lastLog.weight
                            : parseFloat(Config.get('currentWeight'));

    if (isNaN(start) || isNaN(target)) {
      document.getElementById('wStart').textContent   = '—';
      document.getElementById('wNow').textContent     = '—';
      document.getElementById('wTarget').textContent  = '—';
      document.getElementById('weightBadge').textContent = 'Setup needed';
      if (this._chart) { this._chart.destroy(); this._chart = null; }
      this._renderLog([]);
      return;
    }

    const lost = parseFloat((start - (isNaN(curr) ? start : curr)).toFixed(1));
    document.getElementById('wStart').textContent  = start + ' kg';
    document.getElementById('wNow').textContent    = isNaN(curr) ? '—' : curr + ' kg';
    document.getElementById('wTarget').textContent = target + ' kg';
    document.getElementById('weightBadge').textContent =
      lost > 0 ? '↓' + Math.abs(lost) + ' kg lost' :
      lost < 0 ? '↑' + Math.abs(lost) + ' kg gained' : 'No change';

    const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

    // Date range: first log (or today) up to today, capped at 90 days back
    const today     = new Date(); today.setHours(0, 0, 0, 0);  // local midnight
    const ninetyAgo = new Date(today.getTime() - 90 * 24 * 3600 * 1000);
    // Parse date strings as local midnight (not UTC) to avoid timezone shift
    const parseLocal = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
    const localStr   = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const fromDate   = logs.length > 0
      ? new Date(Math.max(parseLocal(logs[0].date).getTime(), ninetyAgo.getTime()))
      : today;

    // Build log map
    const logMap = {};
    logs.forEach(l => { logMap[l.date] = l.weight; });

    const labels      = [];
    const actualData  = [];
    const targetLine  = [];

    for (let d = new Date(fromDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = localStr(d);        // local date string, not UTC
      labels.push(dateStr);
      actualData.push(logMap[dateStr] !== undefined ? logMap[dateStr] : null);
      targetLine.push(target);
    }

    // Y-axis bounds from all logged + boundary weights
    const allW   = logs.map(l => l.weight).concat([start, target]).filter(w => !isNaN(w));
    const minY   = allW.length > 0 ? Math.floor(Math.min(...allW) - 1) : target - 2;
    const maxY   = allW.length > 0 ? Math.ceil(Math.max(...allW) + 1)  : start + 2;

    const ctx = document.getElementById('weightChart').getContext('2d');
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    this._chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Weight',
            data: actualData,
            borderColor: isDark ? '#a0f0b0' : '#1a9e50',
            backgroundColor: isDark ? 'rgba(160,240,176,0.1)' : 'rgba(26,158,80,0.07)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: isDark ? '#a0f0b0' : '#1a9e50',
            pointBorderColor: isDark ? '#161820' : '#fff',
            pointBorderWidth: 1.5,
            spanGaps: true,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Target',
            data: targetLine,
            borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [5, 5],
            tension: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: item => item.parsed.y !== null && item.datasetIndex === 0,
            callbacks: {
              title: items => {
                const d = new Date(items[0].label);
                return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              },
              label: ctx => ctx.parsed.y.toFixed(1) + ' kg',
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              maxTicksLimit: 6,
              maxRotation: 0,
              callback: function(val) {
                const label = this.getLabelForValue(val);
                const d = new Date(label);
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
              }
            },
            grid: { color: gridColor },
            border: { display: false },
          },
          y: {
            min: minY,
            max: maxY,
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              callback: v => v + 'kg',
            },
            grid: { color: gridColor },
            border: { display: false },
          }
        }
      }
    });

    this._renderLog(logs);
  },

  _renderLog(logs) {
    const container = document.getElementById('weightLog');
    if (!container) return;
    container.innerHTML = '';
    if (logs.length === 0) return;

    const recent = logs.slice(-5).reverse();
    recent.forEach(function(entry) {
      const pill = document.createElement('div');
      pill.className = 'weight-log-pill';
      const d = new Date(entry.date);
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      pill.innerHTML = label + ' <strong>' + entry.weight + ' kg</strong>';
      container.appendChild(pill);
    });
  },
};
