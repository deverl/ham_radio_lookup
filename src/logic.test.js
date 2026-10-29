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

test('database names reject punctuation', () => {
  assert.equal(logic.validatedName('fcc'), 'fcc');
  assert.throws(() => logic.validatedName('fcc;drop'), /cannot be used/);
});

test('mysql load statements keep the pipe separator and the bang is not involved', () => {
  const sql = schema.licenseSQL('fcc', '/tmp/HD.dat', '/tmp/EN.dat', '/tmp/AM.dat');
  assert.match(sql, /FIELDS TERMINATED BY '\|'/);
  assert.match(sql, /CREATE DATABASE IF NOT EXISTS `fcc`/);
  const dmr = schema.dmrSQL('fcc', "/tmp/user's.csv");
  assert.match(dmr, /user\\'s\.csv/);
});
