const form = document.getElementById('loginForm');
const msg = document.getElementById('loginMsg');
const codeField = document.getElementById('codeField');
const submitBtn = form.querySelector('button[type="submit"]');
let needs2fa = false;

function setSubmitting(active) {
  submitBtn.disabled = active;
  submitBtn.classList.toggle('is-loading', active);
  if (active) {
    submitBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Signing in…';
  } else {
    submitBtn.textContent = needs2fa ? 'Verify & sign in' : 'Sign in';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';
  setSubmitting(true);
  const body = { username: username.value.trim(), password: password.value };
  if (needs2fa) body.code = code.value.trim();
  try {
    const result = await api('/api/auth/login', { method: 'POST', body });
    window.senkuAuth.set(result.token);
    showSessionTransition('Welcome back', 'Opening your SenkuPayout dashboard…');
    document.querySelector('.auth-page')?.classList.add('auth-leaving');
    await new Promise(resolve => setTimeout(resolve, 620));
    location.href = 'portal.html';
  } catch (err) {
    if (err.status === 428 && err.data?.twoFactorRequired) {
      needs2fa = true;
      codeField.classList.remove('hidden');
      code.focus();
      msg.innerHTML = '<div class="notice info">Enter the 6-digit code from your authenticator app.</div>';
      setSubmitting(false);
      return;
    }
    msg.innerHTML = `<div class="notice bad">${escapeHtml(err.message)}</div>`;
    setSubmitting(false);
  }
});
