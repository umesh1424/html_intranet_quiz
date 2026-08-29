// js/subjects.js
document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.checkAuth();
  if (!user) return;
  window.renderHeader(user);

  let questions = [];
  let subjects = [];
  let selectedSubjects = new Set();

  const subjectsList = document.getElementById('subjects-list');
  const subjectsSummary = document.getElementById('subjects-summary');
  const subjectSearch = document.getElementById('subject-search');
  const maxQuestionsFilter = document.getElementById('max-questions-filter');
  const deleteSelectedBtn = document.getElementById('delete-selected-subjects');

  async function fetchSubjects() {
    try {
      subjectsList.innerHTML = `
        <div class="py-16 flex flex-col justify-center items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p class="text-slate-500 text-sm">Loading syllabus tags...</p>
        </div>
      `;

      const { data, error } = await window.supabaseClient
        .from('question_bank')
        .select('id, type, syllabus_tag, created_at')
        .eq('teacher_id', user.id)
        .order('syllabus_tag', { ascending: true });

      if (error) throw error;

      questions = data || [];
      subjects = buildSubjectRows(questions);
      selectedSubjects = new Set(
        [...selectedSubjects].filter((tag) => subjects.some((subject) => subject.tag === tag))
      );
      renderSubjects();
    } catch (err) {
      console.error('Error loading syllabus tags:', err);
      subjectsList.innerHTML = `
        <div class="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center max-w-lg mx-auto">
          <i data-lucide="alert-circle" class="w-12 h-12 text-rose-500 mx-auto mb-3"></i>
          <h3 class="text-lg font-semibold text-rose-900">Failed to load syllabus tags</h3>
          <p class="text-rose-700 text-sm mt-1 mb-4">${escapeHtml(err.message || 'Please try again.')}</p>
          <button id="retry-subjects" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer">
            Retry
          </button>
        </div>
      `;
      window.lucide.createIcons();
      document.getElementById('retry-subjects')?.addEventListener('click', fetchSubjects);
    }
  }

  function buildSubjectRows(list) {
    const grouped = new Map();

    list.forEach((question) => {
      const tag = question.syllabus_tag || 'Untagged';
      if (!grouped.has(tag)) {
        grouped.set(tag, {
          tag,
          total: 0,
          mcq: 0,
          fib: 0,
          shortAnswer: 0,
          latestCreatedAt: question.created_at || '',
        });
      }

      const subject = grouped.get(tag);
      subject.total += 1;
      const type = normalizeQuestionType(question.type);
      if (type === 'MCQ') subject.mcq += 1;
      else if (type === 'FIB') subject.fib += 1;
      else subject.shortAnswer += 1;

      if (question.created_at && (!subject.latestCreatedAt || question.created_at > subject.latestCreatedAt)) {
        subject.latestCreatedAt = question.created_at;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.tag.localeCompare(b.tag));
  }

  function renderSubjects() {
    const query = subjectSearch.value.trim().toLowerCase();
    const maxQuestions = getMaxQuestionsFilter();
    const filtered = subjects.filter((subject) => {
      const matchesSearch = !query || subject.tag.toLowerCase().includes(query);
      const matchesMaxQuestions = maxQuestions === null || subject.total <= maxQuestions;
      return matchesSearch && matchesMaxQuestions;
    });

    updateSummary(filtered.length);
    updateBulkDeleteButton();

    if (subjects.length === 0) {
      subjectsList.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <i data-lucide="tags" class="w-12 h-12 text-slate-400 mx-auto mb-3"></i>
          <h3 class="text-lg font-bold text-slate-900">No syllabus tags yet</h3>
          <p class="text-slate-600 text-sm mt-1 mb-4">Add or import questions to build your subject list.</p>
          <a href="questions.html" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer">
            <i data-lucide="plus" class="w-4 h-4"></i>
            Add Questions
          </a>
        </div>
      `;
      window.lucide.createIcons();
      return;
    }

    if (filtered.length === 0) {
      subjectsList.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <i data-lucide="search-x" class="w-12 h-12 text-slate-400 mx-auto mb-3"></i>
          <h3 class="text-lg font-bold text-slate-900">No matching syllabus tags</h3>
          <p class="text-slate-600 text-sm mt-1">Try a different search term or increase the max question count.</p>
        </div>
      `;
      window.lucide.createIcons();
      return;
    }

    const selectedVisibleCount = filtered.filter((subject) => selectedSubjects.has(subject.tag)).length;
    const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;

    subjectsList.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 select-none cursor-pointer">
            <input
              type="checkbox"
              id="select-visible-subjects"
              class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              ${allVisibleSelected ? 'checked' : ''}
            />
            Select visible syllabus tags
          </label>
          <span class="text-xs font-medium text-slate-500">${selectedVisibleCount} selected on this page</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${filtered.map(renderSubjectRow).join('')}
        </div>
      </div>
    `;

    window.lucide.createIcons();
    document.getElementById('select-visible-subjects')?.addEventListener('change', (event) => {
      filtered.forEach((subject) => {
        if (event.target.checked) selectedSubjects.add(subject.tag);
        else selectedSubjects.delete(subject.tag);
      });
      renderSubjects();
    });
  }

  function renderSubjectRow(subject) {
    const checked = selectedSubjects.has(subject.tag) ? 'checked' : '';
    const latestDate = subject.latestCreatedAt
      ? new Date(subject.latestCreatedAt).toLocaleDateString('en-GB')
      : 'N/A';

    return `
      <div class="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <input
            type="checkbox"
            class="subject-checkbox w-4 h-4 mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            data-subject="${escapeHtml(subject.tag)}"
            ${checked}
          />
          <div class="min-w-0">
            <h2 class="text-sm font-bold text-slate-900 break-words">${escapeHtml(subject.tag)}</h2>
            <p class="text-xs text-slate-500 mt-1">Latest question added: ${escapeHtml(latestDate)}</p>
            <div class="flex flex-wrap gap-2 mt-3">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-100">
                ${subject.total} total
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                ${subject.mcq} MCQ
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-100">
                ${subject.fib} FIB
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-100">
                ${subject.shortAnswer} Short Answer
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 lg:shrink-0">
          <a
            href="questions.html?tag=${encodeURIComponent(subject.tag)}"
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-all cursor-pointer"
          >
            <i data-lucide="list" class="w-3.5 h-3.5"></i>
            View
          </a>
          <button
            type="button"
            class="delete-subject-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 hover:border-rose-300 hover:bg-rose-50 text-xs font-semibold text-rose-700 transition-all cursor-pointer"
            data-subject="${escapeHtml(subject.tag)}"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            Delete
          </button>
        </div>
      </div>
    `;
  }

  function updateSummary(filteredCount) {
    const totalQuestions = subjects.reduce((sum, subject) => sum + subject.total, 0);
    const selectedCount = selectedSubjects.size;
    const filterLabels = [];
    if (subjectSearch.value.trim()) filterLabels.push('search');
    const maxQuestions = getMaxQuestionsFilter();
    if (maxQuestions !== null) filterLabels.push(`max ${maxQuestions} questions`);
    const filterSuffix = filterLabels.length ? ` ${filteredCount} match ${filterLabels.join(' and ')}.` : '';
    subjectsSummary.textContent = `${subjects.length} syllabus tags across ${totalQuestions} questions.${selectedCount ? ` ${selectedCount} selected.` : ''}${filterSuffix}`;
  }

  function updateBulkDeleteButton() {
    deleteSelectedBtn.disabled = selectedSubjects.size === 0;
    deleteSelectedBtn.innerHTML = `
      <i data-lucide="trash-2" class="w-4 h-4"></i>
      Delete Selected${selectedSubjects.size ? ` (${selectedSubjects.size})` : ''}
    `;
    window.lucide.createIcons();
  }

  async function deleteSubjects(tags) {
    const rowsToDelete = subjects.filter((subject) => tags.includes(subject.tag));
    const questionCount = rowsToDelete.reduce((sum, subject) => sum + subject.total, 0);
    if (rowsToDelete.length === 0 || questionCount === 0) return;

    const tagList = rowsToDelete.map((subject) => `- ${subject.tag} (${subject.total} questions)`).join('\n');
    const confirmed = confirm(
      `Delete ${questionCount} questions from ${rowsToDelete.length} syllabus tag${rowsToDelete.length === 1 ? '' : 's'}?\n\n${tagList}\n\nThis also removes those questions from any quizzes that use them. This action cannot be undone.`
    );
    if (!confirmed) return;

    deleteSelectedBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient
        .from('question_bank')
        .delete()
        .eq('teacher_id', user.id)
        .in('syllabus_tag', tags);

      if (error) throw error;

      tags.forEach((tag) => selectedSubjects.delete(tag));
      window.showToast(`Deleted ${questionCount} questions from ${rowsToDelete.length} syllabus tag${rowsToDelete.length === 1 ? '' : 's'}.`, 'success');
      await fetchSubjects();
    } catch (err) {
      console.error('Error deleting syllabus tags:', err);
      window.showToast(err.message || 'Failed to delete syllabus tags', 'error');
      updateBulkDeleteButton();
    }
  }

  function normalizeQuestionType(type) {
    const rawType = String(type || 'MCQ').trim().toUpperCase();
    if (rawType === 'FIB' || rawType === 'FILL IN THE BLANK' || rawType === 'FILL IN THE BLANKS') return 'FIB';
    if (rawType === 'SHORT ANSWER' || rawType === 'SA' || rawType === 'SHORTANSWER') return 'Short Answer';
    return 'MCQ';
  }

  function getMaxQuestionsFilter() {
    const value = Number.parseInt(maxQuestionsFilter.value, 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  subjectSearch.addEventListener('input', renderSubjects);
  maxQuestionsFilter.addEventListener('input', renderSubjects);
  deleteSelectedBtn.addEventListener('click', () => deleteSubjects([...selectedSubjects]));
  subjectsList.addEventListener('change', (event) => {
    if (!event.target.classList.contains('subject-checkbox')) return;
    const tag = event.target.dataset.subject;
    if (event.target.checked) selectedSubjects.add(tag);
    else selectedSubjects.delete(tag);
    renderSubjects();
  });
  subjectsList.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.delete-subject-btn');
    if (!deleteBtn) return;
    deleteSubjects([deleteBtn.dataset.subject]);
  });

  fetchSubjects();
});
