'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logic = require('./logic');
const schema = require('./schema');
const { searchSQLite } = require('./database');

test('column counts match the FCC files', () => {
  assert.equal(schema.hdColumns.length, 59);
  assert.equal(schema.enColumns.length, 30);
  assert.equal(schema.amColumns.length, 18);
  assert.equal(schema.dmrColumns.length, 7);
});

test('sqlite import turns off defensive mode so the journal can be disabled', () => {
  const script = schema.importScript('/tmp/HD.dat', '/tmp/EN.dat', '/tmp/AM.dat');
  assert.ok(script.indexOf('.dbconfig defensive off') < script.indexOf('PRAGMA journal_mode = OFF'));
  assert.match(script, /\.import \/tmp\/EN\.dat en/);
});

test('like prefixes escape wildcards and use the bang escape', () => {
  assert.equal(logic.likePrefix('Jo_n'), 'Jo!_n%');
  assert.equal(logic.likePrefix('100%'), '100!%%');
  const built = logic.statement({
    callSign: '',
    firstName: 'Jo_n',
    lastName: '100%',
    city: '',
    state: 'id',
    licenseStatuses: ['A'],
    operatorClasses: ['E'],
  });
  assert.deepEqual(built.parameters, ['Jo!_n%', '100!%%', 'ID', 'A', 'E']);
  assert.match(built.sql, /ESCAPE '!'/);
  assert.doesNotMatch(built.sql, /ESCAPE '\\'/);
});

test('an empty search is not a query', () => {
  assert.equal(logic.statement({
    callSign: '  ', firstName: '', lastName: '', city: '', state: '',
    licenseStatuses: [], operatorClasses: [],
  }), null);
});

test('title case matches the Mac app', () => {
  assert.equal(logic.titleCase('DEVERL STOKES'), 'Deverl Stokes');
  assert.equal(logic.titleCase('1501 JORDAN LN'), '1501 Jordan Ln');
  assert.equal(logic.titleCase('PO BOX 12'), 'PO Box 12');
  assert.equal(logic.titleCase('THE ART OF RADIO'), 'The Art of Radio');
  assert.equal(logic.titleCase("O'BRIEN"), "O'Brien");
});

test('the status line includes how long the query took', () => {
  assert.equal(logic.queryDuration(0.0004), '< 1 ms');
  assert.equal(logic.queryDuration(0.048), '48 ms');
  assert.equal(logic.queryDuration(1), '1 second');
  assert.equal(logic.queryDuration(1.24), '1.2 seconds');
  assert.equal(logic.queryDuration(10), '10 seconds');
  assert.equal(logic.resultSummary(1, 1, false, 0.048), 'Found 1 matching record in 48 ms');
  assert.equal(logic.resultSummary(12, 12, false, 1.24), 'Found 12 matching records in 1.2 seconds');
  assert.equal(logic.resultSummary(12, 3, true, 1.24), 'Showing 3 of 12 records in 1.2 seconds');
  assert.equal(logic.resultSummary(0, 0, false, 1.24), '');
});

test('eight days is current and one second more is stale', () => {
  const imported = new Date('2026-10-01T12:00:00Z');
  const exactly = new Date(imported.getTime() + logic.MAXIMUM_AGE_MS);
  const later = new Date(exactly.getTime() + 1000);
  assert.equal(logic.classifyFreshness(imported, exactly).kind, 'current');
  assert.equal(logic.classifyFreshness(imported, later).kind, 'stale');
  assert.equal(logic.classifyFreshness(null).kind, 'missing');
});

test('csv quotes fields that need it', () => {
  const text = logic.csv([{
    callSign: 'W7DNS',
    firstName: 'Deverl',
    lastName: 'Stokes, Jr.',
    streetAddress: '1 "Main"',
    city: 'Emmett',
    state: 'ID',
    zip: '83617',
    operatorClassName: 'Amateur Extra',
    licenseStatusName: 'Active',
    frn: '1',
    regionCode: '7',
    dmrID: '',
  }]);
  assert.match(text, /"Stokes, Jr."/);
  assert.match(text, /"1 ""Main"""/);
  assert.ok(text.endsWith('\n'));
});

