// caffeine.js — Two-phase PK model grounded in NIH/NAS study:
// "Pharmacology of Caffeine", Institute of Medicine (2001), NBK223808
//
// Model: One-compartment open model with first-order absorption and elimination.
// This matches the study's statement: "elimination is by first-order kinetics and
// is adequately described by a one-compartment open model system."
//
// Parameters sourced directly from NBK223808:
//   ka  : absorption rate constant
//         → 99% absorbed within 45 min ⟹ ka = -ln(0.01)/0.75h ≈ 6.14 h⁻¹
//         → Peak plasma at 15–120 min (tmax ~ 45 min typical fasted)
//   ke  : elimination rate constant
//         → Mean half-life 5h ⟹ ke = ln(2)/5 = 0.1386 h⁻¹
//         → Range 1.5–9.5h accounted for via user profile modifier
//   Vd  : volume of distribution = 0.7 L/kg (from study)
//   CL  : total plasma clearance = 0.078 L/h/kg (from study)
//
// Paraxanthine overlay:
//   The study states 75–80% of caffeine converts to paraxanthine via CYP1A2,
//   and paraxanthine is "an equipotent adenosine antagonist to caffeine in vitro."
//   Paraxanthine peaks ~300 min after dose and has its own half-life (~8.5h).
//   After 8–10h, paraxanthine levels exceed caffeine — so total effective
//   stimulant load = caffeine(t) + weighted paraxanthine(t).
//   We show both curves to reflect true pharmacological activity.
//
// Half-life modifiers (from study):
//   Oral contraceptives → doubles half-life (Abernethy & Todd, 1985)
//   Smoking             → accelerates clearance (Parsons & Neims, 1978)
//   Pregnancy           → slows clearance

// ─── PK Constants (NBK223808) ────────────────────────────────
const PK = {
  // Absorption: 99% absorbed in 45 min → ka = -ln(0.01)/0.75
  ka: 6.14,          // h⁻¹  absorption rate constant
  // Elimination: mean half-life 5h
  ke_base: 0.1386,   // h⁻¹  ln(2)/5
  // Paraxanthine: ~75% conversion, peaks at 300 min, half-life ~8.5h
  f_px: 0.77,        // fraction converted to paraxanthine
  ke_px: 0.0816,     // h⁻¹  ln(2)/8.5 — paraxanthine elimination
  ka_px: 0.231,      // h⁻¹  absorption of paraxanthine (peaks ~300 min)
  // Pharmacological weight of paraxanthine vs caffeine
  // Study: "equipotent antagonist at adenosine receptors"
  // but at single doses, caffeine dominates; with repeated dosing paraxanthine matters
  px_weight: 0.6,    // conservative weighting for effective load calculation
};

// Half-life modifiers from study
const HL_MODIFIERS = {
  default:      1.0,
  smoker:       0.65,   // faster clearance
  contraceptive:2.0,    // doubles half-life
  pregnant:     3.0,    // ~3× slower (3rd trimester)
};

