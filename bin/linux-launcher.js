'use strict';

const fs = require('fs');
const path = require('path');

const arch = process.argv[2];
const name = 'Ham Radio Lookup';
const dir = path.join('dist', `${name}-linux-${arch}`);
const binary = path.join(dir, name);
const realBinary = path.join(dir, `${name}.bin`);

if (!fs.existsSync(dir)) {
  console.error(`Missing ${dir}. Package the Linux app first.`);
  process.exit(1);
}

if (!fs.existsSync(realBinary)) {
  fs.renameSync(binary, realBinary);
}

const script = `#!/bin/sh
cd "$(dirname "$0")"
exec "./${name}.bin" --no-sandbox "$@"
`;
fs.writeFileSync(binary, script, { mode: 0o755 });
fs.chmodSync(binary, 0o755);
console.log(`Linux launcher written to ${binary}`);
