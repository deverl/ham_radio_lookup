'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const schema = require('./schema');
const { validatedName } = require('./logic');

const FCC_URL = 'https://data.fcc.gov/download/pub/uls/complete/l_amat.zip';
const RADIO_URL = 'https://radioid.net/static/user.csv';

function downloadDirectory() {
  if (process.platform === 'darwin') return '/tmp/ham-radio-lookup';
  // On Linux, /tmp is often a small RAM disk. The FCC files plus the database
  // need a few gigabytes, so keep the work files on the home disk.
  if (process.platform === 'linux') {
    const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    return path.join(base, 'ham-radio-lookup');
  }
  return path.join(os.tmpdir(), 'ham-radio-lookup');
}

class UpdateError extends Error {
  constructor(message, databaseReplaced = false) {
    super(message);
    this.databaseReplaced = databaseReplaced;
  }
}

function cancelled(databaseReplaced) {
  const error = new UpdateError(
    databaseReplaced
      ? 'Update cancelled after the database had already been changed.'
      : 'Update cancelled. The database was not changed.',
    databaseReplaced,
  );
  error.cancelled = true;
  return error;
}

function failed(message, databaseReplaced) {
  if (databaseReplaced) {
    return new UpdateError(`The database was changed, but a later step did not finish. ${message}`, true);
  }
  return new UpdateError(message, false);
}

function tail(text) {
  const value = String(text || '').trim();
  return value.length > 1200 ? value.slice(-1200) : value;
}

function formatBytes(bytes) {
  const amount = Number(bytes) || 0;
  if (amount < 1000) return `${amount} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = amount / 1000;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function byteDetail(written, expected) {
  if (!expected) return formatBytes(written);
  return `${formatBytes(written)} of ${formatBytes(expected)}`;
}

function run(executable, args, { cwd, input, stderrLimit = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderrLimit > 0 && stderr.length > stderrLimit) stderr = stderr.slice(-stderrLimit);
    });
    child.on('error', (error) => {
      reject(failed(`${path.basename(executable)} could not be started. ${error.message}`, false));
    });
    child.on('close', (status) => {
      if (status !== 0) {
        const name = path.basename(executable);
        const detail = tail(stderr);
        reject(failed(detail ? `${name} exited with status ${status}.\n${detail}` : `${name} exited with status ${status}.`, false));
        return;
      }
      resolve({ stdout, stderr: stderr.trim() });
    });
    if (input != null) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

function download(url, destination, { onProgress, isCancelled, replaced = () => false }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const replacedNow = () => (typeof replaced === 'function' ? replaced() : Boolean(replaced));
    const visit = (target, redirects) => {
      if (settled) return;
      if (isCancelled()) {
        finish(cancelled(replacedNow()));
        return;
      }
      const lib = target.startsWith('http://') ? http : https;
      const request = lib.get(target, {
        headers: { 'User-Agent': 'HamRadioLookup/1.0.0' },
      }, (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects > 5) {
            finish(failed('The download was redirected too many times.', replacedNow()));
            return;
          }
          visit(new URL(response.headers.location, target).href, redirects + 1);
          return;
        }
        if (status !== 200) {
          response.resume();
          finish(failed(`The download failed with status ${status}.`, replacedNow()));
          return;
        }
        const expected = Number(response.headers['content-length']) || 0;
        let written = 0;
        const file = fs.createWriteStream(destination);
        response.on('data', (chunk) => {
          written += chunk.length;
          onProgress?.(written, expected);
          if (isCancelled()) request.destroy();
        });
        response.pipe(file);
        file.on('finish', () => file.close(() => {
          finish(isCancelled() ? cancelled(replacedNow()) : undefined);
        }));
        file.on('error', (error) => finish(failed(error.message, replacedNow())));
      });
      request.on('error', (error) => {
        if (isCancelled() || error.code === 'ECONNRESET') finish(cancelled(replacedNow()));
        else finish(failed(error.message, replacedNow()));
      });
    };
    visit(url, 0);
  });
}

function prepareDirectory(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function requireSize(file, minimum, name) {
  const size = fs.statSync(file).size;
  if (size < minimum) throw failed(`The ${name} download was incomplete.`, false);
}

async function extract(zip, dir) {
  const unzip = process.platform === 'darwin' && fs.existsSync('/usr/bin/unzip') ? '/usr/bin/unzip' : 'unzip';
  await run(unzip, ['-o', '-q', zip, 'HD.dat', 'EN.dat', 'AM.dat'], { cwd: dir });
}

function locate(dir, name) {
  const direct = path.join(dir, name);
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
    const nested = path.join(dir, entry.name, name);
    if (fs.existsSync(nested)) return nested;
  }
  throw failed(`The FCC archive did not contain ${name}.`, false);
}

function sqliteExecutable() {
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/sqlite3')) return '/usr/bin/sqlite3';
  return 'sqlite3';
}

async function sqlite(script, database, cwd) {
  let output;
  try {
    output = await run(sqliteExecutable(), ['-batch', database], { cwd, input: script, stderrLimit: 16000 });
  } catch (error) {
    if (String(error.message).includes('ENOENT') || String(error.message).includes('could not be started')) {
      throw failed('The sqlite3 tool was not found.', false);
    }
    throw error;
  }
  if (output.stderr.includes('disk is full') || output.stderr.includes('INSERT failed')) {
    throw failed(`The license import ran out of disk space.\n${tail(output.stderr)}`, false);
  }
  if (output.stderr.includes('expected') && output.stderr.includes('columns')) {
    throw failed(`The license file did not match the expected columns.\n${tail(output.stderr)}`, false);
  }
  return output.stdout;
}

function lastLine(text) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.length);
  return lines.at(-1) ?? '';
}

function optionQuoted(value) {
  let quoted = '"';
  for (const character of String(value)) {
    if (character === '\\' || character === '"') quoted += `\\${character}`;
    else if (character === '\n') quoted += '\\n';
    else if (character === '\r') quoted += '\\r';
    else if (character === '\t') quoted += '\\t';
    else quoted += character;
  }
  return `${quoted}"`;
}

