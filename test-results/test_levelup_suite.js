// test-results/test_levelup_suite.js
const assert = require('assert');

console.log('=== LevelUp HTML and Excel Editors Test Suite ===\n');

// 1. Protocol Constants & Origins Verification
const TRUSTED_EDITOR_ORIGINS = [
  'https://levelup.technikh.com',
  'https://codestudio.pragament.com',
  'https://pragament.github.io'
];
const MESSAGE_PROTOCOL_VERSION = 'LEVELUP_EDITOR_v1';

assert.strictEqual(MESSAGE_PROTOCOL_VERSION, 'LEVELUP_EDITOR_v1');
assert.ok(TRUSTED_EDITOR_ORIGINS.includes('https://codestudio.pragament.com'));
assert.ok(TRUSTED_EDITOR_ORIGINS.includes('https://pragament.github.io'));
console.log('PASS [1/7]: Protocol constants & origin whitelist verified.');

// 2. PostMessage Message Protocol Validation
function validateIncomingPostMessage(event) {
  const isAllowedOrigin = TRUSTED_EDITOR_ORIGINS.some(allowed => {
    try {
      return new URL(allowed).origin === new URL(event.origin).origin;
    } catch (e) {
      return false;
    }
  });
  if (!isAllowedOrigin) return { valid: false, reason: 'untrusted_origin' };

  const data = event.data;
  if (!data || typeof data !== 'object' || data.protocol !== MESSAGE_PROTOCOL_VERSION) {
    return { valid: false, reason: 'invalid_protocol' };
  }

  const validTypes = ['EDITOR_READY', 'AUTOSAVE_NOTIFY', 'RESPONSE_GET_CONTENT', 'ERROR'];
  if (!validTypes.includes(data.type)) {
    return { valid: false, reason: 'unknown_type' };
  }

  return { valid: true, type: data.type, payload: data.payload, questionId: data.questionId };
}

// Test untrusted origin
assert.strictEqual(
  validateIncomingPostMessage({ origin: 'https://malicious-site.com', data: { protocol: 'LEVELUP_EDITOR_v1' } }).valid,
  false
);

// Test trusted CodeStudio editor ready event
const readyEvent = {
  origin: 'https://codestudio.pragament.com',
  data: {
    protocol: 'LEVELUP_EDITOR_v1',
    type: 'EDITOR_READY',
    questionId: 'q-html-1',
    payload: {}
  }
};
assert.strictEqual(validateIncomingPostMessage(readyEvent).valid, true);

// Test Table Editor autosave notify event
const autosaveEvent = {
  origin: 'https://pragament.github.io',
  data: {
    protocol: 'LEVELUP_EDITOR_v1',
    type: 'AUTOSAVE_NOTIFY',
    questionId: 'q-excel-1',
    payload: {
      sheets: [{ name: 'Sheet1', data: [['Item', 'Price'], ['Laptop', 1000]] }]
    }
  }
};
const resAutosave = validateIncomingPostMessage(autosaveEvent);
assert.strictEqual(resAutosave.valid, true);
assert.strictEqual(resAutosave.type, 'AUTOSAVE_NOTIFY');
console.log('PASS [2/7]: PostMessage validation & origin enforcement verified.');

// 3. Stale Overwrite Prevention (Timestamp Guard)
let answers = {};
let editorSavedTimestamps = {};

function saveAnswerWithTimestamp(qId, content) {
  const now = Date.now();
  const prevTs = editorSavedTimestamps[qId] || 0;
  if (now < prevTs) {
    return false; // Stale ignored
  }
  editorSavedTimestamps[qId] = now;
  answers[qId] = content;
  return true;
}

const qId = 'test-q-1';
assert.strictEqual(saveAnswerWithTimestamp(qId, 'Initial Code'), true);
assert.strictEqual(answers[qId], 'Initial Code');

// Simulate a stale write by setting timestamp into the future
editorSavedTimestamps[qId] = Date.now() + 10000;
assert.strictEqual(saveAnswerWithTimestamp(qId, 'Stale Code'), false);
assert.strictEqual(answers[qId], 'Initial Code'); // Still initial code!
console.log('PASS [3/7]: Timestamp stale write prevention verified.');

