// config.js — all user data stored server-side via Netlify Blobs
//
// SERVER fields (/.netlify/functions/config-get|set):
//   startWeight, currentWeight, targetWeight, stepTarget, manualSteps,
//   wakeTime, sleepTime, caffeineProfile, caffeineDoses
//
// localStorage is used ONLY as an offline cache — never as primary storage.
// Theme stays local-only (it's a visual preference with no sync value).

const SERVER_KEYS = new Set([
  'startWeight',
  'currentWeight',
  'targetWeight',
  'stepTarget',
  'manualSteps',
  'wakeTime',
  'sleepTime',
  'caffeineProfile',
  'caffeineDoses',   // array — managed by CaffeineTracker
]);

const DEFAULTS = {
  startWeight:    null,
  currentWeight:  null,
  targetWeight:   null,
  stepTarget:     10000,
  manualSteps:    null,
  wakeTime:       '06:30',
  sleepTime:      '22:30',
  caffeineProfile:'default',
  caffeineDoses:  [],
};

const Config = {
  _data: { ...DEFAULTS },
  _serverLoaded: false,

  // ─── Fetch all server fields ────────────────────────────────
  async _loadServer() {
    try {
      const res = await fetch('/.netlify/functions/config-get');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      for (const [k, v] of Object.entries(data)) {
        if (SERVER_KEYS.has(k) && v !== undefined && v !== null) {
          this._data[k] = v;
        }
      }
      this._serverLoaded = true;
      // Refresh offline cache
      localStorage.setItem('vital_server_cache', JSON.stringify(this._data));
    } catch (err) {
      console.warn('Config: server unreachable, using offline cache.', err.message);
      try {
        const cache = JSON.parse(localStorage.getItem('vital_server_cache') || '{}');
        for (const [k, v] of Object.entries(cache)) {
          if (SERVER_KEYS.has(k) && v !== null && v !== undefined) this._data[k] = v;
        }
      } catch { /* no cache — use DEFAULTS */ }
    }
  },

  // ─── Public init — await this before rendering tiles ────────
  async init() {
    await this._loadServer();
    return this;
  },

  // ─── Read a value ───────────────────────────────────────────
  get(key) {
    const val = this._data[key];
    if (val === undefined || val === null) return DEFAULTS[key] ?? null;
    return val;
  },

  // ─── Save a batch of fields to Blobs ────────────────────────
  async saveAll(obj) {
    this._data = { ...this._data, ...obj };

    const payload = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SERVER_KEYS.has(k)) payload[k] = v;
    }

    try {
      const res = await fetch('/.netlify/functions/config-set', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      // Keep cache fresh
      localStorage.setItem('vital_server_cache', JSON.stringify(this._data));
      return { ok: true };
    } catch (err) {
      console.error('Config: server save failed:', err.message);
      // Cache the intended state so nothing is lost offline
      localStorage.setItem('vital_server_cache', JSON.stringify({ ...this._data, ...payload }));
      return { ok: false, error: err.message };
    }
  },

  // ─── Save a single field ────────────────────────────────────
  async set(key, value) {
    return this.saveAll({ [key]: value });
  },
};
