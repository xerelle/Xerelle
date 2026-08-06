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
})();
