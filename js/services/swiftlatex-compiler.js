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
     * Read file from virtual filesystem
     * @param {string} filename - File name
     * @returns {Uint8Array} File content
     */
    async readFile(filename) {
        if (!this.isReady) {
            throw new Error('SwiftLaTeX engine not initialized');
        }

        try {
            return this.engine.readMemFSFile(filename);
        } catch (error) {
            console.error(`❌ Failed to read ${filename}:`, error);
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

            // First pass: pdflatex
            console.log('🔄 Running pdflatex (pass 1)...');
            let result = await this.engine.compileLaTeX();

            if (result.status !== 0) {
                const log = await this.getLog();
                console.error('❌ LaTeX errors (pass 1):', log);
                throw new Error('LaTeX compilation failed. Check console for errors.');
            }

            // If bibliography exists, run bibtex + 2 more pdflatex passes
            if (bibContent && bibContent.trim()) {
                console.log('🔄 Running bibtex...');
                await this.engine.compileBibtex();

                console.log('🔄 Running pdflatex (pass 2)...');
                result = await this.engine.compileLaTeX();

                console.log('🔄 Running pdflatex (pass 3 - final)...');
                result = await this.engine.compileLaTeX();

                if (result.status !== 0) {
                    const log = await this.getLog();
                    console.error('❌ LaTeX errors (final pass):', log);
                    throw new Error('LaTeX compilation failed. Check console for errors.');
                }
            }

            // Read generated PDF
            console.log('📥 Reading generated PDF...');
            const pdfData = await this.readFile('main.pdf');

            // Convert to Blob
            const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });

            console.log(`✅ PDF generated (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed:', error);

            // Try to get log
            try {
                const log = await this.getLog();
                if (log) {
                    console.error('LaTeX log:', log);
                    throw new Error(`Compilation failed: ${log.substring(0, 500)}`);
                }
            } catch (logError) {
                // Log not available
            }

            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    /**
     * Get compilation log
     * @returns {Promise<string>} Log content
     */
    async getLog() {
        try {
            const logData = await this.readFile('main.log');
            return new TextDecoder().decode(logData);
        } catch (error) {
            return 'Log not available';
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
