
// Global Handlers for Excel Data Bar
window.copyExcelTableData = function(qId) {
  const ta = document.getElementById('editor-fallback-textarea-' + qId);
  if (ta && ta.value) {
    navigator.clipboard.writeText(ta.value).then(() => {
      if (typeof window.showToast === 'function') window.showToast('Table data copied to clipboard!', 'success');
    });
  }
};

window.clearExcelTableData = function(qId) {
  const ta = document.getElementById('editor-fallback-textarea-' + qId);
  if (ta && confirm('Clear table data for this question?')) {
    ta.value = '';
    if (typeof saveAnswerWithTimestamp === 'function') saveAnswerWithTimestamp(qId, '', 'editor');
    const statusEl = document.getElementById('editor-save-status-' + qId);
    if (statusEl) {
      statusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200';
      statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>Ready for Table Editor</span>';
    }
    if (typeof window.showToast === 'function') window.showToast('Table data cleared.', 'info');
  }
};

window.toggleInlineEditorFrame = function(qId) {
  const wrapper = document.getElementById('inline-frame-wrapper-' + qId);
  const textEl = document.getElementById('toggle-frame-text-' + qId);
  if (!wrapper) return;
  const isHidden = wrapper.classList.contains('hidden');
  if (isHidden) {
    wrapper.classList.remove('hidden');
    if (textEl) textEl.textContent = 'Hide Embedded Frame';
  } else {
    wrapper.classList.add('hidden');
    if (textEl) textEl.textContent = 'Show Embedded Frame';
  }
};


// Helper: Extract markdown table from text into 2D array
function extractMarkdownTableFromText(text) {
  if (!text || !text.includes('|')) return null;
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  for (let i = 0; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim();
    const nextTrimmed = lines[i + 1].trim();
    if (trimmed.includes('|') && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(nextTrimmed)) {
      const cleanRow = r => {
        let s = r.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        return s.split('|').map(c => c.trim());
      };
      const rows = [cleanRow(trimmed)];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().includes('|') && lines[j].trim().length > 0) {
        rows.push(cleanRow(lines[j]));
        j++;
      }
      return rows;
    }
  }
  return null;
}

// Global handler: Copy Question Table Data to Clipboard
window.copyQuestionTableData = function(btn) {
  try {
    const wrap = btn.closest('.question-markdown-table-wrap');
    if (!wrap) return;
    const dataAttr = wrap.getAttribute('data-table');
    if (!dataAttr) return;
    const parsed = JSON.parse(dataAttr);
    if (!parsed.headers || !parsed.rows) return;
    const tsv = [parsed.headers.join('\t'), ...parsed.rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      if (typeof window.showToast === 'function') {
        window.showToast('Table data copied to clipboard (TSV format for Excel)!', 'success');
      }
    }).catch(() => {
      if (typeof window.showToast === 'function') {
        window.showToast('Copied to clipboard!', 'info');
      }
    });
  } catch (e) {
    console.error('Error copying table data:', e);
  }
};

// Global handler: Load Question Table Data into Table Editor
window.loadTableDataToEditor = function(btn) {
  try {
    const wrap = btn.closest('.question-markdown-table-wrap');
    if (!wrap) return;
    const dataAttr = wrap.getAttribute('data-table');
    if (!dataAttr) return;
    const parsed = JSON.parse(dataAttr);
    if (!parsed.headers || !parsed.rows) return;

    const cells2D = [parsed.headers, ...parsed.rows];
    const iframe = document.querySelector('iframe[id*="table-editor-iframe"]');

    if (iframe && iframe.contentWindow) {
      if (typeof sendPostMessageToIframe === 'function') {
        sendPostMessageToIframe(iframe.contentWindow, 'LEVELUP_INIT', {
          data: cells2D,
          csv: cells2D.map(r => r.join(',')).join('\n')
        });
      } else {
        iframe.contentWindow.postMessage({
          protocol: 'LEVELUP_EDITOR_v1',
          type: 'LEVELUP_INIT',
          payload: {
            data: cells2D,
            csv: cells2D.map(r => r.join(',')).join('\n')
          },
          timestamp: Date.now()
        }, '*');
      }
    }

    const fallbackTextarea = document.querySelector('textarea[id*="editor-fallback-textarea"]');
    if (fallbackTextarea) {
      fallbackTextarea.value = cells2D.map(r => r.join(',')).join('\n');
    }

    if (typeof window.showToast === 'function') {
      window.showToast('Table data loaded into Table Editor successfully!', 'success');
    }
  } catch (e) {
    console.error('Error loading table data to editor:', e);
  }
};

