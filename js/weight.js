// weight.js — Daily weight logging with server-side persistence

const WeightTracker = {
  _chart: null,
  _rangeCache: null,

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
    const btn     = document.getElementById('logWeightBtn');
    if (!inp) return;

    const val = parseFloat(inp.value);
    if (isNaN(val) || val <= 0 || val > 500) return;

    const today   = this._todayStr();
    const dateStr = (dateInp && dateInp.value) ? dateInp.value : today;

    // Make sure Config has loaded from the server before mutating weightLogs.
    // Otherwise we'd merge into the empty default array and clobber the user's
    // existing logs on the server.
    await Config.init();

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

    // Persist weightLogs + currentWeight in a single POST. Two sequential
    // Config.set calls hit the server as separate lambda invocations and can
    // race against each other (last write wins on the merged blob), which has
    // caused logs to vanish on refresh. One saveAll = one atomic merge.
    const latest = logs[logs.length - 1];
    const result = await Config.saveAll(
      latest
        ? { weightLogs: logs, currentWeight: latest.weight }
        : { weightLogs: logs }
    );

    if (btn) {
      if (result && result.ok === false) {
        btn.textContent = 'Save failed — retry';
        btn.classList.add('weight-log-btn-error');
        setTimeout(() => {
          btn.textContent = 'Log';
          btn.classList.remove('weight-log-btn-error');
        }, 3500);
        // Leave the inputs populated so the user can retry without re-typing.
        return;
      }
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = 'Log'; }, 1200);
    }

    inp.value = '';
    if (dateInp) dateInp.value = this._todayStr();

    this.render();
  },

  render() {
    const start         = parseFloat(Config.get('startWeight'));
    const target        = parseFloat(Config.get('targetWeight'));
    const startDateStr  = Config.get('startDate');
    const targetDateStr = Config.get('targetDate');
    const logs          = (Config.get('weightLogs') || []).slice()
                          .sort((a, b) => a.date.localeCompare(b.date));

    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const curr    = lastLog ? lastLog.weight
                            : parseFloat(Config.get('currentWeight'));

    if (isNaN(start) || isNaN(target)) {
      document.getElementById('wStart').textContent      = '—';
      document.getElementById('wNow').textContent        = '—';
      document.getElementById('wTarget').textContent     = '—';
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

    const today      = new Date(); today.setHours(0, 0, 0, 0);
    const parseLocal = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
    const localStr   = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    // Full journey range when dates are set; fall back to 90-day rolling window
    let fromDate, toDate;
    if (startDateStr && targetDateStr) {
      fromDate = parseLocal(startDateStr);
      toDate   = parseLocal(targetDateStr);
    } else {
      const ninetyAgo = new Date(today.getTime() - 90 * 24 * 3600 * 1000);
      fromDate = logs.length > 0
        ? new Date(Math.max(parseLocal(logs[0].date).getTime(), ninetyAgo.getTime()))
        : today;
      toDate = today;
    }

    const logMap = {};
    logs.forEach(l => { logMap[l.date] = l.weight; });

    // labels + trajectory only depend on the date range and start/target weights.
    // Cache them so theme toggles (which trigger render()) don't rebuild a year of points.
    const cacheKey = `${localStr(fromDate)}|${localStr(toDate)}|${start}|${target}`;
    let labels, trajectory;
    if (this._rangeCache && this._rangeCache.key === cacheKey) {
      labels     = this._rangeCache.labels;
      trajectory = this._rangeCache.trajectory;
    } else {
      labels     = [];
      trajectory = [];
      const totalMs = toDate.getTime() - fromDate.getTime();
      for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
        const dateStr  = localStr(d);
        const progress = totalMs > 0 ? (d.getTime() - fromDate.getTime()) / totalMs : 0;
        labels.push(dateStr);
        trajectory.push(parseFloat((start + (target - start) * Math.min(progress, 1)).toFixed(2)));
      }
      this._rangeCache = { key: cacheKey, labels, trajectory };
    }

    const actualData = labels.map(dateStr =>
      logMap[dateStr] !== undefined ? logMap[dateStr] : null
    );

    const allW = logs.map(l => l.weight).concat([start, target]).filter(w => !isNaN(w));
    const minY = allW.length > 0 ? Math.floor(Math.min(...allW) - 2) : target - 2;
    const maxY = allW.length > 0 ? Math.ceil(Math.max(...allW) + 2)  : start + 2;

    const todayStr = localStr(today);

    // Inline plugin: draws a vertical "Today" marker on the chart
    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const idx = labels.indexOf(todayStr);
        if (idx < 0) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data[idx]) return;
        const x = meta.data[idx].x;
        const { ctx: c, chartArea: { top, bottom } } = chart;
        c.save();
        c.beginPath();
        c.moveTo(x, top);
        c.lineTo(x, bottom);
        c.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
        c.lineWidth = 1.5;
        c.setLineDash([4, 4]);
        c.stroke();
        c.restore();
      }
    };

    const ctx = document.getElementById('weightChart').getContext('2d');
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    this._chart = new Chart(ctx, {
      type: 'line',
      plugins: [todayLinePlugin],
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
            label: 'Target Trajectory',
            data: trajectory,
            borderColor: isDark ? 'rgba(255,210,80,0.45)' : 'rgba(180,100,0,0.35)',
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
                const lbl = items[0].label;
                const [y, m, d] = lbl.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
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
              maxTicksLimit: 7,
              maxRotation: 0,
              callback: function(val) {
                const lbl = this.getLabelForValue(val);
                const [y, m, d] = lbl.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
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
      const [ey, em, ed] = entry.date.split('-').map(Number);
      const d = new Date(ey, em - 1, ed);
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      pill.textContent = label + ' ';
      const strong = document.createElement('strong');
      strong.textContent = entry.weight + ' kg';
      pill.appendChild(strong);
      container.appendChild(pill);
    });
  },
};
