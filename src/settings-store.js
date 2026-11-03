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
const MYSQL_ACCOUNT = 'database-password';
const POSTGRES_ACCOUNT = 'postgres-password';

const mysqlStandard = {
  host: '127.0.0.1',
  port: 3306,
  database: 'fcc',
  username: 'fccuser',
  password: 'fccuser',
};

const postgresStandard = {
  host: '127.0.0.1',
  port: 5432,
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

function normalize(settings, fallbackPort) {
  const port = Number(settings.port);
  return {
    host: String(settings.host ?? '').trim(),
    port: port >= 1 && port <= 65535 ? port : fallbackPort,
    database: String(settings.database ?? '').trim(),
    username: String(settings.username ?? '').trim(),
    password: String(settings.password ?? ''),
  };
}

function knownEngine(engine) {
  return engine === 'mysql' || engine === 'postgres' ? engine : 'sqlite';
}

function readKeychain(account) {
  if (process.platform !== 'darwin') return null;
  try {
    return execFileSync('security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w',
    ], { encoding: 'utf8', timeout: 8000 }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

function writeKeychain(account, password) {
  if (process.platform !== 'darwin') return true;
  try {
    execFileSync('security', [
      'add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', password,
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
  const { engine, mysql, postgres } = memory;
  const body = {
    engine,
    host: mysql.host,
    port: mysql.port,
    database: mysql.database,
    username: mysql.username,
    postgres: {
      host: postgres.host,
      port: postgres.port,
      database: postgres.database,
      username: postgres.username,
    },
  };
  if (process.platform !== 'darwin') {
    body.password = mysql.password;
    body.postgres.password = postgres.password;
  }
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
  const engine = knownEngine(stored.engine);
  const mysql = normalize({ ...mysqlStandard, ...stored }, 3306);
  const postgres = normalize({ ...postgresStandard, ...(stored.postgres || {}) }, 5432);
  const mysqlKeychain = readKeychain(MYSQL_ACCOUNT);
  if (mysqlKeychain != null) mysql.password = mysqlKeychain;
  else if (process.platform !== 'darwin' && stored.password != null) mysql.password = String(stored.password);
  const postgresKeychain = readKeychain(POSTGRES_ACCOUNT);
  if (postgresKeychain != null) postgres.password = postgresKeychain;
  else if (process.platform !== 'darwin' && stored.postgres && stored.postgres.password != null) {
    postgres.password = String(stored.postgres.password);
  }
  memory = { engine, mysql, postgres };
  if (imported) persist();
  return memory;
}

function state() {
  return memory || load();
}

function current() {
  const stored = state();
  return {
    engine: stored.engine,
    mysql: stored.mysql,
    postgres: stored.postgres,
    settings: stored.engine === 'postgres' ? stored.postgres : stored.mysql,
  };
}

function freshness() {
  return classifyFreshness(readImportedAt(databaseFile()));
}

function activeSettings() {
  const stored = state();
  return stored.engine === 'postgres' ? stored.postgres : stored.mysql;
}

function snapshot() {
  const { engine } = state();
  const settings = activeSettings();
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
  state().engine = knownEngine(engine);
  persist();
  return snapshot();
}

function saveConnection(settings) {
  const stored = state();
  const slot = stored.engine === 'postgres' ? 'postgres' : 'mysql';
  stored[slot] = normalize(settings, slot === 'postgres' ? 5432 : 3306);
  const account = slot === 'postgres' ? POSTGRES_ACCOUNT : MYSQL_ACCOUNT;
  const storedPassword = process.platform === 'darwin' ? writeKeychain(account, stored[slot].password) : true;
  persist();
  return {
    snapshot: snapshot(),
    warning: storedPassword ? null : 'The connection was saved, but the password could not be stored in the Keychain. It will be used until you quit.',
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
