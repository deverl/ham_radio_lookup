'use strict';

(function () {

const LICENSE_STATUSES = [
  { code: 'A', title: 'Active' },
  { code: 'C', title: 'Canceled' },
  { code: 'E', title: 'Expired' },
  { code: 'L', title: 'Pending Legal Status' },
  { code: 'P', title: 'Parent Station Canceled' },
  { code: 'T', title: 'Terminated' },
  { code: 'X', title: 'Term Pending' },
];

const OPERATOR_CLASSES = [
  { code: 'A', title: 'Advanced' },
  { code: 'E', title: 'Amateur Extra' },
  { code: 'G', title: 'General' },
  { code: 'N', title: 'Novice' },
  { code: 'P', title: 'Technician Plus' },
  { code: 'T', title: 'Technician' },
];

const CSV_HEADER = [
  'Call Sign', 'First Name', 'Last Name', 'Street Address', 'City', 'State',
  'ZIP', 'Operator Class', 'License Status', 'FRN', 'Region Code', 'DMR ID',
];

const MAXIMUM_AGE_MS = 8 * 24 * 60 * 60 * 1000;

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'via',
]);

const PRESERVED = new Set(['PO', 'RR', 'HC', 'NE', 'NW', 'SE', 'SW']);

function statusTitle(code) {
  return LICENSE_STATUSES.find((item) => item.code === code)?.title ?? code;
}

function classTitle(code) {
  return OPERATOR_CLASSES.find((item) => item.code === code)?.title ?? code;
}

function titleCaseWord(word) {
  let result = '';
  let capitalizeNext = true;
  for (const character of word) {
    if (character === '-' || character === '/' || character === "'" || character === '’') {
      result += character;
      capitalizeNext = true;
      continue;
    }
    if (/\p{L}/u.test(character)) {
      result += capitalizeNext ? character.toUpperCase() : character.toLowerCase();
      capitalizeNext = false;
    } else {
      result += character;
    }
  }
  return result;
}

