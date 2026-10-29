'use strict';

const hdColumns = [
  'record_type', 'sys_id', 'file_number', 'ebf_number', 'call_sign', 'license_status',
  'radio_service_code', 'grant_date', 'expired_date', 'cancellation_date', 'eligibility_rule_num',
  'reserved1', 'alien', 'alien_government', 'alien_corporation', 'alien_officer', 'alien_control',
  'revoked', 'convicted', 'adjudged', 'reserved2', 'common_carrier', 'non_common_carrier',
  'private_comm', 'fixed', 'mobile', 'radiolocation', 'satellite', 'dev_sta_demo',
  'interconnected_service', 'certifier_first_name', 'certifier_middle_initial', 'certifier_last_name',
  'certifier_suffix', 'certifier_title', 'female', 'black_or_african_american', 'native_american',
  'hawaiian', 'asian', 'white', 'hispanic', 'effective_date', 'last_action_date', 'auction_id',
  'broadcast_regulatory_status', 'band_manager_regulatory_status', 'broadcast_services_type',
  'alien_ruling', 'licensee_name_change', 'whitespace_indicator', 'operation_perf_requirement_choice',
  'operation_perf_requirement_answer', 'discontinuation_of_service', 'regulatory_compliance',
  '_900_mhz_eligibility_cert', '_900_mhz_transition_plan_cert', '_900_mhz_return_spectrum_cert',
  '_900_mhz_payment_cert',
];

const enColumns = [
  'record_type', 'sys_id', 'file_number', 'ebf_number', 'call_sign', 'entity_type', 'licensee_id',
  'entity_name', 'first_name', 'middle_initial', 'last_name', 'suffix', 'phone', 'fax', 'email',
  'street_address', 'city', 'state', 'zip', 'po_box', 'attention_line', 'sgin', 'frn',
  'app_type_code', 'app_type_code_other', 'status_code', 'status_date', '_37_ghz_lic_type',
  'linked_sys_id', 'linked_call_sign',
];

const amColumns = [
  'record_type', 'sys_id', 'file_number', 'ebf_number', 'call_sign', 'operator_class', 'group_code',
  'region_code', 'trustee_call_sign', 'trustee_indicator', 'physician_cert', 've_signature',
  'systematic_call_sign_change', 'vanity_call_sign_change', 'vanity_relationship', 'previous_call_sign',
  'previous_operator_class', 'trustee_name',
];

const dmrColumns = [
  'radio_id', 'call_sign', 'first_name', 'last_name', 'city', 'state', 'country',
];

const nocaseColumns = new Set([
  'call_sign', 'first_name', 'last_name', 'city', 'state', 'license_status', 'operator_class',
]);

function table(name, columns) {
  const definitions = columns.map((column) => (
    nocaseColumns.has(column) ? `${column} TEXT COLLATE NOCASE` : `${column} TEXT`
  ));
  return `CREATE TABLE ${name} (\n    ${definitions.join(',\n    ')}\n);`;
}

const createTables = `${table('hd', hdColumns)}
${table('en', enColumns)}
${table('am', amColumns)}
${table('dmr', dmrColumns)}
CREATE TABLE app_info (
    imported_at TEXT NOT NULL
);`;

const createIndexes = `CREATE INDEX en_call_sign_index ON en (call_sign);
CREATE INDEX en_first_name_last_name_index ON en (first_name, last_name);
CREATE INDEX en_last_name_index ON en (last_name);
CREATE INDEX en_city ON en (city);
CREATE INDEX hd_sys_id_index ON hd (sys_id, license_status);
CREATE INDEX am_sys_id_index ON am (sys_id, operator_class, region_code);
CREATE INDEX dmr_call_sign_index ON dmr (call_sign, radio_id);`;

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function importScript(hd, en, am) {
  return `.dbconfig defensive off
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -262144;
${createTables}
.mode ascii
.separator "|" "\\n"
.import ${hd} hd
.import ${en} en
.import ${am} am
`;
}

function dmrScript(csv) {
  return `.mode csv
.import --skip 1 ${csv} dmr
`;
}

function finishScript(importedAt) {
  return `${createIndexes}
INSERT INTO app_info (imported_at) VALUES (${sqlString(importedAt)});
SELECT COUNT(*) FROM en;
`;
}

function quotedIdentifier(name) {
  return `\`${String(name).replaceAll('`', '``')}\``;
}

function mysqlLiteral(value) {
  let escaped = '';
  for (const character of String(value)) {
    if (character === '\\' || character === "'") escaped += `\\${character}`;
    else if (character === '\n') escaped += '\\n';
    else if (character === '\r') escaped += '\\r';
    else escaped += character;
  }
  return `'${escaped}'`;
}

