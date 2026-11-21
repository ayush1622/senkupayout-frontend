// SenkuPayout frontend has exactly ONE backend URL setting.
// Localhost works automatically. After Render gives you a URL, replace
// the PRODUCTION_API_BASE value below once, commit, and GitHub Pages will use it.
(() => {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const PRODUCTION_API_BASE = 'https://REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com';
  window.SENKU_CONFIG = {
    API_BASE: isLocal ? 'http://localhost:4000' : PRODUCTION_API_BASE
  };
})();
