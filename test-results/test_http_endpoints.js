const http = require('http');

const endpoints = [
  '/',
  '/index.html',
  '/quiz.html?code=DEMO&name=Alex%20Student',
  '/result.html',
  '/questions.html',
  '/reports.html',
  '/dashboard.html',
  '/subjects.html',
  '/js/quiz.js',
  '/js/questions.js',
  '/js/result.js',
  '/js/reports.js',
  '/js/subjects.js',
  '/js/auth.js'
];

async function checkUrl(path) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      resolve({ path, statusCode: res.statusCode });
    }).on('error', (err) => {
      resolve({ path, error: err.message });
    });
  });
}

(async () => {
  console.log('Testing HTTP Endpoints on http://localhost:3000...\n');
  let allPassed = true;
  for (const ep of endpoints) {
    const res = await checkUrl(ep);
    if (res.statusCode === 200) {
      console.log(`[OK 200] ${ep}`);
    } else {
      console.error(`[FAIL] ${ep} ->`, res);
      allPassed = false;
    }
  }
  if (allPassed) {
    console.log('\n>>> ALL 14 HTTP ENDPOINTS RESPONDED WITH HTTP 200 OK! <<<');
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
