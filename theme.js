/* AxiomPilotCode appearance: no dependencies, no inline script required. */
(() => {
  'use strict';
  const key = 'axiom-theme';
  let stored = null;
  try { stored = localStorage.getItem(key); } catch { /* Private browsing can disable storage. */ }
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  let theme = stored === 'dark' || stored === 'light' ? stored : (systemDark ? 'dark' : 'light');

  function apply() {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c1421' : '#f9fbff');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const next = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      button.setAttribute('title', 'Switch to ' + next + ' theme');
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
    });
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-theme-toggle]');
    if (!button) return;
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, theme); } catch { /* Preference lasts for this page. */ }
    apply();
  });
})();
