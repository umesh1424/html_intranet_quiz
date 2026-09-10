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

  let quiz = null;
  let questions = [];
  let currentRound = 1;
  let currentIdx = 0;
  let answers = {};
  let questionAttachments = {}; // q.id -> [{ name, type, size, dataUrl }, ...]
  let timeLeftSeconds = 0;
  let totalDurationSeconds = 0;
  let timerInterval = null;
  let submitting = false;

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
    const type = (question.type || 'MCQ').toUpperCase();
    if (type === 'MCQ') return 0;
    if (type === 'FIB') return 1;
    return 2;
  }

  function orderQuestionsBySection(list, shouldRandomize) {
    const sections = [[], [], []];
    list.forEach((question) => {
      sections[getQuestionTypeRank(question)].push(question);
    });

    return sections.flatMap((section, sectionIndex) => {
      if (!shouldRandomize) return section;
      return shuffleWithSeed(section, `${studentName}:${quiz.id}:section:${sectionIndex}`);
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
      if (typeof window.ensureSupabaseClient === 'function') {
        await window.ensureSupabaseClient();
      } else if (!window.supabaseClient && typeof window.initSupabaseFromStorage === 'function') {
        window.initSupabaseFromStorage();
      }

      if (!window.supabaseClient) {
        throw new Error('Supabase database client is not configured.');
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

      const shouldRandomizeQuestions = quiz.randomize_questions ?? quiz.is_random;
      items = orderQuestionsBySection(items, shouldRandomizeQuestions);
      questions = items.slice(0, getQuestionLimit(items.length));

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
    timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Progress percentage
    const pct = (timeLeftSeconds / totalDurationSeconds) * 100;
    timerProgressBar.style.width = `${pct}%`;

    // Red theme alert if less than 60s
    if (timeLeftSeconds < 60) {
      timerProgressBar.classList.remove('bg-blue-600');
      timerProgressBar.classList.add('bg-rose-500');
      timerDisplay.classList.add('text-rose-600');
      timerIcon.classList.remove('text-slate-600');
      timerIcon.classList.add('text-rose-500', 'animate-pulse');
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
    const qType = (q.type || 'MCQ').trim().toUpperCase();

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
            <label for="student-file-upload" class="inline-flex items-center gap-2 px-4 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold border border-slate-200 cursor-pointer transition shrink-0 select-none shadow-sm" title="Upload screenshot, PDF, DOCX, etc.">
              <i data-lucide="paperclip" class="w-4 h-4 text-slate-600"></i>
              <span class="hidden sm:inline">Attach File</span>
            </label>
            <input type="file" id="student-file-upload" class="hidden" accept="image/*,.pdf,.doc,.docx,.txt" multiple />
          </div>
          <div id="attachments-preview-container" class="flex flex-wrap gap-2"></div>
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

  // Helper to save current answer (for both MCQ and text)
  function saveCurrentAnswer() {
    const q = questions[currentIdx];
    if (!q) return;
    const qType = (q.type || 'MCQ').trim().toUpperCase();
    if (qType === 'MCQ') {
      // Already handled by selectOption, but just in case
    } else if (qType === 'FIB' && getFibBlankCount(q.question_text) > 0) {
      const inlineInputs = questionTextDisplay.querySelectorAll('.inline-fib-input');
      if (inlineInputs && inlineInputs.length > 0) {
        const parts = [];
        inlineInputs.forEach((inp, idx) => {
          parts[idx] = inp.value.trim();
        });
        answers[q.id] = parts.join(', ');
      }
    } else {
      const textInput = document.getElementById('student-text-answer');
      if (textInput) {
        answers[q.id] = textInput.value.trim();
      }
    }
  }

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
    if (!rawStudent || !rawCorrect) return false;

    const qType = (question.type || 'MCQ').trim().toUpperCase();
    if (qType === 'MCQ') {
      const studentLetter = rawStudent.charAt(0).toUpperCase();
      const correctLetter = rawCorrect.charAt(0).toUpperCase();
      return Boolean(studentLetter && correctLetter && studentLetter === correctLetter);
    }

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

      // 1. Insert the student_results row and obtain the verified database ID
      const resultRow = await insertStudentResult({
        quiz_id: quiz.id,
        student_name: studentName,
        score: finalScore,
        total_questions: questions.length,
      }, responseSnapshot);

      const resultId = resultRow.id;
      console.log('✅ Student result created with verified ID:', resultId);

      // Save local response snapshot keyed by verified result ID
      saveLocalResponseSnapshot(resultId, responseSnapshot);

      // 2. Insert row-per-answer responses linked to this resultId
      await insertStudentResponses(resultId, responseSnapshot);

      // Build detailed question review snapshot for student review
      const quizReviewData = questions.map((q, idx) => {
        const studentAns = answers[q.id] || '';
        const isCorrect = isAnswerCorrect(q, studentAns);
        return {
          question_number: idx + 1,
          id: q.id,
          question_text: q.question_text,
          type: q.type || 'MCQ',
          option_a: q.option_a || null,
          option_b: q.option_b || null,
          option_c: q.option_c || null,
          option_d: q.option_d || null,
          options: q.type === 'MCQ' ? getOptionReviewData(q) : null,
          correct_option: q.correct_option || '',
          student_answer: studentAns,
          is_correct: isCorrect,
          syllabus_tag: q.syllabus_tag || ''
        };
      });

      // 3. Save to sessionStorage
      sessionStorage.setItem('lastResultId', resultId);
      sessionStorage.setItem('lastScore', finalScore.toString());
      sessionStorage.setItem('lastTotal', questions.length.toString());
      sessionStorage.setItem('lastTitle', quiz.title);
      sessionStorage.setItem('lastQuizReview', JSON.stringify(quizReviewData));

      // Redirect to results
      setTimeout(() => {
        window.location.href = `result.html?code=${encodeURIComponent(quiz.access_code)}`;
      }, 800);
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
