/**
 * Main Document Generator
 * Generates a master LaTeX document from multiple articles with bibliography
 */

/**
 * Generate BibTeX entry for an article
 */
function generateBibTeXEntry(article, index) {
    const key = article.bibtexId || `article${index + 1}`;

    let entry = `@article{${key},\n`;

    if (article.authors) {
        entry += `  author = {${escapeB

ibTeX(article.authors)}},\n`;
    }
    if (article.title) {
        entry += `  title = {${escapeBibTeX(article.title)}},\n`;
    }
    if (article.journal) {
        entry += `  journal = {${escapeBibTeX(article.journal)}},\n`;
    }
    if (article.year) {
        entry += `  year = {${article.year}},\n`;
    }
    if (article.volume) {
        entry += `  volume = {${article.volume}},\n`;
    }
    if (article.number) {
        entry += `  number = {${article.number}},\n`;
    }
    if (article.pages) {
        entry += `  pages = {${article.pages}},\n`;
    }
    if (article.doi) {
        entry += `  doi = {${article.doi}},\n`;
    }

    entry += `}\n`;

    return entry;
}

/**
 * Generate complete BibTeX file from articles
 */
function generateBibliography(articles) {
    if (!articles || articles.length === 0) {
        return '';
    }

    let bibContent = '% Generated Bibliography\n';
    bibContent += '% Created by PaperGraph\n\n';

    articles.forEach((article, index) => {
        if (article.bibtexId || article.title) {
            bibContent += generateBibTeXEntry(article, index);
            bibContent += '\n';
        }
    });

    return bibContent;
}

/**
 * Generate main LaTeX document
 */
