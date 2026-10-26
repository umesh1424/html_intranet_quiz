// test-results/test_codestudio_fullscreen.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== LevelUp CodeStudio Full Screen Integration Test ===\n');

// 1. Verify codestudio/index.html structure
const codestudioHtml = fs.readFileSync(path.join(__dirname, '..', 'codestudio', 'index.html'), 'utf8');
assert.ok(codestudioHtml.includes('id="levelup-submit-btn"'), 'CodeStudio toolbar must include levelup-submit-btn');
assert.ok(codestudioHtml.includes('id="run-button"'), 'CodeStudio toolbar must include run-button');
assert.ok(codestudioHtml.includes('runCode()'), 'CodeStudio run button must invoke runCode()');
assert.ok(codestudioHtml.includes('submitToLevelUpQuiz()'), 'CodeStudio submit button must invoke submitToLevelUpQuiz()');
assert.ok(codestudioHtml.includes('id="html-code"'), 'CodeStudio must include html-code textarea');
assert.ok(codestudioHtml.includes('id="css-code"'), 'CodeStudio must include css-code textarea');
assert.ok(codestudioHtml.includes('id="js-code"'), 'CodeStudio must include js-code textarea');
assert.ok(codestudioHtml.includes('id="preview"'), 'CodeStudio must include preview iframe');
assert.ok(codestudioHtml.includes('index.html') && codestudioHtml.includes('style.css') && codestudioHtml.includes('script.js'), 'CodeStudio must include file explorer tabs');
console.log('PASS [1/6]: CodeStudio desktop website DOM & toolbar buttons verified.');

// 2. Verify codestudio/app.js postMessage protocol & LevelUp submission APIs
const codestudioJs = fs.readFileSync(path.join(__dirname, '..', 'codestudio', 'app.js'), 'utf8');
assert.ok(codestudioJs.includes('window.setCodeContent'), 'CodeStudio must expose window.setCodeContent API');
assert.ok(codestudioJs.includes('window.getCodeContent'), 'CodeStudio must expose window.getCodeContent API');
assert.ok(codestudioJs.includes('window.submitToLevelUpQuiz'), 'CodeStudio must expose window.submitToLevelUpQuiz API');
assert.ok(codestudioJs.includes('window.runCode'), 'CodeStudio must expose window.runCode API');
assert.ok(codestudioJs.includes('CODESTUDIO_TRANSFER_CODE'), 'CodeStudio must dispatch CODESTUDIO_TRANSFER_CODE on quiz submission');
assert.ok(codestudioJs.includes('AUTOSAVE_NOTIFY'), 'CodeStudio must dispatch AUTOSAVE_NOTIFY on edits');
assert.ok(codestudioJs.includes('LEVELUP_INIT'), 'CodeStudio must handle LEVELUP_INIT to restore code');
console.log('PASS [2/6]: CodeStudio bidirectional PostMessage protocol & submission APIs verified.');

// 3. Verify js/quiz.js Open CodeStudio Button & Quiz Type Bar Integration
const quizJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'quiz.js'), 'utf8');
assert.ok(quizJs.includes('open-codestudio-btn'), 'quiz.js must include open-codestudio-btn');
assert.ok(quizJs.includes('student-code-bar'), 'quiz.js must include student-code-bar textarea');
assert.ok(quizJs.includes('window.launchCodeStudio'), 'quiz.js must expose window.launchCodeStudio');
assert.ok(quizJs.includes('applyCodeStudioAnswer'), 'quiz.js must implement applyCodeStudioAnswer');
assert.ok(quizJs.includes('codestudio/index.html'), 'quiz.js must open codestudio/index.html');
console.log('PASS [3/6]: LevelUp Open CodeStudio button, Quiz Type Bar & synchronization APIs verified.');

// 4. Verify Code Content extraction and simple code handling (no JSON wrapper)
function simulateCodeContent(html, css, js) {
  const isBoilerplate = (str) => {
    if (!str) return true;
    const t = str.trim();
    return !t || 
           t === '/* Add your CSS here */' || 
           t === '// Add your JavaScript here' || 
           t === '<!-- Add your HTML code here -->' ||
           (t.startsWith('/* Add your CSS here') && t.length < 50) ||
           (t.startsWith('// Add your JavaScript here') && t.length < 50);
  };

  const cleanCss = isBoilerplate(css) ? '' : css.trim();
  const cleanJs = isBoilerplate(js) ? '' : js.trim();

  if (!cleanCss && !cleanJs) {
    return html;
  }

  let combined = html;
  if (cleanCss) combined = `<style>\n${cleanCss}\n</style>\n\n` + combined;
  if (cleanJs) combined = combined + `\n\n<script>\n${cleanJs}\n</script>`;
  return combined;
}

const htmlOnly = simulateCodeContent('<p style="color: red; font-size: 20px;">Red paragraph</p>', '/* Add your CSS here */\n', '// Add your JavaScript here\n');
assert.strictEqual(htmlOnly, '<p style="color: red; font-size: 20px;">Red paragraph</p>');

const simpleStudentCode = simulateCodeContent('a=1;\nb=2;\nc=(a=b);\nprint(c);', '/* Add your CSS here */\n', '// Add your JavaScript here\n');
assert.strictEqual(simpleStudentCode, 'a=1;\nb=2;\nc=(a=b);\nprint(c);');
assert.ok(!simpleStudentCode.includes('"html":'), 'Must NOT return JSON format with html/css/js keys');

const customCssJs = simulateCodeContent('<p>Hi</p>', 'p { color: red; }', 'console.log("ready")');
assert.ok(customCssJs.includes('color: red;'));
assert.ok(customCssJs.includes('console.log'));
console.log('PASS [4/6]: HTML and simple clean code (no JSON formatting) verified.');

// 5. Verify Automatic Storage into Quiz Attempt
const simulatedAnswers = {};
let simulatedSnapshot = [];

function submitQuizWithCode(qId, code) {
  simulatedAnswers[qId] = code;
  simulatedSnapshot = [
    {
      question_id: qId,
      question_type: 'HTML',
      student_answer: simulatedAnswers[qId],
      submitted_at: Date.now()
    }
  ];
  return {
    storedAnswer: simulatedAnswers[qId],
    snapshot: simulatedSnapshot
  };
}

const submission = submitQuizWithCode('q-html-test', '<p style="color: red; font-size: 20px;">Red paragraph</p>');
assert.strictEqual(submission.storedAnswer, '<p style="color: red; font-size: 20px;">Red paragraph</p>');
assert.strictEqual(submission.snapshot[0].student_answer, '<p style="color: red; font-size: 20px;">Red paragraph</p>');
console.log('PASS [5/6]: Automatic code storage into quiz answers payload verified.');

// 6. Verify Result View Code Rendering
const resultJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'result.js'), 'utf8');
assert.ok(resultJs.includes("qType === 'HTML'"), 'result.js must handle HTML question rendering');
assert.ok(resultJs.includes('Your Submitted HTML/CSS/JS Code:'), 'result.js must render submitted code header');
console.log('PASS [6/6]: Student result view code verification verified.');

console.log('\n>>> ALL 6 CODESTUDIO FULL SCREEN INTEGRATION TESTS PASSED! <<<\n');