async function mysqlExecutable() {
  const candidates = [
    '/opt/homebrew/bin/mysql',
    '/usr/local/bin/mysql',
    '/opt/homebrew/opt/mariadb/bin/mysql',
    '/opt/homebrew/opt/mysql/bin/mysql',
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;
  try {
    const output = await run('/bin/zsh', ['-lc', 'command -v mysql'], { cwd: os.tmpdir() });
    const resolved = output.stdout.trim();
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // fall through
  }
  throw failed('The mysql client was not found. Install MariaDB with Homebrew and try again.', false);
}

async function runMySQL(sql, settings, cwd) {
  if (!settings.host || !settings.username || !(settings.port >= 1 && settings.port <= 65535)) {
    throw failed('The database connection settings are incomplete.', false);
  }
  if (/[\r\n]/.test(settings.host) || /[\r\n]/.test(settings.username) || /[\r\n]/.test(settings.password)) {
    throw failed('The database connection settings contain a line break.', false);
  }
  const config = path.join(cwd, '.mysql-client.cnf');
  const text = `[client]
host=${optionQuoted(settings.host)}
port=${settings.port}
user=${optionQuoted(settings.username)}
password=${optionQuoted(settings.password)}
local-infile=1
`;
  fs.writeFileSync(config, text, { mode: 0o600 });
  try {
    const mysql = await mysqlExecutable();
    const output = await run(mysql, [
      `--defaults-extra-file=${config}`,
      '--local-infile=1',
      '--protocol=TCP',
      '--batch',
      '--skip-column-names',
    ], { cwd, input: sql });
    return output.stdout;
  } finally {
    fs.rmSync(config, { force: true });
  }
}

async function installDatabase(staging, destinationDir, destination) {
  fs.mkdirSync(destinationDir, { recursive: true });
  const previous = path.join(destinationDir, 'licenses.sqlite.previous');
  if (fs.existsSync(previous)) fs.rmSync(previous);
  if (fs.existsSync(destination)) fs.renameSync(destination, previous);
  try {
    fs.renameSync(staging, destination);
    fs.rmSync(previous, { force: true });
  } catch (error) {
    if (fs.existsSync(previous) && !fs.existsSync(destination)) {
      try { fs.renameSync(previous, destination); } catch { /* keep the original error */ }
    }
    throw error;
  }
}

async function updateDatabase({
  engine,
  settings,
  databaseFile,
  onProgress,
  isCancelled,
}) {
  const dir = downloadDirectory();
  let databaseReplaced = false;
  const report = (snapshot) => onProgress?.(snapshot);
  const check = () => {
    if (isCancelled()) throw cancelled(databaseReplaced);
  };

  try {
    report({ status: 'Preparing…', fraction: null, detail: '', canCancel: true });
    prepareDirectory(dir);
    check();

    const zip = path.join(dir, 'l_amat.zip');
    report({ status: 'Downloading FCC license file…', fraction: null, detail: '', canCancel: true });
    await download(FCC_URL, zip, {
      isCancelled,
      replaced: () => databaseReplaced,
      onProgress: (written, expected) => report({
        status: 'Downloading FCC license file…',
        fraction: expected > 0 ? Math.min(1, written / expected) : null,
        detail: byteDetail(written, expected),
        canCancel: true,
      }),
    });
    check();
    requireSize(zip, 1_000_000, 'FCC license file');

    report({ status: 'Extracting license files…', fraction: null, detail: '', canCancel: false });
    await extract(zip, dir);
    const hd = locate(dir, 'HD.dat');
    const en = locate(dir, 'EN.dat');
    const am = locate(dir, 'AM.dat');
    requireSize(hd, 1_000_000, 'HD license file');
    requireSize(en, 1_000_000, 'EN license file');
    requireSize(am, 1_000_000, 'AM license file');
    fs.rmSync(zip, { force: true });

    if (engine === 'mysql') {
      const database = validatedName(settings.database);
      report({
        status: 'Rebuilding license tables…',
        fraction: null,
        detail: 'This replaces the current license records and can take a few minutes.',
        canCancel: false,
      });
      await runMySQL(schema.licenseSQL(database, hd, en, am), settings, dir);
      databaseReplaced = true;
      check();

      const csv = path.join(dir, 'user.csv');
      report({ status: 'Downloading RadioID user list…', fraction: null, detail: '', canCancel: true });
      await download(RADIO_URL, csv, {
        isCancelled,
        replaced: () => databaseReplaced,
        onProgress: (written, expected) => report({
          status: 'Downloading RadioID user list…',
          fraction: expected > 0 ? Math.min(1, written / expected) : null,
          detail: byteDetail(written, expected),
          canCancel: true,
        }),
      });
      check();
      requireSize(csv, 1000, 'RadioID user list');
      report({
        status: 'Importing DMR IDs…',
        fraction: null,
        detail: 'This replaces the current DMR records.',
        canCancel: false,
      });
      await runMySQL(schema.dmrSQL(database, csv), settings, dir);
      return;
    }

    const csv = path.join(dir, 'user.csv');
    report({ status: 'Downloading RadioID user list…', fraction: null, detail: '', canCancel: true });
    await download(RADIO_URL, csv, {
      isCancelled,
      replaced: () => databaseReplaced,
      onProgress: (written, expected) => report({
        status: 'Downloading RadioID user list…',
        fraction: expected > 0 ? Math.min(1, written / expected) : null,
        detail: byteDetail(written, expected),
        canCancel: true,
      }),
    });
    check();
    requireSize(csv, 1000, 'RadioID user list');

    // Write the database on the same disk as the installed file. On Linux that
    // disk is the home directory; /tmp is often too small for this import.
    const staging = process.platform === 'linux'
      ? path.join(path.dirname(databaseFile), 'licenses.sqlite.building')
      : path.join(dir, 'licenses.sqlite');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    fs.rmSync(staging, { force: true });
    report({
      status: 'Importing license records…',
      fraction: null,
      detail: 'This can take a few minutes.',
      canCancel: false,
    });
    await sqlite(schema.importScript(hd, en, am), staging, dir);
    report({ status: 'Importing DMR IDs…', fraction: null, detail: '', canCancel: false });
    await sqlite(schema.dmrScript(csv), staging, dir);
    report({
      status: 'Indexing license records…',
      fraction: null,
      detail: 'This can take a few minutes.',
      canCancel: false,
    });
    const count = await sqlite(schema.finishScript(new Date().toISOString()), staging, dir);
    if (lastLine(count) === '0') throw failed('The license file did not contain any records.', false);

    report({ status: 'Installing the database…', fraction: null, detail: databaseFile, canCancel: false });
    await installDatabase(staging, path.dirname(databaseFile), databaseFile);
    databaseReplaced = true;
  } catch (error) {
    if (!databaseReplaced && process.platform === 'linux') {
      fs.rmSync(path.join(path.dirname(databaseFile), 'licenses.sqlite.building'), { force: true });
    }
    if (error instanceof UpdateError) {
      if (error.databaseReplaced !== databaseReplaced && databaseReplaced) {
        throw failed(error.message, true);
      }
      throw error;
    }
    throw failed(error.message || String(error), databaseReplaced);
  }
}

module.exports = {
  downloadDirectory,
  updateDatabase,
  UpdateError,
  optionQuoted,
};
