// js/create.js
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  const user = await window.checkAuth();
  if (!user) return;
  window.renderHeader(user);

  let questions = [];
  let selectedQuestionIds = [];
  let selectedTagFilter = 'all';
  const urlParams = new URLSearchParams(window.location.search);
  const editQuizId = urlParams.get('edit');
  let originalQuizData = null;

  const quizTitleInput = document.getElementById('quiz-title');
  const quizRoundsInput = document.getElementById('quiz-rounds');
  const quizDurationInput = document.getElementById('quiz-duration');
  const quizCodeInput = document.getElementById('quiz-code');
  const quizRandomizeInput = document.getElementById('quiz-randomize');
  const quizRandomizeOptionsInput = document.getElementById('quiz-randomize-options');
  const quizQuestionCountInput = document.getElementById('quiz-question-count');
  const quizOfflineModeInput = document.getElementById('quiz-offline-mode');
  const otpContainer = document.getElementById('otp-container');
  const displayStartOtp = document.getElementById('display-start-otp');
  const displaySubmitOtp = document.getElementById('display-submit-otp');
  const generateCodeBtn = document.getElementById('generate-code-btn');
  const selectedCountBadge = document.getElementById('selected-count-badge');
  const submitQuizBtn = document.getElementById('submit-quiz-btn');
  const tagSelector = document.getElementById('tag-selector');
  const questionsContainer = document.getElementById('questions-container');
  const createForm = document.getElementById('create-quiz-form');

  let currentStartOtp = '';
  let currentSubmitOtp = '';

  function generateOtp() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  quizOfflineModeInput.addEventListener('change', (e) => {
    if (e.target.checked) {
      otpContainer.classList.remove('hidden');
      if (!currentStartOtp) currentStartOtp = generateOtp();
      if (!currentSubmitOtp) currentSubmitOtp = generateOtp();
      displayStartOtp.textContent = currentStartOtp;
      displaySubmitOtp.textContent = currentSubmitOtp;
    } else {
      otpContainer.classList.add('hidden');
    }
  });

  // Generate a random 8-character access code starting with QUIZ
  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'QUIZ';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    quizCodeInput.value = code;
  }

  generateCodeBtn.addEventListener('click', generateCode);
  quizCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Load Quiz for Edit
  async function loadQuizForEdit() {
    try {
      const { data: quizData, error: quizError } = await window.supabaseClient
        .from('quizzes')
        .select('*')
        .eq('id', editQuizId)
        .single();

      if (quizError) throw quizError;
      
      originalQuizData = quizData;
      
      // Pre-fill form fields
      quizTitleInput.value = quizData.title;
      quizRoundsInput.value = quizData.rounds;
      quizDurationInput.value = quizData.duration_minutes;
      quizCodeInput.value = quizData.access_code;
      quizRandomizeInput.checked = quizData.is_random;
      if (quizRandomizeOptionsInput) {
        quizRandomizeOptionsInput.checked = quizData.randomize_options !== false;
      }
      if (quizQuestionCountInput && quizData.question_count) {
        quizQuestionCountInput.value = quizData.question_count;
      }

      if (quizData.offline_mode) {
        quizOfflineModeInput.checked = true;
        currentStartOtp = quizData.start_otp || generateOtp();
        currentSubmitOtp = quizData.submit_otp || generateOtp();
        displayStartOtp.textContent = currentStartOtp;
        displaySubmitOtp.textContent = currentSubmitOtp;
        otpContainer.classList.remove('hidden');
      }
      
      // Update button text
      submitQuizBtn.textContent = 'Update Quiz';
      
      // Get junction data to pre-select questions
      const { data: junctionData, error: junctionError } = await window.supabaseClient
        .from('quiz_questions')
        .select('question_bank_id')
        .eq('quiz_id', editQuizId);

      if (junctionError) throw junctionError;

      selectedQuestionIds = junctionData.map((item) => item.question_bank_id);
      selectedCountBadge.textContent = selectedQuestionIds.length;
      syncQuestionCountLimit();
      
    } catch (err) {
      console.error('Error loading quiz for edit:', err);
      window.showToast('Failed to load quiz for editing', 'error');
    }
  }

  // Fetch Questions
  async function fetchQuestions() {
    try {
      questionsContainer.innerHTML = `
        <div class="py-12 flex justify-center items-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      `;

      const { data, error } = await window.supabaseClient
        .from('question_bank')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      questions = data || [];
      updateTagDropdown();
      renderQuestions();
    } catch (err) {
      console.error('Error fetching questions:', err);
      window.showToast('Failed to load questions from bank', 'error');
    }
  }

  // Populate unique tags in filter dropdown
  function updateTagDropdown() {
    const tags = new Set();
    questions.forEach((q) => {
      if (q.syllabus_tag) tags.add(q.syllabus_tag);
    });

    const sortedTags = Array.from(tags).sort();
    tagSelector.innerHTML = '<option value="all">All Syllabus Tags</option>';
    sortedTags.forEach((tag) => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      tagSelector.appendChild(option);
    });
  }

  // Toggle selected state of question
  window.toggleQuestionSelect = (id) => {
    const idx = selectedQuestionIds.indexOf(id);
    if (idx === -1) {
      selectedQuestionIds.push(id);
    } else {
      selectedQuestionIds.splice(idx, 1);
    }
    selectedCountBadge.textContent = selectedQuestionIds.length;
    syncQuestionCountLimit();
    renderQuestions();
  };

  // Select/Deselect all filtered questions helper
  window.toggleAllFiltered = () => {
    const filtered = getFilteredQuestions();
    const filteredIds = filtered.map((q) => q.id);
    const allSelected = filteredIds.every((id) => selectedQuestionIds.includes(id));

    if (allSelected) {
      // Remove all filtered questions from selected set
      selectedQuestionIds = selectedQuestionIds.filter((id) => !filteredIds.includes(id));
    } else {
      // Add missing filtered questions
      filteredIds.forEach((id) => {
        if (!selectedQuestionIds.includes(id)) {
          selectedQuestionIds.push(id);
        }
      });
    }
    selectedCountBadge.textContent = selectedQuestionIds.length;
    syncQuestionCountLimit();
    renderQuestions();
  };

  function getFilteredQuestions() {
    if (selectedTagFilter === 'all') return questions;
    return questions.filter((q) => q.syllabus_tag === selectedTagFilter);
  }

  // Render question list
  function renderQuestions() {
    const filtered = getFilteredQuestions();

    if (filtered.length === 0) {
      questionsContainer.innerHTML = `
        <div class="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-300 text-center">
          <i data-lucide="alert-circle" class="w-10 h-10 text-slate-400 mx-auto mb-2"></i>
          <h3 class="text-sm font-semibold text-slate-700">No questions available</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            ${selectedTagFilter !== 'all'
              ? `No questions registered under the tag "${selectedTagFilter}".`
              : 'You do not have any questions registered in the global bank yet.'}
          </p>
          <a
            href="questions.html"
            class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
          >
            Go register questions first
          </a>
        </div>
      `;
      window.lucide.createIcons();
      return;
    }

    const filteredIds = filtered.map((q) => q.id);
    const allFilteredSelected = filteredIds.every((id) => selectedQuestionIds.includes(id));
    
    let html = `
      <button
        type="button"
        onclick="window.toggleAllFiltered()"
        class="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 cursor-pointer bg-blue-50 px-3 py-2 rounded-lg"
      >
        ${allFilteredSelected ? 'Deselect All Filtered' : 'Select All Filtered'}
      </button>
      <div class="max-h-[500px] overflow-y-auto pr-1 space-y-3">
    `;

    filtered.forEach((q) => {
      const isSelected = selectedQuestionIds.includes(q.id);
      
      let contentHtml = '';
      
      if (q.type === 'MCQ') {
        const correctOpt = (q.correct_option || '').toUpperCase();
        contentHtml += `
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
            <div class="${correctOpt === 'A' ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
              A: ${escapeHtml(q.option_a)} ${correctOpt === 'A' ? '✅' : ''}
            </div>
            <div class="${correctOpt === 'B' ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
              B: ${escapeHtml(q.option_b)} ${correctOpt === 'B' ? '✅' : ''}
            </div>
            <div class="${correctOpt === 'C' ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
              C: ${escapeHtml(q.option_c)} ${correctOpt === 'C' ? '✅' : ''}
            </div>
            <div class="${correctOpt === 'D' ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
              D: ${escapeHtml(q.option_d)} ${correctOpt === 'D' ? '✅' : ''}
            </div>
          </div>
        `;
      } else {
        contentHtml += `
          <div class="mt-2 text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-lg w-fit">
            🟢 Correct Answer: ${escapeHtml(q.correct_option || '')}
          </div>
        `;
      }
      
      html += `
        <div
          onclick="window.toggleQuestionSelect('${q.id}')"
          class="flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition select-none ${
            isSelected
              ? 'border-blue-500 bg-blue-50/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }"
        >
          <span class="mt-0.5 text-blue-600">
            ${
              isSelected
                ? '<i data-lucide="check-square" class="w-5 h-5"></i>'
                : '<i data-lucide="square" class="w-5 h-5 text-slate-400"></i>'
            }
          </span>
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                ${escapeHtml(q.syllabus_tag)}
              </span>
              <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                ${q.type || 'MCQ'}
              </span>
            </div>
            <p class="text-slate-900 text-sm font-semibold pr-2">${escapeHtml(q.question_text)}</p>
            ${contentHtml}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    questionsContainer.innerHTML = html;
    window.lucide.createIcons();
  }

  // Handle tag filter change
  tagSelector.addEventListener('change', () => {
    selectedTagFilter = tagSelector.value;
    renderQuestions();
  });

  function syncQuestionCountLimit() {
    if (!quizQuestionCountInput) return;
    quizQuestionCountInput.max = selectedQuestionIds.length || 1;
  }

  // Submit and Create/Update Quiz
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = quizTitleInput.value.trim();
    const rounds = parseInt(quizRoundsInput.value) || 1;
    const duration = parseInt(quizDurationInput.value) || 15;
    const accessCode = quizCodeInput.value.trim().toUpperCase();
    const isRandom = quizRandomizeInput.checked;
    const randomizeOptions = quizRandomizeOptionsInput ? quizRandomizeOptionsInput.checked : true;
    const requestedQuestionCount = quizQuestionCountInput?.value
      ? parseInt(quizQuestionCountInput.value, 10)
      : selectedQuestionIds.length;
    const isOffline = quizOfflineModeInput.checked;
    const finalStartOtp = isOffline ? currentStartOtp : null;
    const finalSubmitOtp = isOffline ? currentSubmitOtp : null;

    if (!title) {
      window.showToast('Please enter a quiz title.', 'error');
      return;
    }

    if (selectedQuestionIds.length === 0) {
      window.showToast('Please select at least one question for the quiz.', 'error');
      return;
    }

    if (!Number.isInteger(requestedQuestionCount) || requestedQuestionCount < 1 || requestedQuestionCount > selectedQuestionIds.length) {
      window.showToast('Questions to ask must be between 1 and the number of selected questions.', 'error');
      return;
    }

    if (!accessCode) {
      window.showToast('Please generate or enter an access code.', 'error');
      return;
    }

    submitQuizBtn.disabled = true;
    submitQuizBtn.textContent = editQuizId ? 'Updating Quiz...' : 'Creating Quiz...';

    try {
      // 1. Check if access code is unique (if it changed or we're creating)
      if (!editQuizId || accessCode !== originalQuizData.access_code) {
        const { data: codeCheck, error: checkError } = await window.supabaseClient
          .from('quizzes')
          .select('id')
          .eq('access_code', accessCode);

        if (checkError) throw checkError;

        if (codeCheck && codeCheck.length > 0) {
          // If editing, make sure the code isn't taken by another quiz
          if (editQuizId) {
            const otherQuiz = codeCheck.find((c) => c.id !== editQuizId);
            if (otherQuiz) {
              window.showToast('Access code already exists. Please generate a new one.', 'error');
              submitQuizBtn.disabled = false;
              submitQuizBtn.textContent = 'Update Quiz';
              return;
            }
          } else {
            window.showToast('Access code already exists. Please generate a new one.', 'error');
            submitQuizBtn.disabled = false;
            submitQuizBtn.textContent = 'Assemble & Launch Quiz';
            return;
          }
        }
      }

      if (editQuizId) {
        // Update existing quiz
        const updatePayload = {
          title,
          rounds,
          question_count: requestedQuestionCount,
          duration_minutes: duration,
          is_random: isRandom,
          randomize_questions: isRandom,
          randomize_options: randomizeOptions,
          access_code: accessCode,
          offline_mode: isOffline,
          start_otp: finalStartOtp,
          submit_otp: finalSubmitOtp,
        };

        let { error: quizUpdateError } = await window.supabaseClient
          .from('quizzes')
          .update(updatePayload)
          .eq('id', editQuizId);

        if (quizUpdateError && (quizUpdateError.message?.includes('schema cache') || quizUpdateError.message?.includes('column') || quizUpdateError.code === 'PGRST204')) {
          const { offline_mode, start_otp, submit_otp, randomize_questions, randomize_options, ...basicUpdatePayload } = updatePayload;
          const { error: retryError } = await window.supabaseClient
            .from('quizzes')
            .update(basicUpdatePayload)
            .eq('id', editQuizId);
          quizUpdateError = retryError;
        }

        if (quizUpdateError) throw quizUpdateError;

        // Delete old junction rows
        const { error: deleteJunctionError } = await window.supabaseClient
          .from('quiz_questions')
          .delete()
          .eq('quiz_id', editQuizId);

        if (deleteJunctionError) throw deleteJunctionError;

        // Insert new junction rows
        const junctionInserts = selectedQuestionIds.map((qId) => ({
          quiz_id: editQuizId,
          question_bank_id: qId,
        }));

        const { error: junctionError } = await window.supabaseClient
          .from('quiz_questions')
          .insert(junctionInserts);

        if (junctionError) throw junctionError;

        window.showToast('Quiz updated successfully!', 'success');
      } else {
        // Insert new quiz
        const insertPayload = {
          teacher_id: user.id,
          title,
          rounds,
          question_count: requestedQuestionCount,
          duration_minutes: duration,
          is_random: isRandom,
          randomize_questions: isRandom,
          randomize_options: randomizeOptions,
          access_code: accessCode,
          offline_mode: isOffline,
          start_otp: finalStartOtp,
          submit_otp: finalSubmitOtp,
        };

        let { data: newQuiz, error: quizError } = await window.supabaseClient
          .from('quizzes')
          .insert(insertPayload)
          .select()
          .single();

        if (quizError && (quizError.message?.includes('schema cache') || quizError.message?.includes('column') || quizError.code === 'PGRST204')) {
          const { offline_mode, start_otp, submit_otp, randomize_questions, randomize_options, ...basicInsertPayload } = insertPayload;
          const { data: retryQuiz, error: retryError } = await window.supabaseClient
            .from('quizzes')
            .insert(basicInsertPayload)
            .select()
            .single();
          newQuiz = retryQuiz;
          quizError = retryError;
        }

        if (quizError) throw quizError;

        // Insert junction rows
        const junctionInserts = selectedQuestionIds.map((qId) => ({
          quiz_id: newQuiz.id,
          question_bank_id: qId,
        }));

        const { error: junctionError } = await window.supabaseClient
          .from('quiz_questions')
          .insert(junctionInserts);

        if (junctionError) throw junctionError;

        window.showToast('Quiz created successfully!', 'success');
      }

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      console.error('Error creating/updating quiz:', err);
      window.showToast(err.message || 'Failed to create/update quiz', 'error');
      submitQuizBtn.disabled = false;
      submitQuizBtn.textContent = editQuizId ? 'Update Quiz' : 'Assemble & Launch Quiz';
    }
  });

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

  // Init page
  if (!editQuizId) {
    generateCode();
  }
  await fetchQuestions();
  if (editQuizId) {
    await loadQuizForEdit();
    // Re-render questions to show selected state
    renderQuestions();
  }
});
