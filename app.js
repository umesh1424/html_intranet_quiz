// Default sample code
const defaultHTML = `<!-- Add your HTML code here -->
`;

const defaultCSS = `/* Add your CSS here */
body {
    background-color: #f0f0f0;
    font-family: Arial, sans-serif;
}

h1 {
    color: #333;
    text-align: center;
}

p {
    color: #666;
}`;

const defaultJS = `// Add your JavaScript here
console.log('Hello from script.js!');

document.querySelector('h1').addEventListener('click', () => {
    alert('You clicked the heading!');
});`;

// Initialize CodeMirror editors with default content
const htmlEditor = CodeMirror.fromTextArea(document.getElementById('html-code'), {
    mode: 'htmlmixed',
    theme: 'material',
    lineNumbers: true,
    autoCloseTags: true,
    value: defaultHTML,
    extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-Enter": function() { runCode(); },
        "Cmd-Enter": function() { runCode(); }
    },
});
const cssEditor = CodeMirror.fromTextArea(document.getElementById('css-code'), {
    mode: 'css',
    theme: 'material',
    lineNumbers: true,
    value: defaultCSS,
    extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-Enter": function() { runCode(); },
        "Cmd-Enter": function() { runCode(); }
    },
});
const jsEditor = CodeMirror.fromTextArea(document.getElementById('js-code'), {
    mode: 'javascript',
    theme: 'material',
    lineNumbers: true,
    value: defaultJS,
    extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-Enter": function() { runCode(); },
        "Cmd-Enter": function() { runCode(); }
    },
});

// Automatically show hints while typing
cssEditor.on("inputRead", function (cm, event) {
    if (!cm.state.completionActive) {  // Prevent multiple popups
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
});

// Automatically show hints while typing
htmlEditor.on("inputRead", function (cm, event) {
    const autocompleteButton = document.getElementById('autocomplete-button');
    const isOn = autocompleteButton.textContent.includes('On');
    if (isOn && !cm.state.completionActive) {  // Prevent multiple popups
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
});

// Automatically show hints while typing
jsEditor.on("inputRead", function (cm, event) {
    if (!cm.state.completionActive) {  // Prevent multiple popups
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
});

// Function to update the preview

// Function to execute and refresh preview via Run button / keyboard shortcut
function runCode() {
    const preview = document.getElementById('preview');
    if (!preview) return;
    const html = htmlEditor ? htmlEditor.getValue() : '';
    const css = `<style>${cssEditor ? cssEditor.getValue() : ''}</style>`;
    const js = `<script>
                try {
                    ${jsEditor ? jsEditor.getValue() : ''}
                } catch (error) {
                    console.error(error);
                }
            <\/script>`;

    // Reset and reload so scripts re-execute cleanly
    preview.srcdoc = '';
    setTimeout(() => {
        preview.srcdoc = html + css + js;
    }, 15);

    const runBtn = document.getElementById('run-button');
    if (runBtn) {
        runBtn.classList.add('running');
        setTimeout(() => runBtn.classList.remove('running'), 250);
    }
}
window.runCode = runCode;

// Render initial code on load
runCode();

// Keyboard shortcut (Ctrl+Enter / Cmd+Enter) to run code from anywhere
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    }
});

function updatePreview() {
    const html = htmlEditor.getValue();
    const css = `<style>${cssEditor.getValue()}</style>`;
    const js = `<script>
                try {
                    ${jsEditor.getValue()}
                } catch (error) {
                    console.error(error);
                }
            <\/script>`;
    const preview = document.getElementById('preview');
    preview.srcdoc = html + css + js;
}

// Update preview on editor change
// htmlEditor.on('change', updatePreview); // disabled auto-run
// cssEditor.on('change', updatePreview); // disabled auto-run
// jsEditor.on('change', updatePreview); // disabled auto-run

// Function to toggle files
function toggleFile(type) {
    const htmlEditorElement = htmlEditor.getWrapperElement();
    const cssEditorElement = cssEditor.getWrapperElement();
    const jsEditorElement = jsEditor.getWrapperElement();

    htmlEditorElement.classList.add('hidden');
    cssEditorElement.classList.add('hidden');
    jsEditorElement.classList.add('hidden');

    if (type === 'html') {
        htmlEditorElement.classList.remove('hidden');
        htmlEditor.refresh();
        htmlEditor.focus();
    } else if (type === 'css') {
        cssEditorElement.classList.remove('hidden');
        cssEditor.refresh();
        cssEditor.focus();
    } else if (type === 'js') {
        jsEditorElement.classList.remove('hidden');
        jsEditor.refresh();
        jsEditor.focus();
    }
}

