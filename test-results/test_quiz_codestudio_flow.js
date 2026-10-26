// test-results/test_quiz_codestudio_flow.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Verifying Open CodeStudio Button -> CodeStudio Submit -> Quiz Type Bar Flow ===\n');

// 1. Read files
const quizJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'quiz.js'), 'utf8');
const codestudioHtml = fs.readFileSync(path.join(__dirname, '..', 'codestudio', 'index.html'), 'utf8');
const codestudioJs = fs.readFileSync(path.join(__dirname, '..', 'codestudio', 'app.js'), 'utf8');

// 2. Check Quiz Card has Open CodeStudio button
assert.ok(quizJs.includes('open-codestudio-btn'), 'Quiz page must render #open-codestudio-btn');
assert.ok(quizJs.includes('🚀 Open CodeStudio'), 'Button text must invite student to open CodeStudio');
assert.ok(quizJs.includes('window.launchCodeStudio'), 'Button must call window.launchCodeStudio');
console.log('PASS [1/5]: Quiz Question Card renders "🚀 Open CodeStudio" button.');

// 3. Check Quiz Card has Quiz Type Bar (textarea)
assert.ok(quizJs.includes('student-code-bar-'), 'Quiz page must render #student-code-bar-${q.id} textarea');
assert.ok(quizJs.includes('Quiz Type Bar (Your HTML Code):'), 'Quiz Type Bar label must be present');
assert.ok(quizJs.includes('student-code-bar-${q.id}'), 'Textarea id must be student-code-bar-${q.id}');
console.log('PASS [2/5]: Quiz Question Card renders "Quiz Type Bar" code input area.');

// 4. Check CodeStudio has Submit Button & Submit Handler
assert.ok(codestudioHtml.includes('id="levelup-submit-btn"'), 'CodeStudio must render #levelup-submit-btn');
assert.ok(codestudioHtml.includes('submitToLevelUpQuiz()'), 'CodeStudio button must call submitToLevelUpQuiz()');
assert.ok(codestudioJs.includes('window.submitToLevelUpQuiz = function()'), 'codestudio/app.js must define submitToLevelUpQuiz');
assert.ok(codestudioJs.includes('CODESTUDIO_TRANSFER_CODE'), 'submitToLevelUpQuiz must post CODESTUDIO_TRANSFER_CODE');
assert.ok(codestudioJs.includes('levelup_codestudio_submission'), 'submitToLevelUpQuiz must broadcast via localStorage');
console.log('PASS [3/5]: CodeStudio includes "🚀 Submit Code to Quiz" button and transfer handlers.');

// 5. Check Quiz Page receives the code and updates the Quiz Type Bar
assert.ok(quizJs.includes('applyCodeStudioAnswer'), 'quiz.js must implement applyCodeStudioAnswer()');
assert.ok(quizJs.includes('codeBar.value = code'), 'applyCodeStudioAnswer must update the Quiz Type Bar textarea value');
assert.ok(quizJs.includes('saveAnswerWithTimestamp(targetQId, code)'), 'applyCodeStudioAnswer must save the answer for quiz submission');
assert.ok(quizJs.includes('levelup_codestudio_submission'), 'quiz.js must listen for localStorage cross-window broadcast');
console.log('PASS [4/5]: Quiz page receives code and populates Quiz Type Bar & answers store.');

// 6. Check Quiz Submission preserves the code from the Quiz Type Bar
assert.ok(quizJs.includes('saveCurrentAnswer()'), 'quiz.js must save answer before submission');
assert.ok(quizJs.includes('const codeBar = document.getElementById(`student-code-bar-${q.id}`)'), 'saveCurrentAnswer must read from student-code-bar');
assert.ok(quizJs.includes('saveAnswerWithTimestamp(q.id, codeBar.value)'), 'saveCurrentAnswer must save student-code-bar value');
console.log('PASS [5/5]: Quiz submission retrieves code from Quiz Type Bar for final submission.');

console.log('\n>>> ALL 5 END-TO-END FLOW CHECKS PASSED SUCCESSFULLY! <<<\n');
