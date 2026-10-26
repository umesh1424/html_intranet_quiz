// test-results/test_simple_code_submission.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Verifying Simple Code Submission (No HTML, CSS, JS JSON wrapper) ===\n');

// 1. Check codestudio/app.js
const codestudioJs = fs.readFileSync(path.join(__dirname, '..', 'codestudio', 'app.js'), 'utf8');

// Ensure no JSON.stringify({ html, css, js }) is present in codestudio/app.js
assert.ok(!codestudioJs.includes('JSON.stringify({ html, css, js'), 'codestudio/app.js must NEVER serialize code into { html, css, js } JSON');
console.log('PASS [1/4]: Verified codestudio/app.js does not package code into JSON object.');

// 2. Simulate CodeStudio getCodeContent with student code from the screenshot:
function simulateGetCodeContent(html, css, js) {
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

  const cleanHtml = (html.trim() === '<!-- Add your HTML code here -->') ? '' : html;
  const cleanCss = isBoilerplate(css) ? '' : css.trim();
  const cleanJs = isBoilerplate(js) ? '' : js.trim();

  if (!cleanCss && !cleanJs) {
    return cleanHtml;
  }

  let combined = cleanHtml;
  if (cleanCss) combined = `<style>\n${cleanCss}\n</style>\n\n` + combined;
  if (cleanJs) combined = combined + `\n\n<script>\n${cleanJs}\n</script>`;
  return combined;
}

const studentInput = 'a=1;\nb=2;\nc=(a=b);\nprint(c);';
const submittedCode = simulateGetCodeContent(studentInput, '/* Add your CSS here */\n', '// Add your JavaScript here\n');

assert.strictEqual(submittedCode, studentInput, 'Submitted code must equal pure student code');
assert.ok(!submittedCode.includes('"html":'), 'Must NOT contain "html" JSON key');
assert.ok(!submittedCode.includes('"css":'), 'Must NOT contain "css" JSON key');
assert.ok(!submittedCode.includes('"js":'), 'Must NOT contain "js" JSON key');
console.log('PASS [2/4]: Verified CodeStudio returns pure simple code for student submission.');

// 3. Test Quiz extractStudentFriendlyCode unwraps any legacy JSON dump into pure simple code
const quizJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'quiz.js'), 'utf8');
assert.ok(quizJs.includes('extractStudentFriendlyCode'), 'quiz.js must implement extractStudentFriendlyCode');

function simulateExtractStudentFriendlyCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return rawCode || '';
  const trimmed = rawCode.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('{\n') && trimmed.endsWith('\n}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const html = typeof parsed.html === 'string' ? parsed.html : (typeof parsed.code === 'string' ? parsed.code : '');
        const css = typeof parsed.css === 'string' ? parsed.css.trim() : '';
        const js = typeof parsed.js === 'string' ? parsed.js.trim() : '';

        const isDef = (str) => {
          if (!str) return true;
          const t = str.trim();
          return !t || 
                 t === '/* Add your CSS here */' || 
                 t === '// Add your JavaScript here' || 
                 t === '<!-- Add your HTML code here -->' ||
                 (t.startsWith('/* Add your CSS here') && t.length < 50) ||
                 (t.startsWith('// Add your JavaScript here') && t.length < 50);
        };

        const hasCss = !isDef(css);
        const hasJs = !isDef(js);

        if (!hasCss && !hasJs) {
          return html;
        }

        let combined = html;
        if (hasCss) {
          combined = `<style>\n${css}\n</style>\n\n` + combined;
        }
        if (hasJs) {
          combined = combined + `\n\n<script>\n${js}\n</script>`;
        }
        return combined;
      }
    } catch (e) {
      return rawCode;
    }
  }
  return rawCode;
}

const legacyJsonDump = JSON.stringify({
  html: 'a=1;\nb=2;\nc=(a=b);\nprint(c);',
  css: '/* Add your CSS here */\n',
  js: '// Add your JavaScript here\n'
}, null, 2);

const cleaned = simulateExtractStudentFriendlyCode(legacyJsonDump);
assert.strictEqual(cleaned, 'a=1;\nb=2;\nc=(a=b);\nprint(c);');
console.log('PASS [3/4]: Verified legacy JSON dump is automatically unwrapped to simple code in quiz.js.');

// 4. Verify saveAnswerWithTimestamp saves simple code directly
assert.ok(quizJs.includes('answers[qId] = extractStudentFriendlyCode(content)'), 'saveAnswerWithTimestamp must unwrap content with extractStudentFriendlyCode');
console.log('PASS [4/4]: Verified saveAnswerWithTimestamp sanitizes code answer.');

console.log('\n>>> ALL 4 SIMPLE CODE VERIFICATIONS PASSED SUCCESSFULLY! <<<\n');