// Function to insert image path at cursor position
function insertImagePath(imagePath) {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const cursor = activeEditor.getCursor();
        activeEditor.replaceRange(imagePath, cursor);
        activeEditor.focus(); // Focus back on the editor
    }
}

// Function to insert Lorem Ipsum at cursor position
function insertTemplate() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const wrappedText = `<!-- Add your HTML code here -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello World</title>
</head>
<body>
    <h1>Hello, World!</h1>
</body>
</html>`;
        const cursor = activeEditor.getCursor();
        clearEditor();
        activeEditor.replaceRange(wrappedText, cursor);
        activeEditor.focus(); // Focus back on the editor
    }
}

// Function to insert Lorem Ipsum or character at cursor position
function insertLoremIpsum(dummyText) {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const wrappedText = dummyText.length > 50 ? dummyText.replace(/(.{80})/g, "$1\n") : dummyText;
        const cursor = activeEditor.getCursor();
        activeEditor.replaceRange(wrappedText, cursor);
        activeEditor.focus(); // Focus back on the editor
    }
}

// Function to get the active editor
function getActiveEditor() {
    const htmlEditorElement = htmlEditor.getWrapperElement();
    const cssEditorElement = cssEditor.getWrapperElement();
    const jsEditorElement = jsEditor.getWrapperElement();

    if (!htmlEditorElement.classList.contains('hidden')) {
        return htmlEditor;
    } else if (!cssEditorElement.classList.contains('hidden')) {
        return cssEditor;
    } else if (!jsEditorElement.classList.contains('hidden')) {
        return jsEditor;
    }
    return null;
}

// Undo/Redo Functions
function undo() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        activeEditor.undo();
        updateUndoRedoButtons(); // Update button states after undo
    }
}

function redo() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        activeEditor.redo();
        updateUndoRedoButtons(); // Update button states after undo
    }
}

function zoomIn() {
    document.body.style.zoom = (parseFloat(document.body.style.zoom || 1) + 0.1).toFixed(1);
}

function zoomOut() {
    document.body.style.zoom = (parseFloat(document.body.style.zoom || 1) - 0.1).toFixed(1);
}

// Function to update undo/redo button states
function updateUndoRedoButtons(event) {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const undoButton = document.getElementById('undo-button');
        const redoButton = document.getElementById('redo-button');
        const history = activeEditor.historySize();
        undoButton.disabled = !history.undo;
        redoButton.disabled = !history.redo;
        checkCapsLock();
    }
}

function checkCapsLock() {
    document.addEventListener('keydown', function (event) {
        if (event.getModifierState("CapsLock")) {
            showCapsLockWarning();
        } else {
            hideCapsLockWarning();
        }
    });

    document.addEventListener('keyup', function (event) {
        if (!event.getModifierState("CapsLock")) {
            hideCapsLockWarning();
        }
    });
}

function showCapsLockWarning() {
    let warning = document.getElementById("capsWarning");
    if (!warning) {
        warning = document.createElement("div");
        warning.id = "capsWarning";
        warning.innerHTML = "⚠️ Caps Lock is ON!";
        warning.style.position = "fixed";
        warning.style.top = "10px";
        warning.style.right = "10px";
        warning.style.color = "red";
        warning.style.background = "yellow";
        warning.style.padding = "10px";
        warning.style.border = "2px solid red";
        warning.style.borderRadius = "5px";
        warning.style.animation = "blink 0.3s infinite alternate";
        document.body.appendChild(warning);
    }
    warning.style.display = "block";
}

function hideCapsLockWarning() {
    const warning = document.getElementById("capsWarning");
    if (warning) {
        warning.style.display = "none";
    }
}

// Listen for changes in editors to update undo/redo buttons
htmlEditor.on('change', updateUndoRedoButtons);
cssEditor.on('change', updateUndoRedoButtons);
jsEditor.on('change', updateUndoRedoButtons);

// Show HTML editor by default
toggleFile('html');

