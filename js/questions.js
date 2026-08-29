// js/questions.js
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  const user = await window.checkAuth();
  if (!user) return;
  window.renderHeader(user);

  let questions = [];
  const initialTagFilter = new URLSearchParams(window.location.search).get('tag');
  let selectedTagFilter = initialTagFilter || 'all';
  let selectedTypeFilter = 'all';

  const questionsList = document.getElementById('questions-list');
  const questionsSummary = document.getElementById('questions-summary');
  const tagFilter = document.getElementById('tag-filter');
  const typeFilter = document.getElementById('type-filter');

  const toggleAddFormBtn = document.getElementById('toggle-add-form');
  const toggleIcon = document.getElementById('toggle-icon');
  const toggleText = document.getElementById('toggle-text');
  const addFormPanel = document.getElementById('add-form-panel');

  const manualForm = document.getElementById('manual-question-form');
  const cancelFormBtn = document.getElementById('cancel-form-btn');
  const submitQuestionBtn = document.getElementById('submit-question-btn');

  const csvFileInput = document.getElementById('csv-file-input');
  const importCsvBtn = document.getElementById('import-csv-btn');
  const csvPasteInput = document.getElementById('csvPasteInput');
  const csvPasteHighlight = document.getElementById('csvPasteHighlight');
  const csvPasteLineNumbers = document.getElementById('csvPasteLineNumbers');
  const toggleModeFile = document.getElementById('toggle-mode-file');
  const toggleModePaste = document.getElementById('toggle-mode-paste');
  const wrapperFileInput = document.getElementById('wrapper-file-input');
  const wrapperPasteInput = document.getElementById('wrapper-paste-input');
  const importBtnText = document.getElementById('import-btn-text');
  const copyAiPromptBtn = document.getElementById('copy-ai-prompt-btn');

  const questionTypeSelect = document.getElementById('question-type');
  const mcqFieldsContainer = document.getElementById('mcq-fields-container');
  const textAnswerFieldsContainer = document.getElementById('text-answer-fields-container');
  const correctTextAnswer = document.getElementById('correct-text-answer');

  function updateQuestionTypeUI() {
    const qType = questionTypeSelect ? questionTypeSelect.value : 'MCQ';
    const isMCQ = qType === 'MCQ';

    if (mcqFieldsContainer) {
      if (isMCQ) {
        mcqFieldsContainer.classList.remove('hidden');
      } else {
        mcqFieldsContainer.classList.add('hidden');
      }
    }

    if (textAnswerFieldsContainer) {
      if (isMCQ) {
        textAnswerFieldsContainer.classList.add('hidden');
      } else {
        textAnswerFieldsContainer.classList.remove('hidden');
      }
    }

    const optA = document.getElementById('option-a');
    const optB = document.getElementById('option-b');
    const optC = document.getElementById('option-c');
    const optD = document.getElementById('option-d');
    if (optA) optA.required = isMCQ;
    if (optB) optB.required = isMCQ;
    if (optC) optC.required = isMCQ;
    if (optD) optD.required = isMCQ;
    if (correctTextAnswer) correctTextAnswer.required = !isMCQ;
  }

  if (questionTypeSelect) {
    questionTypeSelect.addEventListener('change', updateQuestionTypeUI);
    updateQuestionTypeUI();
  }

  // Toggle form panel
  let showForm = false;
  function toggleForm(forceState) {
    showForm = forceState !== undefined ? forceState : !showForm;
    if (showForm) {
      addFormPanel.classList.remove('hidden');
      toggleText.textContent = 'Hide Form';
      toggleIcon.setAttribute('data-lucide', 'x');
      updateQuestionTypeUI();
    } else {
      addFormPanel.classList.add('hidden');
      toggleText.textContent = 'Add Question';
      toggleIcon.setAttribute('data-lucide', 'plus');
      manualForm.reset();
      if (questionTypeSelect) questionTypeSelect.value = 'MCQ';
      updateQuestionTypeUI();
      csvFileInput.value = '';
      csvPasteInput.value = '';
      renderCsvPasteEditor();
      setImportMode('file');
    }
    window.lucide.createIcons();
  }

  let importMode = 'file';
  function setImportMode(mode) {
    importMode = mode;
    if (mode === 'file') {
      toggleModeFile.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
      toggleModeFile.classList.remove('text-slate-600', 'hover:text-slate-900');
      toggleModePaste.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
      toggleModePaste.classList.add('text-slate-600', 'hover:text-slate-900');
      
      wrapperFileInput.classList.remove('hidden');
      wrapperPasteInput.classList.add('hidden');
      
      importBtnText.textContent = 'Process and Import File';
    } else {
      toggleModePaste.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
      toggleModePaste.classList.remove('text-slate-600', 'hover:text-slate-900');
      toggleModeFile.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
      toggleModeFile.classList.add('text-slate-600', 'hover:text-slate-900');
      
      wrapperPasteInput.classList.remove('hidden');
      wrapperFileInput.classList.add('hidden');
      
      importBtnText.textContent = 'Process and Import Text Block';
    }
  }

  toggleModeFile.addEventListener('click', () => setImportMode('file'));
  toggleModePaste.addEventListener('click', () => setImportMode('paste'));

  // Copy AI Prompt feature
  if (copyAiPromptBtn) {
    copyAiPromptBtn.addEventListener('click', async () => {
      const promptText = `Act as an expert school teacher. Create a 5-question quiz for [Class/Subject] on the topic "[Topic]". 

Output ONLY a raw CSV block. Do not include markdown brackets (\`\`\`) or any introductory text.

Use these exact headers in the first row:
type,question,option1,option2,option3,option4,correct_option,subject

Rules:
1. 'type' can be: MCQ, FIB, or Short Answer.
2. For MCQ: Fill in option1 to option4. 'correct_option' must be A, B, C, or D.
3. For FIB & Short Answer: Leave option1, option2, option3, and option4 completely blank. Put the actual text answer inside 'correct_option'.`;

      try {
        await navigator.clipboard.writeText(promptText);
        
        // Visual feedback
        const originalHtml = copyAiPromptBtn.innerHTML;
        copyAiPromptBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Copied!';
        copyAiPromptBtn.classList.remove('bg-blue-50', 'text-blue-600', 'hover:bg-blue-100');
        copyAiPromptBtn.classList.add('bg-emerald-50', 'text-emerald-600', 'hover:bg-emerald-100');
        window.lucide.createIcons();

        setTimeout(() => {
          copyAiPromptBtn.innerHTML = originalHtml;
          copyAiPromptBtn.classList.remove('bg-emerald-50', 'text-emerald-600', 'hover:bg-emerald-100');
          copyAiPromptBtn.classList.add('bg-blue-50', 'text-blue-600', 'hover:bg-blue-100');
          window.lucide.createIcons();
        }, 2000);
      } catch (err) {
        console.error('Failed to copy prompt:', err);
        window.showToast('Failed to copy prompt to clipboard', 'error');
      }
    });
  }

  toggleAddFormBtn.addEventListener('click', () => toggleForm());
  cancelFormBtn.addEventListener('click', () => toggleForm(false));

  // Fetch Questions
  async function fetchQuestions() {
    try {
      questionsList.innerHTML = `
        <div class="py-16 flex justify-center items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
      window.showToast(err.message || 'Failed to load question bank', 'error');
    }
  }

  // Populate/Update Tag dropdown filter
  function updateTagDropdown() {
    const tags = new Set();
    questions.forEach((q) => {
      if (q.syllabus_tag) tags.add(q.syllabus_tag);
    });

    const sortedTags = Array.from(tags).sort();
    
    // Clear and keep "all" option
    tagFilter.innerHTML = '<option value="all">All Syllabus Tags</option>';
    sortedTags.forEach((tag) => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      if (tag === selectedTagFilter) {
        option.selected = true;
      }
      tagFilter.appendChild(option);
    });
  }

  // Render questions
  function renderQuestions() {
    const filtered = questions.filter((q) => {
      const matchesTag = selectedTagFilter === 'all' || q.syllabus_tag === selectedTagFilter;
      const matchesType = selectedTypeFilter === 'all' || normalizeQuestionType(q.type) === selectedTypeFilter;
      return matchesTag && matchesType;
    });

    // Summary text
    questionsSummary.textContent = getQuestionsSummary(filtered.length);

    if (filtered.length === 0) {
      questionsList.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <i data-lucide="alert-circle" class="w-12 h-12 text-slate-400 mx-auto mb-3"></i>
          <h3 class="text-lg font-bold text-slate-900">No questions found</h3>
          <p class="text-slate-600 text-sm mt-1 mb-4">
            ${hasActiveFilters()
              ? `No questions match the selected ${getActiveFilterLabel()}.`
              : 'Your question bank is empty. Get started by adding a multiple-choice question.'}
          </p>
          ${!hasActiveFilters() ? `
            <button
              id="add-first-btn"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              Add Your First Question
            </button>
          ` : ''}
        </div>
      `;
      window.lucide.createIcons();
      const addFirstBtn = document.getElementById('add-first-btn');
      if (addFirstBtn) {
        addFirstBtn.addEventListener('click', () => toggleForm(true));
      }
      return;
    }

    let listHtml = '';
    filtered.forEach((q, idx) => {
      let optionsHtml = '';
      let correctAnswerHtml = '';

      if (q.type === 'MCQ') {
        // Show option grid for MCQ
        optionsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div class="p-3 rounded-xl border text-sm flex gap-2 ${(q.correct_option || '').toUpperCase() === 'A' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : 'border-slate-100 bg-slate-50/50 text-slate-700'}">
              <span class="font-bold text-slate-400">A.</span>
              <span class="formatted-content">${formatQuestionText(q.option_a)}</span>
            </div>
            <div class="p-3 rounded-xl border text-sm flex gap-2 ${(q.correct_option || '').toUpperCase() === 'B' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : 'border-slate-100 bg-slate-50/50 text-slate-700'}">
              <span class="font-bold text-slate-400">B.</span>
              <span class="formatted-content">${formatQuestionText(q.option_b)}</span>
            </div>
            <div class="p-3 rounded-xl border text-sm flex gap-2 ${(q.correct_option || '').toUpperCase() === 'C' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : 'border-slate-100 bg-slate-50/50 text-slate-700'}">
              <span class="font-bold text-slate-400">C.</span>
              <span class="formatted-content">${formatQuestionText(q.option_c)}</span>
            </div>
            <div class="p-3 rounded-xl border text-sm flex gap-2 ${(q.correct_option || '').toUpperCase() === 'D' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : 'border-slate-100 bg-slate-50/50 text-slate-700'}">
              <span class="font-bold text-slate-400">D.</span>
              <span class="formatted-content">${formatQuestionText(q.option_d)}</span>
            </div>
          </div>
        `;
        correctAnswerHtml = `
          <div class="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl w-fit">
            Correct Answer: Option ${(q.correct_option || '').toUpperCase()}
          </div>
        `;
      } else {
        // Show clean text answer for FIB/Short Answer
        correctAnswerHtml = `
          <div class="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl w-fit">
            🟢 Correct Answer: <span class="formatted-content">${formatQuestionText(q.correct_option || '')}</span>
          </div>
        `;
      }

      listHtml += `
        <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-slate-300 transition duration-150 relative animate-slide-up">
          <div class="flex justify-between items-start gap-4 mb-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                Question #${idx + 1}
              </span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                <i data-lucide="tag" class="w-3 h-3"></i>
                ${escapeHtml(q.syllabus_tag)}
              </span>
              <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                ${q.type || 'MCQ'}
              </span>
            </div>
            <button
              onclick="window.deleteQuestion('${q.id}')"
              class="text-slate-400 hover:text-rose-600 transition p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
              title="Delete Question"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

          <p class="text-slate-900 font-semibold mb-4 pr-8 formatted-content">${formatQuestionText(q.question_text)}</p>

          ${optionsHtml}

          ${correctAnswerHtml}
        </div>
      `;
    });

    questionsList.innerHTML = listHtml;
    window.lucide.createIcons();
  }

  // Handle filter dropdown changes
  tagFilter.addEventListener('change', () => {
    selectedTagFilter = tagFilter.value;
    renderQuestions();
  });

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      selectedTypeFilter = typeFilter.value;
      renderQuestions();
    });
  }

  // Manual Question creation
  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const qType = (questionTypeSelect ? questionTypeSelect.value : 'MCQ').trim();
    const syllabusTag = document.getElementById('syllabus-tag').value.trim();
    const questionText = document.getElementById('question-text').value.trim();

    if (!syllabusTag || !questionText) {
      window.showToast('Please fill out the syllabus tag and question text.', 'error');
      return;
    }

    let insertPayload = {
      teacher_id: user.id,
      type: qType,
      syllabus_tag: syllabusTag,
      question_text: questionText,
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_option: '',
    };

    if (qType === 'MCQ') {
      const optionA = document.getElementById('option-a').value.trim();
      const optionB = document.getElementById('option-b').value.trim();
      const optionC = document.getElementById('option-c').value.trim();
      const optionD = document.getElementById('option-d').value.trim();
      const correctOption = document.getElementById('correct-option').value;

      if (!optionA || !optionB || !optionC || !optionD) {
        window.showToast('Please fill out all 4 MCQ options.', 'error');
        return;
      }

      insertPayload.option_a = optionA;
      insertPayload.option_b = optionB;
      insertPayload.option_c = optionC;
      insertPayload.option_d = optionD;
      insertPayload.correct_option = correctOption;
    } else {
      const textAns = correctTextAnswer ? correctTextAnswer.value.trim() : '';
      if (!textAns) {
        window.showToast('Please provide the correct model answer.', 'error');
        return;
      }
      insertPayload.correct_option = textAns;
    }

    submitQuestionBtn.disabled = true;
    submitQuestionBtn.textContent = 'Saving...';

    try {
      const { error } = await window.supabaseClient.from('question_bank').insert(insertPayload);

      if (error) throw error;

      window.showToast(`${qType} question added successfully!`, 'success');
      toggleForm(false);
      fetchQuestions();
    } catch (err) {
      console.error('Error saving question:', err);
      window.showToast(err.message || 'Failed to add question', 'error');
    } finally {
      submitQuestionBtn.disabled = false;
      submitQuestionBtn.textContent = 'Save Question';
    }
  });

  // Delete Question handler
  window.deleteQuestion = async (id) => {
    if (!confirm('Are you sure you want to delete this question? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await window.supabaseClient
        .from('question_bank')
        .delete()
        .eq('id', id)
        .eq('teacher_id', user.id);

      if (error) throw error;

      window.showToast('Question deleted successfully', 'success');
      // Update local state and redraw
      questions = questions.filter((q) => q.id !== id);
      updateTagDropdown();
      renderQuestions();
    } catch (err) {
      console.error('Error deleting question:', err);
      window.showToast(err.message || 'Failed to delete question', 'error');
    }
  };

  // Consolidated CSV Ingestion Process
  async function processCSVData(parsedData, sourceName) {
    if (!parsedData || parsedData.length === 0) {
      window.showToast(`No data found in ${sourceName}.`, 'error');
      return;
    }

    // Filter out rows that are completely empty (PapaParse sometimes adds ghost rows)
    const dataRows = parsedData.filter(row => {
      const question = (row.question || row.question_text || '').trim();
      const correct = (row.correct_option || row['correct_option '] || '').trim();
      return question !== '' && correct !== '';
    });

    if (dataRows.length === 0) {
      window.showToast('No valid rows found. Make sure question and correct_option columns are filled.', 'error');
      return;
    }

    const recordsToInsert = dataRows.map(row => {
      const rawType = (row.type || '').trim().toUpperCase() || 'MCQ';

      let qType = 'MCQ';
      if (rawType === 'FIB' || rawType === 'FILL IN THE BLANK') {
        qType = 'FIB';
      } else if (rawType === 'SHORT ANSWER' || rawType === 'SA' || rawType === 'SHORTANSWER') {
        qType = 'Short Answer';
      }

      const isMCQ = (qType === 'MCQ');

      return {
        teacher_id: user.id,
        type: qType,
        question_text: (row.question || row.question_text || '').trim(),
        option_a: (row.option1 || '').trim(),
        option_b: (row.option2 || '').trim(),
        option_c: (row.option3 || '').trim(),
        option_d: (row.option4 || '').trim(),
        correct_option: (row.correct_option || row['correct_option '] || '').trim(),
        syllabus_tag: (row.subject || row.syllabus_tag || 'General').trim()
      };
    });

    // Basic validation pass: MCQ must have A/B/C/D, all rows must have question + correct_option
    const errors = [];
    recordsToInsert.forEach((rec, idx) => {
      const rowNum = idx + 2;
      if (!rec.question_text) {
        errors.push(`Row ${rowNum}: Missing question text.`);
      }
      if (!rec.correct_option) {
        errors.push(`Row ${rowNum}: Missing correct_option.`);
      }
      if (rec.type === 'MCQ') {
        const co = rec.correct_option.toUpperCase();
        if (co !== 'A' && co !== 'B' && co !== 'C' && co !== 'D') {
          errors.push(`Row ${rowNum}: MCQ correct_option must be A, B, C, or D (got "${rec.correct_option}").`);
        }
      }
    });

    if (errors.length > 0) {
      alert(`CSV Validation Failed:\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n...and more' : ''}`);
      window.showToast('Failed to validate CSV structure.', 'error');
      return;
    }

    try {
      const { error } = await window.supabaseClient
        .from('question_bank')
        .insert(recordsToInsert);

      if (error) throw error;

      alert(`Successfully imported ${recordsToInsert.length} questions!`);
      window.showToast(`Successfully imported ${recordsToInsert.length} questions!`, 'success');

      // Reset inputs
      csvFileInput.value = '';
      csvPasteInput.value = '';
      renderCsvPasteEditor();
      toggleForm(false);
      fetchQuestions();
    } catch (err) {
      console.error('Error bulk importing questions:', err);
      alert(err.message || 'Failed to import CSV questions.');
      window.showToast(err.message || 'Failed to import CSV questions.', 'error');
    }
  }

  // Unified Import Button Click Listener
  importCsvBtn.addEventListener('click', () => {
    if (importMode === 'file') {
      const file = csvFileInput.files[0];
      if (!file) {
        window.showToast('Please select a CSV file first.', 'error');
        return;
      }

      importCsvBtn.disabled = true;
      const originalHtml = importCsvBtn.innerHTML;
      importCsvBtn.textContent = 'Parsing...';

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: async (results) => {
          await processCSVData(results.data, file.name);
          resetImportBtn(originalHtml);
        },
        error: (err) => {
          console.error('CSV Parsing Error:', err);
          window.showToast('Error parsing CSV file.', 'error');
          resetImportBtn(originalHtml);
        }
      });
    } else {
      // Paste Mode
      const rawText = csvPasteInput.value.trim();
      if (!rawText) {
        alert('Please paste some CSV data first.');
        return;
      }

      // Strip markdown code block wrapping (like ```csv ... ```)
      const cleanedText = rawText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();

      importCsvBtn.disabled = true;
      const originalHtml = importCsvBtn.innerHTML;
      importCsvBtn.textContent = 'Parsing...';

      Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: async (results) => {
          await processCSVData(results.data, 'pasted text');
          resetImportBtn(originalHtml);
        },
        error: (err) => {
          console.error('CSV Parsing Error:', err);
          alert('Error parsing CSV input. Please check console.');
          resetImportBtn(originalHtml);
        }
      });
    }
  });

  function resetImportBtn(originalHtml) {
    importCsvBtn.disabled = false;
    importCsvBtn.innerHTML = originalHtml;
    window.lucide.createIcons();
  }

  function setupCsvPasteEditor() {
    if (!csvPasteInput || !csvPasteHighlight || !csvPasteLineNumbers) return;

    csvPasteInput.addEventListener('input', renderCsvPasteEditor);
    csvPasteInput.addEventListener('scroll', syncCsvPasteEditorScroll);
    renderCsvPasteEditor();
  }

  function renderCsvPasteEditor() {
    if (!csvPasteInput || !csvPasteHighlight || !csvPasteLineNumbers) return;

    const value = csvPasteInput.value;
    const lineCount = Math.max(value.split('\n').length, 1);
    csvPasteLineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
    csvPasteHighlight.innerHTML = value
      ? value.split('\n').map(renderCsvHighlightLine).join('\n')
      : '';
    syncCsvPasteEditorScroll();
  }

  function syncCsvPasteEditorScroll() {
    if (!csvPasteInput || !csvPasteHighlight || !csvPasteLineNumbers) return;

    csvPasteHighlight.style.transform = `translate(${-csvPasteInput.scrollLeft}px, ${-csvPasteInput.scrollTop}px)`;
    csvPasteLineNumbers.style.transform = `translateY(${-csvPasteInput.scrollTop}px)`;
  }

  function renderCsvHighlightLine(line) {
    if (!line) return '<span class="csv-paste-empty">&nbsp;</span>';

    return splitCsvLineWithDelimiters(line).map((part) => {
      if (part.isDelimiter) {
        return '<span class="csv-comma">,</span>';
      }
      return `<span class="csv-col-${part.column % 8}">${escapeHtml(part.value) || '&nbsp;'}</span>`;
    }).join('');
  }

  function splitCsvLineWithDelimiters(line) {
    const parts = [];
    let value = '';
    let column = 0;
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && nextChar === '"') {
        value += char + nextChar;
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        value += char;
        continue;
      }

      if (char === ',' && !inQuotes) {
        parts.push({ value, column, isDelimiter: false });
        parts.push({ value: char, column, isDelimiter: true });
        value = '';
        column += 1;
        continue;
      }

      value += char;
    }

    parts.push({ value, column, isDelimiter: false });
    return parts;
  }

  function normalizeQuestionType(type) {
    const rawType = String(type || 'MCQ').trim().toUpperCase();
    if (rawType === 'FIB' || rawType === 'FILL IN THE BLANK' || rawType === 'FILL IN THE BLANKS') {
      return 'FIB';
    }
    if (rawType === 'SHORT ANSWER' || rawType === 'SA' || rawType === 'SHORTANSWER') {
      return 'Short Answer';
    }
    return 'MCQ';
  }

  function hasActiveFilters() {
    return selectedTagFilter !== 'all' || selectedTypeFilter !== 'all';
  }

  function getActiveFilterLabel() {
    const activeFilters = [];
    if (selectedTagFilter !== 'all') {
      activeFilters.push(`tag "${selectedTagFilter}"`);
    }
    if (selectedTypeFilter !== 'all') {
      activeFilters.push(`type "${selectedTypeFilter}"`);
    }
    return activeFilters.join(' and ');
  }

  function getQuestionsSummary(filteredCount) {
    if (!hasActiveFilters()) {
      return `${questions.length} questions registered total. Select a syllabus tag or question type to filter.`;
    }
    return `${filteredCount} of ${questions.length} questions match the selected ${getActiveFilterLabel()}.`;
  }

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

  // Initialize page data
  setupCsvPasteEditor();
  fetchQuestions();
});
