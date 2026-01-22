/**
 * CodeMirror 6 LaTeX Editor Utility
 * Simple wrapper for LaTeX editing with syntax highlighting
 */

/**
 * Initialize CodeMirror editor for LaTeX
 * @param {HTMLElement} container - Container element
 * @param {string} initialContent - Initial document content
 * @param {Function} onChange - Callback when content changes
 * @returns {Object} Editor instance with getValue/setValue methods
 */
function initLatexEditor(container, initialContent = '', onChange = null) {
    // Clear container
    container.innerHTML = '';

    // Create textarea fallback (CodeMirror 6 CDN can be complex)
    // We'll use enhanced textarea for now
    const textarea = document.createElement('textarea');
    textarea.className = 'latex-editor';
    textarea.value = initialContent;
    textarea.spellcheck = false;
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');

    // Styling for LaTeX editor
    textarea.style.cssText = `
        width: 100%;
        min-height: 400px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.6;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: vertical;
        tab-size: 4;
        background: #fafafa;
        color: #333;
    `;

    // Event listener for changes
    if (onChange) {
        textarea.addEventListener('input', () => {
            onChange(textarea.value);
        });
    }

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
        }
    });

    container.appendChild(textarea);

    // Return editor interface
    return {
        getValue: () => textarea.value,
        setValue: (content) => {
            textarea.value = content;
        },
        destroy: () => {
            textarea.remove();
        },
        element: textarea
    };
}

/**
 * Enhanced syntax highlighting for LaTeX (basic)
 * Can be expanded later with CodeMirror 6 proper integration
 */
function highlightLatexSyntax(text) {
    // This is a placeholder for future CodeMirror 6 integration
    // For now, the textarea has good enough UX with monospace font
    return text;
}

// Make globally available
window.initLatexEditor = initLatexEditor;
window.highlightLatexSyntax = highlightLatexSyntax;
