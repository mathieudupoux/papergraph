/**
 * CodeMirror 6 LaTeX Editor Utility
 * Enhanced textarea with line numbers and LaTeX-optimized styling
 */

/**
 * Initialize LaTeX editor with line numbers
 * @param {HTMLElement} container - Container element
 * @param {string} initialContent - Initial document content
 * @param {Function} onChange - Callback when content changes
 * @returns {Object} Editor instance with getValue/setValue methods
 */
function initLatexEditor(container, initialContent = '', onChange = null) {
    // Clear container
    container.innerHTML = '';

    // Create wrapper for editor with line numbers
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'latex-editor-wrapper';
    editorWrapper.style.cssText = `
        display: flex;
        width: 100%;
        min-height: 400px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.6;
        background: #1e1e1e;
        border: none;
        border-radius: 0;
        overflow: hidden;
    `;

    // Create line numbers column
    const lineNumbers = document.createElement('div');
    lineNumbers.className = 'latex-line-numbers';
    lineNumbers.style.cssText = `
        background: #252525;
        color: #858585;
        padding: 12px 8px;
        text-align: right;
        user-select: none;
        min-width: 40px;
        border-right: 1px solid #3e3e3e;
    `;

    // Create textarea for code
    const textarea = document.createElement('textarea');
    textarea.className = 'latex-editor';
    textarea.value = initialContent;
    textarea.spellcheck = false;
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('wrap', 'off');

    // Styling for LaTeX editor
    textarea.style.cssText = `
        flex: 1;
        min-height: 400px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.6;
        padding: 12px;
        border: none;
        resize: vertical;
        tab-size: 4;
        background: #1e1e1e;
        color: #d4d4d4;
        outline: none;
    `;

    // Add syntax highlighting colors for LaTeX
    const style = document.createElement('style');
    style.textContent = `
        .latex-editor-wrapper {
            position: relative;
        }

        .latex-editor::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }

        .latex-editor::-webkit-scrollbar-track {
            background: #1e1e1e;
        }

        .latex-editor::-webkit-scrollbar-thumb {
            background: #424242;
            border-radius: 6px;
        }

        .latex-editor::-webkit-scrollbar-thumb:hover {
            background: #4e4e4e;
        }

        .latex-editor::selection {
            background: #264f78;
        }
    `;
    document.head.appendChild(style);

    // Function to update line numbers
    function updateLineNumbers() {
        const lines = textarea.value.split('\n').length;
        const numbers = [];
        for (let i = 1; i <= lines; i++) {
            numbers.push(i);
        }
        lineNumbers.textContent = numbers.join('\n');

        // Sync scroll
        lineNumbers.scrollTop = textarea.scrollTop;
    }

    // Event listener for changes
    if (onChange) {
        textarea.addEventListener('input', () => {
            onChange(textarea.value);
            updateLineNumbers();
        });
    }

    // Sync scroll between line numbers and textarea
    textarea.addEventListener('scroll', () => {
        lineNumbers.scrollTop = textarea.scrollTop;
    });

    // Tab key support (insert 4 spaces)
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;

            // Insert 4 spaces
            textarea.value = value.substring(0, start) + '    ' + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 4;

            // Trigger change event
            if (onChange) {
                onChange(textarea.value);
            }
            updateLineNumbers();
        }
    });

    // Assemble editor
    editorWrapper.appendChild(lineNumbers);
    editorWrapper.appendChild(textarea);
    container.appendChild(editorWrapper);

    // Initial line numbers
    updateLineNumbers();

    // Return editor interface
    return {
        getValue: () => textarea.value,
        setValue: (content) => {
            textarea.value = content;
            updateLineNumbers();
        },
        destroy: () => {
            editorWrapper.remove();
        },
        element: textarea,
        wrapper: editorWrapper
    };
}

// Make globally available
window.initLatexEditor = initLatexEditor;