const mysqlLicenseTables = `CREATE TABLE hd (
    record_type VARCHAR(10),
    sys_id BIGINT,
    file_number VARCHAR(20),
    ebf_number VARCHAR(20),
    call_sign VARCHAR(20),
    license_status VARCHAR(5),
    radio_service_code VARCHAR(10),
    grant_date VARCHAR(20),
    expired_date VARCHAR(20),
    cancellation_date VARCHAR(20),
    eligibility_rule_num VARCHAR(10),
    reserved1 VARCHAR(10),
    alien VARCHAR(5),
    alien_government VARCHAR(5),
    alien_corporation VARCHAR(5),
    alien_officer VARCHAR(5),
    alien_control VARCHAR(5),
    revoked VARCHAR(5),
    convicted VARCHAR(5),
    adjudged VARCHAR(5),
    reserved2 VARCHAR(10),
    common_carrier VARCHAR(5),
    non_common_carrier VARCHAR(5),
    private_comm VARCHAR(5),
    fixed VARCHAR(5),
    mobile VARCHAR(5),
    radiolocation VARCHAR(5),
    satellite VARCHAR(5),
    dev_sta_demo VARCHAR(5),
    interconnected_service VARCHAR(5),
    certifier_first_name VARCHAR(50),
    certifier_middle_initial VARCHAR(5),
    certifier_last_name VARCHAR(50),
    certifier_suffix VARCHAR(10),
    certifier_title VARCHAR(50),
    female VARCHAR(5),
    black_or_african_american VARCHAR(5),
    native_american VARCHAR(5),
    hawaiian VARCHAR(5),
    asian VARCHAR(5),
    white VARCHAR(5),
    hispanic VARCHAR(5),
    effective_date VARCHAR(20),
    last_action_date VARCHAR(20),
    auction_id INT,
    broadcast_regulatory_status VARCHAR(10),
    band_manager_regulatory_status VARCHAR(10),
    broadcast_services_type VARCHAR(10),
    alien_ruling VARCHAR(10),
    licensee_name_change VARCHAR(10),
    whitespace_indicator VARCHAR(5),
    operation_perf_requirement_choice VARCHAR(10),
    operation_perf_requirement_answer VARCHAR(10),
    discontinuation_of_service VARCHAR(10),
    regulatory_compliance VARCHAR(10),
    _900_mhz_eligibility_cert VARCHAR(10),
    _900_mhz_transition_plan_cert VARCHAR(10),
    _900_mhz_return_spectrum_cert VARCHAR(10),
    _900_mhz_payment_cert VARCHAR(10)
);

CREATE TABLE en (
    record_type VARCHAR(10),
    sys_id BIGINT,
    file_number VARCHAR(20),
    ebf_number VARCHAR(20),
    call_sign VARCHAR(20),
    entity_type VARCHAR(10),
    licensee_id VARCHAR(20),
    entity_name VARCHAR(100),
    first_name VARCHAR(50),
    middle_initial VARCHAR(5),
    last_name VARCHAR(50),
    suffix VARCHAR(10),
    phone VARCHAR(20),
    fax VARCHAR(20),
    email VARCHAR(100),
    street_address VARCHAR(100),
    city VARCHAR(50),
    state VARCHAR(10),
    zip VARCHAR(20),
    po_box VARCHAR(20),
    attention_line VARCHAR(100),
    sgin VARCHAR(20),
    frn VARCHAR(20),
    app_type_code VARCHAR(10),
    app_type_code_other VARCHAR(10),
    status_code VARCHAR(10),
    status_date VARCHAR(20),
    _37_ghz_lic_type VARCHAR(10),
    linked_sys_id BIGINT,
    linked_call_sign VARCHAR(20)
);

CREATE TABLE am (
    record_type VARCHAR(10),
    sys_id BIGINT,
    file_number VARCHAR(20),
    ebf_number VARCHAR(20),
    call_sign VARCHAR(20),
    operator_class VARCHAR(5),
    group_code VARCHAR(5),
    region_code VARCHAR(10),
    trustee_call_sign VARCHAR(20),
    trustee_indicator VARCHAR(5),
    physician_cert VARCHAR(5),
    ve_signature VARCHAR(5),
    systematic_call_sign_change VARCHAR(5),
    vanity_call_sign_change VARCHAR(5),
    vanity_relationship VARCHAR(10),
    previous_call_sign VARCHAR(20),
    previous_operator_class VARCHAR(5),
    trustee_name VARCHAR(100)
);

CREATE INDEX en_call_sign_index ON en (call_sign);
CREATE INDEX en_first_name_last_name_index ON en (first_name, last_name);
CREATE INDEX en_last_name_index ON en (last_name);
CREATE INDEX en_city ON en (city);
CREATE INDEX hd_sys_id_index ON hd (sys_id, license_status);
CREATE INDEX am_sys_id_index ON am (sys_id, operator_class, region_code);`;

function licenseSQL(database, hd, en, am) {
  return `CREATE DATABASE IF NOT EXISTS ${quotedIdentifier(database)};
USE ${quotedIdentifier(database)};

DROP TABLE IF EXISTS hd;
DROP TABLE IF EXISTS en;
DROP TABLE IF EXISTS am;

${mysqlLicenseTables}

LOAD DATA LOCAL INFILE ${mysqlLiteral(hd)}
INTO TABLE hd
FIELDS TERMINATED BY '|'
LINES TERMINATED BY '\\n';

LOAD DATA LOCAL INFILE ${mysqlLiteral(en)}
INTO TABLE en
FIELDS TERMINATED BY '|'
LINES TERMINATED BY '\\n';

LOAD DATA LOCAL INFILE ${mysqlLiteral(am)}
INTO TABLE am
FIELDS TERMINATED BY '|'
LINES TERMINATED BY '\\n';
`;
}

function dmrSQL(database, csv) {
  return `USE ${quotedIdentifier(database)};

DROP TABLE IF EXISTS dmr;

CREATE TABLE dmr (
    radio_id VARCHAR(20),
    call_sign VARCHAR(20),
    first_name VARCHAR(30),
    last_name VARCHAR(40),
    city VARCHAR(40),
    state VARCHAR(30),
    country VARCHAR(30)
);

CREATE INDEX dmr_call_sign_index ON dmr (call_sign, radio_id);

LOAD DATA LOCAL INFILE ${mysqlLiteral(csv)}
INTO TABLE dmr
FIELDS TERMINATED BY ','
LINES TERMINATED BY '\\n';
`;
}

module.exports = {
  hdColumns,
  enColumns,
  amColumns,
  dmrColumns,
  createTables,
  createIndexes,
  importScript,
  dmrScript,
  finishScript,
  licenseSQL,
  dmrSQL,
  mysqlLiteral,
};
