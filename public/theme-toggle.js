// Xerelle shared theme toggle logic.
// Every page links this file (after theme.css). It applies the saved
// preference immediately on load (before paint, to avoid a flash of the
// wrong theme), and exposes window.xerelleToggleTheme() for any page
// that has an actual toggle switch/button.

(function () {
  const STORAGE_KEY = 'xerelle_theme';
  const saved = localStorage.getItem(STORAGE_KEY) || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  window.xerelleGetTheme = function () {
    return localStorage.getItem(STORAGE_KEY) || 'light';
  };

  window.xerelleSetTheme = function (theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  };

  window.xerelleToggleTheme = function () {
    const current = window.xerelleGetTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    window.xerelleSetTheme(next);
    return next;
  };

  // Shared "back" navigation — used by the back-arrow icon on every page.
  // Goes to whatever page you actually came from (real browser history),
  // falling back to the homepage only if there's genuinely nowhere to go
  // back to (e.g. someone opened this page directly, not through the app).
  window.xerelleGoBack = function () {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/index.html';
    }
  };
})();
