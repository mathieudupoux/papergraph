// ===== LATEX ONLINE COMPILATION SERVICE =====
/**
 * Online LaTeX compilation module
 * Supports:
 * - LaTeX.Online API (primary)
 * - YtoTech API (fallback)
 * - PDF preview generation
 * - BibTeX bibliography support
 */

/**
 * Compile LaTeX document to PDF using online services
 * @param {string} latexContent - Main LaTeX document content
 * @param {string} bibtexContent - BibTeX bibliography content (optional)
 * @param {object} options - Compilation options
 * @returns {Promise<Blob>} - PDF blob
 */
async function compileLatexOnline(latexContent, bibtexContent = '', options = {}) {
    const {
        compiler = 'pdflatex',
        service = 'auto', // 'auto', 'latexonline', 'ytotech'
        onProgress = null
    } = options;

    // Try LaTeX.Online first if auto or explicitly requested
    if (service === 'auto' || service === 'latexonline') {
        try {
            if (onProgress) onProgress('Trying LaTeX.Online...');
            return await compileWithLatexOnline(latexContent, bibtexContent, compiler);
        } catch (error) {
            console.warn('LaTeX.Online failed:', error);
            if (service === 'latexonline') throw error; // Don't fallback if explicitly requested
        }
    }

    // Fallback to YtoTech or if explicitly requested
    if (onProgress) onProgress('Using YtoTech LaTeX compiler...');
    return await compileWithYtoTech(latexContent, bibtexContent, compiler);
}

/**
 * Compile using LaTeX.Online (https://latexonline.cc/)
 * Free, open source, supports git repositories
 */
async function compileWithLatexOnline(latexContent, bibtexContent, compiler) {
    // LaTeX.Online works by providing files via URL or direct upload
    // For direct compilation, we use their API with multipart/form-data

    const formData = new FormData();

    // Main .tex file
    const texBlob = new Blob([latexContent], { type: 'text/plain' });
    formData.append('fileToUpload', texBlob, 'document.tex');

    // BibTeX file if provided
    if (bibtexContent && bibtexContent.trim()) {
        const bibBlob = new Blob([bibtexContent], { type: 'text/plain' });
        formData.append('fileToUpload', bibBlob, 'references.bib');
    }

    // LaTeX.Online API endpoint
    // Note: They support direct compilation via URL parameters
    // We'll use the compile endpoint with file upload
    const url = 'https://latexonline.cc/compile';

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LaTeX.Online compilation failed: ${response.status} - ${errorText}`);
    }

    return await response.blob();
}

/**
 * Compile using YtoTech LaTeX API (https://latex.ytotech.com/)
 * Used as fallback or when explicitly requested
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

/**
 * Generate a preview-sized PDF for embedding in the editor
 * @param {string} latexContent - LaTeX content to compile
 * @param {string} bibtexContent - BibTeX content
 * @returns {Promise<string>} - Data URL of PDF
 */
async function generateLatexPreviewPDF(latexContent, bibtexContent = '') {
    try {
        // Add minimal document wrapper if not present
        let fullContent = latexContent;
        if (!latexContent.includes('\\documentclass')) {
            fullContent = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{hyperref}

\\begin{document}
${latexContent}
\\end{document}`;
        }

        const pdfBlob = await compileLatexOnline(fullContent, bibtexContent, {
            onProgress: (msg) => console.log('Preview:', msg)
        });

        // Convert blob to data URL for embedding
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
        });
    } catch (error) {
        console.error('Preview generation failed:', error);
        throw error;
    }
}

/**
 * Generate complete LaTeX document with proper BibTeX support
 * @param {object} projectData - Project review metadata and content
 * @param {array} articles - Array of article objects
 * @returns {object} - {latex: string, bibtex: string}
 */
