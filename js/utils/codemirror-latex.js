/**
 * LaTeX Editor with Line Numbers and Syntax Highlighting
 * Integrated with app theme (light mode)
 */

/**
 * Initialize LaTeX editor with line numbers and syntax highlighting
 * @param {HTMLElement} container - Container element
 * @param {string} initialContent - Initial document content
 * @param {Function} onChange - Callback when content changes
 * @returns {Object} Editor instance with getValue/setValue methods
 */
function initLatexEditor(container, initialContent = '', onChange = null) {
    // Clear container and remove any padding/margin
    container.innerHTML = '';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.border = 'none';

    // Create wrapper for editor with line numbers
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'latex-editor-wrapper';
    editorWrapper.style.cssText = `
        position: relative;
        display: flex;
        width: 100%;
        min-height: 400px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.5;
        background: #ffffff;
        border: none;
        margin: 0;
        padding: 0;
        overflow: hidden;
    `;

    // Create line numbers column
    const lineNumbers = document.createElement('div');
    lineNumbers.className = 'latex-line-numbers';
    lineNumbers.style.cssText = `
        background: #f7f9fb;
        color: #9e9e9e;
        padding: 8px 12px 8px 8px;
        text-align: right;
        user-select: none;
        min-width: 50px;
        border-right: 1px solid #e0e0e0;
        font-size: 12px;
        line-height: 1.5;
        overflow: hidden;
    `;

    // Create syntax highlight layer (behind textarea)
    const highlightLayer = document.createElement('pre');
    highlightLayer.className = 'latex-highlight-layer';
    highlightLayer.style.cssText = `
        position: absolute;
        top: 0;
        left: 50px;
        margin: 0;
        padding: 8px 12px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        pointer-events: none;
        z-index: 1;
        background: transparent;
        border: none;
        color: transparent;
    `;

    // Create textarea for code
    const textarea = document.createElement('textarea');
    textarea.className = 'latex-editor-content';
    textarea.value = initialContent;
    textarea.spellcheck = false;
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocorrect', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    textarea.setAttribute('wrap', 'soft');

    // Styling for LaTeX editor (light theme, transparent text for highlighting)
    textarea.style.cssText = `
        position: relative;
        flex: 1;
        min-height: 400px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.5;
        padding: 8px 12px;
        border: none;
        margin: 0;
        resize: vertical;
        tab-size: 4;
        background: transparent;
        color: #2e3440;
        outline: none;
        z-index: 2;
    `;

    // Add global CSS for syntax highlighting and scrollbar
    if (!document.getElementById('latex-editor-styles')) {
        const style = document.createElement('style');
        style.id = 'latex-editor-styles';
        style.textContent = `
            .latex-editor-wrapper {
                position: relative;
            }

            .latex-editor-content::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }

            .latex-editor-content::-webkit-scrollbar-track {
                background: #f7f9fb;
            }

            .latex-editor-content::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 5px;
            }

            .latex-editor-content::-webkit-scrollbar-thumb:hover {
                background: #a8a8a8;
            }

            .latex-editor-content::selection {
                background: #b3d7ff;
            }

            /* Syntax highlighting colors */
            .latex-highlight-layer .latex-command {
                color: #0077aa;
                font-weight: 500;
            }

            .latex-highlight-layer .latex-comment {
                color: #6a9955;
                font-style: italic;
            }

            .latex-highlight-layer .latex-bracket {
                color: #af00db;
            }

            .latex-highlight-layer .latex-math {
                color: #ee9900;
                font-weight: bold;
            }

            .latex-highlight-layer .latex-environment {
                color: #008080;
                font-weight: 600;
            }

            .latex-highlight-layer .latex-string {
                color: #d73a49;
            }
        `;
        document.head.appendChild(style);
    }

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

    // Function to apply syntax highlighting
    function applySyntaxHighlighting(text) {
        // Escape HTML first
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Apply syntax highlighting with classes
        html = html
            // Comments (green) - highest priority, should be done first
            .replace(/(%.*?)$/gm, '<span class="latex-comment">$1</span>')
            // LaTeX commands (\command)
            .replace(/(\\[a-zA-Z@]+\*?)/g, '<span class="latex-command">$1</span>')
            // Environment names  in \begin{} and \end{}
            .replace(/(\\(?:begin|end)\{)([^}]+)(\})/g,
                '<span class="latex-command">$1</span>' +
                '<span class="latex-environment">$2</span>' +
                '<span class="latex-bracket">$3</span>')
            // Math delimiters ($ and $$)
            .replace(/(\$\$?)/g, '<span class="latex-math">$1</span>')
            // Brackets and braces (purple)
            .replace(/([{}[\]])/g, '<span class="latex-bracket">$1</span>');

        return html;
    }

    // Update highlighting
    function updateHighlighting() {
        const highlighted = applySyntaxHighlighting(textarea.value);
        highlightLayer.innerHTML = highlighted;
        highlightLayer.scrollTop = textarea.scrollTop;
        highlightLayer.scrollLeft = textarea.scrollLeft;
    }

    // Event listener for changes
    const handleInput = () => {
        if (onChange) {
            onChange(textarea.value);
        }
        updateLineNumbers();
        updateHighlighting();
    };

    textarea.addEventListener('input', handleInput);

    // Sync scroll between line numbers, textarea, and highlight layer
    textarea.addEventListener('scroll', () => {
        lineNumbers.scrollTop = textarea.scrollTop;
        highlightLayer.scrollTop = textarea.scrollTop;
        highlightLayer.scrollLeft = textarea.scrollLeft;
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
            handleInput();
        }
    });

    // Assemble editor (order matters: highlight layer behind textarea)
    editorWrapper.appendChild(lineNumbers);
    editorWrapper.appendChild(highlightLayer);
    editorWrapper.appendChild(textarea);
    container.appendChild(editorWrapper);

    // Initial update
    updateLineNumbers();
    updateHighlighting();

    // Return editor interface
    return {
        getValue: () => textarea.value,
        setValue: (content) => {
            textarea.value = content;
            updateLineNumbers();
            updateHighlighting();
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
