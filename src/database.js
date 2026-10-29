'use strict';

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const mysql = require('mysql2/promise');
const { statement, shapeRecord } = require('./logic');

function searchUnavailableMessage() {
  const error = new Error('The license database has not been created.');
  error.code = 'MISSING_DATABASE';
  return error;
}

function describeMySQL(error, settings) {
  if (error.code === 'MISSING_DATABASE' || error.friendly) return error;
  const raw = `${error.code || ''} ${error.message || error}`;
  const lower = raw.toLowerCase();
  let message;
  if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('etimedout') || lower.includes('timed out') || lower.includes('econnreset')) {
    message = `Could not connect to MySQL at ${settings.host}:${settings.port}. Check that the database is running, or update the connection in Settings.`;
  } else if (lower.includes('access denied') || error.code === 'ER_ACCESS_DENIED_ERROR') {
    message = `The database rejected ${settings.username}. Check the username and password in Settings.`;
  } else if (lower.includes('unknown database') || error.code === 'ER_BAD_DB_ERROR') {
    message = `Database “${settings.database}” was not found on ${settings.host}.`;
  } else if (error.code === 'ENOTFOUND' || lower.includes('getaddrinfo')) {
    message = `Could not connect to MySQL at ${settings.host}:${settings.port}. Check that the database is running, or update the connection in Settings.`;
  } else {
    message = `Database error: ${error.message || raw}`;
  }
  const wrapped = new Error(message);
  wrapped.friendly = true;
  return wrapped;
}

function validate(settings) {
  if (!settings.host) throw friendly('Enter a database host in Settings.');
  if (!(settings.port >= 1 && settings.port <= 65535)) throw friendly('Port must be between 1 and 65535.');
  if (!settings.database) throw friendly('Enter a database name in Settings.');
  if (!settings.username) throw friendly('Enter a database username in Settings.');
}

function friendly(message) {
  const error = new Error(message);
  error.friendly = true;
  return error;
}

async function openMySQL(settings) {
  validate(settings);
  try {
    return await mysql.createConnection({
      host: settings.host,
      port: settings.port,
      user: settings.username,
      password: settings.password,
      database: settings.database,
      connectTimeout: 8000,
      ssl: false,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
  } catch (error) {
    throw describeMySQL(error, settings);
  }
}

async function testConnection(settings) {
  const connection = await openMySQL(settings);
  try {
    await connection.query('SELECT 1');
  } catch (error) {
    throw describeMySQL(error, settings);
  } finally {
    await connection.end().catch(() => {});
  }
}

async function searchMySQL(settings, built, applyTitleCase) {
  const connection = await openMySQL(settings);
  try {
    const [rows] = await connection.query(built.sql, built.parameters);
    return rows.map((row) => shapeRecord(row, applyTitleCase));
  } catch (error) {
    throw describeMySQL(error, settings);
  } finally {
    await connection.end().catch(() => {});
  }
}

function searchSQLite(databaseFile, built, applyTitleCase) {
  if (!fs.existsSync(databaseFile)) throw searchUnavailableMessage();
  let db;
  try {
    db = new DatabaseSync(databaseFile, { readOnly: true });
    const rows = db.prepare(built.sql).all(...built.parameters);
    return rows.map((row) => shapeRecord(row, applyTitleCase));
  } catch (error) {
    if (error.code === 'MISSING_DATABASE') throw error;
    const wrapped = new Error(error.message || 'The license database could not be read.');
    wrapped.friendly = true;
    throw wrapped;
  } finally {
    db?.close();
  }
}

async function search(engine, settings, databaseFile, query) {
  const built = statement(query);
  if (!built) return [];
  if (engine === 'mysql') return searchMySQL(settings, built, query.applyTitleCase);
  return searchSQLite(databaseFile, built, query.applyTitleCase);
}

function readImportedAt(databaseFile) {
  if (!fs.existsSync(databaseFile)) return null;
  let db;
  try {
    db = new DatabaseSync(databaseFile, { readOnly: true });
    const row = db.prepare('SELECT imported_at FROM app_info LIMIT 1').get();
    return row?.imported_at ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

module.exports = {
  search,
  testConnection,
  readImportedAt,
  searchSQLite,
};