// Initialize preview with default content
updatePreview();

// Chat Window Functions
function toggleChat() {
    const chatWindow = document.querySelector('.chat-window');
    chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
}

function showFAQs() {
    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML = `
        <div class="message bot">
            <p>Here are some FAQs:</p>
        </div>
        <div class="action-buttons">
            <button onclick="selectFAQ('How do I add an image?')">How do I add an image?</button>
            <button onclick="selectFAQ('How do I style my page?')">How do I style my page?</button>
            <button onclick="selectFAQ('How do I add JavaScript?')">How do I add JavaScript?</button>
        </div>
    `;
}

function selectFAQ(faq) {
    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML += `
        <div class="message user">
            <p>${faq}</p>
        </div>
    `;
    // Simulate a bot response
    setTimeout(() => {
        chatBody.innerHTML += `
            <div class="message bot">
                <p>This is a response to: "${faq}".</p>
            </div>
        `;
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 1000);
}

function showCustomMessageInput() {
    const chatFooter = document.getElementById('chat-footer');
    chatFooter.style.display = 'flex';
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    // Add user message to chat
    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML += `
        <div class="message user">
            <p>${message}</p>
        </div>
    `;

    // Clear input
    input.value = '';

    // Scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;

    // Send message to API (mock API for demonstration)
    const response = await mockApiCall(message);

    // Add bot response to chat
    chatBody.innerHTML += `
        <div class="message bot">
            <p>${response}</p>
        </div>
    `;

    // Scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;
}

// Mock API call (replace with actual API call)
async function mockApiCall(message) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(`You said: "${message}". This is a mock response.`);
        }, 1000);
    });
}

// Toggle Preview Layout
function togglePreviewLayout() {
    const mainContainer = document.getElementById('main-container');
    const previewToggleButton = document.getElementById('preview-toggle-button');

    if (mainContainer.classList.contains('preview-right')) {
        mainContainer.classList.remove('preview-right');
        mainContainer.classList.add('preview-bottom');
    } else {
        mainContainer.classList.remove('preview-bottom');
        mainContainer.classList.add('preview-right');
    }
}

// Function to select all text in the active editor
function selectAll() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        activeEditor.execCommand('selectAll');
    }
}

// Function to copy selected text in the active editor
function copyText() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const selectedText = activeEditor.getSelection();
        if (selectedText) {
            navigator.clipboard.writeText(selectedText).then(() => {
                console.log('Text copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
    }
}

// Function to paste text into the active editor
function pasteText() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        navigator.clipboard.readText().then(text => {
            const cursor = activeEditor.getCursor();
            activeEditor.replaceRange(text, cursor);
        });
    }
}

// Function to clear the active editor
function clearEditor() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        activeEditor.setValue('');
    }
}

// Function to toggle the visibility of the special character buttons
function toggleSpecialChars() {
    const specialCharButtons = document.getElementById('special-char-buttons');
    if (specialCharButtons.classList.contains('hidden')) {
        specialCharButtons.classList.remove('hidden');
    } else {
        specialCharButtons.classList.add('hidden');
    }
}

// Function to toggle autocomplete on/off
function toggleAutocomplete() {
    const autocompleteButton = document.getElementById('autocomplete-button');
    const isOn = autocompleteButton.textContent.includes('On');
    autocompleteButton.textContent = `💡: ${isOn ? '❌Off' : '✅On'}`;
}

// Function to prettify code in the active editor
function prettifyCode() {
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const code = activeEditor.getValue();
        const mode = activeEditor.getOption('mode');
        let formattedCode;
        if (mode === 'htmlmixed') {
            formattedCode = html_beautify(code);
        } else if (mode === 'css') {
            formattedCode = css_beautify(code);
        } else if (mode === 'javascript') {
            formattedCode = js_beautify(code);
        }
        activeEditor.setValue(formattedCode);
    }
}

// Function to create a new file and autosave in local storage
function createNewFile() {
    // If there's text in active editor, ask user to save it
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const code = activeEditor.getValue();
        if (code) {
            saveFile();
            // Clear the active editor
            clearEditor();
        }
    }
}

