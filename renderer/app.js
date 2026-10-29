'use strict';

const ROW_HEIGHT = 24;
const COLUMNS = [
  { key: 'callSign', title: 'Call Sign', cls: 'mono' },
  { key: 'firstName', title: 'First Name' },
  { key: 'lastName', title: 'Last Name' },
  { key: 'streetAddress', title: 'Street Address' },
  { key: 'city', title: 'City' },
  { key: 'state', title: 'State' },
  { key: 'zip', title: 'ZIP', cls: 'digits' },
  { key: 'operatorClassName', title: 'Operator Class' },
  { key: 'licenseStatusName', title: 'License Status' },
  { key: 'frn', title: 'FRN', cls: 'digits' },
  { key: 'regionCode', title: 'Region Code' },
  { key: 'dmrID', title: 'DMR ID', cls: 'digits' },
];

const $ = (id) => document.getElementById(id);

const state = {
  snapshot: null,
  offered: false,
  records: [],
  filtered: [],
  selection: new Set(),
  anchor: 0,
  sortKey: '',
  sortDir: 1,
  filter: '',
  hasSearched: false,
  hadCriteria: false,
  searching: false,
  updating: false,
  error: '',
  statuses: new Set(['A']),
  classes: new Set(HamLogic.OPERATOR_CLASSES.map((item) => item.code)),
};

const callSign = $('call-sign');
const firstName = $('first-name');
const lastName = $('last-name');
const city = $('city');
const stateField = $('state');
const titleCase = $('title-case');
const searchButton = $('search');
const clearButton = $('clear');
const exportButton = $('export');
const filterInput = $('filter');
const tableScroll = $('table-scroll');
const header = $('header');
const spacer = $('spacer');
const rows = $('rows');
const empty = $('empty');
const menu = $('menu');

callSign.addEventListener('input', () => {
  const next = callSign.value.toUpperCase();
  if (next !== callSign.value) callSign.value = next;
});

function queryFromForm() {
  return {
    callSign: callSign.value,
    firstName: firstName.value,
    lastName: lastName.value,
    city: city.value,
    state: stateField.value,
    licenseStatuses: [...state.statuses],
    operatorClasses: [...state.classes],
    applyTitleCase: titleCase.checked,
  };
}

function hasCriteria(query) {
  return [query.callSign, query.firstName, query.lastName, query.city, query.state]
    .some((value) => value.trim());
}

function buildChecks(container, items, selected, hint) {
  container.replaceChildren();
  for (const item of items) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(item.code);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(item.code);
      else selected.delete(item.code);
      hint.hidden = selected.size !== 0;
    });
    label.append(box, document.createTextNode(`${item.code}  ${item.title}`));
    container.append(label);
  }
  hint.hidden = selected.size !== 0;
}

buildChecks($('status-checks'), HamLogic.LICENSE_STATUSES, state.statuses, $('status-hint'));
buildChecks($('class-checks'), HamLogic.OPERATOR_CLASSES, state.classes, $('class-hint'));

