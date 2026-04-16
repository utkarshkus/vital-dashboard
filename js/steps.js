// steps.js — Step ring tracker (step target stored server-side via Config)

const StepTracker = {
  _steps: 0,

  init() {
    const manual = Config.get('manualSteps');
    if (manual !== null && manual !== undefined) this._steps = manual;
    this._bindUI();
    this.render();
  },

  _bindUI() {
    document.getElementById('manualStepsBtn').addEventListener('click', function() {
      const wrap = document.getElementById('manualStepsWrap');
      wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('manualStepsSave').addEventListener('click', async function() {
      const val = parseInt(document.getElementById('manualStepsInput').value, 10);
      if (!isNaN(val) && val >= 0) {
        StepTracker._steps = val;
        // Persists to Netlify Blobs via Config
        await Config.set('manualSteps', val);
        document.getElementById('manualStepsWrap').style.display = 'none';
        StepTracker.render();
      }
    });
  },

  update(steps) {
    this._steps = steps;
    this.render();
  },

  render() {
    const target = parseInt(Config.get('stepTarget') || 10000, 10);
    const steps  = this._steps;
    const pct    = Math.min(steps / target, 1);
    const circumference = 2 * Math.PI * 80; // r=80 → 502.65
    const offset = circumference * (1 - pct);

    const ringFill = document.getElementById('stepRingFill');
    ringFill.style.strokeDashoffset = offset.toFixed(1);

    document.getElementById('stepCount').textContent         = steps.toLocaleString();
    document.getElementById('stepTargetDisplay').textContent = target.toLocaleString();
    document.getElementById('stepRemaining').textContent     = Math.max(0, target - steps).toLocaleString();
    document.getElementById('stepPct').textContent           = Math.round(pct * 100) + '%';

    const color = pct >= 1 ? '#a0f0b0' : pct >= 0.5 ? '#f0c070' : '#68d9e0';
    ringFill.style.stroke = color;
  },
};
