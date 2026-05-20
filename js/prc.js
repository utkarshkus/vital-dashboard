// prc.js — WHOOP Phase Response Curve widget.
// Derives circadian zones from WHOOP sleep midpoint and draws a 24h clock.

const PRC = (function() {

  // ─── Constants ──────────────────────────────────────────────
  const COLORS = {
    delay:   '#7c3aed',
    minima:  '#ef4444',
    advance: '#3b82f6',
    dead:    '#14b8a6',
  };

  const CX = 120, CY = 120;
  const R_ARC = 92;            // radius of zone arcs
  const R_POINTER_INNER = 60;  // pointer starts here (outside the center readouts)
  const R_POINTER_OUTER = 100; // pointer ends just outside the arc ring
  const SHIFT_THRESHOLD_MIN = 45;

  // Demo fallback: sleep 23:30 → 07:00
  const DEMO_SLEEP_START = '23:30';
  const DEMO_SLEEP_END   = '07:00';

  // ─── State ──────────────────────────────────────────────────
  let lastZones = null;
  let lastSource = 'demo';     // 'whoop' | 'demo'
  let pointerTimer = null;
  let activeTooltip = null;    // 'delay' | 'advance' | 'dead' | null

  // ─── Geometry helpers ───────────────────────────────────────
  function hourToAngleRad(h) {
    // 0:00 at top (-90°); clockwise positive.
    return ((h / 24) * 360 - 90) * Math.PI / 180;
  }
  function pointAt(h, r) {
    const a = hourToAngleRad(h);
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }
  function arcPath(hStart, hEnd, r) {
    let span = hEnd - hStart;
    while (span <= 0) span += 24;
    while (span > 24) span -= 24;
    const largeArc = span > 12 ? 1 : 0;
    const p1 = pointAt(hStart, r);
    const p2 = pointAt(hEnd, r);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  function dateToHour(d) {
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }
  function fmtClock(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function fmtHHMMSS(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function inHourRange(h, startH, endH) {
    if (startH < endH) return h >= startH && h < endH;
    return h >= startH || h < endH;
  }
  function arcMidHour(startH, endH) {
    let span = endH - startH;
    while (span <= 0) span += 24;
    let mid = startH + span / 2;
    while (mid >= 24) mid -= 24;
    return mid;
  }
  // Smallest circular distance in minutes between two hour-of-day values.
  function modMinutes(a, b) {
    let d = Math.abs(a - b);
    if (d > 12) d = 24 - d;
    return d * 60;
  }

  // ─── Compute zones from sleep window ────────────────────────
  function buildZones(sleepStart, sleepEnd) {
    const midpoint = new Date((sleepStart.getTime() + sleepEnd.getTime()) / 2);
    const T0 = new Date(midpoint.getTime() - 2 * 3600000);
    const off = h => new Date(T0.getTime() + h * 3600000);

    const make = (name, key, color, oStart, oEnd) => {
      const sd = off(oStart), ed = off(oEnd);
      return {
        name, key, color,
        startDate: sd, endDate: ed,
        startHour: dateToHour(sd),
        endHour:   dateToHour(ed),
      };
    };

    return {
      sleepStart, sleepEnd, midpoint, T0,
      minimaDate: off(2),
      minimaHour: dateToHour(off(2)),
      wakeDate:   sleepEnd,
      zones: [
        make('Phase Delay',   'delay',   COLORS.delay,   -4,  2),
        make('Phase Advance', 'advance', COLORS.advance,  4, 10),
        make('Dead Zone',     'dead',    COLORS.dead,    10, 20),
      ],
    };
  }

  function findCurrentZone(zones, nowHour) {
    for (const z of zones.zones) {
      if (inHourRange(nowHour, z.startHour, z.endHour)) return z;
    }
    return null;
  }

  // Next zone boundary (whether end of current, or start of next) as a Date.
  function nextEndDate(zones, now) {
    const nowH = dateToHour(now);
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    const cur = findCurrentZone(zones, nowH);
    let targetHour, label;
    if (cur) {
      targetHour = cur.endHour;
      label = cur.name + ' ends in';
    } else {
      // In minima gap → next event is Phase Advance start.
      const advance = zones.zones.find(z => z.key === 'advance');
      targetHour = advance.startHour;
      label = 'Phase Advance in';
    }

    const end = new Date(today);
    end.setHours(0, 0, 0, 0);
    end.setMilliseconds(targetHour * 3600000);
    if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
    return { date: end, label, currentZone: cur };
  }

  // ─── Shift-detection (localStorage) ─────────────────────────
  function checkShift(t0HourToday) {
    const todayStr = new Date().toISOString().slice(0, 10);
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('prc_t0_history') || 'null'); } catch (_) {}

    let shifted = false;
    if (stored && Array.isArray(stored)) {
      const prior = stored.find(e => e.date !== todayStr);
      if (prior && typeof prior.t0 === 'number') {
        shifted = modMinutes(t0HourToday, prior.t0) > SHIFT_THRESHOLD_MIN;
      }
      const todayEntry = stored.find(e => e.date === todayStr);
      if (todayEntry && typeof todayEntry.shifted === 'boolean') shifted = todayEntry.shifted;
    }

    // Persist: keep today and the most recent prior day.
    const history = stored && Array.isArray(stored) ? stored.slice() : [];
    const todayIdx = history.findIndex(e => e.date === todayStr);
    if (todayIdx >= 0) {
      history[todayIdx] = { date: todayStr, t0: t0HourToday, shifted };
    } else {
      history.unshift({ date: todayStr, t0: t0HourToday, shifted });
    }
    const trimmed = history.slice(0, 2);
    try { localStorage.setItem('prc_t0_history', JSON.stringify(trimmed)); } catch (_) {}
    return shifted;
  }

  // ─── DOM rendering ──────────────────────────────────────────
  function render(opts) {
    // opts: { sleep, recovery }
    const sleep = opts && opts.sleep;
    const recovery = opts && opts.recovery;

    // Resolve sleep window.
    let sleepStart, sleepEnd, source, warnShort = false;

    if (sleep && !sleep.nap && sleep.startTime && sleep.endTime) {
      sleepStart = new Date(sleep.startTime);
      sleepEnd   = new Date(sleep.endTime);
      source = 'whoop';
      const hours = (sleepEnd - sleepStart) / 3600000;
      if (hours < 4) warnShort = true;
    } else {
      // Demo: use today's date with hardcoded sleep window.
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [sh, sm] = DEMO_SLEEP_START.split(':').map(Number);
      const [eh, em] = DEMO_SLEEP_END.split(':').map(Number);
      sleepStart = new Date(today); sleepStart.setDate(sleepStart.getDate() - 1);
      sleepStart.setHours(sh, sm, 0, 0);
      sleepEnd = new Date(today); sleepEnd.setHours(eh, em, 0, 0);
      source = 'demo';
    }

    const zones = buildZones(sleepStart, sleepEnd);
    lastZones = zones;
    lastSource = source;

    drawZones(zones);
    populateMeta(zones, recovery, source);

    const shifted = checkShift(dateToHour(zones.T0));
    const badge = document.getElementById('prcShiftBadge');
    if (badge) badge.style.display = (shifted && source === 'whoop') ? '' : 'none';

    const warn = document.getElementById('prcWarning');
    if (warn) warn.style.display = warnShort ? '' : 'none';

    const commentary = document.getElementById('prcCommentary');
    if (commentary) {
      if (source === 'demo') {
        commentary.textContent = 'Demo zones (sleep 23:30 → 07:00). Connect WHOOP to derive your own circadian phase.';
      } else {
        const t0Str = fmtClock(zones.T0);
        commentary.textContent = 'Biological midnight (T₀) at ' + t0Str +
          '. Time light, food, and exercise relative to this anchor to shift or hold phase.';
      }
    }

    startPointer();
  }

  function drawZones(zones) {
    const g = document.getElementById('prcZones');
    if (!g) return;
    g.innerHTML = '';

    const ns = 'http://www.w3.org/2000/svg';

    for (const z of zones.zones) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', arcPath(z.startHour, z.endHour, R_ARC));
      path.setAttribute('class', 'prc-arc prc-arc-' + z.key);
      path.setAttribute('stroke', z.color);
      path.setAttribute('data-zone', z.key);
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label',
        z.name + ': ' + fmtClock(z.startDate) + ' to ' + fmtClock(z.endDate));
      g.appendChild(path);
    }

    // Minima dot
    const mp = pointAt(zones.minimaHour, R_ARC);
    const dot = document.getElementById('prcMinima');
    if (dot) {
      dot.setAttribute('cx', mp.x.toFixed(2));
      dot.setAttribute('cy', mp.y.toFixed(2));
      dot.setAttribute('aria-label', 'Circadian minima at ' + fmtClock(zones.minimaDate));
      dot.style.display = '';
    }

    attachZoneListeners(zones);
  }

  function attachZoneListeners(zones) {
    const paths = document.querySelectorAll('#prcZones path');
    paths.forEach(function(p) {
      const key = p.getAttribute('data-zone');
      const z = zones.zones.find(function(zz) { return zz.key === key; });
      if (!z) return;

      const show = function() { showTooltip(z); };
      const hide = function() { hideTooltip(); };

      p.addEventListener('mouseenter', show);
      p.addEventListener('mouseleave', hide);
      p.addEventListener('focus', show);
      p.addEventListener('blur', hide);
      p.addEventListener('click', function(e) {
        e.stopPropagation();
        if (activeTooltip === z.key) hide(); else show();
      });
    });

    document.addEventListener('click', function(e) {
      if (!activeTooltip) return;
      const wrap = document.getElementById('prcClock');
      if (wrap && !wrap.contains(e.target)) hideTooltip();
    });
  }

  function showTooltip(z) {
    const tip = document.getElementById('prcTooltip');
    if (!tip) return;
    tip.textContent = z.name + ': ' + fmtClock(z.startDate) + ' – ' + fmtClock(z.endDate);
    tip.style.borderColor = z.color;
    tip.style.color = z.color;
    tip.style.display = '';
    activeTooltip = z.key;
  }
  function hideTooltip() {
    const tip = document.getElementById('prcTooltip');
    if (tip) tip.style.display = 'none';
    activeTooltip = null;
  }

  function populateMeta(zones, recovery, source) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('prcWake',     fmtClock(zones.wakeDate));
    set('prcMidsleep', fmtClock(zones.midpoint));
    set('prcT0',       fmtClock(zones.T0));
    if (recovery && typeof recovery.score === 'number') {
      set('prcRecovery', recovery.score + '%');
      const rEl = document.getElementById('prcRecovery');
      if (rEl) {
        rEl.style.color = recovery.score >= 67 ? COLORS.advance
          : recovery.score >= 34 ? '#f0c070'
          : COLORS.minima;
      }
    } else {
      set('prcRecovery', source === 'demo' ? '—' : '—');
      const rEl = document.getElementById('prcRecovery');
      if (rEl) rEl.style.color = '';
    }
  }

  // ─── Pointer + countdown (1Hz tick) ─────────────────────────
  function startPointer() {
    if (pointerTimer) clearInterval(pointerTimer);
    tickPointer();
    pointerTimer = setInterval(tickPointer, 1000);
  }
  function tickPointer() {
    if (!lastZones) return;
    const now = new Date();
    const nowH = dateToHour(now);

    // Pointer line: from inner radius (clear of center text) to just past the arcs.
    const inner = pointAt(nowH, R_POINTER_INNER);
    const outer = pointAt(nowH, R_POINTER_OUTER);
    const ptr = document.getElementById('prcPointer');
    if (ptr) {
      ptr.setAttribute('x1', inner.x.toFixed(2));
      ptr.setAttribute('y1', inner.y.toFixed(2));
      ptr.setAttribute('x2', outer.x.toFixed(2));
      ptr.setAttribute('y2', outer.y.toFixed(2));
    }

    // Triangle marker on current zone's arc, at the "now" position.
    const cur = findCurrentZone(lastZones, nowH);
    const marker = document.getElementById('prcZoneMarker');
    const zoneText = document.getElementById('prcCurrentZone');
    if (marker) {
      if (cur) {
        const mp = pointAt(nowH, R_ARC);
        const tipLen = 7;
        // Triangle pointing inward toward the centre.
        const a = hourToAngleRad(nowH);
        const inX = CX + (R_ARC - tipLen) * Math.cos(a);
        const inY = CY + (R_ARC - tipLen) * Math.sin(a);
        const perp = a + Math.PI / 2;
        const halfBase = 5;
        const bx1 = mp.x + halfBase * Math.cos(perp);
        const by1 = mp.y + halfBase * Math.sin(perp);
        const bx2 = mp.x - halfBase * Math.cos(perp);
        const by2 = mp.y - halfBase * Math.sin(perp);
        marker.setAttribute('points',
          inX.toFixed(2) + ',' + inY.toFixed(2) + ' ' +
          bx1.toFixed(2) + ',' + by1.toFixed(2) + ' ' +
          bx2.toFixed(2) + ',' + by2.toFixed(2));
        marker.setAttribute('fill', cur.color);
        marker.style.display = '';
        if (zoneText) { zoneText.textContent = cur.name; zoneText.setAttribute('fill', cur.color); }
      } else {
        marker.style.display = 'none';
        if (zoneText) { zoneText.textContent = 'Minima gap'; zoneText.setAttribute('fill', COLORS.minima); }
      }
    }

    // Countdown to next boundary.
    const nb = nextEndDate(lastZones, now);
    const countdown = document.getElementById('prcCountdown');
    const label = document.getElementById('prcCenterLabel');
    if (countdown) countdown.textContent = fmtHHMMSS(nb.date - now);
    if (label) label.textContent = cur ? 'ENDS IN' : 'STARTS IN';
  }

  // ─── Modal: science refs ────────────────────────────────────
  function initModal() {
    const btn   = document.getElementById('prcInfoBtn');
    const modal = document.getElementById('prcModal');
    const close = document.getElementById('prcModalClose');
    if (!btn || !modal) return;
    btn.addEventListener('click', function() { modal.classList.add('open'); });
    if (close) close.addEventListener('click', function() { modal.classList.remove('open'); });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // ─── Public ─────────────────────────────────────────────────
  return {
    init: function() {
      initModal();
      // Render demo immediately so the widget never looks empty pre-WHOOP.
      render({ sleep: null, recovery: null });
    },
    render: render,
    // For other modules that already cache sleep/recovery (app.js).
    renderFromCache: function(sleepData, recoveryData) {
      render({ sleep: sleepData, recovery: recoveryData });
    },
  };
})();