function generateLatexWithBibtex(projectData, articles) {
    const style = getLatexStyle();

    // Get project metadata
    const projectTitle = projectData?.projectReviewMeta?.title || 'Research Project Review';
    const authorsData = projectData?.projectReviewMeta?.authorsData || [];
    const affiliationsData = projectData?.projectReviewMeta?.affiliationsData || [];
    const projectAbstract = projectData?.projectReviewMeta?.abstract || '';
    const projectContent = projectData?.projectReview || '';

    // Start LaTeX document
    let latex = style + '\n\n';

    latex += `\\title{${escapeLatex(projectTitle)}}\n`;

    // Handle authors with ORCID and affiliations
    latex += '\\author{';
    if (authorsData && authorsData.length > 0) {
        authorsData.forEach((author, idx) => {
            if (author.name && author.name.trim()) {
                const affilNums = author.affiliationNumbers || [];
                latex += escapeLatex(author.name);

                // Add affiliation superscripts
                if (affilNums && affilNums.length > 0) {
                    const superscripts = affilNums.map(num => `\\textsuperscript{${num}}`).join(',');
                    latex += superscripts;
                }

                // Add ORCID if provided
                if (author.orcid && author.orcid.trim()) {
                    latex += `\\thanks{ORCID: ${escapeLatex(author.orcid)}}`;
                }

                // Add separator between authors (except for last one)
                if (idx < authorsData.length - 1) {
                    latex += ' \\and ';
                }
            }
        });
    }
    latex += '}\n';

    // Output affiliations
    if (affiliationsData && affiliationsData.length > 0) {
        latex += '\n';
        latex += '\\date{';
        latex += '\\vspace{0.5em}\\\\\n';
        latex += '{\\small\n';
        latex += '\\begin{tabular}{@{}c@{}}\n';
        affiliationsData.forEach((affil, idx) => {
            if (affil.text && affil.text.trim()) {
                latex += `\\textsuperscript{${idx + 1}}${escapeLatex(affil.text)}`;
                if (idx < affiliationsData.length - 1) {
                    latex += ' \\\\\n';
                }
            }
        });
        latex += '\n\\end{tabular}}';
        latex += '\\\\[1.5em]\n';
        latex += '\\today}\n';
    } else {
        latex += `\\date{\\today}\n`;
    }

    latex += '\n\n';
    latex += `\\begin{document}\n\n`;
    latex += `\\maketitle\n\n`;

    // Add abstract if provided
    if (projectAbstract) {
        latex += `\\begin{abstract}\n`;
        latex += processLatexContent(projectAbstract) + '\n';
        latex += `\\end{abstract}\n\n`;
    }

    // Add main document content
    if (projectContent) {
        latex += `\\section*{Overview}\n\n`;
        const processedContent = processLatexContent(projectContent);
        latex += processedContent + '\n\n';
    }

    // Add article abstracts section
    if (articles && articles.length > 0) {
        articles.forEach((article) => {
            latex += `\\section*{${escapeLatex(article.title || 'Untitled')}}`;
            if (article.bibtexId) {
                latex += ` \\cite{${article.bibtexId}}`;
            }
            latex += `\n\n`;

            if (article.authors) {
                latex += `\\textbf{Authors:} ${escapeLatex(article.authors)}\\\\\n`;
            }
            if (article.year) {
                latex += `\\textbf{Year:} ${escapeLatex(article.year)}\\\\\n`;
            }
            if (article.journal) {
                latex += `\\textbf{Journal:} ${escapeLatex(article.journal)}\\\\\n`;
            }
            latex += '\n';

            if (article.abstract) {
                latex += `\\textbf{Abstract:}\n\n`;
                latex += processLatexContent(article.abstract) + '\n\n';
            }

            if (article.text) {
                latex += `\\textbf{Notes:}\n\n`;
                latex += `\\setcounter{section}{0}\n`;
                latex += `\\setcounter{subsection}{0}\n`;
                latex += `\\setcounter{subsubsection}{0}\n\n`;
                const articleText = processLatexContent(article.text);
                latex += articleText + '\n\n';
            }
        });
    }

    // Add bibliography using BibTeX
    if (articles && articles.length > 0 && articles.some(a => a.bibtexId)) {
        latex += '\\bibliographystyle{plain}\n';
        latex += '\\bibliography{references}\n\n';
    }

    // Add footer
    latex += `\\vfill\n`;
    latex += `\\begin{center}\n`;
    latex += `\\small\\textit{Generated by Papergraph --- \\url{https://papergraph.net}}\n`;
    latex += `\\end{center}\n\n`;

    latex += `\\end{document}\n`;

    // Generate BibTeX content
    let bibtex = '';
    if (articles && articles.length > 0) {
        articles.forEach(article => {
            if (article.bibtexId) {
                bibtex += articleToBibTeX(article) + '\n';
            }
        });
    }

    return { latex, bibtex };
}

// Make functions globally available
window.compileLatexOnline = compileLatexOnline;
window.generateLatexPreviewPDF = generateLatexPreviewPDF;
window.generateLatexWithBibtex = generateLatexWithBibtex;
