// ===== LATEX ONLINE COMPILATION SERVICE =====
/**
 * Online LaTeX compilation module
 * Supports:
 * - University of Halle LaTeX service (primary)
 * - YtoTech API (fallback)
 * - PDF preview generation
 * - Inline bibliography support
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
        service = 'auto', // 'auto', 'halle', 'ytotech'
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
 * Compile using University of Halle LaTeX Online service
 * https://latex.informatik.uni-halle.de/latex-online/
 */
async function compileWithUnivHalle(latexContent, bibtexContent, compiler) {
    console.log('Compiling LaTeX document with University of Halle service...');

    // Step 1: Submit the LaTeX content as form data
    const formData = new FormData();
    formData.append('filecontents[]', latexContent);
    formData.append('filename[]', 'main.tex');
    formData.append('engine', compiler || 'pdflatex');
    formData.append('return', 'pdf');

    const response = await fetch('https://latex.informatik.uni-halle.de/latex-online/latex.php', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`LaTeX compilation request failed: ${response.status}`);
    }

    // Step 2: Parse the HTML response to find the PDF download link
    const htmlResponse = await response.text();
    console.log('Received HTML response, parsing for PDF link...');

    // Look for PDF download link in the response
    const pdfLinkMatch = htmlResponse.match(/href=["']([^"']*\.pdf)["']/i);

    if (!pdfLinkMatch) {
        // Try alternative patterns
        const alternativeMatch = htmlResponse.match(/location\.href\s*=\s*["']([^"']*\.pdf)["']/i);
        if (!alternativeMatch) {
            console.error('HTML Response:', htmlResponse.substring(0, 1000));
            throw new Error('Could not find PDF download link in response');
        }
    }

    let pdfUrl = pdfLinkMatch ? pdfLinkMatch[1] : null;

    if (!pdfUrl) {
        throw new Error('PDF URL not found in response');
    }

    // Make URL absolute if it's relative
    if (pdfUrl.startsWith('/')) {
        pdfUrl = 'https://latex.informatik.uni-halle.de' + pdfUrl;
    } else if (!pdfUrl.startsWith('http')) {
        pdfUrl = 'https://latex.informatik.uni-halle.de/latex-online/' + pdfUrl;
    }

    console.log('Found PDF URL:', pdfUrl);

    // Step 3: Fetch the actual PDF
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }

    const pdfBlob = await pdfResponse.blob();
    console.log('PDF downloaded successfully, size:', pdfBlob.size, 'bytes');

    return pdfBlob;
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
