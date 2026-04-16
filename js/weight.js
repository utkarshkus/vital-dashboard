// weight.js — Weight journey chart

const WeightTracker = {
  _chart: null,

  render() {
    const start = parseFloat(Config.get('startWeight'));
    const current = parseFloat(Config.get('currentWeight'));
    const target = parseFloat(Config.get('targetWeight'));

    if (isNaN(start) || isNaN(target)) {
      document.getElementById('wStart').textContent = '—';
      document.getElementById('wNow').textContent = '—';
      document.getElementById('wTarget').textContent = '—';
      document.getElementById('weightBadge').textContent = 'Setup needed';
      return;
    }

    const curr = isNaN(current) ? start : current;
    const lost = parseFloat((start - curr).toFixed(1));
    const toGo = parseFloat((curr - target).toFixed(1));
    const totalDrop = start - target;
    const pct = totalDrop > 0 ? Math.round(((start - curr) / totalDrop) * 100) : 0;

    document.getElementById('wStart').textContent = `${start} kg`;
    document.getElementById('wNow').textContent = `${curr} kg`;
    document.getElementById('wTarget').textContent = `${target} kg`;
    document.getElementById('weightBadge').textContent = `${lost > 0 ? '↓' : ''}${Math.abs(lost)} kg lost`;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

    // Build a simple projected line: start → current (actual) → target (projected)
    // We simulate ~weekly data points assuming linear progress
    const weeks = 16;
    const labels = [];
    const actual = [];
    const projected = [];

    for (let i = 0; i <= weeks; i++) {
      labels.push(`W${i}`);
      const fraction = i / weeks;
      const projected_weight = parseFloat((start - (start - target) * fraction).toFixed(1));
      projected.push(projected_weight);
    }

    // Current is at the appropriate week index based on lost weight
    const currWeek = Math.round(((start - curr) / (start - target || 1)) * weeks);
    for (let i = 0; i <= currWeek; i++) {
      actual.push(start - (start - curr) * (i / Math.max(currWeek, 1)));
    }

    const ctx = document.getElementById('weightChart').getContext('2d');
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    // Current marker
    const currentPointPlugin = {
      id: 'currentMarker',
      afterDraw(chart) {
        const ds0 = chart.getDatasetMeta(0);
        if (!ds0.data.length) return;
        const last = ds0.data[ds0.data.length - 1];
        const { ctx } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? '#a0f0b0' : '#1a9e50';
        ctx.fill();
        ctx.strokeStyle = isDark ? '#161820' : '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    };

    this._chart = new Chart(ctx, {
      type: 'line',
      plugins: [currentPointPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Actual',
            data: actual,
            borderColor: isDark ? '#a0f0b0' : '#1a9e50',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'Target trajectory',
            data: projected,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [5, 5],
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y.toFixed(1)} kg`,
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              maxTicksLimit: 8,
            },
            grid: { color: gridColor },
            border: { display: false },
          },
          y: {
            min: parseFloat((target - 1).toFixed(0)),
            max: parseFloat((start + 0.5).toFixed(0)),
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              callback: v => `${v}kg`,
            },
            grid: { color: gridColor },
            border: { display: false },
          }
        }
      }
    });
  }
};
