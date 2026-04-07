import { state } from '../../core/state.js';
import { showNotification } from '../../utils/helpers.js';
import { save } from '../../data/persistence.js';
import { getBibliography, escapeBibTeX, escapeLatex } from '../../data/bibliography.js';
import { generateBibtexContent, getExportFilename } from '../../data/export.js';
import { generateContentHash } from './sidebar.js';
import { listState } from './shared.js';

// ===== PDF PREVIEW & COMPILATION =====
// LaTeX compilation, PDF rendering, bibliography generation, and LaTeX preview

export function addPreviewToggle() {
    const previewLabel = document.querySelector('.preview-pane .pane-label');
    if (!previewLabel) return;

    const existingCompile = previewLabel.querySelector('.compile-pdf-btn');
    if (existingCompile) existingCompile.remove();
    const existingTex = previewLabel.querySelector('.download-tex-btn');
    if (existingTex) existingTex.remove();
    const existingPdf = previewLabel.querySelector('.download-pdf-btn');
    if (existingPdf) existingPdf.remove();

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    // PDF Compile button
    const compileBtn = document.createElement('button');
    compileBtn.className = 'compile-pdf-btn';
    compileBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6m0 0l-3-3m3 3l3-3M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>';
    compileBtn.title = 'Compile LaTeX to PDF';
    compileBtn.style.cssText = 'background: #4a90e2; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500;';

    const compileText = document.createElement('span');
    compileText.textContent = 'Compile';
    compileBtn.appendChild(compileText);

    compileBtn.onclick = async () => {
        await compileToPDFPreview();
    };

    // Download .zip button
    const downloadTexBtn = document.createElement('button');
    downloadTexBtn.className = 'download-tex-btn';
    downloadTexBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg><span style="margin-left: 4px;">.zip</span>';
    downloadTexBtn.title = 'Download LaTeX source (.zip with .tex and .bib)';
    downloadTexBtn.style.cssText = 'background: #6c757d; color: white; border: none; padding: 6px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; font-size: 12px;';

    downloadTexBtn.onclick = async () => {
        let latexContent = '';
        let bibContent = '';

        const cachedData = listState.pdfCache[state.activeNoteId];
        if (cachedData && cachedData.latexContent) {
            latexContent = cachedData.latexContent;
            bibContent = cachedData.bibContent || '';
        } else {
            try {
                if (state.appData.articles && state.appData.articles.length > 0) {
                    bibContent = generateBibliography(state.appData.articles);
                }

                if (state.activeNoteId === 'review') {
                    latexContent = window.generateLatexDocument
                        ? window.generateLatexDocument()
                        : generateFallbackLatexDocument(listState.latexEditor ? listState.latexEditor.getValue() : '');
                } else {
                    const editorContent = listState.latexEditor ? listState.latexEditor.getValue() : '';
                    if (!editorContent.trim()) {
                        showNotification('No content to export', 'warning');
                        return;
                    }
                    if (editorContent.includes('\\documentclass')) {
                        latexContent = editorContent;
                    } else {
                        const currentArticle = state.appData.articles.find(a => a.id === state.activeNoteId);
                        const articlesWithBibtex = state.appData.articles ? state.appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];
                        let preamble = `\\documentclass[11pt,a4paper]{article}\n\\usepackage{filecontents}\n\\usepackage[utf8]{inputenc}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{amsmath}\n\\usepackage{amssymb}\n\\usepackage{hyperref}\n\\usepackage{orcidlink}\n\\usepackage[numbers,sort&compress]{natbib}\n\n`;
                        if (articlesWithBibtex.length > 0 && bibContent && bibContent.trim()) {
                            preamble += '\\begin{filecontents}{references.bib}\n' + bibContent + '\\end{filecontents}\n\n';
                        }
                        preamble += '\\begin{document}\n\n';
                        if (currentArticle) {
                            preamble += `\\section*{${escapeLatex(currentArticle.title || 'Untitled')}`;
                            if (currentArticle.bibtexId && currentArticle.bibtexId.trim()) {
                                const citationKey = window.sanitizeCitationKey ? window.sanitizeCitationKey(currentArticle.bibtexId) : currentArticle.bibtexId;
                                preamble += ` \\cite{${citationKey}}`;
                            }
                            preamble += `}\n\n`;
                            const metadataParts = [];
                            if (currentArticle.authors && currentArticle.authors.trim()) metadataParts.push(escapeLatex(currentArticle.authors));
                            if (currentArticle.year && currentArticle.year.trim()) metadataParts.push(`(${escapeLatex(currentArticle.year)})`);
                            if (currentArticle.journal && currentArticle.journal.trim()) {
                                let journalText = escapeLatex(currentArticle.journal);
                                if (currentArticle.volume && currentArticle.volume.trim()) {
                                    journalText += ` ${escapeLatex(currentArticle.volume)}`;
                                    if (currentArticle.number && currentArticle.number.trim()) journalText += `(${escapeLatex(currentArticle.number)})`;
                                }
                                metadataParts.push(`\\textit{${journalText}}`);
                            }
                            if (metadataParts.length > 0) preamble += `{\\small ${metadataParts.join(', ')}}\n\n`;
                        }
                        const bibliography = articlesWithBibtex.length > 0 ? '\n\n\\bibliographystyle{plainnat}\n\\bibliography{references}\n\n' : '';
                        latexContent = preamble + editorContent + bibliography + '\\end{document}';
                    }
                }
            } catch (err) {
                console.error('Error generating LaTeX for download:', err);
                showNotification('Error generating LaTeX: ' + err.message, 'error');
                return;
            }
        }

        if (!latexContent.trim()) {
            showNotification('No content to export', 'warning');
            return;
        }

        try {
            const zip = new JSZip();
            zip.file('main.tex', latexContent);
            if (bibContent && bibContent.trim()) {
                zip.file('references.bib', bibContent);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getExportFilename('zip');
            a.click();
            URL.revokeObjectURL(url);
            showNotification('LaTeX source package downloaded!', 'success');
        } catch (error) {
            console.error('Download error:', error);
            showNotification('Error creating download: ' + error.message, 'error');
        }
    };

    // Download .pdf button
    const downloadPdfBtn = document.createElement('button');
    downloadPdfBtn.className = 'download-pdf-btn';
    downloadPdfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg><span style="margin-left: 4px;">.pdf</span>';
    downloadPdfBtn.title = 'Download compiled PDF';
    downloadPdfBtn.style.cssText = 'background: #28a745; color: white; border: none; padding: 6px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; font-size: 12px;';

    downloadPdfBtn.onclick = () => {
        const cachedData = listState.pdfCache[state.activeNoteId];
        
        if (!cachedData || !cachedData.pdfBlob) {
            showNotification('Please compile first', 'warning');
            return;
        }

        const url = URL.createObjectURL(cachedData.pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getExportFilename('pdf');
        a.click();
        URL.revokeObjectURL(url);
        showNotification('PDF downloaded!', 'success');
    };

    buttonContainer.appendChild(compileBtn);
    buttonContainer.appendChild(downloadTexBtn);
    buttonContainer.appendChild(downloadPdfBtn);
    previewLabel.appendChild(buttonContainer);
}

export async function compileToPDFPreview() {
    const previewContainer = document.getElementById('latexPreview');
    if (!previewContainer) return;

    const compileBtn = document.querySelector('.compile-pdf-btn');
    const downloadTexBtn = document.querySelector('.download-tex-btn');
    const downloadPdfBtn = document.querySelector('.download-pdf-btn');

    if (compileBtn) {
        compileBtn.disabled = true;
        const btnText = compileBtn.querySelector('span');
        if (btnText) btnText.textContent = 'Compiling...';
    }
    if (downloadTexBtn) downloadTexBtn.disabled = true;
    if (downloadPdfBtn) downloadPdfBtn.disabled = true;

    previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">🔄 Initializing SwiftLaTeX...</div>';

    try {
        if (!window.swiftLatexCompiler) {
            throw new Error('SwiftLaTeX compiler not loaded. Please refresh the page.');
        }

        console.log('🔄 Step 1: Initializing SwiftLaTeX engine...');
        await window.swiftLatexCompiler.initialize();
        console.log('✅ SwiftLaTeX engine ready');

        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">🔄 Preparing document...</div>';

        let latexContent = '';
        let bibContent = '';

        if (listState.latexEditor) {
            latexContent = listState.latexEditor.getValue();
        }

        if (!latexContent.trim()) {
            showNotification('No content to compile', 'warning');
        }

        if (state.appData.articles && state.appData.articles.length > 0) {
            bibContent = getBibliography();
        }

        if (state.activeNoteId === 'review') {
            if (window.generateLatexDocument) {
                latexContent = window.generateLatexDocument();
            } else {
                latexContent = generateFallbackLatexDocument(latexContent);
            }
        } else {
            if (!latexContent.includes('\\documentclass')) {
                const currentArticle = state.appData.articles.find(a => a.id === state.activeNoteId);
                
                let preamble = `\\documentclass[11pt,a4paper]{article}
\\usepackage{filecontents}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{hyperref}
\\usepackage{orcidlink}
\\usepackage[numbers,sort&compress]{natbib}

`;
                
                const articlesWithBibtex = state.appData.articles ? state.appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];
                if (articlesWithBibtex.length > 0 && bibContent && bibContent.trim()) {
                    preamble += '\\begin{filecontents}{references.bib}\n';
                    preamble += bibContent;
                    preamble += '\\end{filecontents}\n\n';
                }
                
                preamble += '\\begin{document}\n\n';
                
                if (currentArticle) {
                    preamble += `\\section*{${escapeLatex(currentArticle.title || 'Untitled')}`;
                    if (currentArticle.bibtexId && currentArticle.bibtexId.trim()) {
                        const citationKey = window.sanitizeCitationKey ? window.sanitizeCitationKey(currentArticle.bibtexId) : currentArticle.bibtexId;
                        preamble += ` \\cite{${citationKey}}`;
                    }
                    preamble += `}\n\n`;
                    
                    const metadataParts = [];
                    
                    if (currentArticle.authors && currentArticle.authors.trim()) {
                        metadataParts.push(escapeLatex(currentArticle.authors));
                    }
                    
                    if (currentArticle.year && currentArticle.year.trim()) {
                        metadataParts.push(`(${escapeLatex(currentArticle.year)})`);
                    }
                    
                    if (currentArticle.journal && currentArticle.journal.trim()) {
                        let journalText = escapeLatex(currentArticle.journal);
                        if (currentArticle.volume && currentArticle.volume.trim()) {
                            journalText += ` ${escapeLatex(currentArticle.volume)}`;
                            if (currentArticle.number && currentArticle.number.trim()) {
                                journalText += `(${escapeLatex(currentArticle.number)})`;
                            }
                        }
                        metadataParts.push(`\\textit{${journalText}}`);
                    }
                    
                    if (metadataParts.length > 0) {
                        preamble += `{\\small ${metadataParts.join(', ')}}\n\n`;
                    }
                }

                let bibliography = '';
                if (articlesWithBibtex.length > 0) {
                    bibliography = '\n\n\\bibliographystyle{plainnat}\n';
                    bibliography += '\\bibliography{references}\n\n';
                }

                latexContent = preamble + latexContent + bibliography + '\\end{document}';
            }
        }

        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">🔄 Compiling LaTeX with SwiftLaTeX...<br><small>This may take 5-30 seconds</small></div>';

        console.log('🚀 Step 2: Starting compilation...');
        console.log(`   Document: ${latexContent.length} chars`);
        console.log(`   Bibliography: ${bibContent.length} chars`);

        console.log('=== PREVIEW COMPILATION DEBUG ===');
        const citeCommands = latexContent.match(/\\cite\{([^}]+)\}/g);
        console.log('Citations in LaTeX:', citeCommands || 'NONE FOUND');
        const citationKeys = citeCommands ? citeCommands.map(c => c.match(/\{([^}]+)\}/)[1]) : [];
        console.log('Citation Keys:', citationKeys);
        const bibtexKeys = bibContent.match(/@\w+\{([^,]+),/g);
        console.log('BibTeX Entries:', bibtexKeys || 'NONE FOUND');
        const bibtexEntryKeys = bibtexKeys ? bibtexKeys.map(k => k.replace(/@\w+\{/, '').replace(',', '')) : [];
        console.log('BibTeX Keys:', bibtexEntryKeys);
        const missingKeys = citationKeys.filter(key => !bibtexEntryKeys.includes(key));
        if (missingKeys.length > 0) {
            console.error('❌ MISMATCH: Citations without BibTeX entries:', missingKeys);
        }
        const hasBibliographyCmd = latexContent.includes('\\bibliography{references}');
        console.log('Has \\bibliography{references}:', hasBibliographyCmd);
        console.log('Has \\bibliographystyle:', latexContent.includes('\\bibliographystyle'));
        console.log('Uses natbib:', /\\usepackage(\[.*?\])?\{natbib\}/.test(latexContent));
        console.log('=== END DEBUG ===');

        const pdfBlob = await window.swiftLatexCompiler.compileToPDF(latexContent, {
            bibContent: bibContent
        });

        console.log(`✅ PDF generated (${pdfBlob.size} bytes)`);

        const contentToHash = state.activeNoteId === 'review' ? (state.appData.projectReview || '') : (listState.latexEditor ? listState.latexEditor.getValue() : '');
        const contentHash = generateContentHash(contentToHash);
        listState.pdfCache[state.activeNoteId] = {
            pdfBlob: pdfBlob,
            latexContent: latexContent,
            bibContent: bibContent,
            contentHash: contentHash,
            timestamp: Date.now()
        };
        console.log(`💾 Cached PDF for ${state.activeNoteId} (hash: ${contentHash})`);

        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">📄 Rendering PDF preview...</div>';

        console.log('🔄 Step 3: Rendering PDF preview...');
        await renderPDFInContainer(pdfBlob, previewContainer);
        console.log('✅ PDF preview rendered');

        showNotification('PDF compiled successfully!', 'success');

    } catch (error) {
        console.error('❌ Compilation error:', error);
        previewContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #ef5350;">
                <strong>⚠️ Compilation Error:</strong><br>
                <span style="font-size: 14px;">${escapeHtml(error.message)}</span><br>
                <div style="margin-top: 12px; font-size: 13px; color: #6c757d;">
                    Check your LaTeX syntax. See browser console for detailed log.
                </div>
            </div>
        `;
        showNotification('LaTeX compilation failed: ' + error.message, 'error');
    } finally {
        if (compileBtn) {
            compileBtn.disabled = false;
            const btnText = compileBtn.querySelector('span');
            if (btnText) btnText.textContent = 'Compile';
        }
        if (downloadTexBtn) downloadTexBtn.disabled = false;
        if (downloadPdfBtn) downloadPdfBtn.disabled = false;
    }
}

// generateBibliography, escapeBibTeX, escapeLatex now imported from bibliography.js
export { escapeBibTeX, escapeLatex };

export function generateBibliography(articles) {
    return getBibliography();
}

export function generateFullLatexDocument(contentText) {
    return window.generateLatexDocument ? window.generateLatexDocument() : generateFallbackLatexDocument(contentText);
}

export function generateFallbackLatexDocument(contentText) {
    const savedStyle = localStorage.getItem('papergraph_latex_style');
    const style = savedStyle || getDefaultLatexStyle();
    
    const projectTitle = (state.appData.projectReviewMeta?.title) || 'Project Review';
    const authorsData = state.appData.projectReviewMeta?.authorsData || [];
    const affiliationsData = state.appData.projectReviewMeta?.affiliationsData || [];
    const projectAbstract = (state.appData.projectReviewMeta?.abstract) || '';
    
    let latex = style + '\n\n';
    
    latex += `\\title{${escapeLatex(projectTitle)}}\n`;
    
    latex += '\\author{';
    if (authorsData && authorsData.length > 0) {
        authorsData.forEach((author, idx) => {
            if (author.name && author.name.trim()) {
                latex += escapeLatex(author.name);
                const affilNums = author.affiliationNumbers || [];
                if (affilNums && affilNums.length > 0) {
                    affilNums.forEach(num => {
                        latex += `\\textsuperscript{${num}}`;
                    });
                }
                if (author.orcid && author.orcid.trim()) {
                    latex += `\\,\\orcidlink{${author.orcid}}`;
                }
                if (idx < authorsData.length - 1) {
                    latex += ', ';
                }
            }
        });
    }
    latex += '}\n';

    latex += '\n';
    latex += '\\date{';
    latex += '{\\small\\itshape\n';
    latex += '\\begin{tabular}{@{}c@{}}';
    if (affiliationsData && affiliationsData.length > 0) {
        const filledAffils = affiliationsData.filter(a => a.text && a.text.trim());
        if (filledAffils.length > 0) {
            latex += '\n';
            filledAffils.forEach((affil, idx) => {
                latex += `\\textsuperscript{${affiliationsData.indexOf(affil) + 1}}${escapeLatex(affil.text)}`;
                if (idx < filledAffils.length - 1) {
                    latex += ' \\\\\n';
                }
            });
            latex += '\n';
        }
    }
    latex += '\\end{tabular}}';
    latex += '\\\\[1.5em]\n';
    latex += '\\today}\n';
    
    latex += '\n\n';
    latex += `\\begin{document}\n\n`;
    latex += `\\maketitle\n\n`;
    
    if (projectAbstract && projectAbstract.trim()) {
        latex += `\\begin{abstract}\n`;
        latex += contentText.includes('\\') ? projectAbstract : escapeLatex(projectAbstract);
        latex += `\n\\end{abstract}\n\n`;
    }
    
    latex += contentText;
    
    const articlesWithBibtex = state.appData.articles ? state.appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];
    
    if (articlesWithBibtex.length > 0) {
        latex += '\\begin{thebibliography}{99}\n\n';

        articlesWithBibtex.forEach((article, index) => {
            const citationKey = window.sanitizeCitationKey ? window.sanitizeCitationKey(article.bibtexId) : article.bibtexId;
            latex += `\\bibitem{${citationKey}}\n`;

            if (article.authors) {
                latex += escapeLatex(article.authors) + '. ';
            }
            if (article.title) {
                latex += `\\textit{${escapeLatex(article.title)}}. `;
            }
            if (article.journal) {
                latex += escapeLatex(article.journal);
                if (article.volume) {
                    latex += ` \\textbf{${escapeLatex(article.volume)}}`;
                }
                if (article.number) {
                    latex += `(${escapeLatex(article.number)})`;
                }
                if (article.pages) {
                    latex += `, ${escapeLatex(article.pages)}`;
                }
                latex += '. ';
            }
            if (article.year) {
                latex += `(${escapeLatex(article.year)}).`;
            }
            latex += '\n\n';
        });

        latex += '\\end{thebibliography}\n\n';
    }
    
    latex += `\\end{document}\n`;
    
    return latex;
}

export async function renderPDFInContainer(pdfBlob, container) {
    container.innerHTML = '';
    container.style.cssText = 'padding: 0; margin: 0; width: 100%; height: 100%;';

    try {
        const pdfUrl = URL.createObjectURL(pdfBlob);

        const objectEl = document.createElement('object');
        objectEl.data = pdfUrl;
        objectEl.type = 'application/pdf';
        objectEl.style.cssText = 'width: 100%; height: 100%; border: none; margin: 0; padding: 0;';

        objectEl.innerHTML = `
            <embed src="${pdfUrl}" type="application/pdf" style="width: 100%; height: 100%; border: none; margin: 0; padding: 0;">
            <p style="padding: 20px; text-align: center;">
                Your browser does not support PDF viewing. 
                <a href="${pdfUrl}" download="document.pdf" style="color: #4a90e2; text-decoration: underline;">Download the PDF</a> to view it.
            </p>
        `;

        container.appendChild(objectEl);

        setTimeout(() => {
            // Keep the URL active as long as the viewer is open
        }, 1000);

    } catch (error) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #dc3545;">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Error Loading PDF</div>
                <div style="font-size: 14px;">${error.message}</div>
            </div>
        `;
        console.error('PDF rendering error:', error);
    }
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderLatexPreview(text, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    
    function getCitation(bibtexKeys, style) {
        const keys = bibtexKeys.split(',').map(k => k.trim()).filter(k => k);
        
        const citations = keys.map(bibtexId => {
            const article = state.appData.articles.find(a => a.bibtexId === bibtexId);
            if (!article) return { text: bibtexId, key: bibtexId, found: false };
            
            let authorName = 'Unknown';
            if (article.authors) {
                const firstAuthor = article.authors.split(/,|and/)[0].trim();
                const nameParts = firstAuthor.split(' ');
                authorName = nameParts[nameParts.length - 1];
            }
            
            const year = article.year || 'n.d.';
            return { text: `${authorName}, ${year}`, key: bibtexId, found: true, authorName, year };
        });
        
        if (style === 'citet') {
            if (citations.length === 1) {
                return citations[0].found ? 
                    `${citations[0].authorName} (${citations[0].year})` : 
                    `[${citations[0].text}]`;
            } else {
                return citations.map((c, i) => {
                    if (!c.found) return `[${c.text}]`;
                    return i === citations.length - 1 ? 
                        `and ${c.authorName} (${c.year})` : 
                        `${c.authorName} (${c.year})`;
                }).join(' ');
            }
        } else if (style === 'citep') {
            return `(${citations.map(c => c.text).join('; ')})`;
        } else {
            return `[${citations.map(c => c.text).join('; ')}]`;
        }
    }
    
    let processedText = text;
    const citationMap = new Map();
    let citationIndex = 0;
    
    processedText = processedText.replace(/\\cite\{([^}]+)\}/g, (match, keys) => {
        const placeholder = `CITATION_${citationIndex}`;
        citationMap.set(placeholder, { keys, style: 'cite' });
        citationIndex++;
        return placeholder;
    });
    processedText = processedText.replace(/\\citep\{([^}]+)\}/g, (match, keys) => {
        const placeholder = `CITATION_${citationIndex}`;
        citationMap.set(placeholder, { keys, style: 'citep' });
        citationIndex++;
        return placeholder;
    });
    processedText = processedText.replace(/\\citet\{([^}]+)\}/g, (match, keys) => {
        const placeholder = `CITATION_${citationIndex}`;
        citationMap.set(placeholder, { keys, style: 'citet' });
        citationIndex++;
        return placeholder;
    });
    
    const authorMap = new Map();
    let authorIndex = 0;
    processedText = processedText.replace(/\\author\{([^}]+)\}(\^\{([^}]+)\})?/g, (match, name, _, affNums) => {
        const placeholder = `AUTHOR_${authorIndex}`;
        authorMap.set(placeholder, { name, affNums });
        authorIndex++;
        return placeholder;
    });
    
    const affiliationMap = new Map();
    let affIndex = 0;
    processedText = processedText.replace(/\\affiliation\{([^}]+)\}(\^\{([^}]+)\})?/g, (match, text, _, num) => {
        const placeholder = `AFFILIATION_${affIndex}`;
        affiliationMap.set(placeholder, { text, num });
        affIndex++;
        return placeholder;
    });
    
    try {
        if (window.latexjs) {
            const latexDocument = `\\documentclass{article}
\\begin{document}
${processedText}
\\end{document}`;
            
            const generator = latexjs.parse(latexDocument, { generator: latexjs.HtmlGenerator });
            const compiled = generator.domFragment();
            
            container.innerHTML = '';
            container.appendChild(compiled);
            
            // Restore authors with affiliations
            authorMap.forEach((author, placeholder) => {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(placeholder)) {
                        const span = document.createElement('span');
                        span.className = 'latex-author';
                        span.innerHTML = author.name;
                        if (author.affNums) {
                            span.innerHTML += `<sup>${author.affNums}</sup>`;
                        }
                        
                        const parts = node.textContent.split(placeholder);
                        const parent = node.parentNode;
                        parent.insertBefore(document.createTextNode(parts[0]), node);
                        parent.insertBefore(span, node);
                        node.textContent = parts.slice(1).join(placeholder);
                    }
                }
            });
            
            // Restore affiliations
            affiliationMap.forEach((affiliation, placeholder) => {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(placeholder)) {
                        const span = document.createElement('span');
                        span.className = 'latex-affiliation';
                        span.style.cssText = 'font-size: 0.9em; font-style: italic; display: block;';
                        if (affiliation.num) {
                            span.innerHTML = `<sup>${affiliation.num}</sup>${affiliation.text}`;
                        } else {
                            span.textContent = affiliation.text;
                        }
                        
                        const parts = node.textContent.split(placeholder);
                        const parent = node.parentNode;
                        parent.insertBefore(document.createTextNode(parts[0]), node);
                        parent.insertBefore(span, node);
                        node.textContent = parts.slice(1).join(placeholder);
                    }
                }
            });
            
            // Restore citations
            citationMap.forEach((citation, placeholder) => {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(placeholder)) {
                        const keys = citation.keys.split(',').map(k => k.trim()).filter(k => k);
                        const wrapper = document.createElement('span');
                        wrapper.className = 'citation-wrapper';
                        
                        if (keys.length > 1) {
                            const prefix = citation.style === 'citep' ? '(' : citation.style === 'cite' ? '[' : '';
                            const suffix = citation.style === 'citep' ? ')' : citation.style === 'cite' ? ']' : '';
                            
                            if (prefix) wrapper.appendChild(document.createTextNode(prefix));
                            
                            keys.forEach((key, idx) => {
                                const article = state.appData.articles.find(a => a.bibtexId === key);
                                if (article) {
                                    const span = document.createElement('span');
                                    span.className = 'citation-link';
                                    span.setAttribute('data-bibtex', key);
                                    span.style.cssText = 'color: #1976d2; font-weight: 600; cursor: pointer; text-decoration: underline;';
                                    
                                    let authorName = 'Unknown';
                                    if (article.authors) {
                                        const firstAuthor = article.authors.split(/,|and/)[0].trim();
                                        const nameParts = firstAuthor.split(' ');
                                        authorName = nameParts[nameParts.length - 1];
                                    }
                                    const year = article.year || 'n.d.';
                                    
                                    if (citation.style === 'citet') {
                                        span.textContent = idx === keys.length - 1 ? 
                                            `and ${authorName} (${year})` : 
                                            `${authorName} (${year})`;
                                    } else {
                                        span.textContent = `${authorName}, ${year}`;
                                    }
                                    
                                    span.onclick = (e) => {
                                        e.preventDefault();
                                        selectNote(article.id);
                                    };
                                    
                                    wrapper.appendChild(span);
                                    if (idx < keys.length - 1) {
                                        wrapper.appendChild(document.createTextNode(citation.style === 'citet' ? ' ' : '; '));
                                    }
                                } else {
                                    const span = document.createElement('span');
                                    span.style.cssText = 'color: #d32f2f;';
                                    span.textContent = key;
                                    wrapper.appendChild(span);
                                    if (idx < keys.length - 1) {
                                        wrapper.appendChild(document.createTextNode('; '));
                                    }
                                }
                            });
                            
                            if (suffix) wrapper.appendChild(document.createTextNode(suffix));
                        } else {
                            const key = keys[0];
                            const article = state.appData.articles.find(a => a.bibtexId === key);
                            const citationText = getCitation(citation.keys, citation.style);
                            const span = document.createElement('span');
                            span.className = 'citation-link';
                            span.setAttribute('data-bibtex', key);
                            
                            if (article) {
                                span.style.cssText = 'color: #1976d2; font-weight: 600; cursor: pointer; text-decoration: underline;';
                                span.onclick = (e) => {
                                    e.preventDefault();
                                    selectNote(article.id);
                                };
                            } else {
                                span.style.cssText = 'color: #d32f2f; font-weight: 600;';
                            }
                            
                            span.textContent = citationText;
                            wrapper.appendChild(span);
                        }
                        
                        const parts = node.textContent.split(placeholder);
                        const parent = node.parentNode;
                        parent.insertBefore(document.createTextNode(parts[0]), node);
                        parent.insertBefore(wrapper, node);
                        node.textContent = parts.slice(1).join(placeholder);
                    }
                }
            });
            
            // Section numbering
            let sectionNum = 0, subsectionNum = 0, subsubsectionNum = 0;
            container.querySelectorAll('h1, .section').forEach(h1 => {
                sectionNum++;
                subsectionNum = 0;
                subsubsectionNum = 0;
                const currentText = h1.textContent.trim();
                if (!currentText.match(/^\d+\./)) {
                    h1.textContent = `${sectionNum}. ${currentText}`;
                }
            });
            container.querySelectorAll('h2, .subsection').forEach(h2 => {
                subsectionNum++;
                subsubsectionNum = 0;
                const currentText = h2.textContent.trim();
                if (!currentText.match(/^\d+\.\d+\./)) {
                    h2.textContent = `${sectionNum}.${subsectionNum}. ${currentText}`;
                }
            });
            container.querySelectorAll('h3, .subsubsection').forEach(h3 => {
                subsubsectionNum++;
                const currentText = h3.textContent.trim();
                if (!currentText.match(/^\d+\.\d+\.\d+\./)) {
                    h3.textContent = `${sectionNum}.${subsectionNum}.${subsubsectionNum}. ${currentText}`;
                }
            });
        } else {
            throw new Error('LaTeX.js not loaded');
        }
    } catch(e) {
        console.warn('LaTeX.js compilation failed, using fallback:', e);
        renderLatexFallback(processedText, container, citationMap, authorMap, affiliationMap, getCitation);
    }
    
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch((err) => {
            console.warn('MathJax error:', err);
        });
    }
}