// Function to view autosaved files in the file explorer
function viewAutosavedFiles() {
    const fileExplorer = document.querySelector('.file-explorer ul');
    fileExplorer.innerHTML = '';
    for (let i = 0; i < localStorage.length; i++) {
        const fileName = localStorage.key(i);
        const li = document.createElement('li');
        li.className = 'hover';
        li.textContent = fileName;
        li.onclick = () => loadFile(fileName);
        fileExplorer.appendChild(li);
    }
}

// Function to load a file from local storage
function loadFile(fileName) {
    console.log("loadFile " + fileName)
    const content = localStorage.getItem(fileName);
    console.log("content " + content)
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        activeEditor.setValue(content);
    }
}

// Save the content of the active editor to local storage
function saveFile(fileName) {
    console.log("saveFile " + fileName)
    const activeEditor = getActiveEditor();
    if (activeEditor) {
        const fileName = prompt('Enter the name of the new file:');
        if (fileName) {
            const content = activeEditor.getValue();
            console.log("content " + content)
            localStorage.setItem(fileName, content);
            viewAutosavedFiles();
        }
    }
}

// ==========================================
// LevelUp Integration Protocol & Code Content APIs
// ==========================================

let currentQuestionId = null;
let validatedParentOrigin = null;
let autosaveTimeout = null;
let initReceived = false;

window.setCodeContent = function(content) {
    if (content === undefined || content === null) return;

    // Student friendly: unwrap any legacy JSON string or object so only simple code is placed in the editor
    let simpleCode = content;
    if (typeof content === 'string') {
        const trimmed = content.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('{\n') && trimmed.endsWith('\n}'))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') {
                    if (typeof parsed.html === 'string') simpleCode = parsed.html;
                    else if (typeof parsed.code === 'string') simpleCode = parsed.code;
                }
            } catch (e) {}
        }
    } else if (typeof content === 'object' && content !== null) {
        if (typeof content.html === 'string') simpleCode = content.html;
        else if (typeof content.code === 'string') simpleCode = content.code;
    }

    if (htmlEditor) {
        htmlEditor.setValue(String(simpleCode));
    }
    if (cssEditor) {
        cssEditor.setValue('/* Add your CSS here */\n');
    }
    if (jsEditor) {
        jsEditor.setValue('// Add your JavaScript here\n');
    }

    toggleFile('html');
    if (typeof updatePreview === 'function') {
        updatePreview();
    }
};

window.getCodeContent = function() {
    const html = htmlEditor ? htmlEditor.getValue() : '';
    const css = cssEditor ? cssEditor.getValue() : '';
    const js = jsEditor ? jsEditor.getValue() : '';

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

    // Pure simple code: return clean code directly without ANY JSON formatting
    if (!cleanCss && !cleanJs) {
        return cleanHtml;
    }

    // If student explicitly added separate CSS or JS, combine into standard plain code (NO JSON!):
    let combined = cleanHtml;
    if (cleanCss) {
        combined = `<style>\n${cleanCss}\n</style>\n\n` + combined;
    }
    if (cleanJs) {
        combined = combined + `\n\n<script>\n${cleanJs}\n</script>`;
    }
    return combined;
};

const LEVELUP_PROTOCOL = 'LEVELUP_EDITOR_v1';
const ALLOWED_PARENT_ORIGINS = ['https://levelup.technikh.com', 'http://localhost', 'http://127.0.0.1', window.location.origin];

function isOriginAllowed(origin) {
    if (!origin) return true;
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin === 'null') return true;
    return ALLOWED_PARENT_ORIGINS.some(o => origin.startsWith(o));
}

window.submitToLevelUpQuiz = function() {
    const code = window.getCodeContent ? window.getCodeContent() : '';
    const qId = currentQuestionId || new URLSearchParams(window.location.search).get('qid') || localStorage.getItem('levelup_current_editing_qid');

    const msg = {
        protocol: LEVELUP_PROTOCOL,
        type: 'CODESTUDIO_TRANSFER_CODE',
        questionId: qId,
        payload: { code: code },
        timestamp: Date.now()
    };

    // 1. Post to opener (if opened in popup/tab)
    if (window.opener && !window.opener.closed) {
        try {
            window.opener.postMessage(msg, '*');
        } catch (e) {}
    }

    // 2. Post to parent (if in iframe/modal)
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage(msg, '*');
        } catch (e) {}
    }

    // 3. Storage broadcast (works 100% reliably across tabs/windows on the same origin)
    try {
        localStorage.setItem('levelup_codestudio_submission', JSON.stringify({
            questionId: qId,
            code: code,
            timestamp: Date.now()
        }));
    } catch (e) {}

    // Button visual feedback
    const btn = document.getElementById('levelup-submit-btn');
    if (btn) {
        btn.innerHTML = '✅ Code Submitted to Quiz!';
        btn.style.background = '#047857';
    }

    alert('✅ Code Submitted to Quiz!\n\nYour code has been transferred to your quiz type bar.\nPlease switch back to your quiz tab to review your code and click "Submit Quiz".');
    if (window.opener && !window.opener.closed) {
        try { window.close(); } catch (e) {}
    }
};

