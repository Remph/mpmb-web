// The look (theme, light or dark) on <html> before the page first paints, so a dark theme never flashes
// light while the app loads. A plain script, loaded by index.html before the app: the site's Content Security
// Policy allows no inline script, and the app's own module runs only after the first paint.
// The same rules as src/look.ts (parseLook, shownMode); src/look.test.ts runs this file against them.
(function () {
  var look = {};
  try {
    look = JSON.parse(localStorage.getItem('mpmb-web.look') || '{}') || {};
  } catch (e) {
    // Storage blocked or not JSON: the default look.
  }
  var theme = look.theme === 'campfire' || look.theme === 'oled' ? look.theme : 'purple';
  var deviceDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = theme === 'oled' || look.mode === 'dark' || (look.mode !== 'light' && deviceDark);
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
})();
