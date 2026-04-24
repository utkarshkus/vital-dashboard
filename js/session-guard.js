// Redirect unauthenticated visitors to /login.html before rendering the dashboard.
(function () {
  var html = document.documentElement;
  html.style.visibility = 'hidden';
  fetch('/api/session-check')
    .then(function (r) {
      if (r.status === 401) {
        window.location.replace('/login.html');
      } else {
        html.style.visibility = '';
      }
    })
    .catch(function () {
      html.style.visibility = ''; // network error — show page, API calls will fail gracefully
    });
})();
