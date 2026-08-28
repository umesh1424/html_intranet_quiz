// js/dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth and save user session info
  const user = await window.checkAuth();
  if (!user) return; // checkAuth will redirect
  window.renderHeader(user);

  let quizzes = [];
  const searchInput = document.getElementById('search-quizzes');
  const contentArea = document.getElementById('content-area');
  const analyticsModal = document.getElementById('analytics-modal');
  const closeAnalyticsModal = document.getElementById('close-analytics-modal');
  const analyticsContent = document.getElementById('analytics-content');

  // Fetch quizzes
  async function fetchQuizzes() {
    try {
      contentArea.innerHTML = `
        <div class="py-24 flex flex-col justify-center items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p class="text-slate-500 text-sm">Loading active quizzes...</p>
        </div>
      `;

      const { data, error } = await window.supabaseClient
        .from('quizzes')
        .select('*, profiles(full_name, email)')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      quizzes = data || [];
      renderQuizzes(quizzes);
    } catch (err) {
      console.error('Error fetching quizzes:', err);
      renderError(err.message || 'Failed to load quizzes');
    }
  }

  // Render Quizzes Grid
  function renderQuizzes(list) {
    if (list.length === 0) {
      const isSearching = searchInput.value.trim() !== '';
      contentArea.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-2xl mx-auto shadow-sm animate-slide-up">
          <span class="inline-flex p-4 bg-blue-50 rounded-2xl text-blue-600 mb-4">
            <i data-lucide="book-open" class="w-8 h-8"></i>
          </span>
          <h3 class="text-lg font-bold text-slate-900">
            ${isSearching ? 'No matching quizzes found' : 'Create your first quiz'}
          </h3>
          <p class="text-slate-600 text-sm mt-2 mb-6 max-w-sm mx-auto">
            ${isSearching
              ? 'Try checking the spelling or search for a different quiz title.'
              : 'Create quizzes from your global question bank, define rounds, timing, and share codes with students.'}
          </p>
          ${!isSearching ? `
            <div class="flex justify-center gap-3">
              <a
                href="questions.html"
                class="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition"
              >
                Go to Question Bank
              </a>
              <a
                href="create.html"
                class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm shadow-blue-100"
              >
                Create Quiz
              </a>
            </div>
          ` : ''}
        </div>
      `;
      window.lucide.createIcons();
      return;
    }

    let gridHtml = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">`;

    list.forEach((quiz) => {
      const formattedDate = new Date(quiz.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const teacherName = quiz.profiles?.full_name || quiz.profiles?.email?.split('@')[0] || 'Teacher';
      const copyBtnId = `copy-btn-${quiz.id}`;

      gridHtml += `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between h-full group animate-slide-up">
          <div>
            <div class="flex justify-between items-start gap-4 mb-3">
              <h3 class="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                ${escapeHtml(quiz.title)}
              </h3>
              <button
                id="${copyBtnId}"
                onclick="window.copyAccessCode('${quiz.access_code}', '${copyBtnId}')"
                class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-all cursor-pointer shrink-0"
                title="Copy Access Code"
              >
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                <span>${quiz.access_code}</span>
              </button>
            </div>

            <!-- Badges -->
            <div class="flex flex-wrap gap-2 mb-4">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-100">
                ${quiz.rounds} ${quiz.rounds === 1 ? 'Round' : 'Rounds'}
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-cyan-50 text-cyan-700 border-cyan-100">
                ${quiz.question_count} ${quiz.question_count === 1 ? 'Question' : 'Questions'}
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-100">
                ${quiz.duration_minutes} min
              </span>
              ${(quiz.randomize_questions ?? quiz.is_random) ? `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                  <i data-lucide="shuffle" class="w-3 h-3"></i>
                  Random Questions
                </span>
              ` : ''}
              ${quiz.randomize_options !== false ? `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-100">
                  <i data-lucide="shuffle" class="w-3 h-3"></i>
                  Random Options
                </span>
              ` : ''}
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-2 mt-auto pt-4 border-t border-slate-100">
              <button
                onclick="window.viewSettings('${quiz.id}')"
                class="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-all cursor-pointer"
              >
                <i data-lucide="settings" class="w-3 h-3"></i>
                Settings
              </button>
              <button
                onclick="window.location.href = 'create.html?edit=${quiz.id}'"
                class="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-all cursor-pointer"
              >
                <i data-lucide="edit" class="w-3 h-3"></i>
                Edit
              </button>
              <button
                onclick="window.openAnalytics('${quiz.id}', '${escapeHtml(quiz.title)}')"
                class="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-xs font-semibold text-slate-600 hover:text-emerald-700 transition-all cursor-pointer"
              >
                <i data-lucide="bar-chart-3" class="w-3 h-3"></i>
                Analytics
              </button>
              <button
                onclick="window.deleteQuiz('${quiz.id}')"
                class="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-xs font-semibold text-slate-600 hover:text-rose-700 transition-all cursor-pointer"
              >
                <i data-lucide="trash-2" class="w-3 h-3"></i>
                Delete
              </button>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-1.5 font-medium text-slate-700">
                <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>By ${escapeHtml(teacherName)}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Created: ${formattedDate}</span>
              </div>
            </div>
            
            <div class="flex items-center gap-1 text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform duration-200">
              <span>Active</span>
              <i data-lucide="play" class="w-3 h-3 fill-current"></i>
            </div>
          </div>
        </div>
      `;
    });

    gridHtml += `</div>`;
    contentArea.innerHTML = gridHtml;
    window.lucide.createIcons();
  }

  // Render Error
  function renderError(message) {
    contentArea.innerHTML = `
      <div class="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center max-w-lg mx-auto">
        <i data-lucide="alert-circle" class="w-12 h-12 text-rose-500 mx-auto mb-3"></i>
        <h3 class="text-lg font-semibold text-rose-900">Failed to load quizzes</h3>
        <p class="text-rose-700 text-sm mt-1 mb-4">${escapeHtml(message)}</p>
        <button
          id="retry-btn"
          class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
        >
          Retry
        </button>
      </div>
    `;
    window.lucide.createIcons();
    document.getElementById('retry-btn').addEventListener('click', fetchQuizzes);
  }

  // Delete Quiz
  window.deleteQuiz = async (quizId) => {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
      return;
    }
    try {
      const { error } = await window.supabaseClient
        .from('quizzes')
        .delete()
        .eq('id', quizId);
      if (error) throw error;
      window.showToast('Quiz deleted successfully', 'success');
      fetchQuizzes();
    } catch (err) {
      console.error('Error deleting quiz:', err);
      window.showToast(err.message || 'Failed to delete quiz', 'error');
    }
  };

  // Open Analytics Modal
  window.openAnalytics = async (quizId, quizTitle) => {
    analyticsModal.classList.remove('hidden');
    analyticsContent.innerHTML = `
      <div class="py-8 flex flex-col justify-center items-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p class="text-slate-500 text-sm">Loading analytics...</p>
      </div>
    `;
    try {
      const { data, error } = await window.supabaseClient
        .from('student_results')
        .select('*')
        .eq('quiz_id', quizId)
        .order('completed_at', { ascending: false });
      if (error) throw error;
      
      const results = data || [];
      let analyticsHtml = `
        <h4 class="text-sm font-semibold text-slate-700 mb-4">${escapeHtml(quizTitle)} - ${results.length} Attempt${results.length !== 1 ? 's' : ''}</h4>
      `;
      if (results.length === 0) {
        analyticsHtml += `
          <div class="text-center py-8 text-slate-500 text-sm">
            No student attempts yet for this quiz.
          </div>
        `;
      } else {
        analyticsHtml += `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-2 text-left text-slate-600 font-semibold text-xs uppercase">Student</th>
                  <th class="px-4 py-2 text-left text-slate-600 font-semibold text-xs uppercase">Score</th>
                  <th class="px-4 py-2 text-left text-slate-600 font-semibold text-xs uppercase">Completed</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
        `;
        results.forEach(result => {
          const formattedDate = new Date(result.completed_at).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const scorePercent = Math.round((result.score / result.total_questions) * 100);
          analyticsHtml += `
            <tr class="hover:bg-slate-50">
              <td class="px-4 py-3 text-slate-900">${escapeHtml(result.student_name)}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${scorePercent >= 70 ? 'bg-emerald-50 text-emerald-700' : scorePercent >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}">
                  ${result.score}/${result.total_questions} (${scorePercent}%)
                </span>
              </td>
              <td class="px-4 py-3 text-slate-600">${formattedDate}</td>
            </tr>
          `;
        });
        analyticsHtml += `
              </tbody>
            </table>
          </div>
        `;
      }
      analyticsContent.innerHTML = analyticsHtml;
    } catch (err) {
      console.error('Error loading analytics:', err);
      analyticsContent.innerHTML = `
        <div class="text-center py-8 text-rose-600 text-sm">
          Failed to load analytics. ${escapeHtml(err.message)}
        </div>
      `;
    }
  };

  // Real-time Search Handler
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      renderQuizzes(quizzes);
      return;
    }
    const filtered = quizzes.filter(
      (q) => q.title.toLowerCase().includes(query) || q.access_code.toLowerCase().includes(query)
    );
    renderQuizzes(filtered);
  });

  // Global helper for copying code
  window.copyAccessCode = async (code, btnId) => {
    try {
      await navigator.clipboard.writeText(code);
      const btn = document.getElementById(btnId);
      btn.innerHTML = `
        <i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 animate-pulse"></i>
        <span class="text-emerald-700">Copied</span>
      `;
      window.lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = `
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>${code}</span>
        `;
        window.lucide.createIcons();
      }, 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Close analytics modal
  closeAnalyticsModal.addEventListener('click', () => {
    analyticsModal.classList.add('hidden');
  });

  // Close analytics modal when clicking outside
  analyticsModal.addEventListener('click', (e) => {
    if (e.target === analyticsModal) {
      analyticsModal.classList.add('hidden');
    }
  });

  // Helper function to escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- View Quiz Settings Modal ---
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsModal = document.getElementById('close-settings-modal');
  const settingsContent = document.getElementById('settings-content');

  if (closeSettingsModal) {
    closeSettingsModal.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  window.viewSettings = function(quizId) {
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) return;

    let html = `
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-2">
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quiz Title</label>
        <div class="text-sm font-semibold text-slate-900">${escapeHtml(quiz.title)}</div>
      </div>

      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-2 flex justify-between items-center">
        <div>
          <label class="block text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Access Code</label>
          <div class="text-lg font-mono font-bold text-blue-900 tracking-wider">${quiz.access_code}</div>
        </div>
        <button 
          onclick="window.copyAccessCode('${quiz.access_code}', 'modal-copy-btn')" 
          id="modal-copy-btn"
          class="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition"
          title="Copy Code"
        >
          <i data-lucide="copy" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-4">
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Question Order</label>
          <div class="text-sm font-semibold text-slate-900">${(quiz.randomize_questions ?? quiz.is_random) ? 'Randomized within sections' : 'Section order only'}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">MCQ Options</label>
          <div class="text-sm font-semibold text-slate-900">${quiz.randomize_options !== false ? 'Randomized' : 'Original order'}</div>
        </div>
      </div>
    `;

    if (quiz.offline_mode) {
      html += `
        <div class="grid grid-cols-2 gap-3 mt-4">
          <div class="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
            <label class="block text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Start OTP</label>
            <div class="text-2xl font-mono font-bold text-amber-900 tracking-widest">${quiz.start_otp || 'N/A'}</div>
          </div>
          <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
            <label class="block text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Submit OTP</label>
            <div class="text-2xl font-mono font-bold text-emerald-900 tracking-widest">${quiz.submit_otp || 'N/A'}</div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="mt-4 p-4 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50">
          <p class="text-sm text-slate-500">Offline mode is disabled. No OTPs required.</p>
        </div>
      `;
    }

    settingsContent.innerHTML = html;
    settingsModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  // Run initialization
  fetchQuizzes();
});
