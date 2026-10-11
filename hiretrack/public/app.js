// public/app.js
// The frontend logic. It runs in the browser and does three things:
//   1. Talks to the backend API with fetch()   (sections 2)
//   2. Draws the data on the page              (section 3)
//   3. Reacts to clicks and typing             (section 4)

// ================================================================
// 1. STATE — the data the page is currently showing
// ================================================================
const STAGES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
const API = '/api/applications';

let applications = [];   // array of application objects from the server
let stageFilter = null;  // e.g. "Interview" when a pipeline tile is clicked
let editingId = null;    // id of the application being edited, or null when adding

// Shortcut: find an element by its id
const $ = (id) => document.getElementById(id);

// ================================================================
// 2. API CALLS — each function sends one HTTP request to the backend
// ================================================================

// One helper for all requests: sends JSON, reads JSON, throws on errors
async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  // Not logged in (or session expired): go to the login page
  if (response.status === 401) {
    location.replace('/login');
    throw new Error('Please log in.');
  }
  const data = await response.json().catch(() => ({ errors: [`Server error (${response.status}).`] }));
  if (!response.ok) {
    // The backend sends { errors: [...] } with a 4xx/5xx status
    throw new Error((data.errors || ['Request failed']).join(' '));
  }
  return data;
}

// Who is logged in? — GET /api/auth?action=me
async function loadUser() {
  const data = await request('/api/auth?action=me');
  const user = data.user;
  $('userName').textContent = user.name;
  const avatar = $('userAvatar');
  if (user.avatar) {
    const img = document.createElement('img');
    img.src = user.avatar;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    avatar.replaceChildren(img);
  } else {
    avatar.textContent = user.name.charAt(0).toUpperCase();
  }
  $('userBox').hidden = false;
  document.body.classList.remove('auth-pending'); // logged in: show the dashboard

  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = `${part}, ${user.name.split(' ')[0]}`;
}

// Log out — POST /api/auth?action=logout
async function logout() {
  await fetch('/api/auth?action=logout', { method: 'POST' });
  location.replace('/login');
}

// READ   — GET /api/applications
async function loadApplications() {
  const data = await request(API);
  applications = data.applications;
  showStorage(data.storage);
  render();
}

// CREATE — POST /api/applications
async function createApplication(fields) {
  const data = await request(API, { method: 'POST', body: JSON.stringify(fields) });
  applications.unshift(data.application); // add to the top of the list
  render();
}