test('sqlite search reads a small license file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-radio-lookup-'));
  const file = path.join(dir, 'licenses.sqlite');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(schema.createTables);
  db.exec(`INSERT INTO hd (record_type, sys_id, license_status) VALUES ('HD', '1', 'A');`);
  db.exec(`INSERT INTO en (record_type, sys_id, call_sign, first_name, last_name, street_address, city, state, zip, frn)
    VALUES ('EN', '1', 'W7DNS', 'DEVERL', 'STOKES', '1 MAIN ST', 'EMMETT', 'ID', '83617', '42');`);
  db.exec(`INSERT INTO am (record_type, sys_id, call_sign, operator_class, region_code) VALUES ('AM', '1', 'W7DNS', 'E', '7');`);
  db.exec(`INSERT INTO dmr (radio_id, call_sign) VALUES ('3216068', 'W7DNS');`);
  db.close();

  const rows = searchSQLite(file, logic.statement({
    callSign: 'w7dns', firstName: '', lastName: '', city: '', state: '',
    licenseStatuses: ['A'], operatorClasses: [],
  }), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].callSign, 'W7DNS');
  assert.equal(rows[0].firstName, 'Deverl');
  assert.equal(rows[0].city, 'Emmett');
  assert.equal(rows[0].operatorClassName, 'Amateur Extra');
  assert.equal(rows[0].dmrID, '3216068');

  const escaped = searchSQLite(file, logic.statement({
    callSign: '', firstName: '', lastName: 'sto_es', city: '', state: 'ID',
    licenseStatuses: [], operatorClasses: [],
  }), false);
  assert.equal(escaped.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pgpass escapes colons and backslashes', () => {
  const { pgPass } = require('./updater');
  const text = pgPass({
    host: '127.0.0.1',
    port: 5432,
    username: 'fc:c',
    password: 'a\\b',
  }, ['fcc']);
  assert.equal(text, '127.0.0.1:5432:fcc:fc\\:c:a\\\\b\n');
});

test('database names reject punctuation', () => {
  assert.equal(logic.validatedName('fcc'), 'fcc');
  assert.throws(() => logic.validatedName('fcc;drop'), /cannot be used/);
});

test('postgres search uses numbered placeholders and case-insensitive prefixes', () => {
  const built = logic.statement({
    callSign: 'w7dns',
    firstName: 'Jo_n',
    lastName: '',
    city: '',
    state: '',
    licenseStatuses: ['A'],
    operatorClasses: [],
  }, 'postgres');
  assert.match(built.sql, /en\.call_sign = \$1/);
  assert.match(built.sql, /en\.first_name ILIKE \$2 ESCAPE '!'/);
  assert.match(built.sql, /hd\.license_status IN \(\$3\)/);
  assert.match(built.sql, /COALESCE\(dmr\.radio_id, ''\)/);
  assert.doesNotMatch(built.sql, /IFNULL/);
  assert.deepEqual(built.parameters, ['W7DNS', 'Jo!_n%', 'A']);
});

test('postgres import copies the pipe files and skips the radioid header', () => {
  const sql = schema.postgresLicenseSQL("/tmp/a'b.dat", '/tmp/EN.dat', '/tmp/AM.dat');
  assert.ok(sql.includes("\\copy hd FROM '/tmp/a''b.dat' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\\x01', ESCAPE E'\\x01')"));
  assert.doesNotMatch(sql, /line_end/);
  assert.match(sql, /CREATE INDEX en_call_sign_index/);
  assert.doesNotMatch(sql, /dmr_call_sign_index/);
  const dmr = schema.postgresDmrSQL('/tmp/user.csv');
  assert.match(dmr, /\\copy dmr FROM '\/tmp\/user\.csv' WITH \(FORMAT csv, HEADER true\)/);
});

test('mysql load statements keep the pipe separator and the bang is not involved', () => {
  const sql = schema.licenseSQL('fcc', '/tmp/HD.dat', '/tmp/EN.dat', '/tmp/AM.dat');
  assert.match(sql, /FIELDS TERMINATED BY '\|'/);
  assert.match(sql, /CREATE DATABASE IF NOT EXISTS `fcc`/);
  const dmr = schema.dmrSQL('fcc', "/tmp/user's.csv");
  assert.match(dmr, /user\\'s\.csv/);
});
