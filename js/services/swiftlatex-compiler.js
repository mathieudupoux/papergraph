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
            console.log('⚠️ Engine not ready, initializing...');
            await this.initialize();
        }

        try {
            console.log(`📝 Writing to virtual FS: ${filename}...`);
            const contentBytes = typeof content === 'string'
                ? new TextEncoder().encode(content)
                : content;

            this.engine.writeMemFSFile(filename, contentBytes);
            console.log(`✅ Written to virtual FS: ${filename} (${contentBytes.length} bytes)`);

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
            console.log('⚠️ Engine not ready for compilation, initializing...');
            await this.initialize();
        }

        const { bibContent } = options;

        try {
            console.log('📄 Starting LaTeX compilation...');
            console.log(`   Document length: ${mainTexContent.length} chars`);
            console.log(`   First 200 chars: ${mainTexContent.substring(0, 200)}`);

            // Write main.tex
            console.log('📝 Step 1: Writing main.tex to virtual filesystem...');
            await this.writeFile('main.tex', mainTexContent);

            // Write bibliography if provided
            if (bibContent && bibContent.trim()) {
                console.log(`📝 Step 2: Writing bibliography (${bibContent.length} chars)...`);
                await this.writeFile('references.bib', bibContent);
            } else {
                console.log('📝 Step 2: No bibliography provided, skipping');
            }

            // Set main file
            console.log('📝 Step 3: Setting main file to main.tex...');
            this.engine.setEngineMainFile('main.tex');
            console.log('✅ Main file set successfully');

            // Run pdflatex compilation
            console.log('🔄 Step 4: Starting pdflatex compilation...');
            console.log('⏳ Waiting for compilation to complete (this may take 5-30 seconds)...');

            const startTime = performance.now();
            let result = await this.engine.compileLaTeX();
            const endTime = performance.now();

            console.log(`✅ Compilation completed in ${(endTime - startTime).toFixed(2)}ms`);
            console.log('📊 Compilation result:', {
                status: result.status,
                hasPDF: !!result.pdf,
                pdfSize: result.pdf ? result.pdf.length : 0,
                logLength: result.log ? result.log.length : 0
            });

            if (result.status !== 0) {
                console.error('❌ LaTeX compilation failed with status:', result.status);
                console.error('📄 Compilation log:', result.log);
                throw new Error('LaTeX compilation failed: ' + result.log.substring(0, 500));
            }

            // Check if we got a PDF
            if (!result.pdf) {
                console.error('❌ No PDF generated despite status 0');
                throw new Error('No PDF generated');
            }

            // Convert to Blob
            console.log('📦 Converting PDF to Blob...');
            const pdfBlob = new Blob([result.pdf], { type: 'application/pdf' });

            console.log(`✅ PDF generated successfully (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed with error:', error);
            console.error('❌ Error stack:', error.stack);
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