// js/quiz.js
document.addEventListener('DOMContentLoaded', async () => {
  // Parse URL query code
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (!code) {
    window.location.href = 'index.html';
    return;
  }

  // Get student name with multi-layered fallbacks (URL query, sessionStorage, localStorage)
  let studentName = urlParams.get('name') || sessionStorage.getItem('studentName') || localStorage.getItem('studentName');
  if (studentName) {
    try { studentName = decodeURIComponent(studentName).trim(); } catch (e) {}
    sessionStorage.setItem('studentName', studentName);
    localStorage.setItem('studentName', studentName);
  }

  if (!studentName) {
    studentName = 'Candidate';
  }

  document.getElementById('student-name-label').textContent = `Candidate: ${studentName}`;

  const TRUSTED_EDITOR_ORIGINS = [
    'https://levelup.technikh.com',
    'https://codestudio.pragament.com',
    'https://umesh1424.github.io',
    'https://pragament.github.io',
    window.location.origin
  ];
  const MESSAGE_PROTOCOL_VERSION = 'LEVELUP_EDITOR_v1';

  let quiz = null;
  let questions = [];
  let currentRound = 1;
  let currentIdx = 0;
  let answers = {};
  let excelModes = {}; // q.id -> 'upload' | 'editor'
  let editorSavedTimestamps = {}; // q.id -> timestamp
  let questionAttachments = {}; // q.id -> [{ name, type, size, dataUrl }, ...]
  let timeLeftSeconds = 0;
  let totalDurationSeconds = 0;
  let timerInterval = null;
  let submitting = false;
  let isDemoQuiz = false;

  function getDemoQuizData() {
    return {
      quiz: {
        id: 'quiz-demo-001',
        title: 'LevelUp Full-Stack Practical Quiz',
        access_code: code || 'DEMO',
        duration_minutes: 20,
        rounds: 1,
        question_count: 5,
        randomize_questions: false,
        randomize_options: false,
        offline_mode: false
      },
      questions: [
        {
          id: 'q-demo-mcq',
          type: 'MCQ',
          syllabus_tag: 'Web Development',
          question_text: 'Which HTML element is used to specify a footer for a document or section?',
          option_a: '<bottom>',
          option_b: '<footer>',
          option_c: '<section>',
          option_d: '<foot>',
          correct_option: 'B'
        },
        {
          id: 'q-demo-fib',
          type: 'FIB',
          syllabus_tag: 'HTML5 Basics',
          question_text: 'The HTML tag used to create an unordered bulleted list is ______',
          correct_option: '<ul>'
        },
        {
          id: 'q-demo-short',
          type: 'Short Answer',
          syllabus_tag: 'CSS Architecture',
          question_text: 'Briefly explain the CSS box model and its four main layers.',
          correct_option: 'Content, padding, border, and margin.'
        },
        {
          id: 'q-demo-html',
          type: 'HTML',
          syllabus_tag: 'CodeStudio Practical',
          question_text: 'Build an interactive Profile Card component using HTML, CSS, and JS with a name, avatar/title, and a button that changes text on click.',
          correct_option: '<div class="card"><h3>Profile</h3><button onclick="this.textContent=\'Connected!\'">Connect</button></div>'
        },
        {
          id: 'q-demo-excel',
          type: 'EXCEL',
          syllabus_tag: 'Spreadsheet Practical',
          question_text: 'Create an Excel worksheet, calculate the average marks, filter students by activity, and create a Bar Chart.\n\n| Student | Activity | Marks |\n| ------- | -------- | ----: |\n| Reema | Drawing | 93 |\n| Om | Quiz | 68 |\n| Sara | Drawing | 79 |\n| Ajay | Quiz | 84 |\n| Naina | Drawing | 88 |',
          correct_option: 'Spreadsheet containing student marks, average formula =AVERAGE(C2:C6), activity filter, and bar chart'
        }
      ]
    };
  }

  function saveAnswerWithTimestamp(qId, content, mode) {
    if (!qId) return;
    const now = Date.now();
    const prevTs = editorSavedTimestamps[qId] || 0;
    if (now < prevTs) {
      console.warn(`[Autosave] Ignored stale save for question ${qId}`);
      return;
    }
    editorSavedTimestamps[qId] = now;
    // Always store clean student-friendly simple code
    answers[qId] = extractStudentFriendlyCode(content);
    if (mode && (mode === 'upload' || mode === 'editor')) {
      excelModes[qId] = mode;
    }
    try {
      if (quiz && studentName) {
        localStorage.setItem(`levelup_answers_${quiz.id}_${studentName}`, JSON.stringify(answers));
        localStorage.setItem(`levelup_excel_modes_${quiz.id}_${studentName}`, JSON.stringify(excelModes));
      }
    } catch (e) {}
  }

  function formatQuestionText(str) {
    if (typeof window.formatQuestionText === 'function') {
      return window.formatQuestionText(str);
    }
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/`([^`\n]+)`/g, '<code class="formatted-inline-code">$1</code>')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="formatted-frac"><span>$1</span><span>$2</span></span>')
      .replace(/\\overline\{([^{}]+)\}/g, '<span class="formatted-overline">$1</span>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function loadLocalAnswers() {
    if (quiz && studentName) {
      try {
        const savedAns = localStorage.getItem(`levelup_answers_${quiz.id}_${studentName}`);
        if (savedAns) {
          const parsed = JSON.parse(savedAns);
          for (const k in parsed) {
            answers[k] = extractStudentFriendlyCode(parsed[k]);
          }
        }
        const savedModes = localStorage.getItem(`levelup_excel_modes_${quiz.id}_${studentName}`);
        if (savedModes) excelModes = { ...excelModes, ...JSON.parse(savedModes) };
      } catch (e) {}
    }
  }

  function resolveQuestionType(q) {
    if (!q) return 'MCQ';
    const rawType = (q.type || '').trim().toUpperCase();
    if (rawType === 'MCQ') return 'MCQ';
    if (rawType === 'FIB' || rawType === 'FILL IN THE BLANKS') return 'FIB';
    if (rawType === 'HTML' || rawType.includes('HTML') || rawType.includes('CODESTUDIO') || rawType === 'CODE') return 'HTML';
    if (rawType === 'EXCEL' || rawType.includes('EXCEL') || rawType.includes('SPREADSHEET') || rawType === 'TABLE') return 'EXCEL';

    // Smart auto-detection fallback:
    // If the question text explicitly asks to write HTML code or spreadsheet formulas
    const text = String(q.question_text || '').toLowerCase();
    if (/\b(write|create|build|code|design)\s+(an?\s+)?html\b/.test(text) || /\bhtml\s+code\b/.test(text)) {
      return 'HTML';
    }
    if (/\b(create|prepare|make)\s+(an?\s+)?(excel|spreadsheet|table\s+report)\b/.test(text) && !/\b(which|what|choose)\b/.test(text)) {
      return 'EXCEL';
    }

    return 'Short Answer';
  }

  function sendPostMessageToIframe(targetWindow, type, payload, questionId) {
    if (!targetWindow) return;
    const currentQ = questions[currentIdx];
    const q = currentQ;
    let targetOrigin = '';

    const qId = questionId || (q ? q.id : null);
    const iframe = (qId && (
      document.getElementById(`html-editor-iframe-${qId}`) ||
      document.getElementById(`table-editor-iframe-${qId}`) ||
      document.getElementById(`inline-table-editor-iframe-${qId}`)
    )) || (q && (
      document.getElementById(`html-editor-iframe-${q.id}`) ||
      document.getElementById(`table-editor-iframe-${q.id}`) ||
      document.getElementById(`inline-table-editor-iframe-${q.id}`)
    ));

    if (iframe && iframe.src) {
      try {
        targetOrigin = new URL(iframe.src, window.location.href).origin;
      } catch (e) {}
    }

    if (!targetOrigin && q) {
      const qType = resolveQuestionType(q);
      if (qType === 'HTML') targetOrigin = window.location.origin;
      else if (qType === 'EXCEL') targetOrigin = window.location.origin || 'https://umesh1424.github.io';
    }

    if (!targetOrigin) {
      console.warn('Cannot resolve explicit targetOrigin for postMessage');
      return;
    }

    try {
      targetWindow.postMessage({
        protocol: MESSAGE_PROTOCOL_VERSION,
        type: type,
        questionId: questionId,
        payload: payload || {},
        timestamp: Date.now()
      }, targetOrigin);
    } catch (err) {
      console.warn('postMessage failed:', err);
    }
  }

    function markdownTableToCsv(markdown) {
    if (!markdown || !markdown.includes('|')) return '';
    const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'));
    if (lines.length < 2) return '';
    const rows = [];
    for (const line of lines) {
      if (/^\|(\s*[-:]+\s*\|)+$/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      rows.push(cells.map(c => `"${c.replace(/"/g, '""')}"`).join(','));
    }
    return rows.join('\n');
  }

  function isTrustedEditorOrigin(origin) {
    if (!origin) return false;
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin === 'null') return true;
    return TRUSTED_EDITOR_ORIGINS.some((allowed) => {
      try {
        return new URL(allowed).origin === new URL(origin).origin;
      } catch (e) {
        return false;
      }
    });
  }

    // Student-Friendly: unwrap raw JSON dumps into clean human-readable code
  function extractStudentFriendlyCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string') return rawCode || '';
    const trimmed = rawCode.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('{\n') && trimmed.endsWith('\n}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          // If spreadsheet table data with CSV or sheets, preserve clean table representation
          if (parsed.csv) {
            return parsed.csv;
          }
          if (parsed.sheets || parsed.workbook || parsed.activeSheet) {
            return rawCode;
          }
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

          // If no custom CSS or JS, return clean simple code without JSON
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

  function applyCodeStudioAnswer(targetQId, rawCode) {
    if (!targetQId) return;

    // Student friendly: extract pure clean code (unwraps any JSON dump)
    const code = extractStudentFriendlyCode(rawCode);

    // Save answer to quiz state and localStorage
    saveAnswerWithTimestamp(targetQId, code);

    // Update Quiz Type Bar textarea if present
    const codeBar = document.getElementById(`student-code-bar-${targetQId}`);
    if (codeBar) {
      codeBar.value = code;
      // Highlighting feedback
      codeBar.classList.add('ring-2', 'ring-emerald-400');
      setTimeout(() => {
        codeBar.classList.remove('ring-2', 'ring-emerald-400');
      }, 1500);
    }

    // Update Short Answer text input if present
    const textInput = document.getElementById('student-text-answer');
    if (textInput && (!targetQId || String(targetQId) === String(questions[currentIdx]?.id))) {
      textInput.value = code;
      textInput.classList.add('ring-2', 'ring-emerald-400');
      setTimeout(() => {
        textInput.classList.remove('ring-2', 'ring-emerald-400');
      }, 1500);
    }

    const inlineSaveStatus = document.getElementById(`inline-excel-save-status-${targetQId}`);
    if (inlineSaveStatus) {
      const timeStr = new Date().toLocaleTimeString();
      inlineSaveStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Autosaved (${timeStr})</span>`;
      if (window.lucide) window.lucide.createIcons();
    }

    const fallbackTextarea = document.getElementById(`editor-fallback-textarea-${targetQId}`);
    if (fallbackTextarea && fallbackTextarea.value !== code) {
      fallbackTextarea.value = code;
    }

    // Update sync status badge
    const statusBadge = document.getElementById(`codestudio-sync-status-${targetQId}`);
    if (statusBadge) {
      const timeStr = new Date().toLocaleTimeString();
      statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Code received from CodeStudio (${timeStr})</span>`;
    }

    const saveStatus = document.getElementById(`editor-save-status-${targetQId}`);
    if (saveStatus) {
      const timeStr = new Date().toLocaleTimeString();
      saveStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> <span>Autosaved (${timeStr})</span>`;
      if (window.lucide) window.lucide.createIcons();
    }

    if (typeof window.showToast === 'function') {
      window.showToast('✅ Code received from CodeStudio and saved to quiz type bar!', 'success');
    }
  }

  // Cross-tab / cross-window storage event listener (instant sync between CodeStudio tab and Quiz tab)
  window.addEventListener('storage', (event) => {
    if (event.key === 'levelup_codestudio_submission' && event.newValue) {
      try {
        const sub = JSON.parse(event.newValue);
        if (sub && sub.questionId && sub.code !== undefined) {
          applyCodeStudioAnswer(sub.questionId, sub.code);
        }
      } catch (e) {
        console.warn('Error processing storage submission:', e);
      }
    } else if ((event.key === 'levelup_excel_autosave' || event.key === 'levelup_excel_submission') && event.newValue) {
      try {
        const sub = JSON.parse(event.newValue);
        if (sub && sub.data !== undefined) {
          const currentQ = questions[currentIdx];
          const targetQId = sub.questionId || (currentQ ? currentQ.id : null);
          if (targetQId) {
            applyCodeStudioAnswer(targetQId, sub.data);
            if (event.key === 'levelup_excel_submission') {
              if (typeof activeExcelPopup !== 'undefined' && activeExcelPopup && !activeExcelPopup.closed) {
                try { activeExcelPopup.close(); } catch (e) {}
              }
              if (typeof window.closeInlineExcel === 'function') {
                window.closeInlineExcel(targetQId);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error processing excel storage autosave:', e);
      }
    }
  });

  window.launchCodeStudio = (qId) => {
    const targetId = qId || (questions[currentIdx] ? questions[currentIdx].id : null);
    if (!targetId) return;

    // Grab current code from quiz type bar or answers
    const codeBar = document.getElementById(`student-code-bar-${targetId}`);
    const currentCode = extractStudentFriendlyCode((codeBar ? codeBar.value : '') || answers[targetId] || '');

    // Cache current question and code in localStorage
    try {
      localStorage.setItem('levelup_current_editing_qid', String(targetId));
      localStorage.setItem(`levelup_current_editing_code_${targetId}`, currentCode);
    } catch (e) {}

    // Open CodeStudio
    const url = `codestudio/index.html?qid=${encodeURIComponent(targetId)}`;
    const popupFeatures = 'width=1280,height=820,left=80,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
    const popup = window.open(url, `codestudio_${targetId}`, popupFeatures);

    if (popup) {
      popup.focus();
    } else {
      window.open(url, '_blank');
    }

    const statusBadge = document.getElementById(`codestudio-sync-status-${targetId}`);
    if (statusBadge) {
      statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200';
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> <span>CodeStudio open — write code & click "Submit Code to Quiz"</span>`;
    }
  };

  window.copyStudentCode = (qId) => {
    const codeBar = document.getElementById(`student-code-bar-${qId}`);
    if (codeBar && codeBar.value) {
      if (typeof window.copyToClipboard === 'function') {
        window.copyToClipboard(codeBar.value);
      } else {
        navigator.clipboard.writeText(codeBar.value);
      }
      if (typeof window.showToast === 'function') {
        window.showToast('📋 Code copied to clipboard!', 'info');
      }
    }
  };

  window.clearStudentCode = (qId) => {
    const codeBar = document.getElementById(`student-code-bar-${qId}`);
    if (codeBar) {
      if (codeBar.value && !confirm('Are you sure you want to clear your code answer?')) return;
      codeBar.value = '';
      saveAnswerWithTimestamp(qId, '');
      const statusBadge = document.getElementById(`codestudio-sync-status-${qId}`);
      if (statusBadge) {
        statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200';
        statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-400"></span> <span>Ready for code</span>`;
      }
      if (typeof window.showToast === 'function') {
        window.showToast('🗑️ Code cleared.', 'info');
      }
    }
  };

  window.addEventListener('message', (event) => {
    const eventOrigin = event.origin || '';
    if (!isTrustedEditorOrigin(eventOrigin)) return;

    const data = event.data;
    if (!data || typeof data !== 'object' || data.protocol !== MESSAGE_PROTOCOL_VERSION) {
      return;
    }

    const { type, questionId, payload, timestamp } = data;
    const currentQ = questions[currentIdx];
    const targetQId = questionId || (currentQ ? currentQ.id : null);

    if (!targetQId) return;

    console.log('[LevelUp PostMessage Listener Received]', data.type, data);

    if (type === 'EDITOR_READY') {
      sendPostMessageToIframe(event.source, 'LEVELUP_INIT', {
        code: answers[targetQId] || '',
        data: answers[targetQId] || '',
        questionId: targetQId
      }, targetQId);
    } else if (type === 'CODESTUDIO_TRANSFER_CODE' || type === 'SUBMIT_QUIZ_CLICK') {
      let content = '';
      if (typeof payload === 'string') {
        content = payload;
      } else if (payload && typeof payload.code === 'string') {
        content = payload.code;
      } else if (payload && typeof payload.data === 'string') {
        content = payload.data;
      }

      if (content === undefined || content === '') {
        const iframe = document.getElementById(`html-editor-iframe-${targetQId}`);
        if (iframe && iframe.contentWindow && typeof iframe.contentWindow.getCodeContent === 'function') {
          try {
            content = iframe.contentWindow.getCodeContent() || '';
          } catch (e) {}
        }
      }

      applyCodeStudioAnswer(targetQId, content || '');
      if (typeof activeExcelPopup !== 'undefined' && activeExcelPopup && !activeExcelPopup.closed) {
        try { activeExcelPopup.close(); } catch (e) {}
      }
      if (typeof window.closeInlineExcel === 'function') {
        window.closeInlineExcel(targetQId);
      }
    } else if (type === 'AUTOSAVE_NOTIFY' || type === 'RESPONSE_GET_CONTENT') {
      let content = '';
      if (typeof payload === 'string') {
        content = payload;
      } else if (payload && typeof payload.code === 'string') {
        content = payload.code;
      } else if (payload && typeof payload.data === 'string') {
        content = payload.data;
      } else if (payload && (payload.json || payload.sheets || payload.table)) {
        content = JSON.stringify(payload);
      }

      if (content !== undefined) {
        applyCodeStudioAnswer(targetQId, content);
      }
    }
  });

  function saveAttachmentsToSession() {
    if (quiz && studentName) {
      try {
        sessionStorage.setItem(`quiz_attachments_${quiz.id}_${studentName}`, JSON.stringify(questionAttachments));
      } catch (e) {
        console.warn('Could not save attachments to sessionStorage:', e);
      }
    }
  }

  function loadAttachmentsFromSession() {
    if (quiz && studentName) {
      try {
        const saved = sessionStorage.getItem(`quiz_attachments_${quiz.id}_${studentName}`);
        if (saved) {
          questionAttachments = JSON.parse(saved);
        }
      } catch (e) {
        console.warn('Could not load attachments from sessionStorage:', e);
      }
    }
  }

  const quizHeaderTitle = document.getElementById('quiz-header-title');
  const timerDisplay = document.getElementById('timer-display');
  const timerProgressBar = document.getElementById('timer-progress-bar');
  const timerIcon = document.getElementById('timer-icon');

  const loaderArea = document.getElementById('loader-area');
  const quizArea = document.getElementById('quiz-area');
  const quizCardContainer = document.getElementById('quiz-card-container');

  const roundBadge = document.getElementById('round-badge');
  const questionBadge = document.getElementById('question-badge');
  const quizCodeLabel = document.getElementById('quiz-code-label');
  const questionTextDisplay = document.getElementById('question-text-display');
  const optionsContainer = document.getElementById('options-container');

  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const nextBtnText = document.getElementById('next-btn-text');
  const nextBtnIcon = document.getElementById('next-btn-icon');

  const startOtpOverlay = document.getElementById('start-otp-overlay');
  const startOtpInput = document.getElementById('start-otp-input');
  const verifyStartOtpBtn = document.getElementById('verify-start-otp-btn');

  const submitOtpOverlay = document.getElementById('submit-otp-overlay');
  const submitOtpInput = document.getElementById('submit-otp-input');
  const verifySubmitOtpBtn = document.getElementById('verify-submit-otp-btn');
  const retryUploadBtn = document.getElementById('retry-upload-btn');

  // Seeded deterministic random number generator + Fisher-Yates shuffle
  function shuffleWithSeed(list, seed) {
    const arr = [...list];

    // Create numeric hash from seed string
    let seedVal = 0;
    for (let i = 0; i < seed.length; i++) {
      seedVal = (seedVal << 5) - seedVal + seed.charCodeAt(i);
      seedVal |= 0;
    }

    // Linear Congruential Generator (LCG) parameters
    const m = 2 ** 31 - 1;
    const a = 1103515245;
    const c = 12345;
    let state = seedVal < 0 ? seedVal + m : seedVal;

    const nextRand = () => {
      state = (a * state + c) % m;
      return state / m;
    };

    // Perform Fisher-Yates shuffle using deterministic rand
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
  }

  function getQuestionTypeRank(question) {
    const type = resolveQuestionType(question);
    if (type === 'MCQ') return 0;
    if (type === 'FIB') return 1;
    if (type === 'HTML') return 3;
    if (type === 'EXCEL') return 4;
    return 2;
  }

  function orderQuestionsBySection(list, shouldRandomize) {
    const sectionMap = {};
    list.forEach((question) => {
      const rank = getQuestionTypeRank(question);
      if (!sectionMap[rank]) sectionMap[rank] = [];
      sectionMap[rank].push(question);
    });

    const sortedKeys = Object.keys(sectionMap).sort((a, b) => Number(a) - Number(b));
    return sortedKeys.flatMap((key) => {
      const section = sectionMap[key];
      if (!shouldRandomize) return section;
      return shuffleWithSeed(section, `${studentName}:${quiz.id}:section:${key}`);
    });
  }

  function getQuestionLimit(totalAvailable) {
    const limit = parseInt(quiz.question_count, 10);
    if (!Number.isInteger(limit) || limit < 1) return totalAvailable;
    return Math.min(limit, totalAvailable);
  }

  function getDisplayOptions(question) {
    if (question.type !== 'MCQ') return [];
    const options = ['A', 'B', 'C', 'D'].map((letter) => ({
      originalLetter: letter,
      text: question[`option_${letter.toLowerCase()}`],
    }));

    if (quiz.randomize_options === false) {
      return options;
    }

    return shuffleWithSeed(options, `${studentName}:${quiz.id}:${question.id}:options`);
  }

  function getOptionReviewData(question) {
    return getDisplayOptions(question).map((option, index) => ({
      display_letter: String.fromCharCode(65 + index),
      original_letter: option.originalLetter,
      text: option.text || '',
    }));
  }

  // Load Quiz Data
  async function loadQuizData() {
    try {
      const isDemoCode = Boolean(code && ['DEMO', 'TEST', 'TESTQUIZ', 'LEVELUP'].includes(code.trim().toUpperCase()));

      if (typeof window.ensureSupabaseClient === 'function') {
        try { await window.ensureSupabaseClient(); } catch (e) {}
      } else if (!window.supabaseClient && typeof window.initSupabaseFromStorage === 'function') {
        try { window.initSupabaseFromStorage(); } catch (e) {}
      }

      if (isDemoCode || !window.supabaseClient) {
        console.log('Initializing interactive demo/test quiz dataset...');
        isDemoQuiz = true;
        const demoData = getDemoQuizData();
        quiz = demoData.quiz;
        questions = demoData.questions;
        loadAttachmentsFromSession();
        loadLocalAnswers();
        quizHeaderTitle.textContent = quiz.title;
        quizCodeLabel.textContent = `Access Code: ${quiz.access_code}`;
        timeLeftSeconds = quiz.duration_minutes * 60;
        totalDurationSeconds = quiz.duration_minutes * 60;
        loaderArea.classList.add('hidden');
        quizArea.classList.remove('hidden');
        startTimer();
        renderCurrentQuestion();
        return;
      }

      // 1. Fetch quiz info
      const { data: quizData, error: quizError } = await window.supabaseClient
        .from('quizzes')
        .select('*')
        .ilike('access_code', code.trim())
        .maybeSingle();

      if (quizError) throw quizError;
      if (!quizData) {
        if (loaderArea) {
          loaderArea.innerHTML = `
            <div class="bg-white border border-slate-200 shadow-md rounded-2xl p-8 max-w-md w-full text-center animate-slide-up">
              <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <i data-lucide="key" class="w-6 h-6"></i>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Quiz Not Found</h3>
              <p class="text-sm text-slate-600 mb-6">No active quiz matches the access code "<span class="font-mono font-bold text-slate-900">${code}</span>". Please check with your teacher.</p>
              <a href="index.html" class="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition cursor-pointer">
                Try Another Code
              </a>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      // 1b. Check if student has already attempted this quiz
      if (studentName && studentName !== 'Candidate') {
        const { data: existingResults, error: rError } = await window.supabaseClient
          .from('student_results')
          .select('id')
          .eq('quiz_id', quizData.id)
          .ilike('student_name', studentName.trim());

        if (existingResults && existingResults.length > 0) {
          if (loaderArea) {
            loaderArea.innerHTML = `
              <div class="bg-white border border-slate-200 shadow-md rounded-2xl p-8 max-w-md w-full text-center animate-slide-up">
                <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i data-lucide="alert-triangle" class="w-6 h-6"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">Quiz Already Attempted</h3>
                <p class="text-sm text-slate-600 mb-6">Student "<span class="font-bold text-slate-900">${studentName}</span>" has already submitted this quiz. Multiple attempts under the same name are not permitted.</p>
                <a href="index.html" class="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition cursor-pointer">
                  Back to Home
                </a>
              </div>
            `;
            if (window.lucide) window.lucide.createIcons();
          }
          return;
        }
      }

      quiz = quizData;
      loadAttachmentsFromSession();
      loadLocalAnswers();
      quizHeaderTitle.textContent = quiz.title;
      quizCodeLabel.textContent = `Access Code: ${quiz.access_code}`;

      timeLeftSeconds = quiz.duration_minutes * 60;
      totalDurationSeconds = quiz.duration_minutes * 60;

      // 2. Fetch quiz questions
      const { data: questionsJunction, error: questionsError } = await window.supabaseClient
        .from('quiz_questions')
        .select('*, question_bank(*)')
        .eq('quiz_id', quiz.id);

      if (questionsError) throw questionsError;

      let items = (questionsJunction || [])
        .map((item) => item.question_bank)
        .filter(Boolean);

      if (items.length === 0) {
        if (loaderArea) {
          loaderArea.innerHTML = `
            <div class="bg-white border border-slate-200 shadow-md rounded-2xl p-8 max-w-md w-full text-center">
              <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <i data-lucide="help-circle" class="w-6 h-6"></i>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Questions Available</h3>
              <p class="text-sm text-slate-600 mb-6">This quiz currently has no questions linked to it. Please inform your instructor.</p>
              <a href="index.html" class="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition">
                Return to Lobby
              </a>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      const questionLimit = getQuestionLimit(items.length);
      const isQuestionPool = items.length > questionLimit;
      const shouldRandomizeQuestions = isQuestionPool || Boolean(quiz.randomize_questions ?? quiz.is_random);
      items = orderQuestionsBySection(items, shouldRandomizeQuestions);
      questions = items.slice(0, questionLimit);

      // Hide loading spinner
      loaderArea.classList.add('hidden');

      if (quiz.offline_mode) {
        startOtpOverlay.classList.remove('hidden');
      } else {
        quizArea.classList.remove('hidden');
        startTimer();
        renderCurrentQuestion();
      }
    } catch (err) {
      console.error('Error loading quiz:', err);
      if (loaderArea) {
        loaderArea.innerHTML = `
          <div class="bg-white border border-slate-200 shadow-md rounded-2xl p-8 max-w-md w-full text-center">
            <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <i data-lucide="alert-circle" class="w-6 h-6"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-900 mb-2">Unable to Load Quiz</h3>
            <p class="text-sm text-slate-600 mb-6">${err.message || 'Could not retrieve quiz questions. Check database connection and access rules.'}</p>
            <a href="index.html" class="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition">
              Return to Lobby
            </a>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  if (verifyStartOtpBtn) {
    verifyStartOtpBtn.addEventListener('click', () => {
      if (startOtpInput.value.trim() === quiz.start_otp) {
        startOtpOverlay.classList.add('hidden');
        quizArea.classList.remove('hidden');
        startTimer();
        renderCurrentQuestion();
      } else {
        window.showToast('Invalid Start OTP.', 'error');
      }
    });
  }

  if (verifySubmitOtpBtn) {
    verifySubmitOtpBtn.addEventListener('click', async () => {
      if (submitOtpInput.value.trim() === quiz.submit_otp) {
        verifySubmitOtpBtn.disabled = true;
        verifySubmitOtpBtn.textContent = 'Uploading...';
        await performUpload();
      } else {
        window.showToast('Invalid Submit OTP.', 'error');
      }
    });
  }

  if (retryUploadBtn) {
    retryUploadBtn.addEventListener('click', async () => {
      retryUploadBtn.disabled = true;
      retryUploadBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Retrying...';
      if (window.lucide) window.lucide.createIcons();
      await performUpload();
    });
  }

  // Countdown timer clock
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timeLeftSeconds--;
      updateTimerDisplay();

      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval);
        window.showToast("Time's up! Submitting your answers...", 'info');
        triggerSubmission();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const mins = Math.floor(timeLeftSeconds / 60);
    const secs = timeLeftSeconds % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (timerDisplay) timerDisplay.textContent = timeStr;

    const fsTimer = document.getElementById('fs-timer-display');
    if (fsTimer) fsTimer.textContent = timeStr;

    // Progress percentage
    if (totalDurationSeconds > 0 && timerProgressBar) {
      const pct = (timeLeftSeconds / totalDurationSeconds) * 100;
      timerProgressBar.style.width = `${pct}%`;
    }

    // Red theme alert if less than 60s
    if (timeLeftSeconds < 60) {
      if (timerProgressBar) {
        timerProgressBar.classList.remove('bg-blue-600');
        timerProgressBar.classList.add('bg-rose-500');
      }
      if (timerDisplay) timerDisplay.classList.add('text-rose-600');
      if (timerIcon) {
        timerIcon.classList.remove('text-slate-600');
        timerIcon.classList.add('text-rose-500', 'animate-pulse');
      }
      if (fsTimer) {
        fsTimer.classList.remove('text-amber-300');
        fsTimer.classList.add('text-rose-400', 'animate-pulse');
      }
    }
  }

  function getFibBlankCount(text) {
    const matches = String(text || '').match(/_{2,}|\[(?:blank|\.\.\.|\s*)\]/gi);
    return matches ? matches.length : 0;
  }

  // Render question card
  function renderCurrentQuestion() {
    const q = questions[currentIdx];

    // Update Badges
    roundBadge.textContent = `Round ${currentRound} of ${quiz.rounds}`;
    questionBadge.textContent = `Question ${currentIdx + 1} of ${questions.length}`;

    // Options rendering based on question type
    const selectedAns = answers[q.id];
    let optionsHtml = '';
    const qType = resolveQuestionType(q);

    // Dynamically expand quiz card container for HTML and EXCEL practical workspaces
    if (quizCardContainer) {
      if (qType === 'HTML' || qType === 'EXCEL') {
        quizCardContainer.classList.remove('max-w-2xl');
        quizCardContainer.classList.add('max-w-6xl');
      } else {
        quizCardContainer.classList.remove('max-w-6xl');
        quizCardContainer.classList.add('max-w-2xl');
      }
    }

    if (qType === 'MCQ') {
      // Question Text
      questionTextDisplay.innerHTML = formatQuestionText(q.question_text);

      // Render MCQ radio/button options
      getDisplayOptions(q).forEach((option, index) => {
        const displayLetter = String.fromCharCode(65 + index);
        const optionText = option.text;
        const isSelected = selectedAns === option.originalLetter;

        optionsHtml += `
          <button
            type="button"
            onclick="window.selectOption('${option.originalLetter}')"
            class="w-full flex items-start gap-4 p-4 rounded-xl border text-left transition select-none cursor-pointer ${
              isSelected
                ? 'border-blue-600 bg-blue-50/30 ring-1 ring-blue-600'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }"
          >
            <span
              class="w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-300 text-slate-500 bg-slate-50'
              }"
            >
              ${displayLetter}
            </span>
            <span class="text-sm formatted-content ${isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'}">
              ${formatQuestionText(optionText)}
            </span>
          </button>
        `;
      });
    } else if (qType === 'FIB') {
      questionTextDisplay.innerHTML = formatQuestionText(q.question_text);
      if (getFibBlankCount(q.question_text) > 0) {
        const savedParts = selectedAns ? selectedAns.split(',').map((s) => s.trim()) : [];
        let blankCounter = 0;

        const blankTokens = [];
        const textWithBlankTokens = String(q.question_text || '').replace(/_{2,}|\[(?:blank|\.\.\.|\s*)\]/gi, () => {
          const idx = blankCounter++;
          const val = savedParts[idx] || '';
          const token = `%%FIB_BLANK_${idx}%%`;
          blankTokens.push({
            token,
            html: `
            <input
              type="text"
              class="inline-fib-input inline-block align-baseline mx-1 px-3 py-1.5 rounded-lg border-2 border-blue-400 bg-blue-50/50 text-blue-950 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm transition placeholder:text-slate-400 shadow-sm"
              data-blank-index="${idx}"
              placeholder="Blank ${idx + 1}"
              value="${escapeHtml(val)}"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
          `
          });
          return token;
        });
        const inlineHtml = blankTokens.reduce(
          (html, item) => html.replace(item.token, item.html),
          formatQuestionText(textWithBlankTokens)
        );

        questionTextDisplay.innerHTML = inlineHtml;

        optionsHtml = `
          <div class="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs font-medium text-blue-800 flex items-center gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-600 shrink-0"></i>
            <span>Type your answers directly into the blank boxes in the sentence above.</span>
          </div>
        `;
      } else {
        optionsHtml = `
          <input
            type="text"
            id="student-text-answer"
            name="ans_${q.id}_${Date.now()}"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            aria-autocomplete="none"
            data-lpignore="true"
            data-form-type="other"
            class="w-full p-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            placeholder="Type your answer here..."
            value="${escapeHtml(selectedAns || '')}"
          />
        `;
      }
    } else if (qType === 'HTML') {
      questionTextDisplay.innerHTML = formatQuestionText(q.question_text);
      const rawSavedCode = selectedAns || '';
      const savedCode = extractStudentFriendlyCode(rawSavedCode);

      optionsHtml = `
        <div class="space-y-4">
          <!-- Top Action Bar: Open CodeStudio Button & Sync Status -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-slate-50 border border-blue-200/90 rounded-2xl shadow-sm">
            <div class="flex items-center gap-3">
              <span class="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                <i data-lucide="code-2" class="w-5 h-5"></i>
              </span>
              <div>
                <h4 class="text-sm font-bold text-slate-900">HTML Code Playground</h4>
                <p class="text-xs text-slate-500">Open CodeStudio to write, test, and preview your HTML/CSS/JS solution</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span id="codestudio-sync-status-${q.id}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${savedCode ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">
                <span class="w-2 h-2 rounded-full ${savedCode ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                <span>${savedCode ? 'Code present in quiz bar' : 'Ready for code'}</span>
              </span>
              <button
                type="button"
                id="open-codestudio-btn-${q.id}"
                onclick="window.launchCodeStudio('${q.id}')"
                class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-500/25 transition-all cursor-pointer select-none"
                title="Launch CodeStudio interactive editor"
              >
                <i data-lucide="external-link" class="w-4 h-4"></i>
                <span>🚀 Open CodeStudio</span>
              </button>
            </div>
          </div>

          <!-- Quiz Type Bar (Your HTML Code) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label for="student-code-bar-${q.id}" class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <i data-lucide="terminal" class="w-4 h-4 text-blue-600"></i>
                <span>Quiz Type Bar (Your HTML Code):</span>
              </label>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onclick="window.copyStudentCode('${q.id}')"
                  class="text-[11px] text-slate-600 hover:text-blue-600 flex items-center gap-1 font-semibold px-2 py-0.5 rounded hover:bg-blue-50 transition cursor-pointer"
                  title="Copy code to clipboard"
                >
                  <i data-lucide="copy" class="w-3 h-3"></i> Copy
                </button>
                <button
                  type="button"
                  onclick="window.clearStudentCode('${q.id}')"
                  class="text-[11px] text-slate-600 hover:text-rose-600 flex items-center gap-1 font-semibold px-2 py-0.5 rounded hover:bg-rose-50 transition cursor-pointer"
                  title="Clear code"
                >
                  <i data-lucide="trash-2" class="w-3 h-3"></i> Clear
                </button>
                <span class="text-[11px] text-slate-400 flex items-center gap-1 ml-1">
                  <i data-lucide="check" class="w-3 h-3 text-emerald-600"></i> Auto-saves to quiz answer
                </span>
              </div>
            </div>

            <div class="relative">
              <textarea
                id="student-code-bar-${q.id}"
                rows="11"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                class="w-full p-4 font-mono text-xs sm:text-sm bg-slate-950 text-emerald-300 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-inner resize-y placeholder:text-slate-600 leading-relaxed tracking-wide transition-all"
                placeholder="<!-- Your code will appear here after clicking '🚀 Submit Code to Quiz' in CodeStudio. You can also write or edit code directly here! -->"
              >${escapeHtml(savedCode)}</textarea>
            </div>

            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 gap-2">
              <div class="flex items-center gap-2">
                <i data-lucide="info" class="w-4 h-4 text-blue-600 shrink-0"></i>
                <span><strong>Workflow:</strong> 1. Click <strong>Open CodeStudio</strong> &rarr; 2. Write your code & click <strong>Submit Code to Quiz</strong> &rarr; 3. Code appears in the bar above &rarr; 4. Click <strong>Submit Quiz</strong> below.</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (qType === 'EXCEL') {
      questionTextDisplay.innerHTML = formatQuestionText(q.question_text);
      const currentMode = excelModes[q.id] || (selectedAns && String(selectedAns).startsWith('[EXCEL_FILE]') ? 'upload' : 'editor');
      excelModes[q.id] = currentMode;

      const isUpload = currentMode === 'upload';
      const existingVal = selectedAns || '';
      const isFileUploaded = existingVal.startsWith('[EXCEL_FILE]');
      let uploadedFileName = '';
      let uploadedFileUrl = '';

      if (isFileUploaded) {
        const parts = existingVal.split(' ');
        uploadedFileUrl = parts[1] || '';
        uploadedFileName = parts.slice(2).join(' ') || 'Workbook.xlsx';
      }

      optionsHtml = `
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3.5 rounded-xl border border-slate-200 gap-3">
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                <i data-lucide="table" class="w-4 h-4"></i>
              </span>
              <div>
                <h4 class="text-xs font-bold text-slate-900">Excel / Spreadsheet Answer Mode</h4>
                <p class="text-[11px] text-slate-500">Select Option A to upload a .xlsx workbook or Option B to use the Online Table Editor</p>
              </div>
            </div>
            <div class="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold w-full sm:w-auto">
              <button
                type="button"
                id="excel-opt-upload-btn-${q.id}"
                onclick="window.toggleExcelMode('${q.id}', 'upload')"
                class="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isUpload ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }"
              >
                <i data-lucide="upload" class="w-3.5 h-3.5"></i>
                Option A: Upload .xlsx
              </button>
              <button
                type="button"
                id="excel-opt-editor-btn-${q.id}"
                onclick="window.toggleExcelMode('${q.id}', 'editor')"
                class="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isUpload ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }"
              >
                <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                Option B: Table Editor
              </button>
            </div>
          </div>

          <!-- Option A: File Upload Container -->
          <div id="excel-upload-panel-${q.id}" class="${isUpload ? '' : 'hidden'} space-y-3">
            <div
              id="excel-dropzone-${q.id}"
              class="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 text-center bg-white transition cursor-pointer"
            >
              <i data-lucide="file-spreadsheet" class="w-10 h-10 text-emerald-600 mx-auto mb-2"></i>
              <p class="text-sm font-bold text-slate-800">Click to upload your Excel workbook (.xlsx)</p>
              <p class="text-xs text-slate-500 mt-1">Preserves original formulas, formatting, and multiple sheets (Max: 10MB)</p>
              <input type="file" id="excel-file-input-${q.id}" class="hidden" accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </div>

            <div id="excel-file-status-${q.id}" class="${isFileUploaded ? '' : 'hidden'} p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <i data-lucide="file-check" class="w-5 h-5"></i>
                </span>
                <div>
                  <p class="text-xs font-bold text-emerald-950" id="excel-filename-${q.id}">${escapeHtml(uploadedFileName || 'Uploaded_Workbook.xlsx')}</p>
                  <span class="text-[10px] font-semibold text-emerald-700">✅ File uploaded and verified in secure storage</span>
                </div>
              </div>
              <button
                type="button"
                id="excel-replace-file-btn-${q.id}"
                class="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Replace File
              </button>
            </div>
          </div>

                    <!-- Option B: Table Editor Container with Prominent Excel Button -->
          <div id="excel-editor-panel-${q.id}" class="${!isUpload ? '' : 'hidden'} space-y-4">
            <!-- Action Card: Open Excel Button & Sync Status -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-slate-50 border border-emerald-200/90 rounded-2xl shadow-sm">
              <div class="flex items-center gap-3">
                <span class="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                  <i data-lucide="file-spreadsheet" class="w-5 h-5"></i>
                </span>
                <div>
                  <h4 class="text-sm font-bold text-slate-900">Excel / Spreadsheet Workspace</h4>
                  <p class="text-xs text-slate-500">Launch full Table Editor to calculate formulas, format cells, and submit answers</p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span id="editor-save-status-${q.id}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${existingVal ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">
                  <span class="w-2 h-2 rounded-full ${existingVal ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                  <span>${existingVal ? 'Data received from Table Editor' : 'Ready for Table Editor'}</span>
                </span>
                <button
                  type="button"
                  id="open-excel-btn-${q.id}"
                  onclick="window.launchTableEditor('${q.id}')"
                  class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-500/25 transition-all cursor-pointer select-none"
                  title="Launch full Excel Table Editor in full website window"
                >
                  <i data-lucide="external-link" class="w-4 h-4"></i>
                  <span>📊 Open Excel Table Editor</span>
                </button>
              </div>
            </div>

            <!-- Quiz Data Bar (Your Table / CSV Data) -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="editor-fallback-textarea-${q.id}" class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <i data-lucide="table" class="w-4 h-4 text-emerald-600"></i>
                  <span>Quiz Data Bar (Your Excel Table Data):</span>
                </label>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick="window.copyExcelTableData('${q.id}')"
                    class="text-[11px] text-slate-600 hover:text-emerald-700 flex items-center gap-1 font-semibold px-2 py-0.5 rounded hover:bg-emerald-50 transition cursor-pointer"
                    title="Copy table data"
                  >
                    <i data-lucide="copy" class="w-3 h-3"></i> Copy
                  </button>
                  <button
                    type="button"
                    onclick="window.clearExcelTableData('${q.id}')"
                    class="text-[11px] text-slate-600 hover:text-rose-600 flex items-center gap-1 font-semibold px-2 py-0.5 rounded hover:bg-rose-50 transition cursor-pointer"
                    title="Clear table data"
                  >
                    <i data-lucide="trash-2" class="w-3 h-3"></i> Clear
                  </button>
                  <button
                    type="button"
                    id="toggle-inline-frame-btn-${q.id}"
                    onclick="window.toggleInlineEditorFrame('${q.id}')"
                    class="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold px-2 py-0.5 rounded hover:bg-slate-100 transition cursor-pointer"
                    title="Toggle embedded view"
                  >
                    <i data-lucide="layout" class="w-3 h-3"></i>
                    <span id="toggle-frame-text-${q.id}">Show Embedded Frame</span>
                  </button>
                  <span class="text-[11px] text-slate-400 flex items-center gap-1 ml-1">
                    <i data-lucide="check" class="w-3 h-3 text-emerald-600"></i> Auto-saves to quiz answer
                  </span>
                </div>
              </div>

              <textarea
                id="editor-fallback-textarea-${q.id}"
                rows="5"
                class="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs text-slate-800 transition"
                placeholder="Click 'Open Excel Table Editor' above to work on the spreadsheet. When you click 'Submit to Quiz', your table data automatically appears here."
              >${escapeHtml(!isFileUploaded ? existingVal : '')}</textarea>
            </div>

            <!-- Optional Embedded Iframe (Toggled via button) -->
            <div id="inline-frame-wrapper-${q.id}" class="hidden relative w-full h-[520px] fullscreen-iframe-container rounded-2xl overflow-hidden border border-slate-300 shadow-sm bg-white">
              <iframe
                id="table-editor-iframe-${q.id}"
                src="https://umesh1424.github.io/html_table_editor/?qid=${q.id}"
                class="w-full h-full border-0"
                title="Online HTML Table Editor"
              ></iframe>
            </div>
          </div>
      `;
    } else {
      // Short Answer Question Type
      questionTextDisplay.innerHTML = formatQuestionText(q.question_text);
      optionsHtml = `
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <input
              type="text"
              id="student-text-answer"
              name="ans_${q.id}_${Date.now()}"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              aria-autocomplete="none"
              data-lpignore="true"
              data-form-type="other"
              class="flex-1 p-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
              placeholder="Type your answer here..."
              value="${escapeHtml(selectedAns || '')}"
            />
            <button
              type="button"
              id="student-open-excel-btn-${q.id}"
              onclick="window.launchTableEditor('${q.id}')"
              class="inline-flex items-center gap-2 px-4 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-semibold shadow-sm transition shrink-0 cursor-pointer select-none"
              title="Open Excel / Table Editor"
            >
              <i data-lucide="file-spreadsheet" class="w-4 h-4 text-white"></i>
              <span class="font-bold">Excel</span>
            </button>
            <label for="student-file-upload" class="inline-flex items-center gap-2 px-4 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold border border-slate-200 cursor-pointer transition shrink-0 select-none shadow-sm" title="Upload screenshot, PDF, DOCX, etc.">
              <i data-lucide="paperclip" class="w-4 h-4 text-slate-600"></i>
              <span class="hidden sm:inline">Attach File</span>
            </label>
            <input type="file" id="student-file-upload" class="hidden" accept="image/*,.pdf,.doc,.docx,.txt" multiple />
          </div>
          <div id="attachments-preview-container" class="flex flex-wrap gap-2"></div>

          <!-- Inline Excel Table Editor Workspace Panel -->
          <div id="inline-excel-panel-${q.id}" class="hidden mt-4 space-y-3">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 gap-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <i data-lucide="table" class="w-4 h-4"></i>
                </span>
                <div>
                  <h4 class="font-bold text-slate-900 flex items-center gap-1.5">
                    Online Excel Table Editor
                    <span class="text-[10px] text-slate-400 font-normal hidden md:inline">(Excel Table Editor)</span>
                  </h4>
                  <p class="text-[11px] text-slate-500">Edit spreadsheet below. Changes will automatically sync to your answer.</p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <span class="text-slate-500 font-medium flex items-center gap-1 text-[11px]" id="inline-excel-save-status-${q.id}">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i> Ready / Autosaving
                </span>
                <button
                  type="button"
                  onclick="window.openExcelExternal('${q.id}')"
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition cursor-pointer"
                  title="Open in new browser tab"
                >
                  <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-500"></i>
                  <span>New Tab</span>
                </button>
                <button
                  type="button"
                  id="inline-excel-fs-btn-${q.id}"
                  onclick="window.toggleInlineExcelFullscreen('${q.id}')"
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs cursor-pointer"
                  title="Toggle Fullscreen Table View (Esc to exit)"
                >
                  <i data-lucide="maximize-2" class="w-3.5 h-3.5" id="inline-excel-fs-icon-${q.id}"></i>
                  <span id="inline-excel-fs-text-${q.id}">Full Screen</span>
                </button>
                <button
                  type="button"
                  onclick="window.closeInlineExcel('${q.id}')"
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                  title="Hide Table Editor"
                >
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div class="relative w-full h-[540px] fullscreen-iframe-container rounded-2xl overflow-hidden border border-slate-300 shadow-sm bg-white">
              <iframe
                id="inline-table-editor-iframe-${q.id}"
                src="https://umesh1424.github.io/html_table_editor/"
                class="w-full h-full border-0"
                title="Online HTML Table Editor"
                allow="clipboard-read; clipboard-write"
              ></iframe>
            </div>
          </div>
        </div>
      `;
    }

    optionsContainer.innerHTML = optionsHtml;

    // Add input event listener for text answer to save as user types
    if (qType === 'FIB' && getFibBlankCount(q.question_text) > 0) {
      const inlineInputs = questionTextDisplay.querySelectorAll('.inline-fib-input');
      const updateInlineAnswers = () => {
        const parts = [];
        inlineInputs.forEach((inp, idx) => {
          parts[idx] = inp.value.trim();
        });
        answers[q.id] = parts.join(', ');
      };
      inlineInputs.forEach((inp) => {
        inp.addEventListener('input', updateInlineAnswers);
      });
    } else if (qType !== 'MCQ') {
      const textInput = document.getElementById('student-text-answer');
      if (textInput) {
        textInput.addEventListener('input', () => {
          answers[q.id] = textInput.value.trim();
        });
      }

      // Only wire file upload for Short Answer questions
      const isShortAnswer = qType === 'SHORT ANSWER' || qType === 'SHORT_ANSWER' || qType === 'SHORT' || (qType !== 'MCQ' && qType !== 'FIB');
      if (isShortAnswer) {
        const fileInput = document.getElementById('student-file-upload');
        if (fileInput) {
          fileInput.addEventListener('change', async (e) => {
            const selectedFiles = Array.from(e.target.files || []);
            if (!selectedFiles.length) return;

            if (!questionAttachments[q.id]) {
              questionAttachments[q.id] = [];
            }

            for (const file of selectedFiles) {
              if (file.size > 5 * 1024 * 1024) {
                window.showToast(`File "${file.name}" exceeds maximum allowed size of 5MB.`, 'error');
                continue;
              }

              try {
                const dataUrl = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (evt) => resolve(evt.target.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });

                let fileUrl = dataUrl;

                let uploadedToStorage = false;

                if (window.supabaseClient) {
                  try {
                    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
                    const storagePath = `quiz_${quiz ? quiz.id : 'general'}/${studentName}_${Date.now()}_${uniqueSuffix}_${cleanName}`;
                    const { data: uploadResult, error: uploadErr } = await window.supabaseClient
                      .storage
                      .from('quiz-attachments')
                      .upload(storagePath, file, { upsert: true });

                    if (!uploadErr && uploadResult) {
                      const { data: pubUrlObj } = window.supabaseClient
                        .storage
                        .from('quiz-attachments')
                        .getPublicUrl(storagePath);

                      if (pubUrlObj && pubUrlObj.publicUrl) {
                        fileUrl = pubUrlObj.publicUrl;
                        uploadedToStorage = true;
                      }
                    } else if (uploadErr) {
                      console.warn('Client storage upload notice (RLS policy check):', uploadErr.message);
                    }
                  } catch (sErr) {
                    console.warn('Client storage upload exception:', sErr);
                  }
                }

                // If client upload failed (e.g., due to POLICIES: 0), try server backend upload API
                if (!uploadedToStorage) {
                  try {
                    const apiRes = await fetch('/api/upload-attachment', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'x-supabase-url': window.SUPABASE_URL || '',
                        'x-supabase-key': window.SUPABASE_ANON_KEY || ''
                      },
                      body: JSON.stringify({
                        fileName: file.name,
                        fileDataUrl: dataUrl,
                        quizId: quiz ? quiz.id : 'general',
                        studentName: studentName
                      })
                    });

                    if (apiRes.ok) {
                      const apiData = await apiRes.json();
                      if (apiData.publicUrl) {
                        fileUrl = apiData.publicUrl;
                        uploadedToStorage = true;
                      }
                    }
                  } catch (apiErr) {
                    console.warn('Backend API upload fallback notice (using base64):', apiErr);
                  }
                }

                questionAttachments[q.id].push({
                  name: file.name,
                  type: file.type || 'application/octet-stream',
                  size: file.size,
                  dataUrl: fileUrl,
                });
              } catch (fErr) {
                console.error('Error reading selected file:', fErr);
              }
            }

            saveAttachmentsToSession();
            renderAttachmentsPreview(q.id);
            fileInput.value = '';
          });
        }

        renderAttachmentsPreview(q.id);
      }
    }

    // Ensure any leftover fullscreen containers are removed
    const oldFs = document.getElementById('html-fullscreen-container');
    if (oldFs) oldFs.remove();
    const defaultHeader = document.querySelector('body > div.sticky');
    if (defaultHeader) defaultHeader.classList.remove('hidden');
    if (quizCardContainer) quizCardContainer.classList.remove('hidden');

    if (qType === 'HTML') {
      const codeBar = document.getElementById(`student-code-bar-${q.id}`);
      if (codeBar) {
        codeBar.addEventListener('input', () => {
          saveAnswerWithTimestamp(q.id, codeBar.value);
          const statusBadge = document.getElementById(`codestudio-sync-status-${q.id}`);
          if (statusBadge) {
            statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
            statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Code edited in quiz bar</span>`;
          }
        });

        // Tab key support for code indentation
        codeBar.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeBar.selectionStart;
            const end = codeBar.selectionEnd;
            codeBar.value = codeBar.value.substring(0, start) + '  ' + codeBar.value.substring(end);
            codeBar.selectionStart = codeBar.selectionEnd = start + 2;
            codeBar.dispatchEvent(new Event('input'));
          }
        });
      }
    } else {

      if (qType === 'EXCEL') {
      setTimeout(() => {
        const dropzone = document.getElementById(`excel-dropzone-${q.id}`);
        const fileInput = document.getElementById(`excel-file-input-${q.id}`);
        const replaceBtn = document.getElementById(`excel-replace-file-btn-${q.id}`);

        const triggerFileInput = () => fileInput && fileInput.click();
        if (dropzone) dropzone.addEventListener('click', triggerFileInput);
        if (replaceBtn) replaceBtn.addEventListener('click', triggerFileInput);

        if (fileInput) {
          fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith('.xlsx')) {
              window.showToast('Invalid file format. Only .xlsx files are supported.', 'error');
              return;
            }

            if (file.size > 10 * 1024 * 1024) {
              window.showToast('File size exceeds maximum allowed 10MB limit.', 'error');
              return;
            }

            window.showToast('Uploading Excel workbook...', 'info');

            try {
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (evt) => resolve(evt.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });

              let publicUrl = '';

              if (window.supabaseClient) {
                try {
                  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                  const storagePath = `quiz_${quiz ? quiz.id : 'general'}/${studentName}_${Date.now()}_${cleanName}`;
                  const { data: upRes, error: upErr } = await window.supabaseClient
                    .storage
                    .from('quiz-attachments')
                    .upload(storagePath, file, { upsert: true });

                  if (!upErr && upRes) {
                    const { data: urlData } = window.supabaseClient
                      .storage
                      .from('quiz-attachments')
                      .getPublicUrl(storagePath);
                    if (urlData?.publicUrl) publicUrl = urlData.publicUrl;
                  }
                } catch (sErr) {}
              }

              if (!publicUrl) {
                const apiRes = await fetch('/api/upload-attachment', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-supabase-url': window.SUPABASE_URL || '',
                    'x-supabase-key': window.SUPABASE_ANON_KEY || ''
                  },
                  body: JSON.stringify({
                    fileName: file.name,
                    fileDataUrl: dataUrl,
                    quizId: quiz ? quiz.id : 'general',
                    studentName: studentName
                  })
                });
                if (apiRes.ok) {
                  const resData = await apiRes.json();
                  if (resData.publicUrl) publicUrl = resData.publicUrl;
                }
              }

              if (!publicUrl) publicUrl = dataUrl;

              if (!questionAttachments[q.id]) questionAttachments[q.id] = [];
              questionAttachments[q.id] = [{
                name: file.name,
                type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                size: file.size,
                dataUrl: publicUrl
              }];
              saveAttachmentsToSession();

              const answerPayload = `[EXCEL_FILE] ${publicUrl} ${file.name}`;
              saveAnswerWithTimestamp(q.id, answerPayload, 'upload');

              const statusEl = document.getElementById(`excel-file-status-${q.id}`);
              const nameEl = document.getElementById(`excel-filename-${q.id}`);
              if (nameEl) nameEl.textContent = file.name;
              if (statusEl) statusEl.classList.remove('hidden');
              window.showToast('Excel workbook uploaded successfully!', 'success');
            } catch (err) {
              console.error('Error uploading Excel file:', err);
              window.showToast('Failed to upload Excel file.', 'error');
            }
          });
        }

        const iframe = document.getElementById(`table-editor-iframe-${q.id}`);
        let initialDataToSend = selectedAns || '';
        if (!initialDataToSend && q.question_text && q.question_text.includes('|')) {
          const starterTable = extractMarkdownTableFromText(q.question_text);
          if (starterTable) {
            initialDataToSend = starterTable;
            localStorage.setItem('levelup_excel_initial_' + q.id, JSON.stringify(starterTable));
            const fallbackTa = document.getElementById(`editor-fallback-textarea-${q.id}`);
            if (fallbackTa && !fallbackTa.value.trim()) {
              fallbackTa.value = starterTable.map(r => r.join(',')).join('\n');
            }
          }
        }
        if (iframe && iframe.contentWindow) {
          sendPostMessageToIframe(iframe.contentWindow, 'LEVELUP_INIT', { data: initialDataToSend }, q.id);
        }

        const fallbackTextarea = document.getElementById(`editor-fallback-textarea-${q.id}`);
        if (fallbackTextarea) {
          fallbackTextarea.addEventListener('input', () => {
            saveAnswerWithTimestamp(q.id, fallbackTextarea.value, 'editor');
          });
        }
      }, 300);
    }
  }

    // Navigation Buttons configuration
    prevBtn.disabled = currentIdx === 0;

    const isLastQuestionOfLastRound = currentIdx === questions.length - 1 && currentRound === quiz.rounds;

    if (isLastQuestionOfLastRound) {
      nextBtnText.textContent = 'Submit Quiz';
      nextBtn.className = "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm cursor-pointer shadow-emerald-100";
      nextBtnIcon.setAttribute('data-lucide', 'send');
    } else if (currentIdx === questions.length - 1) {
      nextBtnText.textContent = 'Next Round';
      nextBtn.className = "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer shadow-blue-100";
      nextBtnIcon.setAttribute('data-lucide', 'arrow-right');
    } else {
      nextBtnText.textContent = 'Next Question';
      nextBtn.className = "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm cursor-pointer shadow-blue-100";
      nextBtnIcon.setAttribute('data-lucide', 'arrow-right');
    }

    window.lucide.createIcons();
  }

  // Helper to save current answer (for MCQ, FIB, Short Answer, HTML, EXCEL)
  function saveCurrentAnswer() {
    const q = questions[currentIdx];
    if (!q) return;
    const qType = resolveQuestionType(q);
    if (qType === 'MCQ') {
      // Already handled by selectOption
    } else if (qType === 'FIB' && getFibBlankCount(q.question_text) > 0) {
      const inlineInputs = questionTextDisplay.querySelectorAll('.inline-fib-input');
      if (inlineInputs && inlineInputs.length > 0) {
        const parts = [];
        inlineInputs.forEach((inp, idx) => {
          parts[idx] = inp.value.trim();
        });
        saveAnswerWithTimestamp(q.id, parts.join(', '));
      }
    } else if (qType === 'HTML') {
      const codeBar = document.getElementById(`student-code-bar-${q.id}`);
      if (codeBar) {
        saveAnswerWithTimestamp(q.id, codeBar.value);
      } else if (answers[q.id] !== undefined) {
        saveAnswerWithTimestamp(q.id, answers[q.id]);
      }
      const iframe = document.getElementById(`html-editor-iframe-${q.id}`);
      if (iframe && iframe.contentWindow && typeof iframe.contentWindow.getCodeContent === 'function') {
        try {
          const directCode = iframe.contentWindow.getCodeContent();
          if (directCode) saveAnswerWithTimestamp(q.id, directCode);
        } catch (e) {}
      }
    } else if (qType === 'EXCEL') {
      const mode = excelModes[q.id] || 'editor';
      if (mode === 'editor') {
        const iframe = document.getElementById(`table-editor-iframe-${q.id}`);
        if (iframe && iframe.contentWindow) {
          sendPostMessageToIframe(iframe.contentWindow, 'REQUEST_GET_CONTENT', {}, q.id);
        }
        const fallbackTextarea = document.getElementById(`editor-fallback-textarea-${q.id}`);
        if (fallbackTextarea && fallbackTextarea.value.trim()) {
          saveAnswerWithTimestamp(q.id, fallbackTextarea.value.trim(), 'editor');
        }
      }
    } else {
      const textInput = document.getElementById('student-text-answer');
      if (textInput) {
        saveAnswerWithTimestamp(q.id, textInput.value.trim());
      }
    }
  }

  window.triggerFsSubmit = () => {
    if (submitting) return;
    const q = questions[currentIdx];
    if (q) {
      const iframe = document.getElementById(`html-editor-iframe-${q.id}`);
      if (iframe && iframe.contentWindow) {
        try {
          if (typeof iframe.contentWindow.getCodeContent === 'function') {
            const code = iframe.contentWindow.getCodeContent();
            if (code !== undefined) {
              saveAnswerWithTimestamp(q.id, code);
            }
          } else if (iframe.contentWindow.htmlEditor) {
            const code = iframe.contentWindow.htmlEditor.getValue();
            if (code !== undefined) {
              saveAnswerWithTimestamp(q.id, code);
            }
          }
        } catch (e) {
          console.warn('Direct code read failed:', e);
        }
        sendPostMessageToIframe(iframe.contentWindow, 'REQUEST_GET_CONTENT', {}, q.id);
      }
    }

    saveCurrentAnswer();

    const isLastQuestionOfLastRound = currentIdx === questions.length - 1 && currentRound === quiz.rounds;
    if (isLastQuestionOfLastRound) {
      triggerSubmission();
    } else {
      if (currentIdx < questions.length - 1) {
        currentIdx++;
        renderCurrentQuestion();
      } else if (currentRound < quiz.rounds) {
        currentRound++;
        currentIdx = 0;
        renderCurrentQuestion();
      }
    }
  };

  window.prevQuestionFromFs = () => {
    saveCurrentAnswer();
    if (currentIdx > 0) {
      currentIdx--;
      renderCurrentQuestion();
    }
  };

  window.toggleExcelMode = (qId, mode) => {
    excelModes[qId] = mode;
    const uploadPanel = document.getElementById(`excel-upload-panel-${qId}`);
    const editorPanel = document.getElementById(`excel-editor-panel-${qId}`);
    const uploadBtn = document.getElementById(`excel-opt-upload-btn-${qId}`);
    const editorBtn = document.getElementById(`excel-opt-editor-btn-${qId}`);

    if (mode === 'upload') {
      if (uploadPanel) uploadPanel.classList.remove('hidden');
      if (editorPanel) editorPanel.classList.add('hidden');
      if (uploadBtn) {
        uploadBtn.className = 'flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-emerald-600 text-white shadow-sm';
      }
      if (editorBtn) {
        editorBtn.className = 'flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900';
      }
    } else {
      if (editorPanel) editorPanel.classList.remove('hidden');
      if (uploadPanel) uploadPanel.classList.add('hidden');
      if (editorBtn) {
        editorBtn.className = 'flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-emerald-600 text-white shadow-sm';
      }
      if (uploadBtn) {
        uploadBtn.className = 'flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900';
      }
    }

    if (quiz && studentName) {
      try {
        localStorage.setItem(`levelup_excel_modes_${quiz.id}_${studentName}`, JSON.stringify(excelModes));
      } catch (e) {}
    }
  };

  window.toggleFullscreenWorkspace = (qId) => {
    const wrapper = document.getElementById(`html-editor-wrapper-${qId}`);
    const banner = document.getElementById(`fullscreen-prompt-banner-${qId}`);
    const footer = document.getElementById(`fullscreen-footer-${qId}`);
    const fsText = document.getElementById(`fullscreen-text-${qId}`);
    const fsIcon = document.getElementById(`fullscreen-icon-${qId}`);

    if (!wrapper) return;
    const isFs = wrapper.classList.contains('fullscreen-workspace-active');

    if (!isFs) {
      wrapper.classList.add('fullscreen-workspace-active');
      if (banner) banner.classList.remove('hidden');
      if (footer) footer.classList.remove('hidden');
      if (fsText) fsText.textContent = 'Exit Fullscreen (Esc)';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'minimize-2');
      document.body.style.overflow = 'hidden';
    } else {
      wrapper.classList.remove('fullscreen-workspace-active');
      if (banner) banner.classList.add('hidden');
      if (footer) footer.classList.add('hidden');
      if (fsText) fsText.textContent = 'Full Screen';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'maximize-2');
      document.body.style.overflow = '';
    }

    window.refreshLivePreview(qId);
    if (window.lucide) window.lucide.createIcons();
  };

  
  window.launchTableEditor = (qId) => {
    const targetId = qId || (questions[currentIdx] ? questions[currentIdx].id : null);
    if (!targetId) return;

    const q = questions.find(item => String(item.id) === String(targetId)) || questions[currentIdx];
    let initialData = answers[targetId] || (document.getElementById('student-text-answer')?.value) || '';
    if (!initialData && q && q.question_text) {
      initialData = markdownTableToCsv(q.question_text);
    }

    try {
      localStorage.setItem('levelup_current_editing_qid', String(targetId));
      if (initialData) {
        localStorage.setItem(`levelup_excel_initial_${targetId}`, initialData);
      }
    } catch (e) {}

    // Open full website in a new tab immediately
    window.openExcelExternal(targetId);

    // Also reveal connection status in quiz card
    const panel = document.getElementById(`inline-excel-panel-${targetId}`);
    if (panel) {
      panel.classList.remove('hidden');
      const saveStatus = document.getElementById(`inline-excel-save-status-${targetId}`);
      if (saveStatus) {
        saveStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> <span>Full Website Active • Autosaving</span>`;
      }
      if (window.lucide) window.lucide.createIcons();
    }
  };

  window.closeInlineExcel = (qId) => {
    const panel = document.getElementById(`inline-excel-panel-${qId}`);
    if (panel) {
      panel.classList.add('hidden');
      panel.classList.remove('fullscreen-workspace-active');
      document.body.style.overflow = '';
      if (window.lucide) window.lucide.createIcons();
    }
  };

  let activeExcelPopup = null;
  window.openExcelExternal = (qId) => {
    const targetId = qId || (questions[currentIdx] ? questions[currentIdx].id : null);
    const qParam = targetId ? `?qid=${encodeURIComponent(targetId)}` : '';
    const url = `https://umesh1424.github.io/html_table_editor/${qParam}`;
    const popupFeatures = 'width=1280,height=820,left=80,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
    try {
      if (activeExcelPopup && !activeExcelPopup.closed) {
        activeExcelPopup.close();
      }
    } catch (e) {}
    activeExcelPopup = window.open(url, '_blank', popupFeatures);
    if (activeExcelPopup) {
      activeExcelPopup.focus();
    }
  };

  window.toggleInlineExcelFullscreen = (qId) => {
    const panel = document.getElementById(`inline-excel-panel-${qId}`);
    const fsText = document.getElementById(`inline-excel-fs-text-${qId}`);
    const fsIcon = document.getElementById(`inline-excel-fs-icon-${qId}`);
    if (!panel) return;

    const isFs = panel.classList.contains('fullscreen-workspace-active');
    if (!isFs) {
      panel.classList.add('fullscreen-workspace-active');
      if (fsText) fsText.textContent = 'Exit (Esc)';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'minimize-2');
      document.body.style.overflow = 'hidden';
    } else {
      panel.classList.remove('fullscreen-workspace-active');
      if (fsText) fsText.textContent = 'Full Screen';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'maximize-2');
      document.body.style.overflow = '';
    }
    if (window.lucide) window.lucide.createIcons();
  };

  window.toggleExcelFullscreen = (qId) => {
    const panel = document.getElementById(`excel-editor-panel-${qId}`);
    const fsText = document.getElementById(`excel-fs-text-${qId}`);
    const fsIcon = document.getElementById(`excel-fs-icon-${qId}`);
    if (!panel) return;

    const isFs = panel.classList.contains('fullscreen-workspace-active');
    if (!isFs) {
      panel.classList.add('fullscreen-workspace-active');
      if (fsText) fsText.textContent = 'Exit Fullscreen (Esc)';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'minimize-2');
      document.body.style.overflow = 'hidden';
    } else {
      panel.classList.remove('fullscreen-workspace-active');
      if (fsText) fsText.textContent = 'Full Screen';
      if (fsIcon) fsIcon.setAttribute('data-lucide', 'maximize-2');
      document.body.style.overflow = '';
    }
    if (window.lucide) window.lucide.createIcons();
  };

  window.refreshLivePreview = (qId) => {
    const editor = document.getElementById(`builtin-code-editor-${qId}`);
    const preview = document.getElementById(`html-live-preview-${qId}`);
    if (!editor || !preview) return;
    preview.srcdoc = editor.value || '';
  };

  window.toggleHtmlEditorMode = (qId, mode) => {
    const builtinView = document.getElementById(`html-builtin-view-${qId}`);
    const codestudioView = document.getElementById(`html-codestudio-view-${qId}`);
    const builtinBtn = document.getElementById(`html-mode-builtin-btn-${qId}`);
    const codestudioBtn = document.getElementById(`html-mode-codestudio-btn-${qId}`);

    if (mode === 'builtin') {
      if (builtinView) builtinView.classList.remove('hidden');
      if (codestudioView) codestudioView.classList.add('hidden');
      if (builtinBtn) {
        builtinBtn.className = 'px-3 py-1 rounded-lg font-semibold transition cursor-pointer bg-white text-blue-700 shadow-sm border border-slate-200';
      }
      if (codestudioBtn) {
        codestudioBtn.className = 'px-3 py-1 rounded-lg font-medium transition cursor-pointer text-slate-600 hover:text-slate-900';
      }
      window.refreshLivePreview(qId);
    } else {
      if (codestudioView) codestudioView.classList.remove('hidden');
      if (builtinView) builtinView.classList.add('hidden');
      if (codestudioBtn) {
        codestudioBtn.className = 'px-3 py-1 rounded-lg font-semibold transition cursor-pointer bg-white text-blue-700 shadow-sm border border-slate-200';
      }
      if (builtinBtn) {
        builtinBtn.className = 'px-3 py-1 rounded-lg font-medium transition cursor-pointer text-slate-600 hover:text-slate-900';
      }
    }
    if (window.lucide) window.lucide.createIcons();
  };

  window.insertStarterTemplate = (qId) => {
    const q = questions.find((item) => String(item.id) === String(qId)) || questions[currentIdx];
    const editor = document.getElementById(`builtin-code-editor-${qId}`);
    if (!editor) return;

    const qText = String(q?.question_text || '').toLowerCase();
    let starter = '';

    if (qText.includes('paragraph') && qText.includes('red') && (qText.includes('20px') || qText.includes('size'))) {
      starter = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Red Paragraph</title>\n  <style>\n    .red-paragraph {\n      color: red;\n      font-size: 20px;\n    }\n  </style>\n</head>\n<body>\n  <p class="red-paragraph">This is a paragraph with red text and a 20px font size.</p>\n</body>\n</html>`;
    } else if (qText.includes('profile') || qText.includes('card')) {
      starter = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Profile Card</title>\n  <style>\n    .card {\n      max-width: 320px;\n      padding: 1.5rem;\n      border-radius: 12px;\n      background: #ffffff;\n      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);\n      font-family: sans-serif;\n      text-align: center;\n    }\n    .btn {\n      margin-top: 1rem;\n      padding: 8px 16px;\n      background: #2563eb;\n      color: white;\n      border: none;\n      border-radius: 6px;\n      cursor: pointer;\n    }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h3>Alex Developer</h3>\n    <p>Web Developer & Designer</p>\n    <button class="btn" onclick="this.textContent = 'Connected!'">Connect</button>\n  </div>\n</body>\n</html>`;
    } else {
      starter = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Solution</title>\n  <style>\n    body { font-family: sans-serif; padding: 1rem; }\n  </style>\n</head>\n<body>\n  <!-- Write your HTML code here -->\n\n</body>\n</html>`;
    }

    if (editor.value.trim() && !confirm('Insert starter template? Current code will be replaced.')) {
      return;
    }

    editor.value = starter;
    editor.dispatchEvent(new Event('input'));
    window.showToast('Starter template loaded!', 'info');
  };

  window.clearHtmlEditor = (qId) => {
    const editor = document.getElementById(`builtin-code-editor-${qId}`);
    if (!editor) return;
    if (!editor.value.trim() || confirm('Are you sure you want to clear your code?')) {
      editor.value = '';
      editor.dispatchEvent(new Event('input'));
    }
  };

  // Keyboard shortcut: Escape exits fullscreen workspace
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeFs = document.querySelector('.fullscreen-workspace-active');
      if (activeFs) {
        const q = questions[currentIdx];
        if (q) {
          const qType = resolveQuestionType(q);
          if (qType === 'HTML' && typeof window.toggleFullscreenWorkspace === 'function') {
            window.toggleFullscreenWorkspace(q.id);
          } else if (qType === 'EXCEL' && typeof window.toggleExcelFullscreen === 'function') {
            window.toggleExcelFullscreen(q.id);
          } else if (typeof window.toggleInlineExcelFullscreen === "function") {
            window.toggleInlineExcelFullscreen(q.id);
          }
        }
      }
    }
  });

  // Handle Option Clicks (MCQ only)
  window.selectOption = (letter) => {
    const q = questions[currentIdx];
    answers[q.id] = letter;
    renderCurrentQuestion();
  };

  // Nav: Previous Question
  prevBtn.addEventListener('click', () => {
    saveCurrentAnswer();
    if (currentIdx > 0) {
      currentIdx--;
      renderCurrentQuestion();
    }
  });

  // Nav: Next Question / Submit
  nextBtn.addEventListener('click', async () => {
    if (submitting) return;
    saveCurrentAnswer();

    const isLastQuestionOfLastRound = currentIdx === questions.length - 1 && currentRound === quiz.rounds;

    if (currentIdx < questions.length - 1) {
      currentIdx++;
      renderCurrentQuestion();
    } else {
      // End of questions list for the round
      if (currentRound < quiz.rounds) {
        currentRound++;
        currentIdx = 0;
        window.showToast(`Round ${currentRound} starting!`, 'info');
        renderCurrentQuestion();
      } else if (isLastQuestionOfLastRound) {
        // Submit Quiz
        triggerSubmission();
      }
    }
  });

  function isMissingSchemaItem(error, itemName) {
    const code = error?.code || '';
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const needle = itemName.toLowerCase();
    return (
      message.includes(needle) &&
      (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01' || message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
    );
  }

  function normalizeAnswerString(str) {
    if (!str) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '')
      .replace(/\s+/g, ' ');
  }

  function isAnswerCorrect(question, studentAnswer) {
    const rawStudent = String(studentAnswer || '').trim();
    const rawCorrect = String(question.correct_option || '').trim();
    if (!rawStudent) return false;

    const qType = resolveQuestionType(question);
    if (qType === 'MCQ') {
      const studentLetter = rawStudent.charAt(0).toUpperCase();
      const correctLetter = rawCorrect.charAt(0).toUpperCase();
      return Boolean(studentLetter && correctLetter && studentLetter === correctLetter);
    }

    if (qType === 'HTML' || qType === 'EXCEL') {
      // Practical submissions are preserved for teacher grading
      return false;
    }

    if (!rawCorrect) return false;
    const normStudent = normalizeAnswerString(rawStudent);
    const normCorrect = normalizeAnswerString(rawCorrect);
    return Boolean(normStudent && normCorrect && normStudent === normCorrect);
  }

  function renderAttachmentsPreview(qId) {
    const container = document.getElementById('attachments-preview-container');
    if (!container) return;

    const list = questionAttachments[qId] || [];
    if (list.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = list.map((fileObj, idx) => {
      const isImage = (fileObj.type && fileObj.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(fileObj.name || '');
      const formattedSize = fileObj.size ? `${(fileObj.size / 1024).toFixed(1)} KB` : '';

      if (isImage && fileObj.dataUrl) {
        return `
          <div class="relative group flex items-center gap-2.5 p-2 px-3 rounded-xl border border-slate-200 bg-white shadow-sm max-w-xs">
            <img src="${fileObj.dataUrl}" alt="${escapeHtml(fileObj.name)}" class="w-9 h-9 object-cover rounded-lg border border-slate-100 shrink-0" />
            <div class="overflow-hidden text-xs">
              <p class="font-medium text-slate-800 truncate" title="${escapeHtml(fileObj.name)}">${escapeHtml(fileObj.name)}</p>
              <p class="text-[10px] text-slate-400 font-mono">${formattedSize}</p>
            </div>
            <button type="button" class="remove-attachment-btn ml-1 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" data-file-index="${idx}" title="Remove attachment">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        `;
      }

      return `
        <div class="relative group flex items-center gap-2.5 p-2 px-3 rounded-xl border border-slate-200 bg-slate-50 shadow-sm max-w-xs">
          <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <i data-lucide="file-text" class="w-4 h-4"></i>
          </div>
          <div class="overflow-hidden text-xs">
            <p class="font-medium text-slate-800 truncate" title="${escapeHtml(fileObj.name)}">${escapeHtml(fileObj.name)}</p>
            <p class="text-[10px] text-slate-400 font-mono">${formattedSize}</p>
          </div>
          <button type="button" class="remove-attachment-btn ml-1 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" data-file-index="${idx}" title="Remove attachment">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    container.querySelectorAll('.remove-attachment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-file-index'), 10);
        if (!isNaN(idx) && questionAttachments[qId]) {
          questionAttachments[qId].splice(idx, 1);
          saveAttachmentsToSession();
          renderAttachmentsPreview(qId);
        }
      });
    });
  }

  function buildResponseSnapshot() {
    return questions.map((q, index) => ({
      quiz_id: quiz.id,
      question_bank_id: q.id,
      question_text: q.question_text,
      student_answer: answers[q.id] || '',
      attachments: questionAttachments[q.id] || [],
      question_type: q.type || 'MCQ',
      question_order: index + 1,
    }));
  }

  function saveLocalResponseSnapshot(resultId, responseSnapshot) {
    try {
      const storageKey = 'quiz_response_snapshots';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const entry = {
        saved_at: new Date().toISOString(),
        quiz_id: quiz.id,
        student_name: studentName,
        responses: responseSnapshot,
      };

      if (resultId) {
        existing[String(resultId)] = entry;
      }
      existing[`latest:${quiz.id}:${studentName}`] = entry;

      const entries = Object.entries(existing).sort((a, b) => {
        return new Date(b[1]?.saved_at || 0) - new Date(a[1]?.saved_at || 0);
      });
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries.slice(0, 150))));
    } catch (err) {
      console.warn('Could not save local response snapshot:', err);
    }
  }

  async function insertStudentResult(basePayload, responseSnapshot) {
    if (!window.supabaseClient) {
      throw new Error('Supabase database client is not initialized. Check your connection configuration.');
    }

    // Insert student_results with snapshot and return the created record with its generated UUID
    let { data, error } = await window.supabaseClient
      .from('student_results')
      .insert({ ...basePayload, response_snapshot: responseSnapshot })
      .select('id, quiz_id, student_name, score, total_questions, completed_at, response_snapshot')
      .single();

    // Fallback if response_snapshot column is missing on an older database schema
    if (error && isMissingSchemaItem(error, 'response_snapshot')) {
      console.warn('response_snapshot column missing, inserting standard student_results record...');
      const fallbackRes = await window.supabaseClient
        .from('student_results')
        .insert(basePayload)
        .select('id, quiz_id, student_name, score, total_questions, completed_at')
        .single();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) {
      console.error('Supabase error inserting student_results:', error);
      throw new Error(`Failed to save quiz results: ${error.message || JSON.stringify(error)}`);
    }

    if (!data || !data.id) {
      throw new Error('Student result was not created: Database returned no valid submission record ID.');
    }

    return data;
  }

  async function insertStudentResponses(studentResultId, responseSnapshot) {
    if (!responseSnapshot || !responseSnapshot.length) return true;
    if (!studentResultId) {
      console.warn('insertStudentResponses skipped: studentResultId is missing');
      return false;
    }

    const responsesPayload = responseSnapshot.map((resp) => ({
      quiz_id: quiz.id,
      student_result_id: studentResultId,
      student_name: studentName,
      question_text: resp.question_text || '',
      question_bank_id: resp.question_bank_id || null,
      student_answer: resp.student_answer || '',
      question_type: resp.question_type || 'MCQ',
      marks_assigned: null,
      ai_reasoning: null,
    }));

    window.lastSentResponsesPayload = responsesPayload;
    console.log('Inserting student responses to Supabase:', responsesPayload);

    const { error } = await window.supabaseClient
      .from('student_responses')
      .insert(responsesPayload);

    if (error) {
      if (isMissingSchemaItem(error, 'student_responses')) {
        console.warn('student_responses table not found; responses are preserved in response_snapshot:', error);
        return false;
      }
      console.warn('Could not insert student responses into table:', error);
      return false;
    }

    return true;
  }
  // Score Calculation & Upload
  async function triggerSubmission() {
    if (submitting) return;
    submitting = true;
    saveCurrentAnswer();

    if (timerInterval) clearInterval(timerInterval);

    nextBtnText.textContent = 'Submitting...';
    nextBtn.disabled = true;

    // 1. Calculate score and preserve every answer for teacher review.
    const responseSnapshot = buildResponseSnapshot();
    const finalScore = questions.reduce((score, q) => {
      return score + (isAnswerCorrect(q, answers[q.id]) ? 1 : 0);
    }, 0);
    
    // Save locally immediately so it's safe if offline
    saveLocalResponseSnapshot(null, responseSnapshot);

    // Cache for upload function
    window.__finalScore = finalScore;
    window.__responseSnapshot = responseSnapshot;

    if (quiz.offline_mode) {
      quizArea.classList.add('hidden');
      submitOtpOverlay.classList.remove('hidden');
    } else {
      await performUpload();
    }
  }

  async function performUpload() {
    try {
      const finalScore = window.__finalScore;
      const responseSnapshot = window.__responseSnapshot;

      let resultId = 'res_' + Date.now();
      if (!isDemoQuiz && window.supabaseClient) {
        const resultRow = await insertStudentResult({
          quiz_id: quiz.id,
          student_name: studentName,
          score: finalScore,
          total_questions: questions.length,
        }, responseSnapshot);

        resultId = resultRow.id;
        console.log('✅ Student result created with verified ID:', resultId);
        saveLocalResponseSnapshot(resultId, responseSnapshot);
        await insertStudentResponses(resultId, responseSnapshot);
      } else {
        saveLocalResponseSnapshot(resultId, responseSnapshot);
      }

      // Build detailed question review snapshot for student review
      const quizReviewData = questions.map((q, idx) => {
        const studentAns = answers[q.id] || '';
        const isCorrect = isAnswerCorrect(q, studentAns);
        return {
          question_number: idx + 1,
          id: q.id,
          question_text: q.question_text,
          type: resolveQuestionType(q),
          option_a: q.option_a || null,
          option_b: q.option_b || null,
          option_c: q.option_c || null,
          option_d: q.option_d || null,
          options: resolveQuestionType(q) === 'MCQ' ? getOptionReviewData(q) : null,
          correct_option: q.correct_option || '',
          student_answer: studentAns,
          is_correct: isCorrect,
          syllabus_tag: q.syllabus_tag || ''
        };
      });

      // 3. Save to sessionStorage and localStorage for persistence
      sessionStorage.setItem('studentName', studentName);
      sessionStorage.setItem('lastResultId', resultId);
      sessionStorage.setItem('lastScore', finalScore.toString());
      sessionStorage.setItem('lastTotal', questions.length.toString());
      sessionStorage.setItem('lastTitle', quiz.title);
      sessionStorage.setItem('lastQuizReview', JSON.stringify(quizReviewData));

      try {
        localStorage.setItem('studentName', studentName);
        localStorage.setItem('lastResultId', resultId);
        localStorage.setItem('lastScore', finalScore.toString());
        localStorage.setItem('lastTotal', questions.length.toString());
        localStorage.setItem('lastTitle', quiz.title);
        localStorage.setItem('lastQuizReview', JSON.stringify(quizReviewData));
      } catch (e) {}

      // Redirect to results
      setTimeout(() => {
        window.location.href = `result.html?code=${encodeURIComponent(quiz.access_code)}&name=${encodeURIComponent(studentName)}`;
      }, 500);
    } catch (err) {
      console.error('Error submitting quiz results:', err);
      window.showToast(err.message || 'Failed to submit quiz results', 'error');
      
      if (quiz.offline_mode) {
        verifySubmitOtpBtn.textContent = 'Verify & Upload';
        verifySubmitOtpBtn.disabled = false;
        retryUploadBtn.classList.remove('hidden');
        retryUploadBtn.disabled = false;
        retryUploadBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Retry Upload';
        if (window.lucide) window.lucide.createIcons();
      } else {
        submitting = false;
        nextBtn.disabled = false;
        nextBtnText.textContent = 'Submit Quiz';
        renderCurrentQuestion();
      }
    }
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start initialization
  loadQuizData();
});
