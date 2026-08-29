// js/result.js
document.addEventListener('DOMContentLoaded', async () => {
  // Render header (no auth required — students view this)
  const user = await window.checkAuth();
  window.renderHeader(user);

  // Helper to escape HTML characters
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Pull results from sessionStorage
  let rawScore = sessionStorage.getItem('lastScore');
  let rawTotal = sessionStorage.getItem('lastTotal');
  let rawTitle = sessionStorage.getItem('lastTitle');
  let studentName = sessionStorage.getItem('studentName');
  let rawReviewData = sessionStorage.getItem('lastQuizReview');

  // Fallback demo data if opened directly without prior quiz session
  if (rawScore === null || rawTotal === null) {
    rawScore = '2';
    rawTotal = '3';
    rawTitle = 'General Knowledge & Science Quiz';
    studentName = 'Alex';
    rawReviewData = JSON.stringify([
      {
        question_number: 1,
        id: 'q1',
        question_text: 'What is the primary gas found in the Earth\'s atmosphere?',
        type: 'MCQ',
        option_a: 'Oxygen',
        option_b: 'Nitrogen',
        option_c: 'Carbon Dioxide',
        option_d: 'Hydrogen',
        correct_option: 'B',
        student_answer: 'B',
        is_correct: true,
        syllabus_tag: 'Science'
      },
      {
        question_number: 2,
        id: 'q2',
        question_text: 'Which planet is known as the Red Planet?',
        type: 'MCQ',
        option_a: 'Venus',
        option_b: 'Jupiter',
        option_c: 'Mars',
        option_d: 'Saturn',
        correct_option: 'C',
        student_answer: 'A',
        is_correct: false,
        syllabus_tag: 'Astronomy'
      },
      {
        question_number: 3,
        id: 'q3',
        question_text: 'What is the chemical formula for water?',
        type: 'FIB',
        correct_option: 'H2O',
        student_answer: 'H2O',
        is_correct: true,
        syllabus_tag: 'Chemistry'
      }
    ]);
  }

  const score = parseInt(rawScore, 10);
  const total = parseInt(rawTotal, 10);
  const quizTitle = rawTitle || 'Quiz';
  const name = studentName || 'Student';

  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  // Populate DOM summary card
  document.getElementById('congrats-text').textContent =
    `Congratulations ${name}, your responses have been registered.`;
  document.getElementById('quiz-title-display').textContent = quizTitle;
  document.getElementById('score-display').textContent = score;
  document.getElementById('total-display').textContent = `out of ${total}`;
  document.getElementById('pct-display').textContent = `${percentage}%`;

  // Progress bar color and feedback message
  const pctBar = document.getElementById('pct-bar');
  const feedbackText = document.getElementById('feedback-text');

  if (percentage >= 70) {
    pctBar.classList.add('bg-emerald-500');
    feedbackText.textContent = 'Fantastic job! You demonstrated a strong grasp of the material.';
  } else if (percentage >= 40) {
    pctBar.classList.add('bg-amber-500');
    feedbackText.textContent = 'Good effort! Review the questions to improve further.';
  } else {
    pctBar.classList.add('bg-rose-500');
    feedbackText.textContent = 'Keep studying! Practice makes perfect.';
  }

  // Animate bar width after a short delay to allow CSS transitions to run
  setTimeout(() => {
    pctBar.style.width = `${percentage}%`;
  }, 200);

  // Detailed Question Review Rendering
  const reviewSection = document.getElementById('review-section');
  const reviewQuestionsList = document.getElementById('review-questions-list');
  let reviewItems = [];

  try {
    reviewItems = rawReviewData ? JSON.parse(rawReviewData) : [];
  } catch (err) {
    console.warn('Could not parse review data:', err);
  }

  if (reviewItems.length === 0) {
    if (reviewSection) reviewSection.classList.add('hidden');
  } else {
    const totalCnt = reviewItems.length;
    const correctCnt = reviewItems.filter(i => i.is_correct).length;
    const incorrectCnt = totalCnt - correctCnt;

    document.getElementById('stat-total-cnt').textContent = totalCnt;
    document.getElementById('stat-correct-cnt').textContent = correctCnt;
    document.getElementById('stat-incorrect-cnt').textContent = incorrectCnt;

    let currentFilter = 'all';

    function renderReviewList() {
      const filtered = reviewItems.filter(item => {
        if (currentFilter === 'correct') return item.is_correct;
        if (currentFilter === 'incorrect') return !item.is_correct;
        return true;
      });

      if (filtered.length === 0) {
        reviewQuestionsList.innerHTML = `
          <div class="text-center py-8 text-slate-500 text-sm">
            No questions match the selected filter.
          </div>
        `;
        return;
      }

      let html = '';
      filtered.forEach((item) => {
        const isCorrect = Boolean(item.is_correct);
        const hasStudentAnswer = Boolean(item.student_answer);
        
        let statusBadge = '';
        let cardBorder = '';

        if (isCorrect) {
          statusBadge = `
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Correct
            </span>
          `;
          cardBorder = 'border-slate-200 bg-white hover:border-emerald-300';
        } else if (hasStudentAnswer) {
          statusBadge = `
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
              <i data-lucide="x-circle" class="w-3.5 h-3.5"></i> Incorrect
            </span>
          `;
          cardBorder = 'border-rose-200 bg-rose-50/10 hover:border-rose-300';
        } else {
          statusBadge = `
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> Unanswered
            </span>
          `;
          cardBorder = 'border-amber-200 bg-amber-50/10 hover:border-amber-300';
        }

        const syllabusTag = item.syllabus_tag ? `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">${escapeHtml(item.syllabus_tag)}</span>` : '';

        let contentHtml = '';

        if (item.type === 'MCQ') {
          contentHtml += `<div class="grid grid-cols-1 gap-2.5 mt-4">`;
          const reviewOptions = Array.isArray(item.options) && item.options.length > 0
            ? item.options
            : ['A', 'B', 'C', 'D'].map((letter) => ({
                display_letter: letter,
                original_letter: letter,
                text: item[`option_${letter.toLowerCase()}`],
              }));

          reviewOptions.forEach((option) => {
            const letter = option.display_letter || option.original_letter;
            const originalLetter = option.original_letter || letter;
            const optionText = option.text;
            if (!optionText && optionText !== '') return;

            const isCorrectOption = (item.correct_option || '').toUpperCase() === originalLetter;
            const isStudentOption = (item.student_answer || '').toUpperCase() === originalLetter;

            let optionStyle = 'border-slate-200 bg-slate-50/50 text-slate-700';
            let optionBadge = '';

            if (isCorrectOption && isStudentOption) {
              optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-500';
              optionBadge = `<span class="ml-auto text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"><i data-lucide="check" class="w-3.5 h-3.5"></i> Your Answer (Correct)</span>`;
            } else if (isCorrectOption) {
              optionStyle = 'border-emerald-400 bg-emerald-50/70 text-emerald-900 font-semibold';
              optionBadge = `<span class="ml-auto text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"><i data-lucide="check" class="w-3.5 h-3.5"></i> Correct Answer</span>`;
            } else if (isStudentOption) {
              optionStyle = 'border-rose-400 bg-rose-50 text-rose-900 font-semibold';
              optionBadge = `<span class="ml-auto text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"><i data-lucide="x" class="w-3.5 h-3.5"></i> Your Answer</span>`;
            }

            contentHtml += `
              <div class="flex items-center gap-3 p-3.5 rounded-xl border ${optionStyle} text-sm transition">
                <span class="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
                  isCorrectOption
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : (isStudentOption ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-white text-slate-600')
                }">
                  ${letter}
                </span>
                <span class="flex-1 formatted-content">${formatQuestionText(optionText)}</span>
                ${optionBadge}
              </div>
            `;
          });
          contentHtml += `</div>`;
        } else {
          // FIB / Short Answer rendering
          contentHtml += `
            <div class="mt-4 space-y-2.5">
              <div class="p-3.5 rounded-xl border ${isCorrect ? 'border-emerald-300 bg-emerald-50/50' : 'border-rose-300 bg-rose-50/50'} text-sm">
                <div class="text-xs font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'} mb-1 flex items-center gap-1">
                  <i data-lucide="${isCorrect ? 'check' : 'x'}" class="w-3.5 h-3.5"></i> Your Answer:
                </div>
                <div class="font-medium text-slate-900 formatted-content">${formatQuestionText(item.student_answer || '(No answer provided)')}</div>
              </div>
              ${!isCorrect ? `
                <div class="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/50 text-sm">
                  <div class="text-xs font-bold text-emerald-700 mb-1 flex items-center gap-1">
                    <i data-lucide="check" class="w-3.5 h-3.5"></i> Correct Answer:
                  </div>
                  <div class="font-medium text-emerald-900 formatted-content">${formatQuestionText(item.correct_option)}</div>
                </div>
              ` : ''}
            </div>
          `;
        }

        html += `
          <div class="p-5 rounded-2xl border ${cardBorder} shadow-sm transition space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">Q${item.question_number}</span>
                ${syllabusTag}
              </div>
              <div>${statusBadge}</div>
            </div>
            <h4 class="text-base font-bold text-slate-900 leading-snug formatted-content">${formatQuestionText(item.question_text)}</h4>
            ${contentHtml}
          </div>
        `;
      });

      reviewQuestionsList.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
    }

    // Filter Buttons logic
    const filterAllBtn = document.getElementById('filter-all-btn');
    const filterCorrectBtn = document.getElementById('filter-correct-btn');
    const filterIncorrectBtn = document.getElementById('filter-incorrect-btn');

    function updateFilterButtons() {
      const activeClass = 'bg-white text-blue-600 shadow-sm';
      const inactiveClass = 'text-slate-600 hover:text-slate-900';

      filterAllBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'all' ? activeClass : inactiveClass}`;
      filterCorrectBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'correct' ? activeClass : inactiveClass}`;
      filterIncorrectBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'incorrect' ? activeClass : inactiveClass}`;
    }

    filterAllBtn.addEventListener('click', () => {
      currentFilter = 'all';
      updateFilterButtons();
      renderReviewList();
    });

    filterCorrectBtn.addEventListener('click', () => {
      currentFilter = 'correct';
      updateFilterButtons();
      renderReviewList();
    });

    filterIncorrectBtn.addEventListener('click', () => {
      currentFilter = 'incorrect';
      updateFilterButtons();
      renderReviewList();
    });

    // Initial render
    renderReviewList();
  }

  // Toggle Review Section Button logic
  const toggleReviewBtn = document.getElementById('toggle-review-btn');
  const toggleReviewBtnText = document.getElementById('toggle-review-btn-text');

  if (toggleReviewBtn && reviewSection) {
    toggleReviewBtn.addEventListener('click', () => {
      const isHidden = reviewSection.classList.contains('hidden');
      if (isHidden) {
        reviewSection.classList.remove('hidden');
        if (toggleReviewBtnText) toggleReviewBtnText.textContent = 'Hide Question Review';
        reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        reviewSection.classList.add('hidden');
        if (toggleReviewBtnText) toggleReviewBtnText.textContent = 'Review Questions & Answers';
      }
    });
  }

  // Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Return / Take Another Quiz button
  const returnBtn = document.getElementById('return-btn');
  returnBtn.addEventListener('click', () => {
    // Clear temporary session data
    sessionStorage.removeItem('lastScore');
    sessionStorage.removeItem('lastTotal');
    sessionStorage.removeItem('lastTitle');
    sessionStorage.removeItem('lastQuizReview');
    window.location.href = 'index.html';
  });
});
