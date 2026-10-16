// Apply the saved choice before the stylesheet paints. Dark is the default.
let theme = 'dark';
try {
  if (localStorage.getItem('id-market-theme') === 'light') theme = 'light';
} catch { /* Local files and private browsing can disable storage. */ }

function updateThemeControl() {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  const key = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  const label = typeof t === 'function' ? t(key) : key;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f7f9f5' : '#07110e';
  updateThemeControl();
}

applyTheme();
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('themeToggle').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('id-market-theme', theme); } catch { /* Keep the choice for this visit. */ }
    applyTheme();
  });
  updateThemeControl();
});
