'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const arch = process.argv[2];
if (arch !== 'x64' && arch !== 'arm64') {
  console.error('Usage: node bin/pack-linux.js <x64|arm64>');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const zipDir = path.join(root, '.electron-download');
const packager = path.join(
  root,
  'node_modules',
  '@electron',
  'packager',
  'bin',
  'electron-packager.mjs',
);

function isTmpfs(dir) {
  try {
    const out = spawnSync('findmnt', ['-no', 'FSTYPE', '-T', dir], {
      encoding: 'utf8',
    });
    return out.status === 0 && String(out.stdout).trim() === 'tmpfs';
  } catch {
    return false;
  }
}

function canWriteProbe(dir) {
  const probe = path.join(dir, `.ham-radio-pack-probe-${process.pid}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    try {
      fs.rmSync(probe, { force: true });
    } catch {
      // ignore cleanup failures
    }
    return false;
  }
}

function chooseTempDir() {
  const candidates = [
    process.env.HAM_RADIO_PACK_TMP,
    path.join(os.homedir(), 'tmp', 'ham-radio-pack'),
    path.join(os.homedir(), '.cache', 'ham-radio-pack-tmp'),
    '/var/tmp/ham-radio-pack',
  ].filter(Boolean);

  const current = process.env.TMPDIR || os.tmpdir();
  if (!isTmpfs(current) && canWriteProbe(current)) return current;

  for (const dir of candidates) {
    if (canWriteProbe(dir)) return dir;
  }

  console.error(
    'Could not find a writable disk-backed temp directory for packaging.\n' +
      'Set HAM_RADIO_PACK_TMP to a directory on a normal disk (not /tmp).',
  );
  process.exit(1);
}

const tmpDir = chooseTempDir();
process.env.TMPDIR = tmpDir;
process.env.TEMP = tmpDir;
process.env.TMP = tmpDir;
console.log(`Using temp directory: ${tmpDir}`);

if (!fs.existsSync(zipDir)) {
  console.error(
    `Missing ${zipDir}. Run: npm run install:electron`,
  );
  process.exit(1);
}

const pack = spawnSync(
  process.execPath,
  [
    packager,
    root,
    'Ham Radio Lookup',
    '--platform=linux',
    `--arch=${arch}`,
    '--out=dist',
    '--overwrite',
    '--icon=build/icon.png',
    `--electron-zip-dir=${zipDir}`,
  ],
  { cwd: root, stdio: 'inherit', env: process.env },
);
if (pack.error) {
  console.error(pack.error.message);
  process.exit(1);
}
if (pack.status !== 0) process.exit(pack.status || 1);

const launcher = spawnSync(
  process.execPath,
  [path.join(root, 'bin', 'linux-launcher.js'), arch],
  { cwd: root, stdio: 'inherit' },
);
if (launcher.error) {
  console.error(launcher.error.message);
  process.exit(1);
}
process.exit(launcher.status || 0);
