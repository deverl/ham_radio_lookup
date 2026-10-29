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

function alreadyInstalled() {
  if (!fs.existsSync(binary) || !fs.existsSync(versionFile)) return false;
  const found = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '');
  return found === version;
}

if (alreadyInstalled()) {
  fs.writeFileSync(path.join(electronDir, 'path.txt'), binaryName);
  console.log(`Electron ${version} is already installed.`);
  process.exit(0);
}

const downloadDir = path.join(root, '.electron-download');
const zipPath = path.join(downloadDir, zipName);
fs.mkdirSync(downloadDir, { recursive: true });
const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;
console.log(`Downloading ${url}`);
const curl = spawnSync('curl', ['-fL', '--retry', '3', '-o', zipPath, url], { stdio: 'inherit' });
if (curl.error) {
  console.error(`curl could not be started. ${curl.error.message}`);
  process.exit(1);
}
if (curl.status !== 0) process.exit(curl.status || 1);

const checksums = require(path.join(electronDir, 'checksums.json'));
const expected = checksums[zipName];
if (!expected) {
  console.error(`No checksum is listed for ${zipName}.`);
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
if (hash !== expected) {
  console.error('The Electron download did not match its checksum.');
  process.exit(1);
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
