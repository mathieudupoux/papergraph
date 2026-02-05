// ===== LATEX ONLINE COMPILATION SERVICE =====
/**
 * Online LaTeX compilation module
 * Supports:
 * - University of Halle LaTeX service (primary) via Supabase proxy
 * - YtoTech API (fallback)
 * - PDF generation with bibliography support
 */

/**
 * Compile LaTeX document to PDF using online services
 * @param {string} latexContent - Main LaTeX document content
 * @param {string} bibtexContent - BibTeX bibliography content (optional)
 * @param {object} options - Compilation options
 * @param {string} options.compiler - Compiler to use (pdflatex, xelatex, lualatex)
 * @param {string} options.service - Service to use ('auto', 'halle', 'ytotech')
 * @param {function} options.onProgress - Progress callback
 * @returns {Promise<Blob>} - PDF blob
 */
async function compileLatexOnline(latexContent, bibtexContent = '', options = {}) {
    const {
        compiler = 'pdflatex',
        service = 'auto',
        onProgress = null
    } = options;

    // Try University of Halle first if auto or explicitly requested
    if (service === 'auto' || service === 'halle') {
        try {
            if (onProgress) onProgress('Compiling with University of Halle...');
            return await compileWithUnivHalle(latexContent, bibtexContent, compiler);
        } catch (error) {
            console.warn('University of Halle failed:', error);
            if (service === 'halle') throw error; // Don't fallback if explicitly requested
        }
    }

    // Fallback to YtoTech or if explicitly requested
    if (onProgress) onProgress('Using YtoTech LaTeX compiler...');
    return await compileWithYtoTech(latexContent, bibtexContent, compiler);
}

/**
 * Compile using University of Halle LaTeX Online service via Supabase proxy
 * Avoids CORS issues by proxying through Supabase Edge Function
 * @param {string} latexContent - LaTeX document content
 * @param {string} bibtexContent - BibTeX content (unused for this service)
 * @param {string} compiler - Compiler to use
 * @returns {Promise<Blob>} - PDF blob
 */
async function compileWithUnivHalle(latexContent, bibtexContent, compiler) {

    if (!window.supabaseClient) {
        throw new Error('Supabase client not initialized');
    }

    // Invoke the edge function with LaTeX content
    const { data, error } = await window.supabaseClient.functions.invoke('compile-latex', {
        body: {
            content: latexContent,
            compiler: compiler || 'pdflatex',
            filename: 'main.tex'
        }
    });

    if (error) {
        console.error('Compilation error:', error);
        throw new Error(error.message || 'LaTeX compilation failed');
    }

    // Check if we got a PDF blob or an error
    let pdfBlob;

    if (data instanceof Blob) {
        pdfBlob = data;
    } else if (data instanceof ArrayBuffer) {
        pdfBlob = new Blob([data], { type: 'application/pdf' });
    } else {
        console.error('Unexpected response format:', data);
        throw new Error('Unexpected response format from compilation service');
    }

    // Verify it's actually a PDF by checking magic bytes
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const isPDF = uint8Array[0] === 0x25 && // %
                  uint8Array[1] === 0x50 && // P
                  uint8Array[2] === 0x44 && // D
                  uint8Array[3] === 0x46;   // F

    if (!isPDF) {
        const text = new TextDecoder().decode(uint8Array);
        console.error('Response is not a PDF:', text.substring(0, 500));
        throw new Error('Compilation failed: ' + (text.substring(0, 200) || 'Invalid response'));
    }


    return pdfBlob;
}

/**
 * Compile using YtoTech LaTeX API (https://latex.ytotech.com/)
 * Used as fallback or when explicitly requested
 * @param {string} latexContent - LaTeX document content
 * @param {string} bibtexContent - BibTeX content (optional)
 * @param {string} compiler - Compiler to use
 * @returns {Promise<Blob>} - PDF blob
 */
async function compileWithYtoTech(latexContent, bibtexContent, compiler) {
    const resources = [
        {
            content: latexContent,
            main: true
        }
    ];

    // Add BibTeX file if provided
    if (bibtexContent && bibtexContent.trim()) {
        resources.push({
            content: bibtexContent,
            file: 'references.bib'
        });
    }

    const response = await fetch('https://latex.ytotech.com/builds/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            compiler: compiler,
            resources: resources
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`YtoTech compilation failed: ${response.status} - ${errorText}`);
    }

    return await response.blob();
}

// Make functions globally available
window.compileLatexOnline = compileLatexOnline;
