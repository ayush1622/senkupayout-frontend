const API_BASE = (window.SENKU_CONFIG?.API_BASE || '').replace(/\/$/, '');

window.senkuAuth = {
  get() { return sessionStorage.getItem('senkupayout_token') || ''; },
  set(token) { if (token) sessionStorage.setItem('senkupayout_token', token); },
  clear() { sessionStorage.removeItem('senkupayout_token'); }
};

window.api = async function api(path, options = {}) {
  if (API_BASE.includes('REPLACE-WITH-YOUR-RENDER-SERVICE')) {
    throw new Error('Production API URL is not configured yet. Edit docs/js/config.js after Render gives you the backend URL.');
  }
  const token = window.senkuAuth.get();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API_BASE + path, {
    credentials: 'include',
    headers,
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) window.senkuAuth.clear();
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
};

window.moneyFmt = function moneyFmt(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
};

window.escapeHtml = function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[ch]));
};


window.showSessionTransition = function showSessionTransition(title, copy = '') {
  let overlay = document.getElementById('sessionTransition');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sessionTransition';
    overlay.className = 'session-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="session-transition-card"><div class="session-transition-mark" aria-hidden="true"></div><div class="session-transition-title">${escapeHtml(title)}</div>${copy ? `<div class="session-transition-copy">${escapeHtml(copy)}</div>` : ''}<div class="session-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
  requestAnimationFrame(() => overlay.classList.add('show'));
  return overlay;
};

window.hideSessionTransition = function hideSessionTransition() {
  const overlay = document.getElementById('sessionTransition');
  if (overlay) overlay.classList.remove('show');
};
