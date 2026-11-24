'use strict';

const $ = (id) => document.getElementById(id);
let snapshot = null;
let testing = false;

function draft() {
  return {
    host: $('host').value,
    port: Number($('port').value),
    database: $('database').value,
    username: $('username').value,
    password: $('password').value,
  };
}

function fill(settings) {
  $('host').value = settings.host;
  $('port').value = String(settings.port);
  $('database').value = settings.database;
  $('username').value = settings.username;
  $('password').value = settings.password;
}

function showStatus(message) {
  const node = $('status');
  node.hidden = !message;
  node.textContent = message || '';
  const ok = message && (message.startsWith('Connected') || message.startsWith('Saved') || message.startsWith('Defaults'));
  node.classList.toggle('secondary', Boolean(ok));
  node.style.color = ok ? '' : 'var(--orange)';
  fit();
}

const standards = {
  mysql: { host: '127.0.0.1', port: 3306, database: 'fcc', username: 'fccuser', password: 'fccuser' },
  postgres: { host: '127.0.0.1', port: 5432, database: 'fcc', username: 'fccuser', password: 'fccuser' },
};

function serverNote(engine) {
  if (engine === 'postgres') {
    return 'The local PostgreSQL defaults are host 127.0.0.1, port 5432, database fcc, and user fccuser.';
  }
  return 'The FCC web app uses host 127.0.0.1, port 3306, database fcc, and user fccuser.';
}

function showEngine(engine) {
  const server = engine === 'mysql' || engine === 'postgres';
  $('server').hidden = !server;
  $('sqlite').hidden = server;
  if (server) $('server-note').textContent = serverNote(engine);
  fit();
}

function apply(next, { replaceDraft } = { replaceDraft: false }) {
  snapshot = next;
  const selected = document.querySelector(`input[name="engine"][value="${next.engine}"]`);
  if (selected) selected.checked = true;
  const link = document.querySelector(`input[name="licenseLink"][value="${next.licenseLink || 'fcc'}"]`);
  if (link) link.checked = true;
  $('location').textContent = next.databasePath;
  $('built').textContent = next.freshnessDescription;
  $('stale').hidden = next.freshness.kind !== 'stale';
  $('sqlite-update').textContent = next.freshness.kind === 'missing' ? 'Create Database…' : 'Update Database…';
  const busy = Boolean(next.updating) || testing;
  $('sqlite-update').disabled = busy;
  $('server-update').disabled = busy;
  $('test').disabled = testing;
  $('save').disabled = testing;
  if (replaceDraft) fill(next.settings);
  showEngine(next.engine);
}

function fit() {
  requestAnimationFrame(() => {
    const form = document.getElementById('form');
    window.ham.resizeSettings(Math.ceil(form.getBoundingClientRect().bottom));
  });
}

document.querySelectorAll('input[name="licenseLink"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    const next = await window.ham.setLicenseLink(radio.value);
    apply(next);
  });
});

document.querySelectorAll('input[name="engine"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    const next = await window.ham.setEngine(radio.value);
    apply(next, { replaceDraft: true });
    showStatus('');
  });
});

$('defaults').addEventListener('click', () => {
  const engine = snapshot && snapshot.engine === 'postgres' ? 'postgres' : 'mysql';
  fill(standards[engine]);
  showStatus('Defaults filled in. Save to keep them.');
});

$('save').addEventListener('click', async () => {
  const result = await window.ham.saveConnection(draft());
  apply(result.snapshot);
  showStatus(result.warning || 'Saved.');
});

$('test').addEventListener('click', async () => {
  testing = true;
  $('testing').hidden = false;
  $('test').disabled = true;
  $('save').disabled = true;
  const result = await window.ham.testConnection(draft());
  testing = false;
  $('testing').hidden = true;
  $('test').disabled = false;
  $('save').disabled = false;
  showStatus(result.message);
});

$('sqlite-update').addEventListener('click', requestMaintain);
$('server-update').addEventListener('click', requestMaintain);

function requestMaintain() {
  window.ham.maintain();
}

document.getElementById('form').addEventListener('submit', (event) => event.preventDefault());

async function boot() {
  apply(await window.ham.bootstrap(), { replaceDraft: true });
}

window.ham.on('state', (next) => apply(next, { replaceDraft: false }));

boot();
