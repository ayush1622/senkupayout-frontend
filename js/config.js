// SenkuPayout API configuration

(() => {
  const isLocal = ['localhost', '127.0.0.1']
    .includes(location.hostname);

  const PRODUCTION_API_BASE =
    'https://senkupayout-api.onrender.com';

  window.SENKU_CONFIG = {
    API_BASE: isLocal
      ? 'http://localhost:4000'
      : PRODUCTION_API_BASE
  };
})();