// 1. Notify parent / opener LevelUp when editor is ready
function notifyReady() {
    const qId = currentQuestionId || new URLSearchParams(window.location.search).get('qid') || localStorage.getItem('levelup_current_editing_qid');
    const msg = {
        protocol: LEVELUP_PROTOCOL,
        type: 'EDITOR_READY',
        questionId: qId,
        timestamp: Date.now()
    };

    if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage(msg, '*'); } catch (e) {}
    }
    if (window.parent && window.parent !== window) {
        try { window.parent.postMessage(msg, '*'); } catch (e) {}
    }
}

function loadInitialQuizCode() {
    const qId = new URLSearchParams(window.location.search).get('qid') || localStorage.getItem('levelup_current_editing_qid');
    if (qId) {
        currentQuestionId = qId;
        const savedCode = localStorage.getItem('levelup_current_editing_code_' + qId);
        if (savedCode && window.setCodeContent) {
            window.setCodeContent(savedCode);
        }
    }
}

if (document.readyState === 'complete') {
    notifyReady();
    loadInitialQuizCode();
} else {
    window.addEventListener('load', () => {
        notifyReady();
        loadInitialQuizCode();
    });
}

// Brief heartbeat until LevelUp acknowledges with LEVELUP_INIT
const readyInterval = setInterval(() => {
    if (initReceived) {
        clearInterval(readyInterval);
        return;
    }
    notifyReady();
}, 400);
setTimeout(() => clearInterval(readyInterval), 4000);

// Debounced autosave notify to LevelUp
function triggerAutosaveNotify() {
    if (!window.parent || window.parent === window) return;
    const currentCode = window.getCodeContent ? window.getCodeContent() : '';
    const targetOrigin = validatedParentOrigin || '*';
    window.parent.postMessage({
        protocol: LEVELUP_PROTOCOL,
        type: 'AUTOSAVE_NOTIFY',
        questionId: currentQuestionId,
        payload: { code: currentCode },
        timestamp: Date.now()
    }, targetOrigin);
}

function debouncedAutosave() {
    if (!initReceived && (!window.parent || window.parent === window)) return;
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(triggerAutosaveNotify, 800);
}

htmlEditor.on('change', debouncedAutosave);
cssEditor.on('change', debouncedAutosave);
jsEditor.on('change', debouncedAutosave);

// 2. Listen for requests from LevelUp
window.addEventListener('message', (event) => {
    if (!isOriginAllowed(event.origin)) return;
    if (!event.data || event.data.protocol !== LEVELUP_PROTOCOL) return;

    validatedParentOrigin = event.origin;

    if (event.data.questionId) {
        currentQuestionId = event.data.questionId;
    } else if (event.data.payload?.questionId) {
        currentQuestionId = event.data.payload.questionId;
    }

    if (event.data.type === 'LEVELUP_INIT') {
        initReceived = true;
        if (readyInterval) clearInterval(readyInterval);
        // Restore existing code
        const initialCode = event.data.payload?.code || event.data.payload?.data || '';
        if (initialCode && window.setCodeContent) {
            window.setCodeContent(initialCode);
        }
    } else if (event.data.type === 'REQUEST_GET_CONTENT') {
        // Reply with current code
        const currentCode = window.getCodeContent ? window.getCodeContent() : '';
        event.source.postMessage({
            protocol: LEVELUP_PROTOCOL,
            type: 'RESPONSE_GET_CONTENT',
            questionId: event.data.questionId || currentQuestionId,
            payload: { code: currentCode },
            timestamp: Date.now()
        }, event.origin);
    }
});

