// Login and first-time setup page logic.
(function () {
  var loginForm  = document.getElementById('loginForm');
  var setupForm  = document.getElementById('setupForm');

  // Check if first-time setup is needed
  fetch('/api/setup')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.needsSetup) {
        loginForm.style.display = 'none';
        setupForm.style.display = '';
      }
    })
    .catch(function () {});

  function showError(elId, msg) {
    var el = document.getElementById(elId);
    el.textContent = msg;
    el.classList.add('visible');
  }
  function clearError(elId) {
    document.getElementById(elId).classList.remove('visible');
  }

  // ── Login ────────────────────────────────────────────────────
  document.getElementById('loginBtn').addEventListener('click', function () {
    clearError('loginError');
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;
    if (!username || !password) { showError('loginError', 'Username and password required.'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          window.location.replace('/');
        } else {
          showError('loginError', res.data.error || 'Login failed.');
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      })
      .catch(function () {
        showError('loginError', 'Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      });
  });

  document.getElementById('password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });

  // ── Setup ────────────────────────────────────────────────────
  document.getElementById('setupBtn').addEventListener('click', function () {
    clearError('setupError');
    var username = document.getElementById('setupUsername').value.trim();
    var password = document.getElementById('setupPassword').value;
    var confirm  = document.getElementById('setupConfirm').value;

    if (!username || !password)    { showError('setupError', 'Username and password required.'); return; }
    if (password !== confirm)      { showError('setupError', 'Passwords do not match.'); return; }
    if (password.length < 8)       { showError('setupError', 'Password must be at least 8 characters.'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          window.location.replace('/');
        } else {
          showError('setupError', res.data.error || 'Setup failed.');
          btn.disabled = false;
          btn.textContent = 'Create account';
        }
      })
      .catch(function () {
        showError('setupError', 'Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Create account';
      });
  });

  document.getElementById('setupConfirm').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('setupBtn').click();
  });
})();