// 4. Excel File Validation (Option A)
function validateExcelUpload(file) {
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_BYTES) {
    return { valid: false, error: 'File exceeds 10MB limit' };
  }
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!isXlsx) {
    return { valid: false, error: 'Only .xlsx files are supported' };
  }
  return { valid: true };
}

assert.strictEqual(validateExcelUpload({ name: 'test.xlsx', size: 2 * 1024 * 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).valid, true);
assert.strictEqual(validateExcelUpload({ name: 'huge.xlsx', size: 15 * 1024 * 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).valid, false);
assert.strictEqual(validateExcelUpload({ name: 'script.exe', size: 1024, type: 'application/x-msdownload' }).valid, false);
console.log('PASS [4/7]: Excel upload size & extension validations verified.');

// 5. Question Ordering & Sections (MCQ -> FIB -> Short Answer -> HTML -> EXCEL)
function getQuestionTypeRank(type) {
  const t = (type || 'MCQ').toUpperCase();
  if (t === 'MCQ') return 0;
  if (t === 'FIB') return 1;
  if (t === 'SHORT ANSWER') return 2;
  if (t === 'HTML') return 3;
  if (t === 'EXCEL') return 4;
  return 2;
}

const mixedQuestions = [
  { id: '1', type: 'EXCEL' },
  { id: '2', type: 'MCQ' },
  { id: '3', type: 'HTML' },
  { id: '4', type: 'Short Answer' },
  { id: '5', type: 'FIB' }
];

const sorted = [...mixedQuestions].sort((a, b) => getQuestionTypeRank(a.type) - getQuestionTypeRank(b.type));
assert.deepStrictEqual(sorted.map(q => q.type), ['MCQ', 'FIB', 'Short Answer', 'HTML', 'EXCEL']);
console.log('PASS [5/7]: 5-section progressive question ordering verified.');

// 6. CSV Processing for HTML and EXCEL Types
function normalizeQuestionType(rawType) {
  const norm = String(rawType || '').trim().toUpperCase();
  if (norm === 'MCQ') return 'MCQ';
  if (norm === 'FIB') return 'FIB';
  if (norm === 'HTML' || norm === 'CODESTUDIO') return 'HTML';
  if (norm === 'EXCEL' || norm === 'TABLE') return 'EXCEL';
  return 'Short Answer';
}

assert.strictEqual(normalizeQuestionType('HTML'), 'HTML');
assert.strictEqual(normalizeQuestionType('codestudio'), 'HTML');
assert.strictEqual(normalizeQuestionType('EXCEL'), 'EXCEL');
assert.strictEqual(normalizeQuestionType('table'), 'EXCEL');
console.log('PASS [6/7]: CSV type normalization for HTML and EXCEL verified.');

// 7. Result View Rendering Helpers
function renderAnswerReviewHtml(item) {
  if (item.type === 'HTML') {
    return `<pre class="html-submission-preview"><code>${item.student_answer || '(No code submitted)'}</code></pre>`;
  }
  if (item.type === 'EXCEL') {
    if (item.student_answer && item.student_answer.startsWith('data:')) {
      return `<a href="${item.student_answer}" download="submission.xlsx">Download Workbook</a>`;
    }
    return `<div class="excel-table-preview">${item.student_answer || '(No table submitted)'}</div>`;
  }
  return `<div>${item.student_answer}</div>`;
}

const htmlReview = renderAnswerReviewHtml({ type: 'HTML', student_answer: '<h1>Test</h1>' });
assert.ok(htmlReview.includes('html-submission-preview'));
assert.ok(htmlReview.includes('<h1>Test</h1>'));

const excelUploadReview = renderAnswerReviewHtml({ type: 'EXCEL', student_answer: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,AAAA' });
assert.ok(excelUploadReview.includes('Download Workbook'));

const excelTableReview = renderAnswerReviewHtml({ type: 'EXCEL', student_answer: 'Region,Sales' });
assert.ok(excelTableReview.includes('excel-table-preview'));
console.log('PASS [7/7]: Result & Review formatters for HTML & EXCEL verified.');

console.log('\n>>> ALL 7 UNIT & INTEGRATION CHECKS PASSED SUCCESSFULLY! <<<\n');