export function renderLatexFallback(text, container, citationMap, authorMap, affiliationMap, getCitation) {
    let htmlContent = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    
    authorMap.forEach((author, placeholder) => {
        let authorHtml = author.name;
        if (author.affNums) {
            authorHtml += `<sup>${author.affNums}</sup>`;
        }
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), 
            `<span class="latex-author">${authorHtml}</span>`);
    });
    
    affiliationMap.forEach((affiliation, placeholder) => {
        let affHtml = affiliation.text;
        if (affiliation.num) {
            affHtml = `<sup>${affiliation.num}</sup>${affHtml}`;
        }
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), 
            `<span class="latex-affiliation" style="font-size: 0.9em; font-style: italic; display: block;">${affHtml}</span>`);
    });
    
    citationMap.forEach((citation, placeholder) => {
        const keys = citation.keys.split(',').map(k => k.trim()).filter(k => k);
        let citationHtml = '';
        
        if (keys.length > 1) {
            const prefix = citation.style === 'citep' ? '(' : citation.style === 'cite' ? '[' : '';
            const suffix = citation.style === 'citep' ? ')' : citation.style === 'cite' ? ']' : '';
            citationHtml = prefix;
            
            keys.forEach((key, idx) => {
                const article = state.appData.articles.find(a => a.bibtexId === key);
                if (article) {
                    let authorName = 'Unknown';
                    if (article.authors) {
                        const firstAuthor = article.authors.split(/,|and/)[0].trim();
                        const nameParts = firstAuthor.split(' ');
                        authorName = nameParts[nameParts.length - 1];
                    }
                    const year = article.year || 'n.d.';
                    const linkText = citation.style === 'citet' && idx === keys.length - 1 ?
                        `and ${authorName} (${year})` :
                        citation.style === 'citet' ?
                        `${authorName} (${year})` :
                        `${authorName}, ${year}`;
                    
                    citationHtml += `<span class="citation-link" data-bibtex="${key}" style="color: #1976d2; font-weight: 600; cursor: pointer; text-decoration: underline;">${linkText}</span>`;
                } else {
                    citationHtml += `<span style="color: #d32f2f;">${key}</span>`;
                }
                
                if (idx < keys.length - 1) {
                    citationHtml += citation.style === 'citet' ? ' ' : '; ';
                }
            });
            citationHtml += suffix;
        } else {
            const citationText = getCitation(citation.keys, citation.style);
            const article = state.appData.articles.find(a => a.bibtexId === keys[0]);
            const color = article ? '#1976d2' : '#d32f2f';
            citationHtml = `<span class="citation-link" data-bibtex="${keys[0]}" style="color: ${color}; font-weight: 600; cursor: pointer; text-decoration: underline;">${citationText}</span>`;
        }
        
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), citationHtml);
    });
    
    htmlContent = htmlContent
        .replace(/\\section\{([^}]+)\}/g, '<h1>$1</h1>')
        .replace(/\\subsection\{([^}]+)\}/g, '<h2>$1</h2>')
        .replace(/\\subsubsection\{([^}]+)\}/g, '<h3>$1</h3>')
        .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
        .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
        .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
        .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
        .replace(/\\texttt\{([^}]+)\}/g, '<code>$1</code>')
        .replace(/\\begin\{itemize\}/g, '<ul>')
        .replace(/\\end\{itemize\}/g, '</ul>')
        .replace(/\\begin\{enumerate\}/g, '<ol>')
        .replace(/\\end\{enumerate\}/g, '</ol>')
        .replace(/\\item\s*/g, '<li>')
        .replace(/\\\\/g, '<br>')
        .replace(/\\newline/g, '<br>')
        .replace(/\n\n+/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    container.innerHTML = '<div class="latex-content"><p>' + htmlContent + '</p></div>';
    
    let sectionNum = 0, subsectionNum = 0, subsubsectionNum = 0;
    container.querySelectorAll('h1').forEach(h1 => {
        sectionNum++;
        subsectionNum = 0;
        subsubsectionNum = 0;
        if (!h1.textContent.match(/^\d+\./)) {
            h1.textContent = `${sectionNum}. ${h1.textContent}`;
        }
    });
    container.querySelectorAll('h2').forEach(h2 => {
        subsectionNum++;
        subsubsectionNum = 0;
        if (!h2.textContent.match(/^\d+\.\d+\./)) {
            h2.textContent = `${sectionNum}.${subsectionNum}. ${h2.textContent}`;
        }
    });
    container.querySelectorAll('h3').forEach(h3 => {
        subsubsectionNum++;
        if (!h3.textContent.match(/^\d+\.\d+\.\d+\./)) {
            h3.textContent = `${sectionNum}.${subsectionNum}.${subsubsectionNum}. ${h3.textContent}`;
        }
    });
    
    container.querySelectorAll('.citation-link').forEach(citation => {
        citation.onclick = (e) => {
            e.preventDefault();
            const bibtexId = citation.getAttribute('data-bibtex');
            const article = state.appData.articles.find(a => a.bibtexId === bibtexId);
            if (article) {
                selectNote(article.id);
            }
        };
    });
}
