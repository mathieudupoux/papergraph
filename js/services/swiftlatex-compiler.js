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
    }

    /**
     * Initialize compiler (no-op for HTTP-based compilation)
     */
    async initialize() {
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

            // Check if document uses natbib
            const usesNatbib = /\\usepackage(\[.*?\])?\{natbib\}/.test(mainTexContent);
            const usesBibliography = /\\bibliography\{/.test(mainTexContent);
            
            if (usesNatbib) {
            }
            if (usesBibliography) {
            }

            // Build URL endpoint
            const url = `${this.serverUrl}/builds/sync`;

            // Build form data for POST request with files
            const formData = new FormData();
            
            // Create main.tex file as Blob and append it
            const texBlob = new Blob([mainTexContent], { type: 'text/plain' });
            formData.append('file[]', texBlob, 'main.tex');
            
            // Set compiler
            formData.append('compiler', compiler);

            // Add bibliography as a file if provided
            if (bibContent && bibContent.trim()) {
                const bibBlob = new Blob([bibContent], { type: 'text/plain' });
                formData.append('file[]', bibBlob, 'references.bib');
                
                // Specify the compilation command to run bibtex
                // Run: latex -> bibtex -> latex -> latex (standard bibliography workflow)
                formData.append('command', `${compiler} -interaction=nonstopmode main.tex && bibtex main || true && ${compiler} -interaction=nonstopmode main.tex && ${compiler} -interaction=nonstopmode main.tex`);
            } else {
                // No bibliography, single compilation pass
                formData.append('command', `${compiler} -interaction=nonstopmode main.tex`);
            }

            // Make request

            const startTime = performance.now();

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/pdf',
                }
            });

            const endTime = performance.now();

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Server error:', response.status, response.statusText);
                console.error('❌ Error details:', errorText);
                throw new Error(`Server error: ${response.status} ${response.statusText}\n${errorText}`);
            }

            // Get PDF
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
    }

    /**
     * Set custom server URL
     * @param {string} url - Server URL (e.g., 'https://latex.ytotech.com')
     */
    setServerUrl(url) {
        this.serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
    }
}

// Create and export singleton
const latexOnlineCompiler = new LaTeXOnlineCompiler();

// Make globally available
window.swiftLatexCompiler = latexOnlineCompiler; // Keep old name for compatibility
window.latexOnlineCompiler = latexOnlineCompiler;

// Also export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = latexOnlineCompiler;
}