function titleCase(value) {
  const words = String(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((word, index) => {
    const upper = word.toUpperCase();
    if (PRESERVED.has(upper)) return upper;
    const cased = titleCaseWord(word);
    const isEdge = index === 0 || index === words.length - 1;
    if (!isEdge && SMALL_WORDS.has(cased.toLowerCase())) return cased.toLowerCase();
    return cased;
  }).join(' ');
}

function likePrefix(value) {
  let escaped = '';
  for (const character of value) {
    if (character === '!' || character === '%' || character === '_') escaped += '!';
    escaped += character;
  }
  return `${escaped}%`;
}

function trimmed(value) {
  return String(value ?? '').trim();
}

function statement(query) {
  const callSign = trimmed(query.callSign).toUpperCase();
  const firstName = trimmed(query.firstName);
  const lastName = trimmed(query.lastName);
  const city = trimmed(query.city);
  const state = trimmed(query.state).toUpperCase();
  if (!callSign && !firstName && !lastName && !city && !state) return null;

  const clauses = [];
  const parameters = [];
  const escape = " ESCAPE '!'";

  if (callSign) {
    clauses.push('en.call_sign = ?');
    parameters.push(callSign);
  }
  if (firstName) {
    clauses.push(`en.first_name LIKE ?${escape}`);
    parameters.push(likePrefix(firstName));
  }
  if (lastName) {
    clauses.push(`en.last_name LIKE ?${escape}`);
    parameters.push(likePrefix(lastName));
  }
  if (city) {
    clauses.push(`en.city LIKE ?${escape}`);
    parameters.push(likePrefix(city));
  }
  if (state) {
    clauses.push('en.state = ?');
    parameters.push(state);
  }

  const statuses = LICENSE_STATUSES.map((item) => item.code).filter((code) => query.licenseStatuses?.includes(code));
  if (statuses.length) {
    clauses.push(`hd.license_status IN (${statuses.map(() => '?').join(', ')})`);
    parameters.push(...statuses);
  }
  const classes = OPERATOR_CLASSES.map((item) => item.code).filter((code) => query.operatorClasses?.includes(code));
  if (classes.length) {
    clauses.push(`am.operator_class IN (${classes.map(() => '?').join(', ')})`);
    parameters.push(...classes);
  }

  const sql = `SELECT en.call_sign AS call_sign,
       en.first_name AS first_name,
       en.last_name AS last_name,
       en.street_address AS street_address,
       en.city AS city,
       en.state AS state,
       en.zip AS zip_code,
       am.operator_class AS operator_class,
       hd.license_status AS license_status,
       en.frn AS frn,
       am.region_code AS region_code,
       IFNULL(dmr.radio_id, '') AS dmr_id
FROM en
JOIN hd ON hd.sys_id = en.sys_id
JOIN am ON am.sys_id = en.sys_id
LEFT JOIN dmr ON dmr.call_sign = en.call_sign
WHERE ${clauses.join('\n  AND ')}
ORDER BY en.last_name ASC, en.first_name ASC`;
  return { sql, parameters };
}

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function shapeRecord(row, applyTitleCase) {
  const shape = (value) => (applyTitleCase ? titleCase(value) : value);
  const operatorClass = text(row.operator_class);
  const licenseStatus = text(row.license_status);
  return {
    callSign: text(row.call_sign),
    firstName: shape(text(row.first_name)),
    lastName: shape(text(row.last_name)),
    streetAddress: shape(text(row.street_address)),
    city: shape(text(row.city)),
    state: text(row.state),
    zip: text(row.zip_code),
    operatorClass,
    operatorClassName: classTitle(operatorClass),
    licenseStatus,
    licenseStatusName: statusTitle(licenseStatus),
    frn: text(row.frn),
    regionCode: text(row.region_code),
    dmrID: text(row.dmr_id),
  };
}

function recordFields(record) {
  return [
    record.callSign, record.firstName, record.lastName, record.streetAddress,
    record.city, record.state, record.zip, record.operatorClass, record.operatorClassName,
    record.licenseStatus, record.licenseStatusName, record.frn, record.regionCode, record.dmrID,
  ];
}

function matches(record, query) {
  const needle = trimmed(query).toLowerCase();
  if (!needle) return true;
  return recordFields(record).some((field) => String(field).toLowerCase().includes(needle));
}

function columns(record) {
  return [
    record.callSign, record.firstName, record.lastName, record.streetAddress,
    record.city, record.state, record.zip, record.operatorClassName,
    record.licenseStatusName, record.frn, record.regionCode, record.dmrID,
  ];
}

function csvField(value) {
  const textValue = String(value ?? '');
  if (/[",\n\r]/.test(textValue)) return `"${textValue.replaceAll('"', '""')}"`;
  return textValue;
}

function csv(records) {
  const lines = [CSV_HEADER.map(csvField).join(',')];
  for (const record of records) lines.push(columns(record).map(csvField).join(','));
  return `${lines.join('\n')}\n`;
}

function tabSeparated(record) {
  return columns(record).join('\t');
}

function classifyFreshness(importedAt, now = new Date()) {
  if (!importedAt) return { kind: 'missing', importedAt: null };
  const date = importedAt instanceof Date ? importedAt : new Date(importedAt);
  if (Number.isNaN(date.getTime())) return { kind: 'missing', importedAt: null };
  const kind = now.getTime() - date.getTime() > MAXIMUM_AGE_MS ? 'stale' : 'current';
  return { kind, importedAt: date.toISOString() };
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

function databaseNotice(freshness) {
  if (freshness.kind === 'stale') {
    return {
      title: 'License Database Is Old',
      message: `The license database was last built ${formatWhen(freshness.importedAt)} and is more than 8 days old. It should be updated.`,
      button: 'Update',
      cancel: 'Later',
    };
  }
  return {
    title: 'License Database Needed',
    message: 'The license database has not been created. Create it before searching. This downloads the FCC amateur license file (about 190 MB) and the RadioID user list.',
    button: 'Create',
    cancel: 'Not Now',
  };
}

function confirmCopy(engine, freshness, databaseName, downloadDir) {
  const creating = engine === 'sqlite' && freshness.kind === 'missing';
  if (engine === 'mysql') {
    return {
      title: 'Update License Database?',
      button: 'Update',
      message: `This downloads the latest FCC amateur license file (about 190 MB) and the RadioID user list, then rebuilds the MySQL database ${databaseName}. The current license tables are replaced. Downloaded files are left in ${downloadDir}.`,
    };
  }
  if (creating) {
    return {
      title: 'Create License Database?',
      button: 'Create',
      message: `The license database has not been created. This downloads the FCC amateur license file (about 190 MB) and the RadioID user list, then builds a database in Ham Radio Query. Downloaded files are left in ${downloadDir}.`,
    };
  }
  return {
    title: 'Update License Database?',
    button: 'Update',
    message: `This downloads the latest FCC amateur license file (about 190 MB) and the RadioID user list, then replaces the SQLite license database. Downloaded files are left in ${downloadDir}.`,
  };
}

function maintenanceTitle(engine, freshness) {
  if (engine === 'sqlite' && freshness.kind === 'missing') return 'Create License Database…';
  return 'Update License Database…';
}

function validatedName(name) {
  const trimmedName = trimmed(name);
  if (!/^[A-Za-z0-9_]{1,64}$/.test(trimmedName)) {
    const error = new Error(`The database name “${trimmedName}” cannot be used. Use letters, numbers, and underscores.`);
    error.databaseReplaced = false;
    throw error;
  }
  return trimmedName;
}

const api = {
  LICENSE_STATUSES,
  OPERATOR_CLASSES,
  CSV_HEADER,
  MAXIMUM_AGE_MS,
  statusTitle,
  classTitle,
  titleCase,
  likePrefix,
  statement,
  shapeRecord,
  matches,
  columns,
  csv,
  tabSeparated,
  classifyFreshness,
  formatWhen,
  databaseNotice,
  confirmCopy,
  maintenanceTitle,
  validatedName,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  globalThis.HamLogic = api;
}
})();
