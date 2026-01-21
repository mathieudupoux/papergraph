/**
 * SwiftLaTeX WebAssembly Compiler Service
 * Client-side LaTeX compilation using SwiftLaTeX engine
 * No server dependencies - runs entirely in the browser
 */

class SwiftLaTeXCompiler {
    constructor() {
        this.engine = null;
        this.isLoading = false;
        this.isReady = false;
        this.loadPromise = null;
    }

    /**
     * Initialize the SwiftLaTeX engine
     * Loads the WebAssembly module and sets up the virtual filesystem
     */
    async initialize() {
        if (this.isReady) return;
        if (this.loadPromise) return this.loadPromise;

        this.isLoading = true;

        this.loadPromise = (async () => {
            try {
                console.log('🚀 Loading SwiftLaTeX WebAssembly engine...');

                // Load SwiftLaTeX from CDN
                if (!window.SwiftLaTeX) {
                    await this.loadScript('https://cdn.jsdelivr.net/npm/swiftlatex@latest/dist/SwiftLaTeX.js');
                }

                // Initialize the engine
                this.engine = new window.SwiftLaTeX.SwiftLaTeX();

                await this.engine.loadEngine();

                this.isReady = true;
                this.isLoading = false;
                console.log('✅ SwiftLaTeX engine ready');
            } catch (error) {
                this.isLoading = false;
                console.error('❌ Failed to initialize SwiftLaTeX:', error);
                throw new Error(`SwiftLaTeX initialization failed: ${error.message}`);
            }
        })();

        return this.loadPromise;
    }

    /**
     * Load external script dynamically
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Write a file to the virtual filesystem
     * This is crucial for BibTeX files and included documents
     */
    async writeFile(filename, content) {
        if (!this.isReady) {
            await this.initialize();
        }

        try {
            // SwiftLaTeX uses a virtual filesystem
            // Write content as string or Uint8Array
            const contentBytes = typeof content === 'string'
                ? new TextEncoder().encode(content)
                : content;

            await this.engine.writeMemFSFile(filename, contentBytes);
            console.log(`✅ Written file to virtual FS: ${filename} (${contentBytes.length} bytes)`);
        } catch (error) {
            console.error(`❌ Failed to write file ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Read a file from the virtual filesystem
     */
    async readFile(filename) {
        if (!this.isReady) {
            throw new Error('SwiftLaTeX engine not initialized');
        }

        try {
            const data = await this.engine.readMemFSFile(filename);
            return data;
        } catch (error) {
            console.error(`❌ Failed to read file ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Compile LaTeX document to PDF
     * @param {string} mainTexContent - Main LaTeX document content
     * @param {Object} options - Compilation options
     * @param {string} options.bibContent - BibTeX bibliography content (optional)
     * @param {Object} options.additionalFiles - Additional files to write {filename: content}
     * @returns {Promise<Blob>} PDF blob
     */
    async compileToPDF(mainTexContent, options = {}) {
        if (!this.isReady) {
            await this.initialize();
        }

        const { bibContent, additionalFiles = {} } = options;

        try {
            console.log('📝 Starting LaTeX compilation...');
            console.log(`   Main document: ${mainTexContent.length} characters`);

            // Write main.tex file
            await this.writeFile('main.tex', mainTexContent);

            // Write bibliography if provided
            if (bibContent) {
                console.log(`   Bibliography: ${bibContent.length} characters`);
                await this.writeFile('references.bib', bibContent);
            }

            // Write any additional files
            for (const [filename, content] of Object.entries(additionalFiles)) {
                console.log(`   Additional file: ${filename}`);
                await this.writeFile(filename, content);
            }

            // Compile the document
            // SwiftLaTeX needs multiple passes for bibliography
            console.log('🔄 Running pdflatex (pass 1)...');
            let result = await this.engine.compileLaTeX();

            if (bibContent) {
                console.log('🔄 Running bibtex...');
                await this.engine.compileBibtex();

                console.log('🔄 Running pdflatex (pass 2)...');
                result = await this.engine.compileLaTeX();

                console.log('🔄 Running pdflatex (pass 3 - final)...');
                result = await this.engine.compileLaTeX();
            }

            // Check compilation result
            if (result.status !== 0) {
                const log = await this.readFile('main.log');
                const logText = new TextDecoder().decode(log);
                console.error('❌ LaTeX compilation errors:', logText);
                throw new Error('LaTeX compilation failed. Check console for errors.');
            }

            // Read the generated PDF
            console.log('📄 Reading generated PDF...');
            const pdfData = await this.readFile('main.pdf');

            // Convert to Blob
            const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });

            console.log(`✅ PDF generated successfully (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed:', error);

            // Try to read log file for more details
            try {
                const log = await this.readFile('main.log');
                const logText = new TextDecoder().decode(log);
                console.error('LaTeX log:', logText);
                throw new Error(`Compilation failed: ${logText.substring(0, 500)}`);
            } catch (logError) {
                throw new Error(`Compilation failed: ${error.message}`);
            }
        }
    }

    /**
     * Get compilation status and logs
     */
    async getCompilationLog() {
        try {
            const log = await this.readFile('main.log');
            return new TextDecoder().decode(log);
        } catch (error) {
            return 'No compilation log available';
        }
    }

    /**
     * Clear the virtual filesystem
     */
    async clearFilesystem() {
        if (!this.isReady) return;

        try {
            // Reset the engine to clear filesystem
            await this.engine.reset();
            console.log('🧹 Virtual filesystem cleared');
        } catch (error) {
            console.error('Failed to clear filesystem:', error);
        }
    }
}

// Export singleton instance
const swiftLatexCompiler = new SwiftLaTeXCompiler();
window.swiftLatexCompiler = swiftLatexCompiler;

export default swiftLatexCompiler;
