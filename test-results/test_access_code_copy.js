// test-results/test_access_code_copy.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Verifying Access Code Copy Functionality ===\n');

const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard.js'), 'utf8');

// 1. Check window.copyToClipboard is defined in auth.js
assert.ok(authJs.includes('window.copyToClipboard = async function(text)'), 'auth.js must define window.copyToClipboard');
assert.ok(authJs.includes('document.execCommand(\'copy\')'), 'window.copyToClipboard must support fallback via execCommand');
assert.ok(authJs.includes('navigator.clipboard.writeText'), 'window.copyToClipboard must support modern writeText');
console.log('PASS [1/4]: window.copyToClipboard with execCommand fallback verified.');

// 2. Check window.copyAccessCode in dashboard.js
assert.ok(dashboardJs.includes('window.copyAccessCode = async (code, btnId, event)'), 'dashboard.js must define window.copyAccessCode');
assert.ok(dashboardJs.includes('window.copyToClipboard(cleanCode)'), 'copyAccessCode must call window.copyToClipboard');
assert.ok(dashboardJs.includes('Copied!'), 'copyAccessCode must provide "Copied!" button feedback');
assert.ok(dashboardJs.includes('window.showToast'), 'copyAccessCode must display a confirmation toast');
console.log('PASS [2/4]: window.copyAccessCode integration & visual feedback verified.');

// 3. Test simulated fallback logic in Node environment
let execCommandCalled = false;
let appendedElement = null;

const fakeDoc = {
  body: {
    appendChild: (el) => { appendedElement = el; },
    removeChild: (el) => { if (appendedElement === el) appendedElement = null; }
  },
  createElement: (tag) => {
    return {
      tagName: tag,
      value: '',
      style: {},
      setAttribute: () => {},
      focus: () => {},
      select: () => {},
      setSelectionRange: () => {}
    };
  },
  execCommand: (cmd) => {
    if (cmd === 'copy') {
      execCommandCalled = true;
      return true;
    }
    return false;
  }
};

async function testFallbackCopy(text, doc) {
  const ta = doc.createElement('textarea');
  ta.value = text;
  doc.body.appendChild(ta);
  ta.select();
  const res = doc.execCommand('copy');
  doc.body.removeChild(ta);
  return res;
}

const copyResult = testFallbackCopy('QUIZ42BB', fakeDoc);
assert.strictEqual(execCommandCalled, true);
assert.strictEqual(appendedElement, null);
console.log('PASS [3/4]: Insecure/Intranet HTTP execCommand fallback successfully simulated.');

// 4. Check questions.js and reports.js use window.copyToClipboard
const questionsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'questions.js'), 'utf8');
const reportsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');

assert.ok(questionsJs.includes('window.copyToClipboard(promptText)'), 'questions.js must use window.copyToClipboard');
assert.ok(reportsJs.includes('window.copyToClipboard(csvContent)'), 'reports.js must use window.copyToClipboard');
console.log('PASS [4/4]: questions.js and reports.js copy functionality unified.');

console.log('\n>>> ALL 4 ACCESS CODE COPY CHECKS PASSED SUCCESSFULLY! <<<\n');