$('options-toggle').addEventListener('click', () => {
  const open = $('options').hidden;
  $('options').hidden = !open;
  $('options-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('chevron').innerHTML = open
    ? '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2 7.8 6 4l4 3.8"/>'
    : '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2 4.2 6 8l4-3.8"/>';
});

function searchUnavailable() {
  return Boolean(state.snapshot?.searchUnavailable);
}

function syncControls() {
  const busy = state.searching || state.updating;
  searchButton.disabled = busy || searchUnavailable();
  searchButton.title = searchUnavailable()
    ? 'Create the license database before searching.'
    : 'Search the license database';
  clearButton.disabled = busy;
  $('search-spinner').hidden = !state.searching;
  $('status-spinner').hidden = !state.searching;
  exportButton.disabled = state.filtered.length === 0;
  window.ham.menuState({
    canExport: state.filtered.length > 0,
    canCopy: state.selection.size > 0,
    canMaintain: !state.searching && !state.updating,
    maintenanceTitle: state.snapshot
      ? HamLogic.maintenanceTitle(state.snapshot.engine, state.snapshot.freshness)
      : 'Update License Database…',
  });
}

function applySortAndFilter() {
  let list = state.records;
  if (state.sortKey) {
    const key = state.sortKey;
    const dir = state.sortDir;
    list = list.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base', numeric: true }) * dir);
  }
  const needle = state.filter.trim();
  state.filtered = needle ? list.filter((record) => HamLogic.matches(record, needle)) : list;
}

function summaryText() {
  const total = state.records.length;
  if (!total) return '';
  if (state.filter.trim()) {
    const noun = total === 1 ? 'record' : 'records';
    return `Showing ${state.filtered.length} of ${total} ${noun}`;
  }
  if (total === 1) return 'Found 1 matching record';
  return `Found ${total} matching records`;
}

function icon(name) {
  const paths = {
    antenna: '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M24 38V18M24 18l-7 7M24 18l7 7"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M14 16c2.8 3 6 4.6 10 4.6S31.2 19 34 16M10 11c4 4.2 8.4 6.4 14 6.4S34 15.2 38 11"/>',
    search: '<circle cx="22" cy="22" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m28 28 8 8"/>',
    text: '<circle cx="21" cy="21" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m27 27 8 8M17 21h8"/>',
    filter: '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M10 14h28l-10 12v8l-8 4v-12z"/>',
    drivePlus: '<rect x="8" y="14" width="26" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M32 10v8M28 14h8"/>',
    driveWarn: '<rect x="8" y="14" width="26" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M33 8v7M33 18.5v.5"/>',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function showEmpty(kind) {
  tableScroll.hidden = true;
  empty.hidden = false;
  empty.replaceChildren();
  const add = (tag, text, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    empty.append(node);
    return node;
  };
  if (kind === 'error') {
    empty.insertAdjacentHTML('afterbegin', icon('driveWarn'));
    add('h2', "Can't Reach the Database");
    add('p', state.error);
    const button = add('button', 'Database Settings…', 'regular');
    button.type = 'button';
    button.addEventListener('click', openSettings);
  } else if (kind === 'searching') {
    const spin = document.createElement('div');
    spin.className = 'spinner';
    empty.append(spin);
    add('p', 'Searching…');
  } else if (kind === 'none') {
    empty.insertAdjacentHTML('afterbegin', icon('search'));
    add('h2', 'No Results Found');
    add('p', 'No licenses matched this search.');
  } else if (kind === 'criteria') {
    empty.insertAdjacentHTML('afterbegin', icon('text'));
    add('h2', 'Enter a Search');
    add('p', 'Enter a call sign, name, city, or state.');
  } else if (kind === 'needed') {
    empty.insertAdjacentHTML('afterbegin', icon('drivePlus'));
    add('h2', 'License Database Needed');
    add('p', 'The license database has not been created. Create it before searching.');
    const button = add('button', 'Create Database…', 'regular');
    button.type = 'button';
    button.addEventListener('click', () => openConfirm());
  } else if (kind === 'filter') {
    empty.insertAdjacentHTML('afterbegin', icon('filter'));
    add('h2', 'No Matching Rows');
    add('p', `Nothing in these results contains “${state.filter.trim()}”.`);
  } else {
    empty.insertAdjacentHTML('afterbegin', icon('antenna'));
    add('h2', 'Ham Radio Lookup');
    add('p', 'Search FCC license records by call sign, name, city, or state.');
  }
}

function viewKind() {
  if (state.error && state.records.length === 0) return 'error';
  if (state.searching && state.records.length === 0) return 'searching';
  if (state.records.length === 0 && state.hasSearched && state.hadCriteria) return 'none';
  if (state.hasSearched && !state.hadCriteria) return 'criteria';
  if (searchUnavailable() && state.records.length === 0) return 'needed';
  if (state.records.length === 0) return 'welcome';
  if (state.filtered.length === 0) return 'filter';
  return 'table';
}

function cellText(record, column) {
  if (column.key === 'dmrID' && !record.dmrID) return '-';
  return record[column.key] ?? '';
}

function paintRows() {
  const count = state.filtered.length;
  spacer.style.height = `${count * ROW_HEIGHT}px`;
  spacer.style.position = 'relative';
  const headerHeight = header.offsetHeight || 28;
  const start = Math.max(0, Math.floor((tableScroll.scrollTop - headerHeight) / ROW_HEIGHT) - 8);
  const end = Math.min(count, Math.ceil((tableScroll.scrollTop + tableScroll.clientHeight) / ROW_HEIGHT) + 8);
  rows.style.position = 'absolute';
  rows.style.left = '0';
  rows.style.right = '0';
  rows.style.top = `${start * ROW_HEIGHT}px`;
  rows.replaceChildren();
  for (let index = start; index < end; index += 1) {
    const record = state.filtered[index];
    const row = document.createElement('div');
    row.className = state.selection.has(record.id) ? 'row data selected' : 'row data';
    row.dataset.index = String(index);
    for (const column of COLUMNS) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (column.cls) cell.classList.add(column.cls);
      if (column.key === 'licenseStatusName' && record.licenseStatus !== 'A') cell.classList.add('secondary');
      if (column.key === 'dmrID' && !record.dmrID) cell.classList.add('tertiary');
      cell.textContent = cellText(record, column);
      row.append(cell);
    }
    rows.append(row);
  }
}

function render() {
  applySortAndFilter();
  const kind = viewKind();
  $('banner').hidden = !(state.error && state.records.length);
  $('banner-text').textContent = state.error || '';
  $('filterbar').hidden = state.records.length === 0;
  const summary = summaryText();
  $('statusbar').hidden = !summary;
  $('summary').textContent = summary;
  if (kind === 'table') {
    empty.hidden = true;
    tableScroll.hidden = false;
    paintRows();
  } else {
    showEmpty(kind);
  }
  syncControls();
}

header.replaceChildren();
for (const column of COLUMNS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.key = column.key;
  const label = document.createElement('span');
  label.textContent = column.title;
  const mark = document.createElement('span');
  mark.className = 'sort-mark';
  button.append(label, mark);
  button.addEventListener('click', () => {
    if (state.sortKey === column.key) state.sortDir *= -1;
    else {
      state.sortKey = column.key;
      state.sortDir = 1;
    }
    updateSortMarks();
    tableScroll.scrollTop = 0;
    render();
  });
  header.append(button);
}

function updateSortMarks() {
  for (const button of header.querySelectorAll('button')) {
    const mark = button.querySelector('.sort-mark');
    if (button.dataset.key === state.sortKey) mark.textContent = state.sortDir > 0 ? '▲' : '▼';
    else mark.textContent = '';
  }
}

tableScroll.addEventListener('scroll', () => {
  if (!tableScroll.hidden) paintRows();
});
window.addEventListener('resize', () => {
  if (!tableScroll.hidden) paintRows();
});

function selectRange(from, to, add) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (!add) state.selection.clear();
  for (let index = start; index <= end; index += 1) state.selection.add(state.filtered[index].id);
}

tableScroll.addEventListener('click', (event) => {
  const row = event.target.closest('.data');
  if (!row) return;
  const index = Number(row.dataset.index);
  const id = state.filtered[index].id;
  if (event.shiftKey) selectRange(state.anchor, index, event.metaKey || event.ctrlKey);
  else if (event.metaKey || event.ctrlKey) {
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    state.anchor = index;
  } else {
    state.selection.clear();
    state.selection.add(id);
    state.anchor = index;
  }
  paintRows();
  syncControls();
});

tableScroll.addEventListener('dblclick', (event) => {
  const row = event.target.closest('.data');
  if (!row) return;
  searchCallSign(state.filtered[Number(row.dataset.index)]);
});

tableScroll.addEventListener('contextmenu', (event) => {
  const row = event.target.closest('.data');
  if (!row) return;
  event.preventDefault();
  const index = Number(row.dataset.index);
  const id = state.filtered[index].id;
  if (!state.selection.has(id)) {
    state.selection.clear();
    state.selection.add(id);
    state.anchor = index;
    paintRows();
    syncControls();
  }
  menu.hidden = false;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 70)}px`;
  $('menu-search').disabled = state.selection.size !== 1;
});

document.addEventListener('click', (event) => {
  if (!menu.contains(event.target)) menu.hidden = true;
});

function chosenRecords() {
  return state.filtered.filter((record) => state.selection.has(record.id));
}

function copySelection() {
  const chosen = chosenRecords();
  if (!chosen.length) return;
  const headerLine = HamLogic.CSV_HEADER.join('\t');
  const text = [headerLine, ...chosen.map(HamLogic.tabSeparated)].join('\n');
  window.ham.copyText(text);
}

$('menu-copy').addEventListener('click', () => {
  menu.hidden = true;
  copySelection();
});
$('menu-search').addEventListener('click', () => {
  menu.hidden = true;
  const chosen = chosenRecords();
  if (chosen.length === 1) searchCallSign(chosen[0]);
});

function searchCallSign(record) {
  if (!record) return;
  callSign.value = record.callSign;
  firstName.value = '';
  lastName.value = '';
  city.value = '';
  stateField.value = '';
  runSearch();
}

async function runSearch() {
  if (state.searching || state.updating) return;
  if (searchUnavailable()) {
    state.records = [];
    state.error = '';
    state.hasSearched = false;
    state.hadCriteria = false;
    render();
    openNotice();
    return;
  }
  const query = queryFromForm();
  state.error = '';
  state.filter = '';
  filterInput.value = '';
  state.selection.clear();
  state.sortKey = '';
  state.sortDir = 1;
  updateSortMarks();
  state.hasSearched = true;
  state.hadCriteria = hasCriteria(query);
  if (!state.hadCriteria) {
    state.records = [];
    state.searching = false;
    render();
    return;
  }
  state.searching = true;
  state.records = [];
  render();
  const result = await window.ham.search(query);
  state.searching = false;
  if (result.ok) {
    state.records = result.records;
    state.error = '';
  } else {
    state.records = [];
    state.error = result.message;
  }
  render();
}

function clearForm() {
  callSign.value = '';
  firstName.value = '';
  lastName.value = '';
  city.value = '';
  stateField.value = '';
  state.statuses = new Set(['A']);
  state.classes = new Set(HamLogic.OPERATOR_CLASSES.map((item) => item.code));
  titleCase.checked = true;
  buildChecks($('status-checks'), HamLogic.LICENSE_STATUSES, state.statuses, $('status-hint'));
  buildChecks($('class-checks'), HamLogic.OPERATOR_CLASSES, state.classes, $('class-hint'));
  state.filter = '';
  filterInput.value = '';
  state.records = [];
  state.selection.clear();
  state.sortKey = '';
  updateSortMarks();
  state.hasSearched = false;
  state.hadCriteria = false;
  state.searching = false;
  state.error = '';
  render();
}

$('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});
clearButton.addEventListener('click', clearForm);
filterInput.addEventListener('input', () => {
  state.filter = filterInput.value;
  state.selection.clear();
  tableScroll.scrollTop = 0;
  render();
});

function openSettings() {
  window.ham.openSettings();
}

$('banner-settings').addEventListener('click', openSettings);
document.getElementById('database').addEventListener('click', openSettings);
exportButton.addEventListener('click', exportResults);

function openDialog(title, message, ok, cancel, onOk) {
  $('alert-title').textContent = title;
  $('alert-message').textContent = message;
  $('alert-ok').textContent = ok;
  $('alert-cancel').textContent = cancel;
  if ($('alert').open) $('alert').close();
  $('alert').showModal();
  $('alert-ok').onclick = () => {
    $('alert').close();
    onOk();
  };
  $('alert-cancel').onclick = () => $('alert').close();
}

function openNotice() {
  if (!state.snapshot || state.snapshot.engine !== 'sqlite') return;
  const notice = HamLogic.databaseNotice(state.snapshot.freshness);
  openDialog(notice.title, notice.message, notice.button, notice.cancel, beginUpdate);
}

function openConfirm() {
  if (!state.snapshot || state.searching || state.updating) return;
  const copy = HamLogic.confirmCopy(
    state.snapshot.engine,
    state.snapshot.freshness,
    state.snapshot.settings.database,
    state.snapshot.downloadDir,
  );
  openDialog(copy.title, copy.message, copy.button, 'Cancel', beginUpdate);
}

function showSheet() {
  $('sheet-status').textContent = 'Preparing…';
  $('sheet-detail').textContent = '';
  $('sheet-error').hidden = true;
  $('sheet-lock').hidden = true;
  $('sheet-files').textContent = `Downloaded files stay in ${state.snapshot?.downloadDir || '/tmp/ham-radio-lookup'} until the next restart.`;
  $('sheet-cancel').hidden = false;
  $('sheet-cancel').disabled = false;
  $('sheet-done').hidden = true;
  const progress = $('sheet-progress');
  progress.hidden = false;
  progress.classList.add('busy');
  progress.firstElementChild.style.width = '';
  if (!$('sheet').open) $('sheet').showModal();
}

async function beginUpdate() {
  state.updating = true;
  syncControls();
  showSheet();
  await window.ham.startUpdate();
  state.updating = false;
  syncControls();
}

$('sheet-cancel').addEventListener('click', () => window.ham.cancelUpdate());
$('sheet-done').addEventListener('click', () => $('sheet').close());
$('sheet').addEventListener('cancel', (event) => {
  if (state.updating) event.preventDefault();
});

window.ham.on('update-progress', (snapshot) => {
  $('sheet-status').textContent = snapshot.status;
  $('sheet-detail').textContent = snapshot.detail || '';
  const progress = $('sheet-progress');
  if (snapshot.fraction == null) {
    progress.hidden = Boolean(snapshot.done && !state.updating);
    progress.classList.toggle('busy', snapshot.fraction == null && !snapshot.done);
    progress.firstElementChild.style.width = '';
  } else {
    progress.hidden = false;
    progress.classList.remove('busy');
    progress.firstElementChild.style.width = `${Math.round(snapshot.fraction * 100)}%`;
  }
  if (snapshot.error) {
    $('sheet-error').hidden = false;
    $('sheet-error').textContent = snapshot.error;
    progress.hidden = true;
  }
  const cancellable = Boolean(snapshot.canCancel) && !snapshot.done;
  $('sheet-cancel').disabled = !cancellable;
  $('sheet-lock').hidden = snapshot.done || cancellable || !state.updating;
  if (snapshot.done) {
    state.updating = false;
    if (snapshot.replaced || snapshot.fraction === 1) {
      state.records = [];
      state.selection.clear();
      state.filter = '';
      filterInput.value = '';
      state.hasSearched = false;
      state.hadCriteria = false;
      state.error = '';
    }
    $('sheet-cancel').hidden = true;
    $('sheet-done').hidden = false;
    $('sheet-lock').hidden = true;
    render();
  }
});

async function exportResults() {
  if (!state.filtered.length) return;
  const text = HamLogic.csv(state.filtered);
  const result = await window.ham.exportCSV(text);
  if (result && result.ok === false && result.message) state.error = result.message;
}

function applySnapshot(snapshot, { offer } = {}) {
  const previous = state.snapshot?.engine;
  state.snapshot = snapshot;
  $('sheet-files').textContent = `Downloaded files stay in ${snapshot.downloadDir} until the next restart.`;
  render();
  if (offer && snapshot.engine === 'sqlite' && snapshot.freshness.kind !== 'current') openNotice();
  else if (previous && previous !== snapshot.engine && snapshot.engine === 'sqlite' && snapshot.freshness.kind !== 'current') openNotice();
}

window.ham.on('state', (snapshot) => applySnapshot(snapshot));
window.ham.on('menu-command', (command) => {
  if (command === 'export') exportResults();
  else if (command === 'copy-selection') copySelection();
  else if (command === 'maintain') openConfirm();
  else if (command === 'focus-filter' && !$('filterbar').hidden) filterInput.focus();
});

async function boot() {
  const snapshot = await window.ham.bootstrap();
  state.offered = true;
  applySnapshot(snapshot, { offer: true });
}

boot();
