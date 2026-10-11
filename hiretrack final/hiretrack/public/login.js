// public/login.js
// Logic for the login / signup page.

const $ = (id) => document.getElementById(id);

// ---------- Show an error (from the URL after a failed social login, or from the API) ----------
function showError(message) {
  $('authError').textContent = message;
  $('authError').hidden = !message;
}
const urlError = new URLSearchParams(location.search).get('error');
if (urlError) showError(urlError);

// ---------- Already logged in? Go straight to the app ----------
fetch('/api/auth?action=me').then((r) => {
  if (r.ok) location.replace('/');
});

// ---------- Show only the social buttons that are set up in Vercel ----------
fetch('/api/auth?action=providers')
  .then((r) => r.json())
  .then((data) => {
    let shown = 0;
    for (const p of data.providers) {
      const button = document.querySelector(`[data-provider="${p.key}"]`);
      if (!button) continue;
      button.hidden = !p.enabled;
      if (p.enabled) shown++;
    }
    $('socialButtons').hidden = shown === 0;
    $('dividerText').textContent = shown ? 'or use your email' : 'or sign in with your email';
  })
  .catch(() => {});

// ---------- One-click demo account ----------
$('demoBtn').addEventListener('click', async () => {
  $('demoBtn').disabled = true;
  showError('');
  try {
    const response = await fetch('/api/auth?action=demo', { method: 'POST' });
    if (!response.ok) throw new Error('Could not open the demo account. Please try again.');
    location.replace('/');
  } catch (error) {
    showError(error.message);
    $('demoBtn').disabled = false;
  }
});

// ---------- Tabs: Log in / Sign up ----------
function showTab(name) {
  const isLogin = name === 'login';
  $('tabLogin').setAttribute('aria-selected', isLogin);
  $('tabSignup').setAttribute('aria-selected', !isLogin);
  $('loginForm').hidden = !isLogin;
  $('signupForm').hidden = isLogin;
  $('authTitle').textContent = isLogin ? 'Welcome back' : 'Create your account';
  $('authSub').textContent = isLogin ? 'Log in to see your applications.' : 'Start tracking your job hunt in seconds.';
  showError('');
}
$('tabLogin').addEventListener('click', () => showTab('login'));
$('tabSignup').addEventListener('click', () => showTab('signup'));

// ---------- Send a form to the API ----------
async function submitAuth(form, action) {
  const fields = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  showError('');
  try {
    const response = await fetch(`/api/auth?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data.errors || ['Something went wrong.']).join(' '));
    location.replace('/'); // logged in: the server has set the session cookie
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  submitAuth(e.target, 'login');
});

$('signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  if (!f.name.value.trim()) return showError('Name is required.');
  if (!f.email.value.includes('@')) return showError('Enter a valid email address.');
  if (f.password.value.length < 8) return showError('Password must be at least 8 characters.');
  submitAuth(e.target, 'signup');
});
