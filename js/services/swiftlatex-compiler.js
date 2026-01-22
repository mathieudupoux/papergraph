/**
 * SwiftLaTeX WebAssembly Compiler Service
 * Client-side LaTeX compilation - no server dependencies
 */

class SwiftLaTeXCompiler {
    constructor() {
        this.engine = null;
        this.isReady = false;
        this.isLoading = false;
        this.loadPromise = null;
    }

    /**
     * Initialize SwiftLaTeX engine
     */
    async initialize() {
        if (this.isReady) {
            return true;
        }

        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.isLoading = true;

        this.loadPromise = (async () => {
            try {
                console.log('🚀 Initializing SwiftLaTeX WebAssembly engine...');

                // Check if SwiftLaTeX is loaded
                if (typeof PdfTeXEngine === 'undefined') {
                    throw new Error('SwiftLaTeX library not loaded. Please refresh the page.');
                }

                // Create engine instance
                this.engine = new PdfTeXEngine();

                // Load engine
                await this.engine.loadEngine();

                this.isReady = true;
                this.isLoading = false;

                console.log('✅ SwiftLaTeX engine initialized');
                return true;

            } catch (error) {
                this.isLoading = false;
                this.isReady = false;
                console.error('❌ SwiftLaTeX initialization failed:', error);
                throw new Error(`Failed to initialize SwiftLaTeX: ${error.message}`);
            }
        })();

        return this.loadPromise;
    }

    /**
     * Write file to virtual filesystem
     * @param {string} filename - File name
     * @param {string|Uint8Array} content - File content
     */
    async writeFile(filename, content) {
        if (!this.isReady) {
            await this.initialize();
        }

        try {
            const contentBytes = typeof content === 'string'
                ? new TextEncoder().encode(content)
                : content;

            this.engine.writeMemFSFile(filename, contentBytes);
            console.log(`📝 Written to virtual FS: ${filename} (${contentBytes.length} bytes)`);

        } catch (error) {
            console.error(`❌ Failed to write ${filename}:`, error);
            throw error;
        }
    }


    /**
     * Compile LaTeX to PDF
     * @param {string} mainTexContent - Main LaTeX document
     * @param {Object} options - Compilation options
     * @param {string} options.bibContent - BibTeX content (optional)
     * @returns {Promise<Blob>} PDF blob
     */
    async compileToPDF(mainTexContent, options = {}) {
        if (!this.isReady) {
            await this.initialize();
        }

        const { bibContent } = options;

        try {
            console.log('📄 Starting LaTeX compilation...');
            console.log(`   Document: ${mainTexContent.length} chars`);

            // Write main.tex
            await this.writeFile('main.tex', mainTexContent);

            // Write bibliography if provided
            if (bibContent && bibContent.trim()) {
                console.log(`   Bibliography: ${bibContent.length} chars`);
                await this.writeFile('references.bib', bibContent);
            }

            // Set main file
            this.engine.setEngineMainFile('main.tex');

            // Run pdflatex compilation
            console.log('🔄 Running pdflatex...');
            let result = await this.engine.compileLaTeX();

            if (result.status !== 0) {
                console.error('❌ LaTeX errors:', result.log);
                throw new Error('LaTeX compilation failed: ' + result.log.substring(0, 500));
            }

            // Check if we got a PDF
            if (!result.pdf) {
                throw new Error('No PDF generated');
            }

            // Convert to Blob
            const pdfBlob = new Blob([result.pdf], { type: 'application/pdf' });

            console.log(`✅ PDF generated (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed:', error);
            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    /**
     * Reset engine and clear virtual filesystem
     */
    async reset() {
        if (!this.isReady) return;

        try {
            await this.engine.flushCache();
            console.log('🧹 Virtual filesystem cleared');
        } catch (error) {
            console.error('Failed to reset engine:', error);
        }
    }
}

// Create and export singleton
const swiftLatexCompiler = new SwiftLaTeXCompiler();

// Make globally available
window.swiftLatexCompiler = swiftLatexCompiler;

// Also export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = swiftLatexCompiler;
}
