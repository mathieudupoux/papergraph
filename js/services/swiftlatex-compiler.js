/**
 * LaTeX Online Compiler Service
 * HTTP-based LaTeX compilation using latex-online server
 * API: https://latex.ytotech.com
 */

class LaTeXOnlineCompiler {
    constructor() {
        // Default to public latex-online instance
        this.serverUrl = 'https://latex.ytotech.com';
        this.isReady = true; // Always ready, no initialization needed
        console.log('📦 LaTeX Online compiler created');
    }

    /**
     * Initialize compiler (no-op for HTTP-based compilation)
     */
    async initialize() {
        console.log('✅ LaTeX Online compiler ready');
        return true;
    }

    /**
     * Compile LaTeX to PDF via latex-online server
     * @param {string} mainTexContent - Main LaTeX document
     * @param {Object} options - Compilation options
     * @param {string} options.bibContent - BibTeX content (optional)
     * @param {string} options.compiler - LaTeX compiler to use (pdflatex, xelatex, lualatex) (optional)
     * @returns {Promise<Blob>} PDF blob
     */
    async compileToPDF(mainTexContent, options = {}) {
        const { bibContent, compiler = 'pdflatex' } = options;

        try {
            console.log('📄 Starting LaTeX compilation via latex-online...');
            console.log(`   Document length: ${mainTexContent.length} chars`);
            console.log(`   Compiler: ${compiler}`);

            // Build URL with parameters
            const url = new URL(`${this.serverUrl}/builds/sync`);
            url.searchParams.set('content', mainTexContent);
            url.searchParams.set('compiler', compiler);

            // Add bibliography as resource if provided
            if (bibContent && bibContent.trim()) {
                console.log(`   Bibliography: ${bibContent.length} chars`);
                url.searchParams.append('resource-path[]', 'references.bib');
                url.searchParams.append('resource-value[]', bibContent);
                url.searchParams.append('resource-type[]', 'content');
            }

            // Make request
            console.log(`📤 Requesting compilation from ${this.serverUrl}`);
            console.log('⏳ Waiting for compilation (this may take 10-60 seconds)...');

            const startTime = performance.now();

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/pdf',
                }
            });

            const endTime = performance.now();
            console.log(`✅ Server responded in ${((endTime - startTime) / 1000).toFixed(2)}s`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Server error:', response.status, response.statusText);
                console.error('❌ Error details:', errorText);
                throw new Error(`Server error: ${response.status} ${response.statusText}\n${errorText}`);
            }

            // Get PDF
            console.log('📥 Downloading PDF...');
            const pdfData = await response.arrayBuffer();

            // Verify it's actually a PDF
            const uint8Array = new Uint8Array(pdfData);
            const isPDF = uint8Array[0] === 0x25 && // %
                          uint8Array[1] === 0x50 && // P
                          uint8Array[2] === 0x44 && // D
                          uint8Array[3] === 0x46;   // F

            if (!isPDF) {
                const text = new TextDecoder().decode(uint8Array.slice(0, 500));
                console.error('❌ Response is not a PDF:', text);
                throw new Error('Server returned invalid PDF: ' + text);
            }

            const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
            console.log(`✅ PDF generated successfully (${pdfBlob.size} bytes)`);

            return pdfBlob;

        } catch (error) {
            console.error('❌ Compilation failed with error:', error);
            console.error('❌ Error stack:', error.stack);
            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    /**
     * Reset compiler state (no-op for HTTP-based compilation)
     */
    async reset() {
        console.log('🧹 Compiler reset (no-op for HTTP-based compilation)');
    }

    /**
     * Set custom server URL
     * @param {string} url - Server URL (e.g., 'https://latex.ytotech.com')
     */
    setServerUrl(url) {
        this.serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
        console.log(`🔧 Server URL set to: ${this.serverUrl}`);
    }
}

// Create and export singleton
const latexOnlineCompiler = new LaTeXOnlineCompiler();

// Make globally available (maintain compatibility with existing code)
window.swiftLatexCompiler = latexOnlineCompiler; // Keep old name for compatibility
window.latexOnlineCompiler = latexOnlineCompiler;

// Also export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = latexOnlineCompiler;
}
