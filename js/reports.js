// js/reports.js
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 [Reports] DOMContentLoaded fired');

  // Check auth
  console.log('🔐 [Reports] Checking auth...');
  const user = await window.checkAuth();

  if (!user) {
    console.error('❌ [Reports] No user found, redirecting...');
    return;
  }

  console.log('✅ [Reports] Auth successful');
  window.renderHeader(user);

  let quizzes = [];
  let results = [];
  let filterDate = '';
  let filterTime = '';
  let filterQuizCode = '';
  let tableSort = { key: 'score', direction: 'desc' };
  let quizFibShortCountMap = {}; // quizId -> number of FIB/Short Answer questions

  const reportsContainer = document.getElementById('reports-container');
  const studentHistoryModal = document.getElementById('studentHistoryModal');
  const studentHistoryName = document.getElementById('studentHistoryName');
  const studentHistoryTotalQuizzes = document.getElementById('studentHistoryTotalQuizzes');
  const studentHistoryAverage = document.getElementById('studentHistoryAverage');
  const studentHistoryTableBody = document.getElementById('studentHistoryTableBody');
  const closeStudentHistory = document.getElementById('closeStudentHistory');

  // Question Review Modal Elements
  const questionReviewModal = document.getElementById('questionReviewModal');
  const questionReviewTitle = document.getElementById('questionReviewTitle');
  const questionReviewContent = document.getElementById('questionReviewContent');
  const closeQuestionReview = document.getElementById('closeQuestionReview');

  // Manual CSV Grading Elements
  const manualCsvInput = document.getElementById('manualCsvInput');
  const btnViewCsvPlain = document.getElementById('btnViewCsvPlain');
  const btnSubmitCsvGrade = document.getElementById('btnSubmitCsvGrade');
  const csvPlainPreview = document.getElementById('csvPlainPreview');

  let currentCsvData = null; // Store parsed CSV data for submission

  // AI Grading Elements
  const aiGradesPasteInput = document.getElementById('aiGradesPasteInput');
  const btnViewAiGrades = document.getElementById('btnViewAiGrades');
  const btnImportAiGrades = document.getElementById('btnImportAiGrades');
  const aiGradesReviewContainer = document.getElementById('aiGradesReviewContainer');
  const aiGradesReviewTable = document.getElementById('aiGradesReviewTable');

  // Metric elements
  const metricTotalAttended = document.getElementById('metric-total-attended');
  const metricQuizScope = document.getElementById('metric-quiz-scope');
  const metricAverageScore = document.getElementById('metric-average-score');
  const metricAverageScope = document.getElementById('metric-average-scope');
  const metricLatestTime = document.getElementById('metric-latest-time');
  const metricLatestStudent = document.getElementById('metric-latest-student');

  // Load quizzes and results
  async function loadReportData() {
    console.log('📊 [Reports] Initializing report data load...');
    console.log('👤 [Reports] Current user:', user);
    console.log('👤 [Reports] User ID:', user.id);

    try {
      reportsContainer.innerHTML = `
        <div class="py-24 flex justify-center items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      `;

      // 1. Fetch teacher quizzes
      console.log('🔍 [Reports] Fetching teacher quizzes...');
      const { data: quizzesData, error: quizzesError } = await window.supabaseClient
        .from('quizzes')
        .select('id, title, access_code')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (quizzesError) {
        console.error('❌ [Reports] Error fetching quizzes:', quizzesError);
        throw quizzesError;
      }

      quizzes = quizzesData || [];
      console.log('✅ [Reports] Quizzes fetched successfully:', quizzes.length, 'quizzes');

      let loadedQuizQuestions = [];
      // 1a. Fetch quiz_questions with question_bank to count FIB/Short Answer per quiz
      if (quizzes.length > 0) {
        const quizIds = quizzes.map(q => q.id);
        const { data: quizQuestions, error: qqError } = await window.supabaseClient
          .from('quiz_questions')
          .select('quiz_id, question_bank(*)')
          .in('quiz_id', quizIds);

        if (qqError) {
          console.warn('⚠️ [Reports] Error fetching quiz questions:', qqError);
        } else {
          loadedQuizQuestions = quizQuestions || [];
          console.log('📥 [Reports] All quizQuestions:', loadedQuizQuestions);
          // Initialize map with 0 for all quizzes
          quizFibShortCountMap = {};
          quizIds.forEach(id => quizFibShortCountMap[id] = 0);

          // Count FIB/Short Answer
          if (loadedQuizQuestions) {
            loadedQuizQuestions.forEach(qq => {
              console.log('👉 [Reports] Processing quiz question:', qq);
              if (qq.question_bank) {
                const qType = qq.question_bank.type || 'MCQ';
                console.log('   [Reports] qType:', qType);
                if (qType === 'FIB' || qType === 'Short Answer' || qType === 'SHORT_ANSWER' || qType === 'Fill in the Blanks') {
                  quizFibShortCountMap[qq.quiz_id] = (quizFibShortCountMap[qq.quiz_id] || 0) + 1;
                  console.log('   [Reports] Incremented count for quiz', qq.quiz_id, 'to', quizFibShortCountMap[qq.quiz_id]);
                }
              }
            });
          }
          console.log('✅ [Reports] Quiz FIB/Short Answer counts:', quizFibShortCountMap);
        }
      }

      if (quizzes.length === 0) {
        // No quizzes = no results possible
        console.log('ℹ️ [Reports] No quizzes found for this teacher');
        results = [];
        renderEmptyState();
        updateMetrics([]);
        return;
      }

      // 2. Fetch student results
      const teacherQuizIds = quizzes.map((q) => q.id);
      console.log('🔍 [Reports] Teacher quiz IDs:', teacherQuizIds);

      // Safety check for empty quiz IDs array
      if (teacherQuizIds.length === 0) {
        console.log('ℹ️ [Reports] No quiz IDs to filter results');
        results = [];
        renderEmptyState();
        updateMetrics([]);
        return;
      }

      console.log('🔍 [Reports] Fetching student results...');
      const { data: resultsData, error: resultsError } = await window.supabaseClient
        .from('student_results')
        .select('*, quizzes(title, access_code)')
        .in('quiz_id', teacherQuizIds)
        .order('completed_at', { ascending: false });

      if (resultsError) {
        console.error('❌ [Reports] Error fetching results:', resultsError);
        throw resultsError;
      }

      let fetchedResults = resultsData || [];

      // 3. Batch fetch student_responses to evaluate grades in real time
      let allResponses = [];
      try {
        const { data: respData, error: respError } = await window.supabaseClient
          .from('student_responses')
          .select('*')
          .in('quiz_id', teacherQuizIds);
        if (!respError && respData) {
          allResponses = respData;
        }
      } catch (e) {
        console.warn('Could not batch fetch student_responses:', e);
      }

      // Map questions by quiz_id
      const quizQuestionsMap = new Map();
      loadedQuizQuestions.forEach(qq => {
        if (!quizQuestionsMap.has(qq.quiz_id)) {
          quizQuestionsMap.set(qq.quiz_id, []);
        }
        if (qq.question_bank) {
          quizQuestionsMap.get(qq.quiz_id).push(qq.question_bank);
        }
      });

      // Map responses by student_result_id and by (quiz_id + student_name)
      const responsesByResultId = new Map();
      const responsesByNameAndQuiz = new Map();
      allResponses.forEach(resp => {
        if (resp.student_result_id) {
          const k = String(resp.student_result_id);
          if (!responsesByResultId.has(k)) responsesByResultId.set(k, []);
          responsesByResultId.get(k).push(resp);
        }
        if (resp.quiz_id && resp.student_name) {
          const k = `${resp.quiz_id}::${resp.student_name}`;
          if (!responsesByNameAndQuiz.has(k)) responsesByNameAndQuiz.set(k, []);
          responsesByNameAndQuiz.get(k).push(resp);
        }
      });

      // Evaluate each result's score dynamically
      fetchedResults.forEach(r => {
        const qList = quizQuestionsMap.get(r.quiz_id) || [];
        if (qList.length === 0) return;

        const snapshotResps = normalizeResponseSnapshot(r.response_snapshot, r);
        const tableResps = responsesByResultId.get(String(r.id)) ||
                           responsesByNameAndQuiz.get(`${r.quiz_id}::${r.student_name}`) ||
                           [];
        const localResps = snapshotResps.length === 0 && tableResps.length === 0
          ? getLocalResponseSnapshot(r.id, r)
          : [];

        if (snapshotResps.length > 0 && tableResps.length > 0) {
          mergeTableGradesIntoSnapshot(snapshotResps, tableResps);
        }

        const mergedResps = snapshotResps.length > 0 ? snapshotResps : (tableResps.length > 0 ? tableResps : localResps);
        const lookupMaps = buildResponseLookupMaps(mergedResps);

        // Retain authoritative database score if present; only fallback to evaluated total if score is missing
        if (r.score !== undefined && r.score !== null && !isNaN(Number(r.score))) {
          r.score = Number(r.score);
        } else {
          let totalCorrect = 0;
          qList.forEach(q => {
            const sResp = findStudentResponse(q, lookupMaps);
            const evaluation = evaluateQuestionGrade(q.type || sResp?.question_type, sResp, q);
            if (evaluation.isCorrect) {
              totalCorrect++;
            }
          });
          r.score = totalCorrect;
        }
      });

      results = fetchedResults;
      console.log('✅ [Reports] Results synchronized & fetched successfully:', results.length, 'results');
      filterAndRender();
    } catch (err) {
      console.error('❌ [Reports] Unhandled error in loadReportData:', err);
      reportsContainer.innerHTML = `
        <div class="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center max-w-md mx-auto">
          <i data-lucide="alert-circle" class="w-10 h-10 text-rose-400 mx-auto mb-3"></i>
          <h3 class="text-base font-bold text-rose-800">Failed to load reports</h3>
          <p class="text-rose-600 text-sm mt-1">${escapeHtml(err.message)}</p>
        </div>
      `;
      window.lucide.createIcons();
    }
  }

  // Filter and Render based on date, time, and quiz code
  function filterAndRender() {
    let filtered = results;

    // Apply quiz code filter if set
    if (filterQuizCode) {
      filtered = filtered.filter(r => {
        const code = r.quizzes?.access_code || '';
        return code.toLowerCase().toUpperCase() === filterQuizCode.toUpperCase();
      });
    }

    // Apply date filter only if it's a valid full date
    if (filterDate) {
      const dateParts = filterDate.split('-');
      // Check if we have a valid 4-digit year, 2-digit month, and 2-digit day
      if (dateParts.length === 3 &&
          dateParts[0].length === 4 &&
          !isNaN(parseInt(dateParts[0])) &&
          dateParts[1].length === 2 &&
          !isNaN(parseInt(dateParts[1])) &&
          dateParts[2].length === 2 &&
          !isNaN(parseInt(dateParts[2]))) {

        filtered = filtered.filter(r => {
          const completedAt = new Date(r.completed_at);
          const rDate = completedAt.toISOString().split('T')[0]; // YYYY-MM-DD
          return rDate === filterDate;
        });
      }
    }

    // Apply time filter only if it's a valid full time (HH:MM)
    if (filterTime) {
      const timeParts = filterTime.split(':');
      if (timeParts.length === 2 &&
          timeParts[0].length === 2 &&
          !isNaN(parseInt(timeParts[0])) &&
          timeParts[1].length === 2 &&
          !isNaN(parseInt(timeParts[1]))) {

        filtered = filtered.filter(r => {
          const completedAt = new Date(r.completed_at);
          const hours = String(completedAt.getHours()).padStart(2, '0');
          const minutes = String(completedAt.getMinutes()).padStart(2, '0');
          const rTime = `${hours}:${minutes}`;
          return rTime === filterTime;
        });
      }
    }

    updateMetrics(filtered);
    renderTable(filtered);
  }

  // Update metrics row
  function updateMetrics(list) {
    // Total Attended
    metricTotalAttended.textContent = list.length;
    metricQuizScope.textContent = 'All Quizzes';

    // Average Score
    if (list.length === 0) {
      metricAverageScore.textContent = '—';
      metricAverageScope.textContent = 'No data yet';
    } else {
      const sumPct = list.reduce((sum, r) => sum + (r.score / r.total_questions) * 100, 0);
      const avgPct = Math.round(sumPct / list.length);
      metricAverageScore.textContent = `${avgPct}%`;
      metricAverageScope.textContent = 'Across all submissions';
    }

    // Latest Submission
    if (list.length === 0) {
      metricLatestTime.textContent = '—';
      metricLatestStudent.textContent = 'No data yet';
    } else {
      const latest = list[0];
      metricLatestTime.textContent = formatDate(latest.completed_at);
      metricLatestStudent.textContent = latest.student_name;
    }
  }

  function getResultPercentage(result) {
    const totalQuestions = Number(result.total_questions) || 0;
    if (totalQuestions <= 0) return 0;
    return Math.round(((Number(result.score) || 0) / totalQuestions) * 100);
  }

  function getSortValue(result, key, sourceIndex) {
    switch (key) {
      case 'sno':
        return sourceIndex;
      case 'student_name':
        return result.student_name || '';
      case 'quiz':
        return result.quizzes?.title || '';
      case 'total_questions':
        return Number(result.total_questions) || 0;
      case 'score':
        return Number(result.score) || 0;
      case 'percentage':
        return getResultPercentage(result);
      case 'grade':
        return getLetterGrade(getResultPercentage(result)).grade;
      case 'completed_at':
        return new Date(result.completed_at || 0).getTime() || 0;
      case 'ai_grading':
        return quizFibShortCountMap[result.quiz_id] || 0;
      default:
        return '';
    }
  }

  function sortResults(list) {
    const directionMultiplier = tableSort.direction === 'asc' ? 1 : -1;

    return list
      .map((result, sourceIndex) => ({ result, sourceIndex }))
      .sort((a, b) => {
        const aValue = getSortValue(a.result, tableSort.key, a.sourceIndex);
        const bValue = getSortValue(b.result, tableSort.key, b.sourceIndex);

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          const numericDiff = aValue - bValue;
          return numericDiff === 0 ? a.sourceIndex - b.sourceIndex : numericDiff * directionMultiplier;
        }

        const textDiff = String(aValue).localeCompare(String(bValue), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        return textDiff === 0 ? a.sourceIndex - b.sourceIndex : textDiff * directionMultiplier;
      })
      .map(({ result }) => result);
  }

  function renderSortableHeader(key, label) {
    const isActive = tableSort.key === key;
    const nextDirection = isActive && tableSort.direction === 'asc' ? 'desc' : 'asc';
    const sortIcon = isActive
      ? (tableSort.direction === 'asc' ? 'arrow-up' : 'arrow-down')
      : 'chevrons-up-down';
    const ariaSort = isActive ? (tableSort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

    return `
      <th class="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider" aria-sort="${ariaSort}">
        <button
          type="button"
          class="reports-sort-btn inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
          data-sort-key="${key}"
          data-sort-direction="${nextDirection}"
        >
          <span>${label}</span>
          <i data-lucide="${sortIcon}" class="w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-300'}"></i>
        </button>
      </th>
    `;
  }

  // Render submissions table
  function renderTable(list) {
    const scopeName = 'All Quizzes';

    if (list.length === 0) {
      renderEmptyState();
      return;
    }

    const sortedList = sortResults(list);

    let tableHtml = `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-slide-up">
        <!-- Table title bar -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <h2 class="text-sm font-bold text-slate-800">
              Student Results — <span class="text-blue-600">${escapeHtml(scopeName)}</span>
            </h2>
            <button id="btnCopyAllCsv" class="inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer">
              📋 Copy All CSV
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-400 mr-2">
              ${list.length} record${list.length !== 1 ? 's' : ''}
            </span>
            <input type="text" id="filterQuizCode" class="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500" style="width: auto;" placeholder="Enter Quiz Code" value="${filterQuizCode}">
            <input type="date" id="filterDateInput" class="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500" style="width: auto;" value="${filterDate}">
            <input type="time" id="filterTimeInput" class="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500" style="width: auto;" value="${filterTime}">
            <button id="btnApplyDateTimeFilter" class="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition cursor-pointer">Filter</button>
            <button id="btnClearDateTimeFilter" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer">Clear</button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-100">
                ${renderSortableHeader('sno', 'S.NO')}
                ${renderSortableHeader('student_name', 'Student Name')}
                ${renderSortableHeader('quiz', 'Quiz')}
                ${renderSortableHeader('total_questions', 'Total Questions')}
                ${renderSortableHeader('score', 'Score')}
                ${renderSortableHeader('percentage', 'Percentage')}
                ${renderSortableHeader('grade', 'Grade')}
                ${renderSortableHeader('completed_at', 'Completed At')}
                ${renderSortableHeader('ai_grading', 'AI Grading Data')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
    `;

    sortedList.forEach((result, idx) => {
      const pct = getResultPercentage(result);
      const { grade, colorClass } = getLetterGrade(pct);
      const title = result.quizzes?.title || 'Unknown Quiz';
      const code = result.quizzes?.access_code || '';

      tableHtml += `
        <tr class="hover:bg-slate-50/60 transition-colors duration-100">
          <td class="px-6 py-4 text-slate-400 font-medium text-xs">${idx + 1}</td>
          <td class="px-6 py-4">
            <button
              onclick="window.openStudentHistory('${escapeHtml(result.student_name)}')"
              class="font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer transition-colors"
            >
              ${escapeHtml(result.student_name)}
            </button>
          </td>
          <td class="px-6 py-4">
            <span class="block font-medium text-slate-700 max-w-[180px] truncate">
              ${escapeHtml(title)}
            </span>
            <span class="text-[11px] font-mono text-slate-400">
              ${code}
            </span>
          </td>
          <td class="px-6 py-4">
            <span class="text-slate-600 font-medium block">${result.total_questions}</span>
            <button
              class="btn-view-responses inline-flex items-center justify-center px-2 py-1 bg-slate-50 hover:bg-slate-100 text-blue-600 text-xs font-semibold rounded transition cursor-pointer"
              data-submission-id="${result.id}"
            >
              View
            </button>
          </td>
          <td class="px-6 py-4">
            <span class="font-bold text-slate-900">${result.score}</span>
            <span class="text-slate-400 font-medium"> / ${result.total_questions}</span>
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-2.5">
              <div class="w-20 bg-slate-100 rounded-full h-1.5 shrink-0">
                <div
                  class="h-full rounded-full ${getProgressColorClass(pct)}"
                  style="width: ${pct}%"
                ></div>
              </div>
              <span class="text-xs font-bold text-slate-700 w-9 shrink-0">${pct}%</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-black ${colorClass}">
              ${grade}
            </span>
          </td>
          <td class="px-6 py-4 text-slate-500 text-xs font-medium whitespace-nowrap">
            ${formatDate(result.completed_at)}
          </td>
          <td class="px-6 py-4">
            ${(() => {
              const fibShortCount = quizFibShortCountMap[result.quiz_id] || 0;
              if (fibShortCount === 0) {
                return `<span class="text-xs text-slate-400">Null</span>`;
              } else {
                return `<button
                  class="copy-csv-btn inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                  data-submission-id="${result.id}"
                  data-student-name="${escapeHtml(result.student_name)}"
                  data-quiz-title="${escapeHtml(title)}"
                >
                  📋 Copy Row CSV
                </button>`;
              }
            })()}
          </td>
        </tr>
      `;
    });

    tableHtml += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    reportsContainer.innerHTML = tableHtml;
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Render empty state
  function renderEmptyState() {
    reportsContainer.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl p-14 text-center shadow-sm max-w-lg mx-auto animate-slide-up">
        <div class="inline-flex items-center justify-center p-4 bg-slate-50 rounded-2xl mb-4">
          <i data-lucide="bar-chart-3" class="w-8 h-8 text-slate-300"></i>
        </div>
        <h3 class="text-base font-bold text-slate-800">
          No students have completed this quiz yet
        </h3>
        <p class="text-slate-500 text-sm mt-2 max-w-xs mx-auto">
          Once students submit their answers using the access code, their results will appear here.
        </p>
      </div>
    `;
    window.lucide.createIcons();
  }

  // Grade helper
  function getLetterGrade(pct) {
    if (pct >= 80) return { grade: 'A', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (pct >= 60) return { grade: 'B', colorClass: 'text-blue-700 bg-blue-50 border-blue-200' };
    if (pct >= 40) return { grade: 'C', colorClass: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { grade: 'F', colorClass: 'text-rose-700 bg-rose-50 border-rose-200' };
  }

  function getProgressColorClass(pct) {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 60) return 'bg-blue-500';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
  }

  // Date formatter
  function formatDate(iso) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Open Student History Modal
  window.openStudentHistory = function(studentName) {
    console.log('📊 [Reports] Opening history for student:', studentName);

    // Filter results for this student
    const studentResults = results.filter(r => r.student_name === studentName);
    console.log('📊 [Reports] Student results:', studentResults.length, 'attempts');

    // Update modal title
    studentHistoryName.textContent = `Student History: ${studentName}`;

    // Update summary stats
    studentHistoryTotalQuizzes.textContent = studentResults.length;

    if (studentResults.length > 0) {
      const sumPct = studentResults.reduce((sum, r) => sum + (r.score / r.total_questions) * 100, 0);
      const avgPct = Math.round(sumPct / studentResults.length);
      studentHistoryAverage.textContent = `${avgPct}%`;
    } else {
      studentHistoryAverage.textContent = '—';
    }

    // Render table body
    let tableBodyHtml = '';
    studentResults.forEach((result, idx) => {
      const pct = Math.round((result.score / result.total_questions) * 100);
      const { grade, colorClass } = getLetterGrade(pct);
      const title = result.quizzes?.title || 'Unknown Quiz';
      const code = result.quizzes?.access_code || '';

      tableBodyHtml += `
        <tr class="hover:bg-slate-50/60 transition-colors duration-100">
          <td class="px-4 py-3 text-slate-400 font-medium text-xs">${idx + 1}</td>
          <td class="px-4 py-3">
            <span class="font-semibold text-slate-900">${escapeHtml(result.student_name)}</span>
          </td>
          <td class="px-4 py-3">
            <span class="block font-medium text-slate-700 max-w-[180px] truncate">
              ${escapeHtml(title)}
            </span>
            <span class="text-[11px] font-mono text-slate-400">
              ${code}
            </span>
          </td>
          <td class="px-4 py-3">
            <span class="text-slate-600 font-medium block">${result.total_questions}</span>
            <button
              class="btn-view-responses inline-flex items-center justify-center px-2 py-1 bg-slate-50 hover:bg-slate-100 text-blue-600 text-xs font-semibold rounded transition cursor-pointer"
              data-submission-id="${result.id}"
            >
              View
            </button>
          </td>
          <td class="px-4 py-3">
            <span class="font-bold text-slate-900">${result.score}</span>
            <span class="text-slate-400 font-medium"> / ${result.total_questions}</span>
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-20 bg-slate-100 rounded-full h-1.5 shrink-0">
                <div
                  class="h-full rounded-full ${getProgressColorClass(pct)}"
                  style="width: ${pct}%"
                ></div>
              </div>
              <span class="text-xs font-bold text-slate-700 w-9 shrink-0">${pct}%</span>
            </div>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-black ${colorClass}">
              ${grade}
            </span>
          </td>
          <td class="px-4 py-3 text-slate-500 text-xs font-medium whitespace-nowrap">
            ${formatDate(result.completed_at)}
          </td>
        </tr>
      `;
    });

    studentHistoryTableBody.innerHTML = tableBodyHtml;

    // Show modal
    studentHistoryModal.classList.remove('hidden');
  }

  // Close Student History Modal
  function closeStudentHistoryModal() {
    studentHistoryModal.classList.add('hidden');
  }

  // Close Question Review Modal
  function closeQuestionReviewModal() {
    questionReviewModal.classList.add('hidden');
  }

  // Add event listeners for closing modals
  closeStudentHistory.addEventListener('click', closeStudentHistoryModal);
  studentHistoryModal.addEventListener('click', (e) => {
    if (e.target === studentHistoryModal) {
      closeStudentHistoryModal();
    }
  });

  closeQuestionReview.addEventListener('click', closeQuestionReviewModal);
  questionReviewModal.addEventListener('click', (e) => {
    if (e.target === questionReviewModal) {
      closeQuestionReviewModal();
    }
  });

  // --- Question review helpers (schema: student_results.id ↔ student_responses.student_result_id) ---

  function normalizeQuestionType(type) {
    const key = (type || 'MCQ').trim().toUpperCase();
    if (key === 'FILL IN THE BLANKS') return 'FIB';
    if (key === 'SHORT ANSWER') return 'SHORT_ANSWER';
    return key;
  }

  function normalizeMcqLetter(answer, question) {
    const trimmed = (answer || '').trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
    for (const letter of ['A', 'B', 'C', 'D']) {
      const optText = (question[`option_${letter.toLowerCase()}`] || '').trim();
      if (optText && optText.toLowerCase() === trimmed.toLowerCase()) return letter;
    }
    return upper;
  }

  function getMcqCorrectLetter(question) {
    const raw = (question.correct_option || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
    for (const letter of ['A', 'B', 'C', 'D']) {
      const optText = (question[`option_${letter.toLowerCase()}`] || '').trim();
      if (optText && optText.toLowerCase() === raw.toLowerCase()) return letter;
    }
    return upper;
  }

  function buildResponseLookupMaps(responses) {
    const byQuestionBankId = new Map();
    const byQuestionText = new Map();
    (responses || []).forEach((resp) => {
      if (resp.question_bank_id != null) {
        byQuestionBankId.set(String(resp.question_bank_id), resp);
      }
      if (resp.question_text) {
        const textKey = resp.question_text.trim().toLowerCase();
        if (!byQuestionText.has(textKey)) {
          byQuestionText.set(textKey, resp);
        }
      }
    });
    return { byQuestionBankId, byQuestionText };
  }

  function findStudentResponse(question, maps) {
    if (!question) return null;
    const byId = maps.byQuestionBankId.get(String(question.id));
    if (byId) return byId;
    if (question.question_text) {
      return maps.byQuestionText.get(question.question_text.trim().toLowerCase()) || null;
    }
    return null;
  }

  function isMissingSchemaItem(error, itemName) {
    const code = error?.code || '';
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const needle = itemName.toLowerCase();
    return (
      message.includes(needle) &&
      (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01' || message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
    );
  }

  function isMissingStudentResponsesError(error) {
    return isMissingSchemaItem(error, 'student_responses');
  }

  async function fetchResultRow(resultId) {
    let { data, error } = await window.supabaseClient
      .from('student_results')
      .select('id, quiz_id, student_name, score, total_questions, completed_at, response_snapshot')
      .eq('id', resultId)
      .maybeSingle();

    if (error && isMissingSchemaItem(error, 'response_snapshot')) {
      ({ data, error } = await window.supabaseClient
        .from('student_results')
        .select('id, quiz_id, student_name, score, total_questions, completed_at')
        .eq('id', resultId)
        .maybeSingle());

      if (data) data.response_snapshot = [];
    }

    if (error) throw error;
    return data;
  }

  function normalizeResponseSnapshot(snapshot, resultRow) {
    if (!Array.isArray(snapshot)) return [];

    return snapshot.map((item) => ({
      quiz_id: item.quiz_id || resultRow?.quiz_id,
      student_result_id: resultRow?.id,
      student_name: resultRow?.student_name || '',
      question_text: item.question_text || '',
      question_bank_id: item.question_bank_id || item.question_id || null,
      student_answer: item.student_answer ?? item.answer ?? '',
      question_type: item.question_type || item.type || 'MCQ',
      marks_assigned: item.marks_assigned ?? null,
      ai_reasoning: item.ai_reasoning ?? null,
    }));
  }

  function getLocalResponseSnapshot(resultId, resultRow) {
    try {
      const stored = JSON.parse(localStorage.getItem('quiz_response_snapshots') || '{}');
      const directEntry = stored[String(resultId)];
      if (directEntry?.responses) {
        return normalizeResponseSnapshot(directEntry.responses, resultRow);
      }

      const latestKey = `latest:${resultRow?.quiz_id}:${resultRow?.student_name}`;
      const latestEntry = stored[latestKey];
      if (latestEntry?.responses) {
        return normalizeResponseSnapshot(latestEntry.responses, resultRow);
      }

      const matchingEntry = Object.values(stored)
        .filter((entry) => entry?.quiz_id === resultRow?.quiz_id && entry?.student_name === resultRow?.student_name)
        .sort((a, b) => new Date(b?.saved_at || 0) - new Date(a?.saved_at || 0))[0];

      return normalizeResponseSnapshot(matchingEntry?.responses, resultRow);
    } catch (err) {
      console.warn('Could not read local response snapshot:', err);
      return [];
    }
  }

  async function fetchStudentResponses(resultId, quizId, studentName) {
    const { data: linkedResponses, error: linkedError } = await window.supabaseClient
      .from('student_responses')
      .select('*')
      .eq('student_result_id', resultId);

    if (linkedError) {
      if (isMissingStudentResponsesError(linkedError)) return [];
      throw linkedError;
    }

    if (linkedResponses && linkedResponses.length > 0) {
      return linkedResponses;
    }

    if (!quizId || !studentName) return [];

    const { data: fallbackResponses, error: fallbackError } = await window.supabaseClient
      .from('student_responses')
      .select('*')
      .eq('quiz_id', quizId)
      .eq('student_name', studentName)
      .order('created_at', { ascending: false });

    if (fallbackError) {
      if (isMissingStudentResponsesError(fallbackError)) return [];
      throw fallbackError;
    }

    return fallbackResponses || [];
  }
  function evaluateQuestionGrade(questionType, studentResp, question) {
    const typeKey = normalizeQuestionType(questionType);
    const rawStudent = studentResp ? String(studentResp.student_answer || '').trim() : '';
    const cleanStudentAns = rawStudent.toLowerCase();

    let correctAnswer = '';
    let studentCompare = rawStudent;
    let correctCompare = '';
    let isCorrect = false;
    let countsTowardAutoScore = false;

    if (typeKey === 'MCQ') {
      countsTowardAutoScore = true;
      const studentLetter = normalizeMcqLetter(rawStudent, question);
      const correctLetter = getMcqCorrectLetter(question);
      correctAnswer = correctLetter;
      studentCompare = studentLetter;
      correctCompare = correctLetter;
      isCorrect = Boolean(rawStudent && studentLetter && correctLetter && studentLetter.toUpperCase() === correctLetter.toUpperCase());
    } else if (typeKey === 'FIB') {
      countsTowardAutoScore = true;
      correctAnswer = String(question.correct_option || '').trim();
      studentCompare = rawStudent;
      correctCompare = correctAnswer;
      const cleanCorrectAns = correctAnswer.toLowerCase();
      isCorrect = Boolean(cleanStudentAns && cleanCorrectAns && cleanStudentAns === cleanCorrectAns);

      const manualMarks = studentResp?.marks_assigned;
      if (manualMarks != null) {
        isCorrect = Number(manualMarks) > 0;
      }
    } else {
      countsTowardAutoScore = true;
      correctAnswer = String(question.correct_option || '').trim();
      studentCompare = rawStudent;
      correctCompare = correctAnswer;
      const cleanCorrectAns = correctAnswer.toLowerCase();
      isCorrect = Boolean(cleanStudentAns && cleanCorrectAns && cleanStudentAns === cleanCorrectAns);

      const manualMarks = studentResp?.marks_assigned;
      if (manualMarks != null) {
        isCorrect = Number(manualMarks) > 0;
      }
    }

    return {
      studentAnswer: rawStudent,
      correctAnswer,
      studentCompare,
      correctCompare,
      isCorrect,
      countsTowardAutoScore,
      questionType: typeKey,
    };
  }

  function renderAnswerBox(label, value, colorClass, emptyText = 'Student not enter') {
    const displayValue = (value == null ? '' : String(value).trim()) || emptyText;

    return `
      <div class="p-4 rounded-xl border-2 ${colorClass}">
        <span class="text-xs font-bold uppercase tracking-wider block mb-2">${label}</span>
        <span class="text-sm font-semibold whitespace-pre-wrap break-words">${escapeHtml(displayValue)}</span>
      </div>
    `;
  }

  function formatMcqAnswerLabel(letter, question) {
    const answerLetter = String(letter || '').trim().toUpperCase();
    if (!answerLetter) return '';

    const optionText = question[`option_${answerLetter.toLowerCase()}`];
    if (!optionText) return answerLetter;

    return `${answerLetter}. ${optionText}`;
  }

  function renderMcqReviewCard(displayNumber, questionText, question, studentLetter, correctLetter) {
    let optionsHtml = '';
    const answeredCorrectly = studentLetter && correctLetter && studentLetter === correctLetter;
    const studentAnswerLabel = formatMcqAnswerLabel(studentLetter, question);
    const correctAnswerLabel = formatMcqAnswerLabel(correctLetter, question);

    ['A', 'B', 'C', 'D'].forEach((letter) => {
      const optionText = question[`option_${letter.toLowerCase()}`];
      if (!optionText) return;

      let containerClasses = 'bg-white border border-slate-200';
      let labelText = '';

      if (letter === studentLetter && letter === correctLetter) {
        containerClasses = 'bg-emerald-50 border-2 border-emerald-400';
        labelText = '<span class="text-xs font-bold text-emerald-700">Correct and student answer</span>';
      } else if (letter === studentLetter && letter !== correctLetter) {
        containerClasses = 'bg-rose-50 border-2 border-rose-400';
        labelText = '<span class="text-xs font-bold text-rose-700">Student answer</span>';
      } else if (letter === correctLetter && letter !== studentLetter) {
        containerClasses = 'bg-emerald-50 border-2 border-emerald-400';
        labelText = '<span class="text-xs font-bold text-emerald-700">Correct answer</span>';
      }

      const badgeBg = containerClasses.includes('emerald')
        ? 'bg-emerald-200 text-emerald-800'
        : containerClasses.includes('rose')
          ? 'bg-rose-200 text-rose-800'
          : 'bg-slate-100 text-slate-500';
      const textClass = containerClasses.includes('emerald')
        ? 'text-emerald-800 font-semibold'
        : containerClasses.includes('rose')
          ? 'text-rose-800 font-semibold'
          : 'text-slate-700';

      optionsHtml += `
        <div class="flex flex-col gap-1.5 p-3 rounded-xl ${containerClasses}">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${badgeBg}">${letter}</span>
            <span class="text-sm ${textClass} flex-1 break-words">${escapeHtml(optionText)}</span>
          </div>
          ${labelText ? `<div class="pl-10">${labelText}</div>` : ''}
        </div>
      `;
    });

    return `
      <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
        <div class="flex items-start gap-3 mb-4">
          <span class="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-sm font-bold shrink-0">${displayNumber}</span>
          <h4 class="text-sm font-bold text-slate-900 flex-1 leading-relaxed pt-1">${escapeHtml(questionText)}</h4>
          <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100 shrink-0">MCQ</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          ${renderAnswerBox(
            'Student Answer',
            studentAnswerLabel,
            answeredCorrectly ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-rose-400 bg-rose-50 text-rose-900'
          )}
          ${renderAnswerBox(
            'Correct Answer',
            correctAnswerLabel,
            'border-emerald-400 bg-emerald-50 text-emerald-900',
            'No correct answer set'
          )}
        </div>
        <div class="grid grid-cols-1 gap-2">${optionsHtml}</div>
      </div>
    `;
  }

  function renderFibReviewCard(displayNumber, questionText, studentAnswer, correctAnswer, isCorrect) {
    return `
      <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
        <div class="flex items-start gap-3 mb-4">
          <span class="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-sm font-bold shrink-0">${displayNumber}</span>
          <h4 class="text-sm font-bold text-slate-900 flex-1 leading-relaxed pt-1">${escapeHtml(questionText)}</h4>
          <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-violet-50 text-violet-600 border border-violet-100 shrink-0">Fill in the Blanks</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${renderAnswerBox(
            'Student Answer',
            studentAnswer,
            isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-rose-400 bg-rose-50 text-rose-900'
          )}
          ${renderAnswerBox(
            'Correct Answer',
            correctAnswer,
            'border-emerald-400 bg-emerald-50 text-emerald-900',
            'No correct answer set'
          )}
        </div>
      </div>
    `;
  }

  function renderShortAnswerReviewCard(displayNumber, questionText, studentAnswer, correctAnswer, isCorrect) {
    return `
      <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
        <div class="flex items-start gap-3 mb-4">
          <span class="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-sm font-bold shrink-0">${displayNumber}</span>
          <h4 class="text-sm font-bold text-slate-900 flex-1 leading-relaxed pt-1">${escapeHtml(questionText)}</h4>
          <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-100 shrink-0">Short Answer</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${renderAnswerBox(
            'Student Answer',
            studentAnswer,
            isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-rose-400 bg-rose-50 text-rose-900'
          )}
          ${renderAnswerBox(
            'Correct Answer',
            correctAnswer,
            'border-emerald-400 bg-emerald-50 text-emerald-900',
            'No correct answer set'
          )}
        </div>
      </div>
    `;
  }
  // Open Question Review Modal
  async function openQuestionReviewModal(submissionId, studentName, quizTitle, quizId) {
    const resultId = String(submissionId).trim();

    questionReviewTitle.textContent = `Review Responses: ${studentName} - ${quizTitle}`;
    questionReviewContent.innerHTML = `
      <div class="py-8 flex items-center justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    `;
    questionReviewModal.classList.remove('hidden');

    try {
      const resultRow = await fetchResultRow(resultId);
      const resolvedQuizId = quizId || resultRow?.quiz_id;
      const resolvedStudentName = studentName || resultRow?.student_name || '';

      const { data: quizQuestions, error: qqError } = await window.supabaseClient
        .from('quiz_questions')
        .select('*, question_bank(*)')
        .eq('quiz_id', resolvedQuizId);

      if (qqError) throw qqError;

      const snapshotResponses = normalizeResponseSnapshot(resultRow?.response_snapshot, resultRow);
            const tableResponses = await fetchStudentResponses(resultId, resolvedQuizId, resolvedStudentName);
                  const localResponses = snapshotResponses.length === 0 && tableResponses.length === 0
              ? getLocalResponseSnapshot(resultId, resultRow)
              : [];
            // Merge grading data from student_responses into snapshot, so manual grades
            // (marks_assigned, ai_reasoning) survive even when response_snapshot is present.
            if (snapshotResponses.length > 0 && tableResponses.length > 0) {
              const tableMap = new Map();
              tableResponses.forEach(r => { const k = (r.question_text || '').trim().toLowerCase(); if (k) tableMap.set(k, r); });
              snapshotResponses.forEach(r => {
                const k = (r.question_text || '').trim().toLowerCase();
                const tr = k ? tableMap.get(k) : null;
                if (tr) {
                  if (tr.marks_assigned != null) r.marks_assigned = tr.marks_assigned;
                  if (tr.ai_reasoning) r.ai_reasoning = tr.ai_reasoning;
                }
              });
            }
            const responses = snapshotResponses.length > 0
              ? snapshotResponses
              : (tableResponses.length > 0 ? tableResponses : localResponses);
      const responseMaps = buildResponseLookupMaps(responses);

      if (!quizQuestions || quizQuestions.length === 0) {
        questionReviewContent.innerHTML = `
          <div class="py-8 text-center">
            <i data-lucide="alert-circle" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
            <p class="text-slate-500">No questions found for this quiz.</p>
          </div>
        `;
        window.lucide.createIcons();
        return;
      }

      const questions = quizQuestions
        .map((qq) => qq.question_bank)
        .filter(Boolean);

      let totalCorrect = 0;
      let autoGradableCount = 0;

      const processedQuestions = questions.map((q, index) => {
        const studentResp = findStudentResponse(q, responseMaps);
        const grade = evaluateQuestionGrade(q.type || studentResp?.question_type, studentResp, q);

        if (grade.countsTowardAutoScore) {
          autoGradableCount++;
          if (grade.isCorrect) {
            totalCorrect++;
          }
        }

        return {
          q,
          index,
          ...grade,
        };
      });

      const savedScore = Number(resultRow?.score);
      const savedTotal = Number(resultRow?.total_questions);
      const scoreNumerator = totalCorrect;
      const scoreDenominator = Number.isFinite(savedTotal) && savedTotal > 0
        ? savedTotal
        : (autoGradableCount > 0 ? autoGradableCount : questions.length);
      const scorePct = scoreDenominator > 0 ? Math.round((scoreNumerator / scoreDenominator) * 100) : 0;
      const scorePctColor = scorePct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                            scorePct >= 60 ? 'text-blue-700 bg-blue-50 border-blue-200' :
                            scorePct >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200' :
                                             'text-rose-700 bg-rose-50 border-rose-200';

      // Keep database and table synchronized with evaluated score
      if (resultId && (!Number.isFinite(savedScore) || savedScore !== totalCorrect)) {
        window.supabaseClient
          .from('student_results')
          .update({ score: totalCorrect })
          .eq('id', resultId)
          .then(({ error }) => {
            if (!error) {
              const localRes = results.find((r) => String(r.id) === String(resultId));
              if (localRes) {
                localRes.score = totalCorrect;
                updateMetrics(getCurrentlyFilteredResults());
                renderTable(getCurrentlyFilteredResults());
              }
            }
          })
          .catch((e) => console.warn('Could not sync score:', e));
      }

      let contentHtml = `
        <div class="flex items-center justify-between p-4 rounded-xl border ${scorePctColor} mb-5">
          <div class="flex items-center gap-3">
            <span class="text-2xl font-black">${scoreNumerator}</span>
            <span class="text-sm font-semibold opacity-80">/ ${scoreDenominator} correct</span>
          </div>
          <span class="text-lg font-extrabold">${scorePct}%</span>
        </div>
      `;

      processedQuestions.forEach((item) => {
        const { q, index, questionType, studentAnswer, correctAnswer, studentCompare, correctCompare, isCorrect } = item;
        const displayNumber = index + 1;
        const questionText = q.question_text || '';

        if (questionType === 'MCQ') {
          contentHtml += renderMcqReviewCard(
            displayNumber,
            questionText,
            q,
            studentCompare,
            correctCompare
          );
        } else if (questionType === 'FIB') {
          contentHtml += renderFibReviewCard(
            displayNumber,
            questionText,
            studentAnswer,
            correctAnswer,
            isCorrect
          );
        } else {
          contentHtml += renderShortAnswerReviewCard(
            displayNumber,
            questionText,
            studentAnswer,
            correctAnswer,
            isCorrect
          );
        }
      });

      questionReviewContent.innerHTML = `<div class="space-y-4">${contentHtml}</div>`;
      window.lucide.createIcons();
    } catch (err) {
      console.error('Error loading question review:', err);
      questionReviewContent.innerHTML = `
        <div class="py-8 text-center">
          <i data-lucide="alert-circle" class="w-12 h-12 text-rose-400 mx-auto mb-3"></i>
          <h4 class="text-sm font-bold text-rose-800">Failed to load questions</h4>
          <p class="text-rose-600 text-sm mt-1">${escapeHtml(err.message)}</p>
        </div>
      `;
      window.lucide.createIcons();
    }
  }
  // Event delegation for btn-view-responses in reports container
  reportsContainer.addEventListener('click', (e) => {
    const sortButton = e.target.closest('.reports-sort-btn');
    if (sortButton) {
      tableSort = {
        key: sortButton.dataset.sortKey,
        direction: sortButton.dataset.sortDirection === 'desc' ? 'desc' : 'asc',
      };
      renderTable(getCurrentlyFilteredResults());
      return;
    }

    const btn = e.target.closest('.btn-view-responses');
    if (!btn) return;

    const submissionId = btn.dataset.submissionId;
    const result = results.find((r) => String(r.id) === String(submissionId));
    if (!result) {
      window.showToast('Submission not found', 'warning');
      return;
    }

    openQuestionReviewModal(
      result.id,
      result.student_name,
      result.quizzes?.title || 'Unknown Quiz',
      result.quiz_id
    );
  });

  // Event delegation for btn-view-responses in student history modal
  studentHistoryModal.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-view-responses');
    if (!btn) return;

    const submissionId = btn.dataset.submissionId;
    const result = results.find((r) => String(r.id) === String(submissionId));
    if (!result) {
      window.showToast('Submission not found', 'warning');
      return;
    }

    openQuestionReviewModal(
      result.id,
      result.student_name,
      result.quizzes?.title || 'Unknown Quiz',
      result.quiz_id
    );
  });

  const detailedCsvHeaders = [
    'submission_id',
    'quiz_code',
    'student_name',
    'quiz_title',
    'completed_at',
    'current_score',
    'total_questions',
    'percentage',
    'question_index',
    'question_type',
    'question_text',
    'student_answer',
    'correct_key',
    'assigned_marks',
    'ai_reasoning'
  ];

  function rowsToCsv(rows) {
    return rows
      .map((row) =>
        row
          .map((val) => {
            const escaped = (val == null ? '' : String(val)).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(',')
      )
      .join('\n');
  }

  function buildAiGradingPrompt(csvContent) {
    return [
      'You are an AI grading assistant.',
      '',
      'Grade ONLY Fill in the Blank (FIB) and Short Answer (SHORT_ANSWER) questions.',
      'Do NOT change MCQ answers. Keep their existing result when calculating the total score.',
      '',
      'For each FIB or SHORT_ANSWER row:',
      'The CSV correct_key is the authoritative correct answer. Never replace or override it using outside knowledge, browser tolerance, or assumptions.',
      'Treat answers that differ only in capitalization or surrounding whitespace as exact matches.',
      '',
      'STRICT HTML & CODE GRADING GUIDELINES:',
      '1. Exact match with all required tags and content = 100% (1.0 / 1.0).',
      '2. HTML Structural Validation Rule: For HTML and programming SHORT_ANSWER questions, compare the student answer structure directly against correct_key. Do NOT award 1/1 if any structural tag present in correct_key (such as <!DOCTYPE html>, <html>, <head>, <title>, <body>, <h1>, <p>) is missing from the student answer.',
      '3. Missing Tag Deductions:',
      '   - One required structural tag missing (e.g. missing <head> or missing <title>): Award at most 0.8/1. Reason MUST state the missing tag (e.g., "Q3: 0.8/1 - Correct content, but missing <head> tag").',
      '   - Multiple required structural tags missing (e.g. missing <head> AND <title>): Award at most 0.7/1 (e.g., "Q4: 0.7/1 - Correct heading and paragraph, but missing <head> and <title> structure").',
      '   - Significant structural omissions or missing body/html: Award 0.5/1 or lower.',
      '4. Synonyms and equivalent terms for concepts = high score (e.g. Water = H2O; CPU = Central Processing Unit).',
      '5. Minor spelling mistakes = small deduction (0.9/1).',
      '6. Grammar mistakes = minimal penalty if meaning is correct.',
      '7. FIB Questions: Exact match or case/whitespace variation = 1/1 (e.g., "Q5: 1/1 - Exact match").',
      '8. Completely incorrect answers = 0/1.',
      '9. Never hallucinate information.',
      '10. Never modify submission_id, student_name, quiz_code, question_text, or question_index.',
      '',
      'Output requirements:',
      '11. Output MUST be valid CSV only.',
      '12. Preserve every submission_id as one output row.',
      '13. Preserve the exact output column order.',
      '14. Do not add explanations outside the CSV.',
      '15. Fill only the grading output columns.',
      '16. Return the completed CSV.',
      '',
      'The completed CSV MUST have exactly these columns in this order:',
      'submission_id,score,ai_reasoning',
      '',
      'Return exactly one row per submission_id. Calculate score as the total for all questions: retain each MCQ result from CSV (1 if student_answer matches correct_key, 0 if mismatch), grade each FIB/SHORT_ANSWER question from 0.0 to 1.0, then round the final total to the nearest whole number. score must be a whole number from 0 to total_questions.',
      'ai_reasoning must list only FIB/SHORT_ANSWER questions in this exact format: Q{question_index}: {earned}/1 - {brief reason}; Q{question_index}: {earned}/1 - {brief reason}. Do not mention MCQ questions. If there are no FIB/SHORT_ANSWER questions, leave ai_reasoning empty. If it contains commas, wrap the field in double quotes.',
      'Output only the completed CSV: no markdown, code fences, headings, notes, or text before or after it.',
      '',
      csvContent
    ].join('\n');
  }
  function extractCsvSection(rawText, requiredHeaders = ['submission_id']) {
    const lines = String(rawText || '')
      .replace(/```(?:csv)?/gi, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const headerIndex = lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return requiredHeaders.every((header) => lower.includes(header.toLowerCase()));
    });

    return (headerIndex >= 0 ? lines.slice(headerIndex) : lines).join('\n');
  }

  function extractAiGradesCsvSection(rawText) {
    const lines = String(rawText || '')
      .replace(/```(?:csv)?/gi, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const headerIndexes = [];
    lines.forEach((line, index) => {
      const cols = parseCsvLine(line).map((col) => col.trim().replace(/^"|"$/g, '').toLowerCase());
      if (cols.includes('submission_id') && cols.includes('score') && cols.includes('ai_reasoning')) {
        headerIndexes.push(index);
      }
    });

    if (headerIndexes.length === 0) return '';

    const headerIndex = headerIndexes[headerIndexes.length - 1];
    const section = [lines[headerIndex]];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const submissionId = (row[0] || '').trim();
      const score = (row[1] || '').trim();
      if (uuidPattern.test(submissionId) && /^\d+$/.test(score)) {
        section.push(lines[i]);
      }
    }

    return section.length > 1 ? section.join('\n') : '';
  }
  function getCurrentlyFilteredResults() {
    let filtered = results;
    if (filterQuizCode) {
      filtered = filtered.filter(r => (r.quizzes?.access_code || '').toUpperCase() === filterQuizCode.toUpperCase());
    }
    if (filterDate) {
      const dateParts = filterDate.split('-');
      if (dateParts.length === 3 && dateParts[0].length === 4) {
        filtered = filtered.filter(r => new Date(r.completed_at).toISOString().split('T')[0] === filterDate);
      }
    }
    if (filterTime) {
      const timeParts = filterTime.split(':');
      if (timeParts.length === 2 && timeParts[0].length === 2) {
        filtered = filtered.filter(r => {
          const d = new Date(r.completed_at);
          return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') === filterTime;
        });
      }
    }
    return filtered;
  }

  function mergeTableGradesIntoSnapshot(snapshotResponses, tableResponses) {
    if (snapshotResponses.length === 0 || tableResponses.length === 0) return;

    const tableMap = new Map();
    tableResponses.forEach((resp) => {
      const key = (resp.question_text || '').trim().toLowerCase();
      if (key) tableMap.set(key, resp);
    });

    snapshotResponses.forEach((resp) => {
      const key = (resp.question_text || '').trim().toLowerCase();
      const tableResp = key ? tableMap.get(key) : null;
      if (!tableResp) return;
      if (tableResp.marks_assigned != null) resp.marks_assigned = tableResp.marks_assigned;
      if (tableResp.ai_reasoning) resp.ai_reasoning = tableResp.ai_reasoning;
    });
  }

  async function buildDetailedCsvRowsForResult(result) {
    const submissionId = result.id;
    const resultRow = await fetchResultRow(submissionId);
    const resultContext = resultRow || result;
    const quizId = result.quiz_id || resultRow?.quiz_id;
    const resolvedStudentName = resultRow?.student_name || result.student_name || '';
    const quizTitle = result.quizzes?.title || 'Unknown Quiz';
    const quizCode = result.quizzes?.access_code || '';

    if (!quizId) return [];

    const { data: quizQuestions, error: qqError } = await window.supabaseClient
      .from('quiz_questions')
      .select('*, question_bank(*)')
      .eq('quiz_id', quizId);

    if (qqError) throw qqError;

    const snapshotResponses = normalizeResponseSnapshot(resultRow?.response_snapshot, resultContext);
    const tableResponses = await fetchStudentResponses(submissionId, quizId, resolvedStudentName);
    const localResponses = snapshotResponses.length === 0 && tableResponses.length === 0
      ? getLocalResponseSnapshot(submissionId, resultContext)
      : [];

    mergeTableGradesIntoSnapshot(snapshotResponses, tableResponses);

    const responses = snapshotResponses.length > 0
      ? snapshotResponses
      : (tableResponses.length > 0 ? tableResponses : localResponses);
    const responseMaps = buildResponseLookupMaps(responses);
    const currentScore = Number(resultRow?.score ?? result.score ?? 0);
    const totalQuestions = Number(resultRow?.total_questions ?? result.total_questions ?? 0);
    const percentage = totalQuestions > 0 ? Math.round((currentScore / totalQuestions) * 100) : 0;

    return (quizQuestions || []).map((qq, qIndex) => {
      const question = qq.question_bank;
      if (!question) return null;

      const studentResp = findStudentResponse(question, responseMaps);
      const questionType = normalizeQuestionType(question.type || studentResp?.question_type);
      const rawStudentAnswer = studentResp ? String(studentResp.student_answer || '').trim() : '';
      const studentAnswer = questionType === 'MCQ'
        ? formatMcqAnswerLabel(normalizeMcqLetter(rawStudentAnswer, question), question)
        : rawStudentAnswer;
      const correctKey = questionType === 'MCQ'
        ? formatMcqAnswerLabel(getMcqCorrectLetter(question), question)
        : (question.correct_option || '');

      return [
        submissionId,
        quizCode,
        resolvedStudentName,
        quizTitle,
        resultRow?.completed_at || result.completed_at || '',
        currentScore,
        totalQuestions,
        percentage,
        qIndex + 1,
        questionType,
        question.question_text || '',
        studentAnswer,
        correctKey,
        studentResp?.marks_assigned ?? '',
        studentResp?.ai_reasoning || ''
      ];
    }).filter(Boolean);
  }

  async function buildDetailedCsvTextForResults(list, includeAiPrompt = true) {
    const rowsByResult = await Promise.all(
      list.map((result) => buildDetailedCsvRowsForResult(result))
    );
    const csvContent = rowsToCsv([detailedCsvHeaders, ...rowsByResult.flat()]);
    return includeAiPrompt ? buildAiGradingPrompt(csvContent) : csvContent;
  }
  // Event delegation for copy CSV buttons
  reportsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-csv-btn');
    if (btn) {
      await handleCopyCsv(btn);
    }
  });

  // Event delegation for Apply Filter button and Copy All CSV
  reportsContainer.addEventListener('click', async (e) => {
    if (e.target.id === 'btnApplyDateTimeFilter') {
      const quizCodeInput = document.getElementById('filterQuizCode');
      const dateInput = document.getElementById('filterDateInput');
      const timeInput = document.getElementById('filterTimeInput');
      filterQuizCode = quizCodeInput ? quizCodeInput.value.trim() : '';
      filterDate = dateInput ? dateInput.value : '';
      filterTime = timeInput ? timeInput.value : '';
      filterAndRender();
    } else if (e.target.id === 'btnClearDateTimeFilter') {
      filterQuizCode = '';
      filterDate = '';
      filterTime = '';
      filterAndRender();
    } else if (e.target.id === 'btnCopyAllCsv') {
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = 'Building...';
      btn.disabled = true;

      try {
        const filtered = getCurrentlyFilteredResults();
        if (filtered.length === 0) {
          window.showToast('No records to copy', 'warning');
          return;
        }

        const csvContent = await buildDetailedCsvTextForResults(filtered, true);
        await navigator.clipboard.writeText(csvContent);
        window.showToast('Detailed AI CSV prompt copied!', 'success');
      } catch (err) {
        console.error('Error copying all CSV:', err);
        window.showToast(err.message || 'Failed to copy all CSV', 'error');
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  });

  // View CSV Button Handler
  btnViewCsvPlain.addEventListener('click', () => {
    const rawText = manualCsvInput.value.trim();
    console.log('📥 btnViewCsvPlain clicked! rawText:', rawText);
    if (!rawText) {
      window.showToast('Please paste CSV text first', 'warning');
      return;
    }

    try {
      // Parse CSV lines, trim whitespace. Accept both header + rows and rows only.
      const csvText = extractCsvSection(rawText, ['submission_id', 'question_text']);
      const lines = csvText.split('\n').filter(line => line.trim());
      console.log('CSV lines array:', lines);
      if (lines.length < 1) {
        window.showToast('CSV must have at least one data row', 'warning');
        return;
      }

      const defaultHeaders = [
        'submission_id',
        'student_name',
        'quiz_title',
        'question_text',
        'question_index',
        'student_answer',
        'correct_key',
        'assigned_marks',
        'ai_reasoning'
      ];

      let headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
      const hasHeader = defaultHeaders.some((header) => headers.includes(header));
      let rowStartIndex = 1;
      if (!hasHeader) {
        headers = defaultHeaders;
        rowStartIndex = 0;
      }

      console.log('CSV headers:', headers);
      const dataRows = [];
      for (let i = rowStartIndex; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        console.log(`line ${i} parsed row:`, row);
        if (row.length > 0) {
          dataRows.push(row);
        }
      }

      console.log('CSV dataRows:', dataRows);
      if (dataRows.length === 0) {
        window.showToast('No data rows found in CSV', 'warning');
        return;
      }

      const getCell = (row, fieldName) => {
        const idx = headers.indexOf(fieldName);
        return idx >= 0 ? (row[idx] || '') : '';
      };

      const groupedMap = new Map();
      dataRows.forEach((row, rowIndex) => {
        const submissionId = getCell(row, 'submission_id') || `row-${rowIndex}`;
        if (!groupedMap.has(submissionId)) {
          groupedMap.set(submissionId, {
            submissionId,
            quizId: getCell(row, 'quiz_id'),
            quizCode: getCell(row, 'quiz_code'),
            studentName: getCell(row, 'student_name'),
            quizTitle: getCell(row, 'quiz_title'),
            completedAt: getCell(row, 'completed_at'),
            currentScore: getCell(row, 'current_score'),
            totalQuestions: getCell(row, 'total_questions'),
            percentage: getCell(row, 'percentage'),
            questions: [],
          });
        }

        const group = groupedMap.get(submissionId);
        const qIndex = getCell(row, 'question_index');
        const questionText = getCell(row, 'question_text');

        if (questionText || getCell(row, 'student_answer') || getCell(row, 'correct_key')) {
          group.questions.push({
            questionIndex: qIndex,
            questionType: getCell(row, 'question_type'),
            questionText,
            studentAnswer: getCell(row, 'student_answer'),
            correctKey: getCell(row, 'correct_key'),
            assignedMarks: getCell(row, 'assigned_marks'),
            aiReasoning: getCell(row, 'ai_reasoning')
          });
        }
      });

      const submissionGroups = Array.from(groupedMap.values()).map((group) => ({
        ...group,
        questions: group.questions.sort((a, b) => {
          const aIndex = parseInt(a.questionIndex, 10);
          const bIndex = parseInt(b.questionIndex, 10);
          if (Number.isNaN(aIndex) || Number.isNaN(bIndex)) return 0;
          return aIndex - bIndex;
        })
      }));

      if (submissionGroups.length === 0) {
        window.showToast('No question rows found in CSV', 'warning');
        return;
      }

      console.log('Submission groups:', submissionGroups);

      const firstGroup = submissionGroups[0];
      currentCsvData = submissionGroups.length === 1 ? {
        submissionId: firstGroup.submissionId,
        studentName: firstGroup.studentName,
        quizTitle: firstGroup.quizTitle,
        questions: firstGroup.questions,
        rawText,
        dataRows,
        headers
      } : null;

      const renderQuestionHtml = (q, idx) => `
        <div class="border border-slate-200 rounded-lg p-3 bg-white">
          <p class="text-xs font-semibold text-slate-700 mb-1">Question ${idx + 1}</p>
          ${q.questionType ? `<p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">${escapeHtml(q.questionType)}</p>` : ''}
          <p class="text-xs text-slate-900 mb-2">${escapeHtml(q.questionText)}</p>
          <p class="text-xs"><span class="font-semibold text-slate-600">Student Answer:</span> ${(q.studentAnswer && q.studentAnswer.trim()) ? escapeHtml(q.studentAnswer) : '<em class="text-slate-400">Student not enter</em>'}</p>
          <p class="text-xs"><span class="font-semibold text-slate-600">Correct Answer:</span> ${escapeHtml(q.correctKey)}</p>
        </div>
      `;

      const groupsHtml = submissionGroups.map((group, groupIndex) => `
        <div class="border border-slate-200 rounded-xl bg-white/70 p-3 space-y-3">
          <div class="text-xs space-y-1.5">
            <p class="font-bold text-slate-800">Student ${groupIndex + 1}</p>
            <p><span class="font-semibold text-slate-600">Student:</span> ${escapeHtml(group.studentName)}</p>
            <p><span class="font-semibold text-slate-600">Quiz:</span> ${escapeHtml(group.quizTitle)}</p>
            ${group.quizCode ? `<p><span class="font-semibold text-slate-600">Quiz Code:</span> <span class="font-mono">${escapeHtml(group.quizCode)}</span></p>` : ''}
            ${group.currentScore || group.totalQuestions ? `<p><span class="font-semibold text-slate-600">Score:</span> ${escapeHtml(group.currentScore || '0')} / ${escapeHtml(group.totalQuestions || String(group.questions.length))}</p>` : ''}
          </div>
          <div class="pt-2 border-t border-slate-200">
            <h4 class="text-xs font-semibold text-slate-700 mb-2">Questions (${group.questions.length})</h4>
            <div class="space-y-2">
              ${group.questions.map(renderQuestionHtml).join('')}
            </div>
          </div>
        </div>
      `).join('');

      const canManualGrade = submissionGroups.length === 1;

      csvPlainPreview.innerHTML = `
        <div class="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="file-text" class="w-4 h-4"></i>
            Plain Text Preview
          </h3>
          <div class="pt-2 border-t border-slate-200">
            <h4 class="text-xs font-semibold text-slate-700 mb-2">${submissionGroups.length === 1 ? `Questions (${firstGroup.questions.length})` : `Submissions (${submissionGroups.length})`}</h4>
            <div class="space-y-3 max-h-64 overflow-y-auto">
              ${groupsHtml}
            </div>
          </div>
          ${canManualGrade ? `
            <div class="pt-2 border-t border-slate-200">
              <label class="text-xs font-semibold text-slate-700 block mb-1.5">Enter Grades (question number + grade, e.g., "2 C, 4 5"):</label>
              <textarea id="manualMarksGiven" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y" placeholder="2 C&#10;4 5"></textarea>
            </div>
          ` : ''}
        </div>
      `;
      window.lucide.createIcons();
      btnSubmitCsvGrade.disabled = !canManualGrade;
    } catch (err) {
      console.error('Error parsing CSV:', err);
      window.showToast('Error parsing CSV: ' + err.message, 'error');
    }
  });

  // Submit CSV Grade Button Handler
  btnSubmitCsvGrade.addEventListener('click', async () => {
    if (!currentCsvData) {
      window.showToast('Please view the CSV first', 'warning');
      return;
    }

    const marksInput = document.getElementById('manualMarksGiven');
    const gradesStr = marksInput ? marksInput.value.trim() : '';

    let gradeEntries;
    try {
      gradeEntries = parseManualGradeEntries(gradesStr, currentCsvData.questions.length);
    } catch (err) {
      window.showToast(err.message, 'warning');
      return;
    }

    if (gradeEntries.size === 0) {
      window.showToast('Please enter at least one grade, e.g., "2 C" or "4 5"', 'warning');
      return;
    }

    for (const [questionIndex, gradeRaw] of gradeEntries.entries()) {
      const mark = manualGradeToMark(gradeRaw, currentCsvData.questions[questionIndex]);
      if (mark === null || isNaN(mark) || mark < 0 || mark > 5) {
        window.showToast(`Grade for question ${questionIndex + 1} must be a number from 0 to 5 or an alphabet`, 'warning');
        return;
      }
    }

    const originalText = btnSubmitCsvGrade.textContent;
    btnSubmitCsvGrade.disabled = true;
    btnSubmitCsvGrade.textContent = 'Saving...';

    try {
      const resultRow = await fetchResultRow(currentCsvData.submissionId);
      const quizId = resultRow?.quiz_id || null;
      const resolvedStudentName = resultRow?.student_name || currentCsvData.studentName;
      const existingResponses = quizId
        ? await fetchStudentResponses(currentCsvData.submissionId, quizId, resolvedStudentName)
        : [];

      const responseMap = new Map();
      existingResponses.forEach((resp, idx) => {
        if (!resp.question_text) return;
        const qText = resp.question_text.trim().toLowerCase();
        if (!responseMap.has(qText)) {
          responseMap.set(qText, []);
        }
        responseMap.get(qText).push({ id: resp.id, index: idx, response: resp });
      });

      for (const [questionIndex, gradeRaw] of gradeEntries.entries()) {
        const q = currentCsvData.questions[questionIndex];
        const marksToAssign = manualGradeToMark(gradeRaw, q);
        const gradeNote = `Manual grade: ${gradeRaw}`;

        const qTextKey = (q.questionText || '').trim().toLowerCase();
        const responsesForQ = responseMap.get(qTextKey) || [];
        const responseId = responsesForQ[0]?.id || null;

        if (responseId) {
          const { error: updateRespError } = await window.supabaseClient
            .from('student_responses')
            .update({ marks_assigned: marksToAssign, ai_reasoning: gradeNote })
            .eq('id', responseId);

          if (updateRespError) throw updateRespError;
        } else if (quizId) {
          const { error: insertRespError } = await window.supabaseClient
            .from('student_responses')
            .insert({
              quiz_id: quizId,
              student_result_id: currentCsvData.submissionId,
              student_name: resolvedStudentName,
              question_text: q.questionText || '',
              question_bank_id: null,
              student_answer: q.studentAnswer || '',
              question_type: 'Manual',
              marks_assigned: marksToAssign,
              ai_reasoning: gradeNote,
            });

          if (insertRespError) throw insertRespError;
        }
      }

      const correctedCount = calculateManualScore(currentCsvData.questions, gradeEntries);
      const manualSnapshot = Array.isArray(resultRow?.response_snapshot) ? [...resultRow.response_snapshot] : [];
      await executeGradingUpdate(currentCsvData.submissionId, correctedCount, manualSnapshot, []);

      // Success!
      window.showToast(`Successfully updated marks for ${currentCsvData.studentName}!`, 'success');

      // Clear UI
      manualCsvInput.value = '';
      csvPlainPreview.innerHTML = '';
      btnSubmitCsvGrade.disabled = true;
      currentCsvData = null;

      // Reload data to update UI
      loadReportData();
    } catch (err) {
      console.error('Error updating grade:', err);
      window.showToast(err.message || 'Failed to update grade', 'error');
    } finally {
      btnSubmitCsvGrade.textContent = originalText;
      btnSubmitCsvGrade.disabled = false;
    }
  });

  async function executeGradingUpdate(submissionId, expectedScore, updatedSnapshot = [], studentResponses = []) {
    const cleanId = String(submissionId || '').trim();
    if (!cleanId) {
      throw new Error('Missing submission ID for grading update.');
    }

    if (!window.supabaseClient) {
      throw new Error('Supabase client is not initialized.');
    }

    // G. Execute UPDATE on student_results
    const updatePayload = { score: expectedScore };
    if (updatedSnapshot && updatedSnapshot.length > 0) {
      updatePayload.response_snapshot = updatedSnapshot;
    }

    let { error: updateError } = await window.supabaseClient
      .from('student_results')
      .update(updatePayload)
      .eq('id', cleanId);

    if (updateError && isMissingSchemaItem(updateError, 'response_snapshot')) {
      ({ error: updateError } = await window.supabaseClient
        .from('student_results')
        .update({ score: expectedScore })
        .eq('id', cleanId));
    }

    // Step H: Immediately re-query database row
    const afterClientRow = await fetchResultRow(cleanId);
    let persistedScore = afterClientRow ? Number(afterClientRow.score) : null;

    // If client update failed or was silently rejected by RLS (0 rows updated), trigger server fallback
    if (updateError || persistedScore !== Number(expectedScore)) {
      console.warn(`Client update error/mismatch (expected ${expectedScore}, found ${persistedScore}). Invoking backend fallback API...`, updateError);

      const session = (await window.supabaseClient.auth.getSession())?.data?.session;
      const token = session?.access_token;

      if (!token) {
        throw new Error('Authentication required: Please sign in again.');
      }

      const response = await fetch('/api/teacher/grade-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-supabase-url': window.SUPABASE_URL || '',
          'x-supabase-key': window.SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({
          submissionId: cleanId,
          score: expectedScore,
          responseSnapshot: updatedSnapshot,
          studentResponses: studentResponses
        })
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `Server update failed with status ${response.status}`);
      }
    }

    // Step I: Fetch result row after update/fallback
    const finalRow = await fetchResultRow(cleanId);
    if (!finalRow || Number(finalRow.score) !== Number(expectedScore)) {
      throw new Error(`Score persistence verification failed. Database returned ${finalRow?.score ?? 'null'}, expected ${expectedScore}.`);
    }

    // Step J: Synchronize local in-memory dataset
    const localResult = results.find((r) => String(r.id) === cleanId);
    if (localResult) {
      localResult.score = expectedScore;
      if (updatedSnapshot && updatedSnapshot.length > 0) {
        localResult.response_snapshot = updatedSnapshot;
      }
    }

    // Step K: Update dashboard metrics and re-render table
    updateMetrics(getCurrentlyFilteredResults());
    renderTable(getCurrentlyFilteredResults());

    return finalRow;
  }

  function parseManualGradeEntries(input, questionCount) {
    const entries = new Map();
    const raw = String(input || '').trim();
    if (!raw) return entries;

    const parts = raw
      .split(/[\n,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    parts.forEach((part) => {
      const match = part.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        throw new Error('Use question number then grade, e.g., "2 C" or "4 5"');
      }

      const questionNumber = parseInt(match[1], 10);
      const grade = match[2].trim();

      if (!questionNumber || questionNumber < 1 || questionNumber > questionCount) {
        throw new Error(`Question number must be between 1 and ${questionCount}`);
      }
      if (!grade) {
        throw new Error(`Missing grade for question ${questionNumber}`);
      }

      entries.set(questionNumber - 1, grade);
    });

    return entries;
  }

  function getLeadingAnswerLetter(value) {
    const match = String(value || '').trim().match(/^([A-D])(?:\b|[.)\s])/i);
    return match ? match[1].toUpperCase() : '';
  }

  function isCsvQuestionCorrect(question) {
    const studentAnswer = String(question.studentAnswer || '').trim();
    const correctAnswer = String(question.correctKey || '').trim();
    if (!studentAnswer || !correctAnswer) return false;

    const studentLetter = getLeadingAnswerLetter(studentAnswer);
    const correctLetter = getLeadingAnswerLetter(correctAnswer);
    if (studentLetter && correctLetter) {
      return studentLetter === correctLetter;
    }

    return studentAnswer.toLowerCase() === correctAnswer.toLowerCase();
  }

  function calculateManualScore(questions, gradeEntries) {
    return questions.reduce((score, question, index) => {
      if (gradeEntries.has(index)) {
        return score + (manualGradeToMark(gradeEntries.get(index), question) > 0 ? 1 : 0);
      }
      return score + (isCsvQuestionCorrect(question) ? 1 : 0);
    }, 0);
  }
  function manualGradeToMark(rawGrade, question) {
    const value = String(rawGrade || '').trim();
    if (!value) return null;

    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    const gradeLetter = value[0].toUpperCase();
    const correctLetter = String(question.correctKey || '').trim().match(/^([A-D])\b/i)?.[1]?.toUpperCase();
    if (correctLetter) {
      return gradeLetter === correctLetter ? 1 : 0;
    }

    return 1;
  }
  // Helper to parse CSV line (handles quotes)
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // AI Grading Logic
  let aiGradesData = [];
  let aiGradesPreviewSource = '';
  async function getAiGradeReviewDetails(submissionId) {
    const result = results.find((item) => String(item.id) === String(submissionId));
    if (!result) return null;

    const questionRows = await buildDetailedCsvRowsForResult(result);
    if (questionRows.length === 0) return null;

    const firstRow = questionRows[0];
    return {
      studentName: firstRow[2] || result.student_name || '',
      quizTitle: firstRow[3] || result.quizzes?.title || '',
      quizCode: firstRow[1] || result.quizzes?.access_code || '',
      totalQuestions: firstRow[6] || questionRows.length,
      questions: questionRows.map((questionRow) => ({
        questionIndex: questionRow[8],
        questionType: questionRow[9],
        questionText: questionRow[10],
        studentAnswer: questionRow[11],
        correctKey: questionRow[12],
        assignedMarks: questionRow[13]
      }))
    };
  }

  function getAiProposedMark(aiReasoning, questionIndex, questionType) {
    if (String(questionType || '').toUpperCase() === 'MCQ') return '';

    const index = Number(questionIndex);
    if (!Number.isInteger(index) || index < 1) return '';

    const entryMatch = String(aiReasoning || '').match(
      new RegExp(`(?:FIB|SHORT_ANSWER)?\\s*Q${index}\\s*:\\s*([^;]+)`, 'i')
    );
    const markMatch = entryMatch?.[1]?.match(/(?:\(\s*)?([0-9.]+)\s*\/\s*([0-9.]+)(?:\s*\))?/);
    return markMatch ? `${markMatch[1]} / ${markMatch[2]}` : '';
  }

  function renderAiGradeReviewDetails(details, score, aiReasoning) {
    if (!details) {
      return `
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Question details could not be loaded for this submission. The proposed AI score can still be imported.
        </div>
      `;
    }

    const questionsHtml = details.questions.map((question) => {
      const hasAssignedMarks = question.assignedMarks !== '' && question.assignedMarks != null;
      const aiProposedMark = getAiProposedMark(aiReasoning, question.questionIndex, question.questionType);
      const isCorrect = isCsvQuestionCorrect(question);
      const qType = String(question.questionType || '').toUpperCase();

      // Determine color and status badge based on correctness and question type
      let studentBoxClass = 'rounded-md bg-emerald-50 p-2 border border-emerald-200';
      let studentTextClass = 'text-emerald-950';
      let studentLabelClass = 'text-emerald-800';
      let statusBadge = '';

      if (qType === 'MCQ') {
        if (isCorrect) {
          studentBoxClass = 'rounded-md bg-emerald-50 p-2 border border-emerald-200';
          studentTextClass = 'text-emerald-950';
          studentLabelClass = 'text-emerald-800';
          statusBadge = '<span class="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Correct (1 / 1)</span>';
        } else {
          studentBoxClass = 'rounded-md bg-rose-50 p-2 border border-rose-200';
          studentTextClass = 'text-rose-950';
          studentLabelClass = 'text-rose-800';
          statusBadge = '<span class="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">Incorrect (0 / 1)</span>';
        }
      } else if (aiProposedMark) {
        const markMatch = String(aiProposedMark).match(/^([0-9.]+)/);
        const earned = markMatch ? parseFloat(markMatch[1]) : null;
        if (earned !== null && !isNaN(earned)) {
          if (earned >= 1.0) {
            studentBoxClass = 'rounded-md bg-emerald-50 p-2 border border-emerald-200';
            studentTextClass = 'text-emerald-950';
            studentLabelClass = 'text-emerald-800';
            statusBadge = `<span class="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">AI: ${escapeHtml(aiProposedMark)}</span>`;
          } else if (earned > 0) {
            studentBoxClass = 'rounded-md bg-amber-50 p-2 border border-amber-200';
            studentTextClass = 'text-amber-950';
            studentLabelClass = 'text-amber-800';
            statusBadge = `<span class="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">AI (Partial): ${escapeHtml(aiProposedMark)}</span>`;
          } else {
            studentBoxClass = 'rounded-md bg-rose-50 p-2 border border-rose-200';
            studentTextClass = 'text-rose-950';
            studentLabelClass = 'text-rose-800';
            statusBadge = `<span class="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">AI (0 / 1): ${escapeHtml(aiProposedMark)}</span>`;
          }
        } else {
          statusBadge = `<span class="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">AI: ${escapeHtml(aiProposedMark)}</span>`;
        }
      }

      return `
        <div class="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold text-slate-800">Question ${escapeHtml(String(question.questionIndex || ''))}</p>
              <p class="mt-1 text-xs text-slate-700">${escapeHtml(question.questionText || '')}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <span class="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">${escapeHtml(question.questionType || '')}</span>
              ${statusBadge}
            </div>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="${studentBoxClass}">
              <p class="text-[10px] font-semibold uppercase tracking-wide ${studentLabelClass}">Student Answer</p>
              <p class="mt-1 text-xs ${studentTextClass}">${question.studentAnswer ? escapeHtml(question.studentAnswer) : '<em class="text-slate-400">No answer</em>'}</p>
            </div>
            <div class="rounded-md bg-sky-50 p-2 border border-sky-200">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-800">Correct Answer</p>
              <p class="mt-1 text-xs text-sky-950">${escapeHtml(question.correctKey || '')}</p>
            </div>
          </div>
          ${hasAssignedMarks ? `<p class="text-[11px] text-slate-500">Previous mark: ${escapeHtml(String(question.assignedMarks))}</p>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-3">
        <div class="space-y-2">
          ${questionsHtml}
        </div>
        ${aiReasoning ? `
          <details class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary class="cursor-pointer text-xs font-semibold text-slate-700">Show AI reasoning</summary>
            <p class="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">${escapeHtml(aiReasoning)}</p>
          </details>
        ` : ''}
      </div>
    `;
  }
  async function renderAiGradesReview(rows) {
    aiGradesData = rows;
    let valid = true;

    const reviewRows = await Promise.all(aiGradesData.map(async (row) => {
      const id = row['submission_id'] || row.submissionId || row['response_id'] || row.responseId || '';
      const score = row['score'] || row.Score || row['marks_assigned'] || row.marksAssigned || '';
      const aiReasoning = row['ai_reasoning'] || row.aiReasoning || '';

      if (!id || score === '') {
        valid = false;
      }

      let details = null;
      if (id) {
        try {
          details = await getAiGradeReviewDetails(id);
        } catch (err) {
          console.warn('Could not load AI grading review details:', err);
        }
      }

      return { id, score, aiReasoning, details };
    }));

    aiGradesReviewTable.innerHTML = reviewRows.map(({ id, score, aiReasoning, details }) => {
      const studentName = details?.studentName || 'Student not found';
      const quizTitle = details?.quizTitle || 'Quiz not found';
      const questionCount = details?.questions?.length || 0;
      const totalQuestions = details?.totalQuestions || questionCount || '?';

      // Compute true verified score: Actual MCQs + AI subjective marks
      let displayScore = score;
      if (details && Array.isArray(details.questions) && details.questions.length > 0) {
        let computedPreview = 0;
        details.questions.forEach((q) => {
          const qType = String(q.questionType || 'MCQ').toUpperCase();
          if (qType === 'MCQ') {
            if (isCsvQuestionCorrect(q)) computedPreview += 1;
          } else {
            const aiMarkStr = getAiProposedMark(aiReasoning, q.questionIndex, q.questionType);
            const numMatch = aiMarkStr ? aiMarkStr.match(/^([0-9.]+)/) : null;
            if (numMatch) {
              computedPreview += parseFloat(numMatch[1]);
            }
          }
        });
        displayScore = Math.round(computedPreview);
      }

      return `
        <details class="rounded-xl border border-slate-200 bg-white" open>
          <summary class="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-xs">
            <div class="min-w-0">
              <p class="font-semibold text-slate-900">${escapeHtml(studentName)} <span class="font-normal text-slate-500">• ${escapeHtml(quizTitle)}</span></p>
              <p class="mt-1 text-[11px] text-slate-500">${questionCount} question${questionCount === 1 ? '' : 's'} · ${escapeHtml(id)}</p>
            </div>
            <span class="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">AI: ${escapeHtml(String(displayScore))} / ${escapeHtml(String(totalQuestions))}</span>
          </summary>
          <div class="border-t border-slate-100 p-3">
            ${renderAiGradeReviewDetails(details, displayScore, aiReasoning)}
          </div>
        </details>
      `;
    }).join('');
    aiGradesReviewContainer.classList.remove('hidden');
    return valid;
  }
  function parseAiGradesCsv(rawText, onComplete, onError) {
    const csvText = extractAiGradesCsvSection(rawText);
    if (!csvText) {
      onComplete([]);
      return;
    }
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => onComplete(results.data || []),
      error: onError
    });
  }

  btnViewAiGrades.addEventListener('click', () => {
    const rawText = aiGradesPasteInput.value.trim();
    if (!rawText) {
      window.showToast('Please paste the graded CSV first', 'warning');
      return;
    }

    aiGradesPreviewSource = '';

    parseAiGradesCsv(
      rawText,
      async (rows) => {
        if (rows.length === 0) {
          window.showToast('Paste the AI returned CSV only: submission_id,score,ai_reasoning', 'warning');
          return;
        }
        const valid = await renderAiGradesReview(rows);
        aiGradesPreviewSource = valid ? rawText : '';
        window.showToast(valid ? 'AI grading preview ready' : 'Some AI grading rows are missing required fields', valid ? 'success' : 'warning');
      },
      (err) => {
        console.error('CSV Parsing Error:', err);
        window.showToast('Error parsing pasted CSV input', 'error');
      }
    );
  });


  btnImportAiGrades.addEventListener('click', () => {
    const rawText = aiGradesPasteInput.value.trim();
    if (!rawText) {
      window.showToast('Please paste the graded CSV first', 'warning');
      return;
    }

    if (aiGradesPreviewSource !== rawText) {
      window.showToast('Click View AI Grades and review the details before importing.', 'warning');
      return;
    }
    btnImportAiGrades.disabled = true;
    const originalText = btnImportAiGrades.textContent;
    btnImportAiGrades.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Parsing...';
    window.lucide.createIcons();

    // PapaParse the pasted CSV text
    const aiCsvText = extractAiGradesCsvSection(rawText);
    if (!aiCsvText) {
      window.showToast('Paste the AI returned CSV only: submission_id,score,ai_reasoning', 'warning');
      resetAiButton(originalText);
      return;
    }

    Papa.parse(aiCsvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: async (results) => {
        aiGradesData = results.data || [];
        if (aiGradesData.length === 0) {
          window.showToast('Paste the AI returned CSV only: submission_id,score,ai_reasoning', 'warning');
          resetAiButton(originalText);
          return;
        }

        const valid = await renderAiGradesReview(aiGradesData);
        if (!valid) {
          window.showToast('Some rows are missing required fields', 'warning');
          resetAiButton(originalText);
          return;
        }

        await processAiGrades();
      },
      error: (err) => {
        console.error('CSV Parsing Error:', err);
        window.showToast('Error parsing pasted CSV input', 'error');
        resetAiButton(originalText);
      }
    });

    function resetAiButton(text) {
      btnImportAiGrades.innerHTML = text;
      btnImportAiGrades.disabled = false;
      btnImportAiGrades.onclick = null;
      btnImportAiGrades.addEventListener('click', initialAiGradesClick);
    }
  });

  // Initial click handler (to be restored after processing)
  function initialAiGradesClick() {
    // This is just to hold the initial click logic
  }

  async function processAiGrades() {
    btnImportAiGrades.disabled = true;
    btnImportAiGrades.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Updating Grades...';
    window.lucide.createIcons();

    try {
      const validGrades = [];
      const errors = [];

      aiGradesData.forEach((row, idx) => {
        const rowNum = idx + 2;
        const submissionId = (row['submission_id'] || row.submissionId || '').trim();
        const scoreRaw = row['score'] || row.Score || row.marks_assigned || row.marksAssigned;
        const aiReasoning = (row['ai_reasoning'] || row.aiReasoning || '').trim();

        if (!submissionId || scoreRaw === undefined || scoreRaw === null) {
          errors.push(`Row ${rowNum}: Missing submission_id or score`);
          return;
        }

        const score = parseInt(scoreRaw, 10);
        if (isNaN(score)) {
          errors.push(`Row ${rowNum}: Invalid score (must be a number)`);
          return;
        }

        validGrades.push({ id: submissionId, score: score, ai_reasoning: aiReasoning });
      });

      if (errors.length > 0) {
        window.showToast(`CSV Validation Failed: ${errors[0]}`, 'error');
        throw new Error('Validation failed');
      }

      const computedScoresMap = new Map();

      // Perform bulk update with question-level responses and score
      const updatePromises = validGrades.map(async (grade) => {
        const submissionId = grade.id;
        const resultRow = results.find((r) => String(r.id) === String(submissionId));
        const quizId = resultRow?.quiz_id || resultRow?.quizzes?.id;
        const studentResponsesList = [];
        const updatedSnapshot = Array.isArray(resultRow?.response_snapshot) ? [...resultRow.response_snapshot] : [];
        let computedTotalScore = grade.score;

        if (quizId) {
          computedTotalScore = 0;
          const resolvedStudentName = resultRow?.student_name || 'Unknown Student';

          // Fetch student_responses for this submission or quiz
          let { data: existingResponses } = await window.supabaseClient
            .from('student_responses')
            .select('*')
            .eq('student_result_id', submissionId);

          if ((!existingResponses || existingResponses.length === 0) && quizId && resolvedStudentName) {
            const fallbackResp = await window.supabaseClient
              .from('student_responses')
              .select('*')
              .eq('quiz_id', quizId)
              .eq('student_name', resolvedStudentName);
            existingResponses = fallbackResp.data;
          }

          const responseMap = new Map();
          (existingResponses || []).forEach((resp) => {
            const key = (resp.question_text || '').trim().toLowerCase();
            if (key && !responseMap.has(key)) {
              responseMap.set(key, resp);
            }
          });

          // Fetch quiz questions
          const { data: quizQuestions } = await window.supabaseClient
            .from('quiz_questions')
            .select('*, question_bank(*)')
            .eq('quiz_id', quizId);

          const questions = (quizQuestions || []).map((qq) => qq.question_bank).filter(Boolean);
          const uniqueQList = [];
          const seenQIds = new Set();
          for (const q of questions) {
            if (q && q.id && !seenQIds.has(q.id)) {
              seenQIds.add(q.id);
              uniqueQList.push(q);
            }
          }

          for (let i = 0; i < uniqueQList.length; i++) {
            const q = uniqueQList[i];
            const qIndex = i + 1;
            const qType = String(q.type || 'MCQ').toUpperCase();
            const proposedMarkStr = getAiProposedMark(grade.ai_reasoning, qIndex, qType);

            const qTextKey = (q.question_text || '').trim().toLowerCase();
            const existingResp = responseMap.get(qTextKey);

            let snapItem = updatedSnapshot.find(s =>
              (s.question_text || '').trim().toLowerCase() === qTextKey ||
              (s.question_bank_id && q.id && String(s.question_bank_id) === String(q.id))
            );

            const studentAns = existingResp?.student_answer || snapItem?.student_answer || '';
            const isCorrectMcq = isCsvQuestionCorrect({ studentAnswer: studentAns, correctKey: q.correct_option });

            let marksToAssign = null;
            let reasoningToAssign = null;

            if (qType === 'MCQ') {
              marksToAssign = isCorrectMcq ? 1 : 0;
              reasoningToAssign = isCorrectMcq ? 'Correct MCQ answer' : 'Incorrect MCQ answer';
              computedTotalScore += marksToAssign;
            } else if (proposedMarkStr) {
              const numMatch = proposedMarkStr.match(/^([0-9.]+)/);
              if (numMatch) marksToAssign = parseFloat(numMatch[1]);
              reasoningToAssign = grade.ai_reasoning || null;
              computedTotalScore += (marksToAssign || 0);
            } else {
              marksToAssign = 0;
              reasoningToAssign = grade.ai_reasoning || null;
            }

            if (!snapItem) {
              snapItem = {
                quiz_id: quizId,
                student_result_id: submissionId,
                student_name: resolvedStudentName,
                question_text: q.question_text || '',
                question_bank_id: q.id,
                student_answer: studentAns,
                question_type: qType,
                question_order: qIndex,
                marks_assigned: marksToAssign,
                ai_reasoning: reasoningToAssign,
              };
              updatedSnapshot.push(snapItem);
            } else {
              snapItem.marks_assigned = marksToAssign;
              snapItem.ai_reasoning = reasoningToAssign;
            }

            if (existingResp) {
              await window.supabaseClient
                .from('student_responses')
                .update({
                  student_result_id: submissionId,
                  marks_assigned: marksToAssign,
                  ai_reasoning: reasoningToAssign
                })
                .eq('id', existingResp.id);
            } else if (marksToAssign !== null) {
              await window.supabaseClient
                .from('student_responses')
                .insert({
                  quiz_id: quizId,
                  student_result_id: submissionId,
                  student_name: resolvedStudentName,
                  question_text: q.question_text || '',
                  question_bank_id: q.id,
                  student_answer: studentAns,
                  question_type: qType,
                  marks_assigned: marksToAssign,
                  ai_reasoning: reasoningToAssign
                });
            }

            studentResponsesList.push({
              id: existingResp?.id || null,
              question_text: q.question_text || '',
              question_bank_id: q.id || null,
              student_answer: studentAns,
              question_type: qType,
              marks_assigned: marksToAssign,
              ai_reasoning: reasoningToAssign
            });
          }
        }

        // Use rounded computed score from actual verified MCQs + AI marks
        const finalScoreToSave = Math.round(computedTotalScore);
        computedScoresMap.set(submissionId, finalScoreToSave);
        await executeGradingUpdate(submissionId, finalScoreToSave, updatedSnapshot, studentResponsesList);
      });

      await Promise.all(updatePromises);

      // Immediately synchronize local in-memory dataset & re-render table before and during reload
      validGrades.forEach((grade) => {
        const localRes = results.find((r) => String(r.id) === String(grade.id));
        if (localRes) {
          localRes.score = computedScoresMap.get(grade.id) ?? grade.score;
        }
      });
      updateMetrics(getCurrentlyFilteredResults());
      renderTable(getCurrentlyFilteredResults());

      window.showToast(`Successfully imported ${validGrades.length} grades!`, 'success');

      // Reset everything
      aiGradesPasteInput.value = '';
      aiGradesReviewContainer.classList.add('hidden');
      aiGradesReviewTable.innerHTML = '';
      aiGradesData = [];
      aiGradesPreviewSource = '';

      btnImportAiGrades.innerHTML = '<i data-lucide="upload-cloud" class="w-4 h-4"></i> Import AI Grades (CSV)';
      btnImportAiGrades.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
      btnImportAiGrades.classList.add('bg-purple-600', 'hover:bg-purple-700');
      btnImportAiGrades.disabled = false;

      // Reload fresh data from database to ensure complete synchronization
      await loadReportData();
    } catch (err) {
      console.error('Error updating AI grades:', err);
      window.showToast(err.message || 'Failed to update grades', 'error');

      // Reset button
      btnImportAiGrades.innerHTML = '<i data-lucide="upload-cloud" class="w-4 h-4"></i> Import AI Grades (CSV)';
      btnImportAiGrades.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
      btnImportAiGrades.classList.add('bg-purple-600', 'hover:bg-purple-700');
      btnImportAiGrades.disabled = false;
    }
  }

  // Also handle clicks in student history modal
  studentHistoryModal.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-csv-btn');
    if (btn) {
      await handleCopyCsv(btn);
    }
  });

  // Handle copying CSV for a submission
  async function handleCopyCsv(btn) {
    const submissionId = btn.dataset.submissionId;
    const result = results.find((r) => String(r.id) === String(submissionId));
    const studentName = btn.dataset.studentName || result?.student_name || '';

    const originalText = btn.textContent;
    btn.textContent = 'Fetching...';
    btn.disabled = true;

    try {
      if (!result) {
        window.showToast('Result not found', 'warning');
        return;
      }

      const csvContent = await buildDetailedCsvTextForResults([result], true);
      await navigator.clipboard.writeText(csvContent);
      window.showToast(`Detailed AI CSV prompt for ${studentName} copied!`, 'success');
    } catch (err) {
      console.error('Error copying CSV:', err);
      window.showToast(err.message || 'Failed to copy CSV', 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }



  // Run initialization
  loadReportData();
});