// ─── State ───────────────────────────────────────────────────
const CaffeineTracker = {
  _doses:    [],   // [{ time: string (ISO), mg: Number, label: String }]
  _chart:    null,
  _modifier: 1.0,  // half-life modifier from user profile

  // Called after Config.init() has resolved — data already loaded from server
  init() {
    // Doses come from server via Config; convert ISO strings back to Date objects
    const rawDoses = Config.get('caffeineDoses') || [];
    this._doses = rawDoses.map(function(d) {
      return { mg: d.mg, label: d.label, time: new Date(d.time) };
    });

    const profile = Config.get('caffeineProfile') || 'default';
    this._modifier = HL_MODIFIERS[profile] || 1.0;

    this._bindButtons();
    this.render();
  },

  _bindButtons() {
    document.getElementById('logCoffee').addEventListener('click',       () => this.log(80,  'Espresso'));
    document.getElementById('logCoffeeFilter').addEventListener('click', () => this.log(120, 'Filter coffee'));
    document.getElementById('logTea').addEventListener('click',          () => this.log(40,  'Tea'));
    document.getElementById('clearCaffeine').addEventListener('click',   () => this.clear());

    // Profile selector — persisted server-side
    const sel = document.getElementById('caffeineProfile');
    if (sel) {
      sel.value = Config.get('caffeineProfile') || 'default';
      sel.addEventListener('change', async () => {
        const val = sel.value;
        this._modifier = HL_MODIFIERS[val] || 1.0;
        await Config.set('caffeineProfile', val);
        this.render();
      });
    }
  },

  async log(mg, label) {
    this._doses.push({ time: new Date(), mg, label });
    await this._save();
    this.render();
  },

  async remove(idx) {
    this._doses.splice(idx, 1);
    await this._save();
    this.render();
  },

  async clear() {
    this._doses = [];
    await this._save();
    this.render();
  },

  // Persist doses to Netlify Blobs via Config.
  // Dates are serialised to ISO strings (JSON-safe); init() deserialises them back.
  async _save() {
    const serialised = this._doses.map(function(d) {
      return { mg: d.mg, label: d.label, time: d.time instanceof Date ? d.time.toISOString() : d.time };
    });
    await Config.set('caffeineDoses', serialised);
  },

  // ─── Core PK equations ───────────────────────────────────
  // One-compartment model, first-order absorption + elimination:
  //   C(t) = (F·D·ka) / (Vd·(ka - ke)) × (e^(-ke·t) - e^(-ka·t))
  //
  // Simplified to mg units (Vd·weight cancels into a scalar):
  //   caffeine_mg(t) = D × ka/(ka-ke) × (e^(-ke·t) - e^(-ka·t))
  //
  // We normalise so that peak ≈ D (dose in mg), matching clinical expectation.

  _caffeineAt(dose_mg, t_hours) {
    if (t_hours <= 0) return 0;
    const ke = PK.ke_base / this._modifier;
    const ka = PK.ka;  // absorption not significantly affected by the modifier factors
    if (Math.abs(ka - ke) < 1e-6) {
      // Edge case: ka ≈ ke → use limit form
      return dose_mg * ka * t_hours * Math.exp(-ke * t_hours);
    }
    const raw = (ka / (ka - ke)) * (Math.exp(-ke * t_hours) - Math.exp(-ka * t_hours));
    return dose_mg * Math.max(0, raw);
  },

  // Paraxanthine concentration from a single caffeine dose.
  // Modelled as a delayed-peak curve; peak at ~300 min (5h) after caffeine dose.
  // Study: paraxanthine "peaks at 300 minutes after an oral dose."
  _paraxanthineAt(dose_mg, t_hours) {
    if (t_hours <= 0) return 0;
    const ke_px = PK.ke_px;
    const ka_px = PK.ka_px;
    const px_dose = dose_mg * PK.f_px;
    if (Math.abs(ka_px - ke_px) < 1e-6) return 0;
    const raw = (ka_px / (ka_px - ke_px)) * (Math.exp(-ke_px * t_hours) - Math.exp(-ka_px * t_hours));
    return px_dose * Math.max(0, raw);
  },

  // Total caffeine-equivalent load at time t (Date object)
  _totalAt(t) {
    return this._doses.reduce((sum, d) => {
      const h = (t - d.time) / 3600000;
      if (h < 0) return sum;
      const caff = this._caffeineAt(d.mg, h);
      const px   = this._paraxanthineAt(d.mg, h) * PK.px_weight;
      return sum + caff + px;
    }, 0);
  },

  // Caffeine-only curve (for rendering as separate line)
  _caffeineOnlyAt(t) {
    return this._doses.reduce((sum, d) => {
      const h = (t - d.time) / 3600000;
      if (h < 0) return sum;
      return sum + this._caffeineAt(d.mg, h);
    }, 0);
  },

  // Paraxanthine-only curve
  _paraxanthineOnlyAt(t) {
    return this._doses.reduce((sum, d) => {
      const h = (t - d.time) / 3600000;
      if (h < 0) return sum;
      return sum + this._paraxanthineAt(d.mg, h) * PK.px_weight;
    }, 0);
  },

  // ─── Curve builder ───────────────────────────────────────
  _buildCurve() {
    const now      = new Date();
    // Prefer actual WHOOP wake time if available, fall back to configured
    const wakeStr  = window._whoopWakeTime || Config.get('wakeTime')  || '06:30';
    const sleepStr = Config.get('sleepTime') || '22:30';

    const parseTime = (str, base) => {
      const [h, m] = str.split(':').map(Number);
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      return d;
    };

    const wake  = parseTime(wakeStr, now);
    const sleep = parseTime(sleepStr, now);
    if (sleep <= wake) sleep.setDate(sleep.getDate() + 1);

    // Extend end 2h past sleep to show residual load at bedtime
    const end  = new Date(sleep.getTime() + 2 * 3600000);
    const step = 10 * 60000; // 10-minute resolution (finer than before)

    const caffPoints = [];
    const pxPoints   = [];
    const totalPoints = [];
    const labels     = [];

    for (let ts = wake.getTime(); ts <= end.getTime(); ts += step) {
      const t = new Date(ts);
      const caff  = Math.max(0, this._caffeineOnlyAt(t));
      const px    = Math.max(0, this._paraxanthineOnlyAt(t));
      const total = Math.max(0, caff + px);
      caffPoints.push(parseFloat(caff.toFixed(1)));
      pxPoints.push(parseFloat(px.toFixed(1)));
      totalPoints.push(parseFloat(total.toFixed(1)));
      labels.push(t.getMinutes() === 0
        ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '');
    }

    return { caffPoints, pxPoints, totalPoints, labels, wake, sleep, now, step };
  },

  // ─── Render ──────────────────────────────────────────────
  render() {
    const { caffPoints, pxPoints, totalPoints, labels, wake, sleep, now, step } = this._buildCurve();

    const nowIdx   = Math.max(0, Math.round((now   - wake) / step));
    const sleepIdx = Math.max(0, Math.round((sleep - wake) / step));

    const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

    // Effective half-life
    const ke = PK.ke_base / this._modifier;
    const effectiveHL = Math.LN2 / ke;

    // Current total load
    const currCaff  = Math.round(this._caffeineOnlyAt(now));
    const currPx    = Math.round(this._paraxanthineOnlyAt(now));
    const currTotal = currCaff + currPx;

    // ── New design elements ──────────────────────────────

    const THRESHOLD_MG = 40;
    const REF_DOSE_MG  = 200;
    const fmtT = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Clear-by time: scan forward until total drops below threshold
    let clearByTime = null;
    if (this._doses.length > 0) {
      const scanEnd = new Date(now.getTime() + 30 * 3600000);
      for (let t = new Date(now.getTime() + 15 * 60000); t <= scanEnd; t = new Date(t.getTime() + 15 * 60000)) {
        if (this._totalAt(t) < THRESHOLD_MG) { clearByTime = t; break; }
      }
    }

    // Cutoff time: last safe single dose (REF_DOSE_MG) before bedtime
    const cutoffOffset = 0.75 + effectiveHL * Math.log2(REF_DOSE_MG / THRESHOLD_MG);
    const cutoffDate   = new Date(sleep.getTime() - cutoffOffset * 3600000);

    // First dose (earliest logged)
    const firstDose = this._doses.length > 0
      ? this._doses.reduce((min, d) => d.time < min.time ? d : min, this._doses[0])
      : null;

    // Phase label + dot color
    let phaseLabel, phaseDotColor;
    if (!firstDose) {
      phaseLabel    = 'No caffeine';
      phaseDotColor = 'var(--text3)';
    } else {
      const hSince = (now - firstDose.time) / 3600000;
      if (hSince < 0) {
        phaseLabel = 'Pre-dose'; phaseDotColor = 'var(--text3)';
      } else if (hSince < 0.75) {
        phaseLabel = 'Onset'; phaseDotColor = 'var(--warn)';
      } else if (hSince < effectiveHL * 1.5 && currTotal > THRESHOLD_MG) {
        phaseLabel = 'Peak focus'; phaseDotColor = 'var(--accent2)';
      } else if (currTotal > THRESHOLD_MG) {
        phaseLabel = 'Clearance'; phaseDotColor = 'var(--danger)';
      } else {
        phaseLabel = 'Cleared'; phaseDotColor = 'var(--text3)';
      }
    }

    // Update phase pill
    const phLabelEl = document.getElementById('caffPhaseLabel');
    const phDotEl   = document.getElementById('caffPhaseDot');
    if (phLabelEl) phLabelEl.textContent = phaseLabel;
    if (phDotEl)   phDotEl.style.background = phaseDotColor;

    // Update readout
    const currEl   = document.getElementById('caffCurrent');
    const hlEl     = document.getElementById('caffHalfLife');
    const clearByEl = document.getElementById('caffClearBy');
    if (currEl)    currEl.textContent    = currTotal;
    if (hlEl)      hlEl.textContent      = effectiveHL.toFixed(1);
    if (clearByEl) {
      clearByEl.textContent = clearByTime
        ? fmtT(clearByTime)
        : (this._doses.length > 0 ? '> 30h' : '—');
    }

    // Phase bar
    const barEl     = document.getElementById('caffBar');
    const nowMarkEl = document.getElementById('caffNowMark');
    const daySpan   = sleep - wake;
    const wakePct   = (d) => Math.max(0, Math.min(100, ((d - wake) / daySpan) * 100));

    if (barEl && nowMarkEl) {
      nowMarkEl.style.left = wakePct(now).toFixed(1) + '%';
      if (firstDose) {
        const peakStart = new Date(firstDose.time.getTime() + 0.75 * 3600000);
        const peakEnd   = new Date(firstDose.time.getTime() + effectiveHL * 1.5 * 3600000);
        const clrEnd    = clearByTime || sleep;
        const os = wakePct(firstDose.time).toFixed(1);
        const ps = wakePct(peakStart).toFixed(1);
        const pe = wakePct(peakEnd).toFixed(1);
        const ce = wakePct(clrEnd).toFixed(1);
        barEl.style.background = [
          `linear-gradient(90deg,`,
          `var(--surface2) 0%,`,
          `var(--surface2) ${os}%,`,
          `var(--warn) ${os}%,`,
          `var(--warn) ${ps}%,`,
          `var(--accent2) ${ps}%,`,
          `var(--accent2) ${pe}%,`,
          `var(--danger) ${pe}%,`,
          `var(--danger) ${ce}%,`,
          `var(--surface2) ${ce}%,`,
          `var(--surface2) 100%)`
        ].join(' ');
      } else {
        barEl.style.background = 'var(--surface2)';
      }
    }

    // Tick labels
    const tickWake  = document.getElementById('caffTickWake');
    const tickOnset = document.getElementById('caffTickOnset');
    const tickPeak  = document.getElementById('caffTickPeak');
    const tickClear = document.getElementById('caffTickClear');
    const tickBed   = document.getElementById('caffTickBed');
    if (tickWake)  tickWake.textContent  = fmtT(wake);
    if (tickBed)   tickBed.textContent   = fmtT(sleep);
    if (firstDose) {
      const peakEnd = new Date(firstDose.time.getTime() + effectiveHL * 1.5 * 3600000);
      if (tickOnset) tickOnset.textContent = fmtT(firstDose.time);
      if (tickPeak)  tickPeak.textContent  = fmtT(peakEnd);
      if (tickClear) tickClear.textContent = clearByTime ? fmtT(clearByTime) : '—';
    } else {
      if (tickOnset) tickOnset.textContent = '—';
      if (tickPeak)  tickPeak.textContent  = '—';
      if (tickClear) tickClear.textContent = '—';
    }

    // Footer cutoff
    const cutoffEl = document.getElementById('caffCutoff');
    if (cutoffEl) {
      cutoffEl.textContent = cutoffDate > now ? fmtT(cutoffDate) : 'past';
    }

    // ── Chart.js ─────────────────────────────────────────

    const annotations = [];
    if (sleepIdx > 0 && sleepIdx < labels.length) {
      annotations.push({ idx: sleepIdx, label: 'Sleep target', color: isDark ? '#68d9e0' : '#0e8090' });
    }
    if (nowIdx > 0 && nowIdx < labels.length) {
      annotations.push({ idx: nowIdx, label: 'Now', color: isDark ? '#a0f0b0' : '#1a9e50' });
    }

    const ctx = document.getElementById('caffeineChart').getContext('2d');
    if (this._chart) { this._chart.destroy(); this._chart = null; }

    const verticalLinePlugin = {
      id: 'vertLines',
      afterDraw(chart) {
        const { ctx, scales, chartArea } = chart;
        annotations.forEach(function(ann) {
          const x = scales.x.getPixelForValue(ann.idx);
          if (x < chartArea.left || x > chartArea.right) return;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ann.color;
          ctx.font = '9px DM Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ann.label, x, chartArea.top + 11);
          ctx.restore();
        });
      }
    };

    this._chart = new Chart(ctx, {
      type: 'line',
      plugins: [verticalLinePlugin],
      data: {
        labels: labels,
        datasets: [
          {
            // Stacked area: paraxanthine (bottom layer)
            label: 'Paraxanthine (effective)',
            data: pxPoints,
            borderColor: isDark ? 'rgba(180,140,240,0.7)' : 'rgba(120,80,200,0.6)',
            backgroundColor: isDark ? 'rgba(180,140,240,0.15)' : 'rgba(120,80,200,0.08)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: true,
            tension: 0.4,
            order: 2,
          },
          {
            // Caffeine curve (top layer)
            label: 'Caffeine',
            data: caffPoints,
            borderColor: isDark ? '#f0c070' : '#b07000',
            backgroundColor: isDark ? 'rgba(240,192,112,0.18)' : 'rgba(176,112,0,0.08)',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: true,
            tension: 0.4,
            order: 1,
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(items) { return items[0].label || ''; },
              label: function(item) {
                const name = item.datasetIndex === 0 ? 'Paraxanthine-eq' : 'Caffeine';
                return name + ': ' + Math.round(item.parsed.y) + 'mg';
              },
              afterBody: function(items) {
                const caff = items.find(function(i) { return i.datasetIndex === 1; });
                const px   = items.find(function(i) { return i.datasetIndex === 0; });
                if (caff && px) {
                  const total = Math.round(caff.parsed.y + px.parsed.y);
                  return ['─────────', 'Total load: ' + total + 'mg-eq'];
                }
                return [];
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
            grid: { color: gridColor },
            border: { display: false },
          },
          y: {
            min: 0,
            ticks: {
              color: textColor,
              font: { size: 9, family: 'DM Mono' },
              callback: function(v) { return v + 'mg'; },
            },
            grid: { color: gridColor },
            border: { display: false },
            title: {
              display: true,
              text: 'effective load (mg-eq)',
              color: textColor,
              font: { size: 8, family: 'DM Mono' },
            }
          }
        }
      }
    });

    this._renderLog(effectiveHL.toFixed(1));
  },

  _renderLog(effectiveHL) {
    const container = document.getElementById('caffeineLog');
    container.innerHTML = '';

    // Show PK footnote
    if (this._doses.length > 0) {
      const note = document.createElement('div');
      note.className = 'caffeine-pk-note';
      note.textContent = 'Model: 1-compartment, first-order kinetics (NBK223808). t½ caffeine: ' +
        effectiveHL + 'h  |  75–77% → paraxanthine (t½ ~8.5h)';
      container.appendChild(note);
    }

    this._doses.forEach(function(d, i) {
      const pill = document.createElement('div');
      pill.className = 'caffeine-pill';
      const timeStr = d.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      pill.innerHTML = d.label + ' ' + d.mg + 'mg @ ' + timeStr +
        ' <button onclick="CaffeineTracker.remove(' + i + ')">✕</button>';
      container.appendChild(pill);
    });
  },
};
