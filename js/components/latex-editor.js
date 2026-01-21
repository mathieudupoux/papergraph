/**
 * LaTeX Editor Component using CodeMirror 6
 * Modern, performant editor with LaTeX syntax highlighting
 */

// CodeMirror 6 imports (will be loaded from CDN)
// import { EditorView, basicSetup } from '@codemirror/basic-setup';
// import { EditorState } from '@codemirror/state';
// import { latex } from '@codemirror/lang-latex';

class LaTeXEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.view = null;
        this.options = {
            initialContent: '',
            onChange: null,
            readOnly: false,
            ...options
        };
    }

    /**
     * Initialize CodeMirror editor
     */
    async initialize() {
        // Check if CodeMirror is loaded
        if (!window.CodeMirror6) {
            await this.loadCodeMirror();
        }

        const { EditorView, EditorState, basicSetup } = window.CodeMirror6;

        // Create editor state
        const state = EditorState.create({
            doc: this.options.initialContent,
            extensions: [
                basicSetup,
                this.latexSupport(),
                this.theme(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && this.options.onChange) {
                        this.options.onChange(update.state.doc.toString());
                    }
                }),
                EditorView.editable.of(!this.options.readOnly)
            ]
        });

        // Create editor view
        this.view = new EditorView({
            state,
            parent: this.container
        });

        console.log('✅ CodeMirror 6 editor initialized');
    }

    /**
     * Load CodeMirror 6 from CDN
     */
    async loadCodeMirror() {
        const scripts = [
            'https://cdn.jsdelivr.net/npm/@codemirror/state@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/view@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/language@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/commands@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/search@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/autocomplete@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/lint@6/dist/index.js',
            'https://cdn.jsdelivr.net/npm/@codemirror/lang-latex@6/dist/index.js'
        ];

        for (const src of scripts) {
            await this.loadScript(src);
        }

        // Setup global CodeMirror6 object
        window.CodeMirror6 = {
            EditorView: window['@codemirror/view'].EditorView,
            EditorState: window['@codemirror/state'].EditorState,
            basicSetup: window['@codemirror/commands'].basicSetup
        };
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * LaTeX language support
     */
    latexSupport() {
        // Simplified LaTeX syntax highlighting
        // In production, use @codemirror/lang-latex
        return [
            // Basic LaTeX command highlighting will be added here
        ];
    }

    /**
     * Custom theme for LaTeX
     */
    theme() {
        const { EditorView } = window.CodeMirror6;

        return EditorView.theme({
            "&": {
                fontSize: "14px",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
            },
            ".cm-content": {
                minHeight: "300px",
                padding: "10px"
            },
            ".cm-scroller": {
                overflow: "auto",
                maxHeight: "600px"
            },
            ".cm-gutters": {
                backgroundColor: "#f5f5f5",
                border: "none"
            }
        });
    }

    /**
     * Get current editor content
     */
    getValue() {
        if (!this.view) return '';
        return this.view.state.doc.toString();
    }

    /**
     * Set editor content
     */
    setValue(content) {
        if (!this.view) return;

        const { EditorState } = window.CodeMirror6;

        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content
            }
        });
    }

    /**
     * Destroy editor
     */
    destroy() {
        if (this.view) {
            this.view.destroy();
            this.view = null;
        }
    }
}

// Simpler alternative: Enhanced textarea with syntax hints
// Use this if CodeMirror 6 loading is problematic
class SimpleLaTeXEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.textarea = null;
        this.options = {
            initialContent: '',
            onChange: null,
            readOnly: false,
            ...options
        };
    }

    initialize() {
        // Create enhanced textarea
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'latex-editor-textarea';
        this.textarea.value = this.options.initialContent;
        this.textarea.readOnly = this.options.readOnly;
        this.textarea.spellcheck = false;

        // Styling
        this.textarea.style.cssText = `
            width: 100%;
            min-height: 400px;
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
            tab-size: 4;
        `;

        // Event listeners
        this.textarea.addEventListener('input', () => {
            if (this.options.onChange) {
                this.options.onChange(this.textarea.value);
            }
        });

        // Tab key support
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.textarea.selectionStart;
                const end = this.textarea.selectionEnd;
                const value = this.textarea.value;

                this.textarea.value = value.substring(0, start) + '    ' + value.substring(end);
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;

                if (this.options.onChange) {
                    this.options.onChange(this.textarea.value);
                }
            }
        });

        this.container.appendChild(this.textarea);

        console.log('✅ Simple LaTeX editor initialized');
    }

    getValue() {
        return this.textarea ? this.textarea.value : '';
    }

    setValue(content) {
        if (this.textarea) {
            this.textarea.value = content;
        }
    }

    destroy() {
        if (this.textarea) {
            this.textarea.remove();
            this.textarea = null;
        }
    }
}

// Export both versions
window.LaTeXEditor = LaTeXEditor;
window.SimpleLaTeXEditor = SimpleLaTeXEditor;

export { LaTeXEditor, SimpleLaTeXEditor };
