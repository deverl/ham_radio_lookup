'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const packageFile = path.join(electronDir, 'package.json');

if (!fs.existsSync(packageFile)) {
  console.error('Electron is not installed yet. Run: npm install --include=dev --ignore-scripts');
  process.exit(1);
}

const { version } = require(packageFile);
const platform = process.platform === 'darwin' ? 'darwin' : process.platform;
const arch = process.arch;
const zipName = `electron-v${version}-${platform}-${arch}.zip`;
const binaryName = platform === 'win32' ? 'electron.exe' : 'electron';
const dist = path.join(electronDir, 'dist');
const binary = path.join(dist, binaryName);
const versionFile = path.join(dist, 'version');
const downloadDir = path.join(root, '.electron-download');
const zipPath = path.join(downloadDir, zipName);
const downloadUrl = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;

function alreadyInstalled() {
  if (!fs.existsSync(binary) || !fs.existsSync(versionFile)) return false;
  const found = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '');
  return found === version;
}

function expectedChecksum() {
  const checksums = require(path.join(electronDir, 'checksums.json'));
  const expected = checksums[zipName];
  if (!expected) {
    console.error(`No checksum is listed for ${zipName}.`);
    process.exit(1);
  }
  return expected;
}

function checksumOk(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  return hash === expectedChecksum();
}

// @electron/get stores zips under a hash of the release directory URL.
function cachedZipPath() {
  let cacheRoot = process.env.electron_config_cache;
  if (!cacheRoot) {
    try {
      cacheRoot = require('env-paths')('electron', { suffix: '' }).cache;
    } catch {
      return null;
    }
  }
  const parsed = new URL(downloadUrl);
  const directory = parsed.pathname.replace(/\/[^/]*$/, '');
  const key = crypto.createHash('sha256').update(`${parsed.origin}${directory}`).digest('hex');
  const cached = path.join(cacheRoot, key, zipName);
  return fs.existsSync(cached) ? cached : null;
}

function downloadZip() {
  fs.mkdirSync(downloadDir, { recursive: true });
  console.log(`Downloading ${downloadUrl}`);
  const curl = spawnSync('curl', ['-fL', '--retry', '3', '-o', zipPath, downloadUrl], { stdio: 'inherit' });
  if (curl.error) {
    console.error(`curl could not be started. ${curl.error.message}`);
    process.exit(1);
  }
  if (curl.status !== 0) process.exit(curl.status || 1);
}

// Linux packaging reads the zip from .electron-download. npm's Electron
// installer extracts the binary and leaves the zip only in its cache.
function ensurePackagingZip() {
  if (checksumOk(zipPath)) return false;
  const cached = cachedZipPath();
  if (cached && checksumOk(cached)) {
    fs.mkdirSync(downloadDir, { recursive: true });
    fs.copyFileSync(cached, zipPath);
    console.log(`Copied ${zipName} from the Electron cache.`);
    return true;
  }
  downloadZip();
  if (!checksumOk(zipPath)) {
    console.error('The Electron download did not match its checksum.');
    process.exit(1);
  }
  return true;
}

const savedZip = ensurePackagingZip();

if (alreadyInstalled()) {
  fs.writeFileSync(path.join(electronDir, 'path.txt'), binaryName);
  if (savedZip) {
    console.log(`Electron ${version} is already installed. Saved ${zipName} for Linux packaging.`);
  } else {
    console.log(`Electron ${version} is already installed.`);
  }
  process.exit(0);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const unzip = spawnSync('unzip', ['-q', '-o', zipPath, '-d', dist], { stdio: 'inherit' });
if (unzip.error) {
  console.error(`unzip could not be started. ${unzip.error.message}`);
  process.exit(1);
}
if (unzip.status !== 0) process.exit(unzip.status || 1);

fs.writeFileSync(path.join(electronDir, 'path.txt'), binaryName);
if (platform !== 'win32') fs.chmodSync(binary, 0o755);
console.log(`Installed Electron ${version}.`);
