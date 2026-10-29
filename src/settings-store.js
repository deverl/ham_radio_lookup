'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { classifyFreshness, formatWhen } = require('./logic');
const { readImportedAt } = require('./database');
const { downloadDirectory } = require('./updater');

const KEYCHAIN_SERVICE = 'us.ds6.HamRadioQuery';
const KEYCHAIN_ACCOUNT = 'database-password';

const standard = {
  host: '127.0.0.1',
  port: 3306,
  database: 'fcc',
  username: 'fccuser',
  password: 'fccuser',
};

let memory = null;

function databaseFile() {
  const root = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : app.getPath('appData');
  return path.join(root, 'Ham Radio Query', 'licenses.sqlite');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalize(settings) {
  const port = Number(settings.port);
  return {
    host: String(settings.host ?? '').trim(),
    port: port >= 1 && port <= 65535 ? port : 3306,
    database: String(settings.database ?? '').trim(),
    username: String(settings.username ?? '').trim(),
    password: String(settings.password ?? ''),
  };
}

function readKeychain() {
  if (process.platform !== 'darwin') return null;
  try {
    return execFileSync('security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w',
    ], { encoding: 'utf8', timeout: 8000 }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

function writeKeychain(password) {
  if (process.platform !== 'darwin') return true;
  try {
    execFileSync('security', [
      'add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w', password,
    ], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

function readMacPreferences() {
  if (process.platform !== 'darwin') return null;
  const files = [
    path.join(os.homedir(), 'Library/Preferences/us.ds6.HamRadioQuery.plist'),
    path.join(os.homedir(), 'Library/Preferences/com.dstokes.HamRadioQuery.plist'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
      return JSON.parse(json);
    } catch {
      // Try the other preferences file.
    }
  }
  return null;
}

function persist() {
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { engine, settings } = memory;
  const body = {
    engine,
    host: settings.host,
    port: settings.port,
    database: settings.database,
    username: settings.username,
  };
  if (process.platform !== 'darwin') body.password = settings.password;
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
}

function load() {
  const file = settingsPath();
  let stored = null;
  if (fs.existsSync(file)) {
    try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { stored = {}; }
  }
  let imported = false;
  if (!stored) {
    const plist = readMacPreferences();
    stored = plist ? {
      engine: plist['HamRadioQuery.engine'],
      host: plist['HamRadioQuery.host'],
      port: plist['HamRadioQuery.port'],
      database: plist['HamRadioQuery.database'],
      username: plist['HamRadioQuery.username'],
    } : {};
    imported = Boolean(plist);
  }
  const engine = stored.engine === 'mysql' ? 'mysql' : 'sqlite';
  const settings = normalize({ ...standard, ...stored });
  const keychain = readKeychain();
  if (keychain != null) settings.password = keychain;
  else if (process.platform !== 'darwin' && stored.password != null) settings.password = String(stored.password);
  memory = { engine, settings };
  if (imported) persist();
  return memory;
}

function current() {
  return memory || load();
}

function freshness() {
  return classifyFreshness(readImportedAt(databaseFile()));
}

function snapshot() {
  const { engine, settings } = current();
  const fresh = freshness();
  return {
    engine,
    settings,
    freshness: fresh,
    databasePath: databaseFile(),
    freshnessDescription: fresh.kind === 'missing' ? 'Not created' : formatWhen(fresh.importedAt),
    searchUnavailable: engine === 'sqlite' && fresh.kind === 'missing',
    downloadDir: downloadDirectory(),
  };
}

function setEngine(engine) {
  current().engine = engine === 'mysql' ? 'mysql' : 'sqlite';
  persist();
  return snapshot();
}

function saveConnection(settings) {
  current().settings = normalize(settings);
  const stored = process.platform === 'darwin' ? writeKeychain(current().settings.password) : true;
  persist();
  return {
    snapshot: snapshot(),
    warning: stored ? null : 'The connection was saved, but the password could not be stored in the Keychain. It will be used until you quit.',
  };
}

module.exports = {
  databaseFile,
  current,
  snapshot,
  setEngine,
  saveConnection,
  freshness,
};