// UPDATE — PUT /api/applications?id=...
async function updateApplication(id, fields) {
  const data = await request(`${API}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(fields)
  });
  const index = applications.findIndex((a) => a.id === id);
  applications[index] = data.application;
  render();
}

// DELETE — DELETE /api/applications?id=...
async function deleteApplication(id) {
  await request(`${API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  applications = applications.filter((a) => a.id !== id);
  render();
}

// ================================================================
// 3. RENDERING — turn the data into HTML
// ================================================================

// Escape user text before putting it in HTML, so typed "<script>" can't run (prevents XSS)
function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// "2026-10-15" -> "15 Oct 2026"
function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Draw everything
function render() {
  renderPipeline();
  renderInsights();
  renderList();
  scheduleCharts();
}

// ---------- Charts: drawn by the Python function /api/chart ----------
let chartTimer = null;

// Wait 400 ms after the last change, so fast edits ask for the charts only once
function scheduleCharts() {
  clearTimeout(chartTimer);
  chartTimer = setTimeout(renderCharts, 400);
}

// Count applications per week for the last 6 weeks (by "Applied on" date)
function weeklyCounts() {
  const weeks = [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // this week's Monday
  for (let i = 5; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = applications.filter((a) => {
      if (!a.appliedOn) return false;
      const d = new Date(a.appliedOn + 'T00:00:00');
      return d >= start && d < end;
    }).length;
    weeks.push({ label: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), count });
  }
  return weeks;
}

async function renderCharts() {
  const stages = {};
  for (const s of STAGES) stages[s] = applications.filter((a) => a.status === s).length;
  const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  if (applications.length === 0) {
    $('stageChart').innerHTML = $('weeklyChart').innerHTML = '<p class="chart-note">Charts appear once you add applications.</p>';
    return;
  }
  try {
    const data = await request('/api/chart', {
      method: 'POST',
      body: JSON.stringify({ stages, weekly: weeklyCounts(), theme })
    });
    // The SVG comes from our own Python function and contains only numbers and fixed labels
    $('stageChart').innerHTML = data.stageChart;
    $('weeklyChart').innerHTML = data.weeklyChart;
  } catch (error) {
    $('stageChart').innerHTML = $('weeklyChart').innerHTML = '<p class="chart-note">Charts are unavailable right now.</p>';
  }
}

// The five stage tiles with counts
function renderPipeline() {
  const total = applications.length;
  let html = '';
  for (const stage of STAGES) {
    const count = applications.filter((a) => a.status === stage).length;
    const percent = total ? Math.round((count / total) * 100) : 0;
    html += `
      <button type="button" class="stage" data-stage="${stage}" data-filter="${stage}"
              aria-pressed="${stageFilter === stage}">
        <span class="stage-count">${count}</span>
        <span class="stage-name">${stage}</span>
        <span class="stage-bar"><span style="width:${percent}%"></span></span>
      </button>`;
  }
  $('pipeline').innerHTML = html;
}

// Total, response rate and upcoming interviews
function renderInsights() {
  const sent = applications.filter((a) => a.status !== 'Wishlist');
  const positive = sent.filter((a) => a.status === 'Interview' || a.status === 'Offer');
  const rate = sent.length ? Math.round((positive.length / sent.length) * 100) : 0;

  $('totalCount').textContent = applications.length;
  $('responseRate').textContent = rate + '%';

  const today = todayISO();
  const upcoming = applications
    .filter((a) => a.interviewOn && a.interviewOn >= today && a.status !== 'Rejected')
    .sort((a, b) => a.interviewOn.localeCompare(b.interviewOn))
    .slice(0, 3);

  $('upcomingList').innerHTML = upcoming.length
    ? upcoming.map((a) => `<li><span>${escapeHtml(a.company)}, ${escapeHtml(a.role)}</span><span>${formatDate(a.interviewOn)}</span></li>`).join('')
    : '<li class="none">No interviews scheduled yet.</li>';
}

// Apply search, stage filter and sort, then draw the cards
function getVisibleApplications() {
  const query = $('searchInput').value.trim().toLowerCase();
  const sortBy = $('sortSelect').value;

  let list = applications.filter((a) => {
    const matchesStage = !stageFilter || a.status === stageFilter;
    const matchesSearch = !query ||
      a.company.toLowerCase().includes(query) ||
      a.role.toLowerCase().includes(query);
    return matchesStage && matchesSearch;
  });

  list = [...list].sort((a, b) => {
    if (sortBy === 'company') return a.company.localeCompare(b.company);
    if (sortBy === 'applied') return (b.appliedOn || '').localeCompare(a.appliedOn || '');
    return b.createdAt.localeCompare(a.createdAt); // newest
  });
  return list;
}

function renderList() {
  const list = getVisibleApplications();

  // Filter note
  const note = $('filterNote');
  if (stageFilter) {
    note.hidden = false;
    note.innerHTML = `Showing <strong>${stageFilter}</strong> only. <button type="button" class="small secondary" data-action="clear-filter">Show all</button>`;
  } else {
    note.hidden = true;
  }

  // Empty states
  if (applications.length === 0) {
    $('list').innerHTML = `
      <div class="empty">
        <h3>No applications yet</h3>
        <p>Add the first company you applied to, or load sample data to explore.</p>
        <div class="buttons">
          <button type="button" class="primary" data-action="add">Add application</button>
          <button type="button" class="secondary" data-action="sample">Load sample data</button>
        </div>
      </div>`;
    return;
  }
  if (list.length === 0) {
    $('list').innerHTML = `<div class="empty"><h3>No matches</h3><p>Try another search or stage.</p></div>`;
    return;
  }

  // One card per application
  $('list').innerHTML = list.map((a) => {
    const options = STAGES.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('');
    const meta = [
      a.location && `📍 ${escapeHtml(a.location)}`,
      a.appliedOn && `Applied ${formatDate(a.appliedOn)}`,
      a.interviewOn && `Interview ${formatDate(a.interviewOn)}`,
      a.link && `<a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">Job posting</a>`
    ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');

    return `
      <article class="card" data-stage="${a.status}">
        <div>
          <h3>${escapeHtml(a.company)}</h3>
          <p class="role">${escapeHtml(a.role)}</p>
          ${meta ? `<p class="meta">${meta}</p>` : ''}
          ${a.notes ? `<p class="notes">${escapeHtml(a.notes)}</p>` : ''}
        </div>
        <div class="card-actions" data-stage="${a.status}">
          <label>
            <span class="visually-hidden">Status for ${escapeHtml(a.company)}</span>
            <select data-status-for="${a.id}">${options}</select>
          </label>
          <div class="card-buttons">
            <button type="button" class="small secondary" data-action="edit" data-id="${a.id}">Edit</button>
            <button type="button" class="small secondary danger" data-action="delete" data-id="${a.id}">Delete</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function showStorage(mode) {
  const el = $('storageStatus');
  if (mode === 'redis') {
    el.textContent = 'Saved to database';
    el.className = 'storage ok';
  } else {
    el.textContent = 'Temporary storage (no database connected)';
    el.className = 'storage warn';
  }
}

function toast(message, isError) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = message;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ================================================================
// 4. EVENTS — what happens when the user clicks or types
// ================================================================

// --- Form popup ---
function openForm(application) {
  const form = $('appForm');
  form.reset();
  $('formErrors').hidden = true;
  editingId = application ? application.id : null;
  $('formTitle').textContent = application ? 'Edit application' : 'Add application';

  if (application) {
    // Fill every input whose name matches a field
    for (const [key, value] of Object.entries(application)) {
      if (form.elements[key]) form.elements[key].value = value;
    }
  } else {
    form.elements.appliedOn.value = todayISO();
  }
  $('formDialog').showModal();
  form.elements.company.focus();
}

function closeForm() {
  $('formDialog').close();
}

// Read all inputs into a plain object: { company: "...", role: "...", ... }
function readForm() {
  const data = new FormData($('appForm'));
  return Object.fromEntries(data.entries());
}

// Quick checks in the browser (the backend checks again)
function validateForm(fields) {
  const errors = [];
  if (!fields.company.trim()) errors.push('Company name is required.');
  if (!fields.role.trim()) errors.push('Job role is required.');
  if (fields.link && !/^https?:\/\//i.test(fields.link)) errors.push('Job link must start with http:// or https://.');
  return errors;
}

$('appForm').addEventListener('submit', async (event) => {
  event.preventDefault(); // stop the browser reloading the page
  const fields = readForm();
  const errors = validateForm(fields);
  if (errors.length) {
    $('formErrors').textContent = errors.join(' ');
    $('formErrors').hidden = false;
    return;
  }

  $('saveBtn').disabled = true;
  try {
    if (editingId) {
      await updateApplication(editingId, fields);
      toast(`Updated ${fields.company}.`);
    } else {
      await createApplication(fields);
      toast(`Added ${fields.company}.`);
    }
    closeForm();
  } catch (error) {
    $('formErrors').textContent = error.message; // errors sent back by the backend
    $('formErrors').hidden = false;
  } finally {
    $('saveBtn').disabled = false;
  }
});

$('addBtn').addEventListener('click', () => openForm(null));
$('cancelBtn').addEventListener('click', closeForm);

// --- Search and sort: redraw the list as you type ---
$('searchInput').addEventListener('input', renderList);
$('sortSelect').addEventListener('change', renderList);

// --- Clicks anywhere on the page (one listener handles all buttons: "event delegation") ---
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  // Pipeline tile: filter by that stage (click again to clear)
  if (button.dataset.filter) {
    stageFilter = stageFilter === button.dataset.filter ? null : button.dataset.filter;
    render();
    return;
  }

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'add') openForm(null);
  if (action === 'clear-filter') { stageFilter = null; render(); }
  if (action === 'sample') await loadSampleData();

  if (action === 'edit') {
    openForm(applications.find((a) => a.id === id));
  }

  if (action === 'delete') {
    const app = applications.find((a) => a.id === id);
    if (!confirm(`Delete the application to ${app.company}?`)) return;
    try {
      await deleteApplication(id);
      toast(`Deleted ${app.company}.`);
    } catch (error) {
      toast(error.message, true);
    }
  }
});

// --- Status dropdown on a card: save the new status straight away ---
document.addEventListener('change', async (event) => {
  const id = event.target.dataset.statusFor;
  if (!id) return;
  try {
    await updateApplication(id, { status: event.target.value });
    toast(`Moved to ${event.target.value}.`);
  } catch (error) {
    toast(error.message, true);
    render(); // put the old value back
  }
});

// --- Export to CSV (opens in Excel) ---
$('exportBtn').addEventListener('click', () => {
  if (!applications.length) return toast('Nothing to export yet.', true);
  const columns = ['company', 'role', 'location', 'status', 'appliedOn', 'interviewOn', 'link', 'notes'];
  const quote = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
  const rows = [columns.join(',')].concat(applications.map((a) => columns.map((c) => quote(a[c])).join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'job-applications.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});

// --- Sample data so the dashboard is not empty in a demo ---
async function loadSampleData() {
  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const samples = [
    { company: 'Zoho', role: 'Member Technical Staff', location: 'Chennai', status: 'Interview', appliedOn: addDays(-12), interviewOn: addDays(2), notes: 'Round 2: data structures and a small coding task.' },
    { company: 'Infosys', role: 'Systems Engineer', location: 'Mysuru', status: 'Offer', appliedOn: addDays(-30), notes: 'Offer letter received. Joining date to confirm.' },
    { company: 'TCS', role: 'Assistant System Engineer', location: 'Coimbatore', status: 'Applied', appliedOn: addDays(-5) },
    { company: 'Freshworks', role: 'Associate Software Engineer', location: 'Chennai', status: 'Interview', appliedOn: addDays(-9), interviewOn: addDays(5), notes: 'Prepare JavaScript and REST API questions.' },
    { company: 'Wipro', role: 'Project Engineer', location: 'Bengaluru', status: 'Rejected', appliedOn: addDays(-25) },
    { company: 'Accenture', role: 'Associate Software Engineer', location: 'Remote', status: 'Wishlist', notes: 'Applications open next month.' },
    { company: 'Cognizant', role: 'Programmer Analyst Trainee', location: 'Coimbatore', status: 'Applied', appliedOn: addDays(-2) }
  ];
  try {
    for (const sample of samples) {
      await createApplication(sample);
    }
    toast('Sample data loaded.');
  } catch (error) {
    toast(error.message, true);
  }
}

// ================================================================
// 5. START — load the data when the page opens
// ================================================================
$('logoutBtn').addEventListener('click', logout);

loadUser().then(loadApplications).catch((error) => {
  if (error.message === 'Please log in.') return; // already on the way to /login
  document.body.classList.remove('auth-pending');
  $('storageStatus').textContent = 'Backend not reachable';
  $('storageStatus').className = 'storage';
  $('list').innerHTML = `<div class="empty"><h3>Could not load applications</h3><p>${escapeHtml(error.message)}</p></div>`;
});