function generateMainDocument(articles, projectMeta = {}) {
    const {
        title = 'Research Review',
        authorsData = [],
        affiliationsData = [],
        abstract = ''
    } = projectMeta;

    let tex = '';

    // ============================================================================
    // DOCUMENT CLASS AND PACKAGES
    // ============================================================================
    tex += '\\documentclass[11pt,a4paper]{article}\n\n';

    tex += '% Packages\n';
    tex += '\\usepackage[utf8]{inputenc}\n';
    tex += '\\usepackage[T1]{fontenc}\n';
    tex += '\\usepackage[margin=1in]{geometry}\n';
    tex += '\\usepackage{amsmath,amssymb}\n';
    tex += '\\usepackage{graphicx}\n';
    tex += '\\usepackage{hyperref}\n';
    tex += '\\usepackage{cite}\n';
    tex += '\\usepackage{url}\n';
    tex += '\\usepackage{xcolor}\n';
    tex += '\n';

    // Hyperref setup
    tex += '% Hyperref configuration\n';
    tex += '\\hypersetup{\n';
    tex += '  colorlinks=true,\n';
    tex += '  linkcolor=blue,\n';
    tex += '  citecolor=blue,\n';
    tex += '  urlcolor=blue\n';
    tex += '}\n\n';

    // ============================================================================
    // TITLE AND AUTHORS
    // ============================================================================
    tex += `\\title{${escapeLatex(title)}}\n`;

    // Authors
    if (authorsData && authorsData.length > 0) {
        tex += '\\author{';
        authorsData.forEach((author, idx) => {
            if (author.name && author.name.trim()) {
                tex += escapeLatex(author.name);

                // Add affiliation superscripts
                const affilNums = author.affiliationNumbers || [];
                if (affilNums && affilNums.length > 0) {
                    affilNums.forEach(num => {
                        tex += `\\textsuperscript{${num}}`;
                    });
                }

                // Add ORCID link
                if (author.orcid && author.orcid.trim()) {
                    tex += `\\,\\href{https://orcid.org/${escapeLatex(author.orcid)}}{\\textcolor{green!70!black}{\\scriptsize\\textbf{[iD]}}}`;
                }

                if (idx < authorsData.length - 1) {
                    tex += ', ';
                }
            }
        });
        tex += '}\n';

        // Affiliations
        if (affiliationsData && affiliationsData.length > 0) {
            tex += '\\date{\n';
            tex += '  \\vspace{0.5em}\\\\\n';
            tex += '  {\\small\\itshape\n';
            tex += '  \\begin{tabular}{@{}c@{}}\n';
            affiliationsData.forEach((affil, idx) => {
                if (affil.text && affil.text.trim()) {
                    tex += `  \\textsuperscript{${idx + 1}}${escapeLatex(affil.text)}`;
                    if (idx < affiliationsData.length - 1) {
                        tex += ' \\\\\n';
                    }
                }
            });
            tex += '\n  \\end{tabular}}\n';
            tex += '  \\\\[1.5em]\n';
            tex += '  \\today\n';
            tex += '}\n';
        } else {
            tex += '\\date{\\today}\n';
        }
    } else {
        tex += '\\date{\\today}\n';
    }

    tex += '\n';

    // ============================================================================
    // BEGIN DOCUMENT
    // ============================================================================
    tex += '\\begin{document}\n\n';
    tex += '\\maketitle\n\n';

    // Abstract
    if (abstract) {
        tex += '\\begin{abstract}\n';
        tex += escapeLatex(abstract);
        tex += '\n\\end{abstract}\n\n';
    }

    // Table of contents (optional)
    tex += '\\tableofcontents\n';
    tex += '\\newpage\n\n';

    // ============================================================================
    // ARTICLES SECTIONS
    // ============================================================================
    if (articles && articles.length > 0) {
        articles.forEach((article, index) => {
            const articleTitle = article.title || `Article ${index + 1}`;
            const citationKey = article.bibtexId || `article${index + 1}`;

            // Section header
            tex += `\\section{${escapeLatex(articleTitle)}`;
            if (article.bibtexId) {
                tex += `~\\cite{${citationKey}}`;
            }
            tex += '}\n\n';

            // Article metadata
            if (article.authors || article.year || article.journal) {
                tex += '\\textbf{Reference:} ';
                if (article.authors) {
                    tex += escapeLatex(article.authors);
                }
                if (article.year) {
                    tex += ` (${article.year})`;
                }
                if (article.journal) {
                    tex += `. \\textit{${escapeLatex(article.journal)}}`;
                }
                tex += '.\n\n';
            }

            // User notes (LaTeX content)
            if (article.text || article.user_notes) {
                tex += '\\subsection*{Notes}\n\n';
                const notes = article.text || article.user_notes || '';
                // Process content - handle LaTeX commands
                tex += processLatexContent(notes);
                tex += '\n\n';
            }

            // Abstract
            if (article.abstract) {
                tex += '\\subsection*{Abstract}\n\n';
                tex += escapeLatex(article.abstract);
                tex += '\n\n';
            }

            tex += '\\clearpage\n\n';
        });
    }

    // ============================================================================
    // BIBLIOGRAPHY
    // ============================================================================
    tex += '\\bibliographystyle{plain}\n';
    tex += '\\bibliography{references}\n\n';

    // ============================================================================
    // FOOTER
    // ============================================================================
    tex += '\\vfill\n';
    tex += '\\begin{center}\n';
    tex += '\\small\\textit{Generated by PaperGraph --- \\url{https://papergraph.net}}\n';
    tex += '\\end{center}\n\n';

    tex += '\\end{document}\n';

    return tex;
}

/**
 * Escape special LaTeX characters
 */
function escapeLatex(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Escape BibTeX special characters
 */
function escapeBibTeX(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/%/g, '\\%');
}

/**
 * Process LaTeX content (handle existing LaTeX commands)
 */
function processLatexContent(content) {
    if (!content) return '';

    // If content already contains LaTeX commands, return as-is
    if (content.includes('\\') || content.includes('{') || content.includes('}')) {
        return content;
    }

    // Otherwise, escape it
    return escapeLatex(content);
}

/**
 * Main generator function - combines everything
 */
async function generateAndCompile(articles, projectMeta, compiler) {
    console.log('📚 Generating main document...');
    console.log(`   Articles: ${articles.length}`);

    // Generate BibTeX
    const bibContent = generateBibliography(articles);
    console.log(`   Bibliography entries: ${articles.length}`);

    // Generate main LaTeX document
    const texContent = generateMainDocument(articles, projectMeta);
    console.log(`   Main document: ${texContent.length} characters`);

    // Compile to PDF
    console.log('🔄 Compiling with SwiftLaTeX...');
    const pdfBlob = await compiler.compileToPDF(texContent, {
        bibContent: bibContent
    });

    return {
        texContent,
        bibContent,
        pdfBlob
    };
}

// Export functions
window.DocumentGenerator = {
    generateBibliography,
    generateMainDocument,
    generateAndCompile,
    escapeLatex,
    escapeBibTeX
};

export {
    generateBibliography,
    generateMainDocument,
    generateAndCompile,
    escapeLatex,
    escapeBibTeX
};
