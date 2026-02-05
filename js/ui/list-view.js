// ===== LIST VIEW (NOTEBOOK MODE) =====

// Global editor instance
let latexEditor = null;

// PDF cache for compiled documents (key: articleId or 'review', value: {pdfBlob, latexContent, bibContent, contentHash, timestamp})
let pdfCache = {};

// Helper function to generate hash from content
function generateContentHash(content) {
    // Simple hash function for content comparison
    let hash = 0;
    if (!content) return hash;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

function renderListView(searchTerm = '') {
    const sidebar = document.getElementById('sidebarContent');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    // 1. Always add Review as first item
    const reviewTitle = (appData.projectReviewMeta && appData.projectReviewMeta.title) 
        ? appData.projectReviewMeta.title 
        : 'Project Review';
    
    const reviewItem = document.createElement('div');
    reviewItem.className = 'sidebar-item review-item';
    reviewItem.dataset.id = 'review';
    reviewItem.innerHTML = `
        <div class="sidebar-item-title">📄 ${reviewTitle}</div>
        <div class="sidebar-item-meta">
            <span class="meta-bibtex">Main Document</span>
        </div>
    `;
    reviewItem.onclick = () => selectNote('review');
    sidebar.appendChild(reviewItem);

    // 2. Filter Articles
    let filtered = appData.articles;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(a => 
            (a.title && a.title.toLowerCase().includes(term)) || 
            (a.authors && a.authors.toLowerCase().includes(term)) ||
            (a.bibtexId && a.bibtexId.toLowerCase().includes(term))
        );
    }

    // 3. Render Article List
    filtered.forEach(article => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.dataset.id = article.id;
        
        const displayAuthors = article.authors ? article.authors : 'No authors';
        const displayKey = article.bibtexId ? article.bibtexId : 'No Key';
        
        // Build tags HTML
        let tagsHTML = '';
        if (article.categories && article.categories.length > 0) {
            tagsHTML = '<div class="sidebar-item-tags">';
            article.categories.forEach(cat => {
                const zone = tagZones.find(z => z.tag === cat);
                const bgColor = zone ? zone.color : '#e3f2fd';
                const textColor = zone ? getContrastColor(zone.color) : '#1976d2';
                tagsHTML += `<span class="sidebar-tag" style="background: ${bgColor}; color: ${textColor};">${cat}</span>`;
            });
            tagsHTML += '</div>';
        }

        item.innerHTML = `
            <div class="sidebar-item-title">${article.title || 'Untitled'}</div>
            <div class="sidebar-item-meta">
                <span class="meta-bibtex">${displayKey}</span>
                <span class="meta-authors">${displayAuthors}</span>
            </div>
            ${tagsHTML}
        `;
        
        item.onclick = () => selectNote(article.id);
        sidebar.appendChild(item);
    });

    // 4. Restore State or default to review
    if (activeNoteId) {
        const activeItem = sidebar.querySelector(`.sidebar-item[data-id="${activeNoteId}"]`);
        if(activeItem) activeItem.classList.add('active');
        
        if (activeNoteId === 'review') {
            loadReviewToEditor();
        } else {
            loadArticleToEditor(activeNoteId);
        }
    } else {
        // Default to showing project review
        activeNoteId = 'review';
        const reviewItemEl = sidebar.querySelector('.sidebar-item[data-id="review"]');
        if (reviewItemEl) reviewItemEl.classList.add('active');
        loadReviewToEditor();
    }
}

function selectNote(id) {
    activeNoteId = id;
    
    // Update UI Highlight
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.sidebar-item[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    if (id === 'review') {
        loadReviewToEditor();
    } else {
        loadArticleToEditor(id);
    }
}

function loadArticleToEditor(id) {
    const article = appData.articles.find(a => a.id === id);
    if (!article) return;

    document.getElementById('editorEmptyState').style.display = 'none';
    document.getElementById('articleEditorState').style.display = 'flex';

    // Hide authors section and abstract row (only for review)
    const authorsSection = document.getElementById('authorsSection');
    const abstractRow = document.getElementById('abstractRow');
    if (authorsSection) authorsSection.style.display = 'none';
    if (abstractRow) abstractRow.style.display = 'none';

    // Show regular authors field for articles
    const authorsRow = document.querySelector('.authors-row');
    if (!authorsRow) {
        // Create authors row if it doesn't exist
        const metadataSection = document.querySelector('.editor-metadata-section');
        const titleEl = document.getElementById('noteTitle');
        if (metadataSection && titleEl) {
            const row = document.createElement('div');
            row.className = 'authors-row';
            row.innerHTML = `
                <label>Authors:</label>
                <div id="noteAuthors" class="editable-field" contenteditable="true"></div>
                <div id="metadataLinks" class="metadata-links"></div>
            `;
            titleEl.parentNode.insertBefore(row, titleEl.nextSibling);
        }
    } else {
        authorsRow.style.display = 'flex';
    }

    // Bind Data
    bindEditableField('noteCitationKey', article, 'bibtexId');
    bindEditableField('noteTitle', article, 'title');
    bindEditableField('noteAuthors', article, 'authors');
    bindEditableField('noteYear', article, 'year');
    
    // Add link and PDF buttons (compact style)
    const linksContainer = document.getElementById('metadataLinks');
    if (linksContainer) linksContainer.innerHTML = '';
    
    if (article.link) {
        const linkBtn = document.createElement('a');
        linkBtn.className = 'metadata-btn';
        linkBtn.href = article.link;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noopener';
        linkBtn.textContent = '🔗 Link';
        linksContainer.appendChild(linkBtn);
    }
    
    if (article.pdf) {
        const pdfBtn = document.createElement('a');
        pdfBtn.className = 'metadata-btn';
        pdfBtn.href = article.pdf;
        pdfBtn.target = '_blank';
        pdfBtn.rel = 'noopener';
        pdfBtn.textContent = '📕 PDF';
        linksContainer.appendChild(pdfBtn);
    }

    // Initialize CodeMirror LaTeX Editor
    const contentEl = document.getElementById('noteContent');

    // Destroy previous editor if exists
    if (latexEditor) {
        latexEditor.destroy();
        latexEditor = null;
    }

    // Check if we have a cached PDF for this article
    const previewContainer = document.getElementById('latexPreview');
    if (previewContainer) {
        const cachedPdf = pdfCache[id];
        if (cachedPdf && cachedPdf.pdfBlob) {
            // Try to load cached PDF if content hasn't changed
            const currentContentHash = generateContentHash(article.text || '');
            if (cachedPdf.contentHash === currentContentHash) {
                console.log(`📦 Loading cached PDF for article ${id}`);
                previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">📄 Loading cached PDF preview...</div>';
                renderPDFInContainer(cachedPdf.pdfBlob, previewContainer).catch(() => {
                    // If loading fails, show compile instruction
                    previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
                });
            } else {
                // Content changed, show compile instruction
                previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
            }
        } else {
            // No cache, show instruction
            previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
        }
    }

    // Initialize editor with auto-save
    let saveTimer = null;
    latexEditor = window.initLatexEditor(contentEl, article.text || '', (content) => {
        // Auto-save after 1 second of no typing
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (article.text !== content) {
                article.text = content;
                saveToLocalStorage(true);
            }
        }, 1000);
    });
    
    // Render tags
    const tagsContainer = document.getElementById('noteTags');
    tagsContainer.innerHTML = '';
    if (article.categories) {
        article.categories.forEach(cat => {
            const tag = document.createElement('span');
            tag.className = 'category-tag';
            tag.textContent = cat;
            
            // Find zone color for this category
            const zone = tagZones.find(z => z.tag === cat);
            if (zone) {
                tag.style.background = zone.color;
                tag.style.borderColor = zone.color;
                tag.style.color = getContrastColor(zone.color);
            }
            
            tagsContainer.appendChild(tag);
        });
    }
    
    // Add toggle button to preview pane label
    addPreviewToggle();
}

// Add PDF compile and download buttons to preview pane
function addPreviewToggle() {
    const previewLabel = document.querySelector('.preview-pane .pane-label');
    if (!previewLabel) return;

    // Remove existing buttons if any
    const existingCompile = previewLabel.querySelector('.compile-pdf-btn');
    if (existingCompile) existingCompile.remove();
    const existingTex = previewLabel.querySelector('.download-tex-btn');
    if (existingTex) existingTex.remove();
    const existingPdf = previewLabel.querySelector('.download-pdf-btn');
    if (existingPdf) existingPdf.remove();

    // Create button container
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

    // Download .tex button (now downloads .zip with .tex and .bib)
    const downloadTexBtn = document.createElement('button');
    downloadTexBtn.className = 'download-tex-btn';
    downloadTexBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg><span style="margin-left: 4px;">.zip</span>';
    downloadTexBtn.title = 'Download LaTeX source (.zip with .tex and .bib)';
    downloadTexBtn.style.cssText = 'background: #6c757d; color: white; border: none; padding: 6px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; font-size: 12px;';

    downloadTexBtn.onclick = async () => {
        // Use cached data for current article/review
        const cachedData = pdfCache[activeNoteId];
        
        if (!cachedData || !cachedData.latexContent) {
            showNotification('Please compile first', 'warning');
            return;
        }

        try {
            // Create ZIP file with main.tex and references.bib
            const zip = new JSZip();
            zip.file('main.tex', cachedData.latexContent);
            
            if (cachedData.bibContent && cachedData.bibContent.trim()) {
                zip.file('references.bib', cachedData.bibContent);
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
        // Use cached data for current article/review
        const cachedData = pdfCache[activeNoteId];
        
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

// Compile current content to PDF and display in preview
async function compileToPDFPreview() {
    const previewContainer = document.getElementById('latexPreview');
    if (!previewContainer) return;

    // Show loading state
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
        // Initialize SwiftLaTeX if needed
        if (!window.swiftLatexCompiler) {
            throw new Error('SwiftLaTeX compiler not loaded. Please refresh the page.');
        }

        console.log('🔄 Step 1: Initializing SwiftLaTeX engine...');
        await window.swiftLatexCompiler.initialize();
        console.log('✅ SwiftLaTeX engine ready');

        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">🔄 Preparing document...</div>';

        let latexContent = '';
        let bibContent = '';

        // Get content from editor (not contentEl - now using CodeMirror)
        if (latexEditor) {
            latexContent = latexEditor.getValue();
        }

        if (!latexContent.trim()) {
            showNotification('No content to compile', 'warning');
            return;
        }

        // Always generate BibTeX bibliography if there are articles
        if (appData.articles && appData.articles.length > 0) {
            bibContent = generateBibliography(appData.articles);
            console.log(`📚 Generated bibliography with ${appData.articles.length} entries`);
            console.log('📚 Bibliography preview:', bibContent.substring(0, 200) + '...');
        } else {
            console.log('⚠️ No articles found for bibliography');
        }

        // For project review, generate full document like export
        if (activeNoteId === 'review') {
            // Use the same format as export.js generateLatexDocument() - it generates everything
            if (window.generateLatexDocument) {
                latexContent = window.generateLatexDocument();
            } else {
                // Fallback if export.js not loaded yet
                latexContent = generateFallbackLatexDocument(latexContent);
            }
        } else {
            // For articles, add minimal document wrapper if not present
            if (!latexContent.includes('\\documentclass')) {
                // Get current article data
                const currentArticle = appData.articles.find(a => a.id === activeNoteId);
                
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
                
                // Add embedded bibliography using filecontents (before \begin{document})
                const articlesWithBibtex = appData.articles ? appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];
                if (articlesWithBibtex.length > 0 && bibContent && bibContent.trim()) {
                    preamble += '\\begin{filecontents}{references.bib}\n';
                    preamble += bibContent;
                    preamble += '\\end{filecontents}\n\n';
                }
                
                preamble += '\\begin{document}\n\n';
                
                // Add article title (minimal styling)
                if (currentArticle) {
                    preamble += `\\section*{${escapeLatex(currentArticle.title || 'Untitled')}`;
                    if (currentArticle.bibtexId && currentArticle.bibtexId.trim()) {
                        const citationKey = window.sanitizeCitationKey ? window.sanitizeCitationKey(currentArticle.bibtexId) : currentArticle.bibtexId;
                        preamble += ` \\cite{${citationKey}}`;
                    }
                    preamble += `}\n\n`;
                    
                    // Add authors and metadata below title (minimal styling)
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
                

                // Generate bibliography
                let bibliography = '';
                
                if (articlesWithBibtex.length > 0) {
                    bibliography = '\n\n\\bibliographystyle{plainnat}\n';
                    bibliography += '\\bibliography{references}\n\n';
                }

                latexContent = preamble + latexContent + bibliography + '\\end{document}';
            }
        }

        // Update status
        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">🔄 Compiling LaTeX with SwiftLaTeX...<br><small>This may take 5-30 seconds</small></div>';

        // Compile with SwiftLaTeX
        console.log('🚀 Step 2: Starting compilation...');
        console.log(`   Document: ${latexContent.length} chars`);
        console.log(`   Bibliography: ${bibContent.length} chars`);

        // ===== DEBUGGING: Show what we're sending to compiler =====
        console.log('=== PREVIEW COMPILATION DEBUG ===');
        
        // Extract and show all \cite commands
        const citeCommands = latexContent.match(/\\cite\{([^}]+)\}/g);
        console.log('Citations in LaTeX:', citeCommands || 'NONE FOUND');
        
        // Extract citation keys
        const citationKeys = citeCommands ? citeCommands.map(c => c.match(/\{([^}]+)\}/)[1]) : [];
        console.log('Citation Keys:', citationKeys);
        
        // Extract BibTeX entry keys
        const bibtexKeys = bibContent.match(/@\w+\{([^,]+),/g);
        console.log('BibTeX Entries:', bibtexKeys || 'NONE FOUND');
        const bibtexEntryKeys = bibtexKeys ? bibtexKeys.map(k => k.replace(/@\w+\{/, '').replace(',', '')) : [];
        console.log('BibTeX Keys:', bibtexEntryKeys);
        
        // Check for mismatches
        const missingKeys = citationKeys.filter(key => !bibtexEntryKeys.includes(key));
        if (missingKeys.length > 0) {
            console.error('❌ MISMATCH: Citations without BibTeX entries:', missingKeys);
        }
        
        // Check if \bibliography command exists
        const hasBibliographyCmd = latexContent.includes('\\bibliography{references}');
        console.log('Has \\bibliography{references}:', hasBibliographyCmd);
        console.log('Has \\bibliographystyle:', latexContent.includes('\\bibliographystyle'));
        
        // Show natbib detection
        console.log('Uses natbib:', /\\usepackage(\[.*?\])?\{natbib\}/.test(latexContent));
        
        console.log('=== END DEBUG ===');

        const pdfBlob = await window.swiftLatexCompiler.compileToPDF(latexContent, {
            bibContent: bibContent
        });

        console.log(`✅ PDF generated (${pdfBlob.size} bytes)`);

        // Cache the compiled PDF with content hash and LaTeX/Bib content
        const contentToHash = activeNoteId === 'review' ? (appData.projectReview || '') : (latexEditor ? latexEditor.getValue() : '');
        const contentHash = generateContentHash(contentToHash);
        pdfCache[activeNoteId] = {
            pdfBlob: pdfBlob,
            latexContent: latexContent,
            bibContent: bibContent,
            contentHash: contentHash,
            timestamp: Date.now()
        };
        console.log(`💾 Cached PDF for ${activeNoteId} (hash: ${contentHash})`);

        // Update status
        previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">📄 Rendering PDF preview...</div>';

        // Render PDF using PDF.js
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
        // Restore button state
        if (compileBtn) {
            compileBtn.disabled = false;
            const btnText = compileBtn.querySelector('span');
            if (btnText) btnText.textContent = 'Compile';
        }
        if (downloadTexBtn) downloadTexBtn.disabled = false;
        if (downloadPdfBtn) downloadPdfBtn.disabled = false;
    }
}

/**
 * Generate BibTeX bibliography from articles
 */
function generateBibliography(articles) {
    if (!articles || articles.length === 0) return '';

    let bib = '% Generated Bibliography\n\n';

    articles.forEach((article, index) => {
        if (!article.bibtexId) return;

        const key = article.bibtexId;
        bib += `@article{${key},\n`;

        // Convert comma-separated authors to 'and' separated for BibTeX
        if (article.authors) {
            const authorsFormatted = article.authors.split(',').map(a => a.trim()).join(' and ');
            bib += `  author = {${escapeBibTeX(authorsFormatted)}},\n`;
        }
        if (article.title) bib += `  title = {${escapeBibTeX(article.title)}},\n`;
        if (article.journal) bib += `  journal = {${escapeBibTeX(article.journal)}},\n`;
        if (article.year) bib += `  year = {${article.year}},\n`;
        if (article.volume) bib += `  volume = {${article.volume}},\n`;
        if (article.number) bib += `  number = {${article.number}},\n`;
        if (article.pages) bib += `  pages = {${article.pages}},\n`;
        if (article.doi) bib += `  doi = {${article.doi}},\n`;

        bib += `}\n\n`;
    });

    return bib;
}

/**
 * Escape special BibTeX characters
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
 * Escape special LaTeX characters (for regular text)
 */
function escapeLatex(text) {
    if (!text) return '';
    return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/</g, '\\textless{}')
        .replace(/>/g, '\\textgreater{}');
}

/**
 * Generate full LaTeX document like export (with title, authors, affiliations, abstract)
 * This uses the same method as export.js generateLatexDocument for consistency
 */
function generateFullLatexDocument(contentText) {
    // Use the export module's function to ensure consistency
    // We'll generate the full document including the main content
    return window.generateLatexDocument ? window.generateLatexDocument() : generateFallbackLatexDocument(contentText);
}

/**
 * Fallback LaTeX document generator if export module not loaded
 */
function generateFallbackLatexDocument(contentText) {
    // Get LaTeX template from localStorage or use default
    const savedStyle = localStorage.getItem('papergraph_latex_style');
    const style = savedStyle || getDefaultLatexStyle();
    
    // Get project metadata
    const projectTitle = (appData.projectReviewMeta?.title) || 'Project Review';
    const authorsData = appData.projectReviewMeta?.authorsData || [];
    const affiliationsData = appData.projectReviewMeta?.affiliationsData || [];
    const projectAbstract = (appData.projectReviewMeta?.abstract) || '';
    
    // Start LaTeX document
    let latex = style + '\n\n';
    
    latex += `\\title{${escapeLatex(projectTitle)}}\n`;
    
    // Handle authors with superscript affiliation numbers and ORCID
    latex += '\\author{';
    if (authorsData && authorsData.length > 0) {
        authorsData.forEach((author, idx) => {
            if (author.name && author.name.trim()) {
                latex += escapeLatex(author.name);

                // Add affiliation superscripts
                const affilNums = author.affiliationNumbers || [];
                if (affilNums && affilNums.length > 0) {
                    affilNums.forEach(num => {
                        latex += `\\textsuperscript{${num}}`;
                    });
                }

                // Add ORCID logo and link if provided
                if (author.orcid && author.orcid.trim()) {
                    // Don't escape ORCID - it's a URL/identifier
                    latex += `\\,\\orcidlink{${author.orcid}}`;
                }

                // Add separator between authors
                if (idx < authorsData.length - 1) {
                    latex += ', ';
                }
            }
        });
    }
    latex += '}\n';
    
    // Output affiliations below authors
    if (affiliationsData && affiliationsData.length > 0) {
        latex += '\n';
        latex += '\\date{';
        latex += '\\vspace{0.5em}';
        latex += '{\\small\\itshape\n';
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
    
    // Add abstract if exists
    if (projectAbstract && projectAbstract.trim()) {
        latex += `\\begin{abstract}\n`;
        latex += contentText.includes('\\') ? projectAbstract : escapeLatex(projectAbstract);
        latex += `\n\\end{abstract}\n\n`;
    }
    
    // Add main content
    latex += contentText;
    
    // Add bibliography section using manual bibliography (not BibTeX)
    // This works with SwiftLaTeX single-pass compilation
    const articlesWithBibtex = appData.articles ? appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];
    
    if (articlesWithBibtex.length > 0) {
        latex += '\\begin{thebibliography}{99}\n\n';

        articlesWithBibtex.forEach((article, index) => {
            // Use the article's bibtexId as the citation key (sanitized)
            const citationKey = window.sanitizeCitationKey ? window.sanitizeCitationKey(article.bibtexId) : article.bibtexId;
            latex += `\\bibitem{${citationKey}}\n`;

            // Format: Authors. Title. Journal, Volume(Number), Pages. Year.
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

// Simple PDF viewer using default system PDF viewer (object/embed tag)
async function renderPDFInContainer(pdfBlob, container) {
    // Clear container and reset styles
    container.innerHTML = '';
    container.style.cssText = 'padding: 0; margin: 0; width: 100%; height: 100%;';

    try {
        // Create object URL for the PDF
        const pdfUrl = URL.createObjectURL(pdfBlob);

        // Create object element to embed PDF with native viewer
        const objectEl = document.createElement('object');
        objectEl.data = pdfUrl;
        objectEl.type = 'application/pdf';
        objectEl.style.cssText = 'width: 100%; height: 100%; border: none; margin: 0; padding: 0;';

        // Fallback for browsers that don't support PDF viewing
        objectEl.innerHTML = `
            <embed src="${pdfUrl}" type="application/pdf" style="width: 100%; height: 100%; border: none; margin: 0; padding: 0;">
            <p style="padding: 20px; text-align: center;">
                Your browser does not support PDF viewing. 
                <a href="${pdfUrl}" download="document.pdf" style="color: #4a90e2; text-decoration: underline;">Download the PDF</a> to view it.
            </p>
        `;

        container.appendChild(objectEl);

        // Clean up the object URL after a delay to ensure the PDF loads
        setTimeout(() => {
            // Note: We keep the URL active as long as the viewer is open
            // URL.revokeObjectURL(pdfUrl);
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

function loadReviewToEditor() {
    document.getElementById('editorEmptyState').style.display = 'none';
    document.getElementById('articleEditorState').style.display = 'flex';

    // Initialize review metadata if not exists
    if (!appData.projectReviewMeta) {
        appData.projectReviewMeta = {
            title: "Project Review",
            authorsData: [{name: "", affiliationNumbers: []}],
            affiliationsData: [{text: ""}],
            abstract: ""
        };
    }
    
    // Ensure authorsData and affiliationsData exist
    if (!appData.projectReviewMeta.authorsData) {
        appData.projectReviewMeta.authorsData = [{name: "", affiliationNumbers: []}];
    }
    if (!appData.projectReviewMeta.affiliationsData) {
        appData.projectReviewMeta.affiliationsData = [{text: ""}];
    }

    // Hide regular authors row (for articles only)
    const authorsRow = document.querySelector('.authors-row');
    if (authorsRow) authorsRow.style.display = 'none';

    // Set metadata for review - make editable
    document.getElementById('noteCitationKey').textContent = 'review';
    document.getElementById('noteCitationKey').contentEditable = 'false';
    
    const titleEl = document.getElementById('noteTitle');
    titleEl.textContent = appData.projectReviewMeta.title || 'Project Review';
    titleEl.contentEditable = 'true';
    titleEl.onblur = () => {
        appData.projectReviewMeta.title = titleEl.textContent.trim();
        saveToLocalStorage(true);
        // Update sidebar
        const reviewItem = document.querySelector('.sidebar-item.review-item .sidebar-item-title');
        if (reviewItem) reviewItem.textContent = '📄 ' + appData.projectReviewMeta.title;
    };
    
    // Show and setup authors section
    const authorsSection = document.getElementById('authorsSection');
    if (authorsSection) {
        authorsSection.style.display = 'block';
        renderAuthorsList();
        
        // Add author button handler
        const addBtn = document.getElementById('addAuthorBtn');
        if (addBtn) {
            addBtn.onclick = () => {
                appData.projectReviewMeta.authorsData.push({name: "", affiliationNumbers: []});
                renderAuthorsList();
                saveToLocalStorage(true);
            };
        }
        
        // Add affiliation button handler
        const addAffilBtn = document.getElementById('addAffiliationBtn');
        if (addAffilBtn) {
            addAffilBtn.onclick = () => {
                appData.projectReviewMeta.affiliationsData.push({text: ""});
                renderAffiliationsList();
                renderAuthorsList(); // Re-render authors to show new affiliation button
                saveToLocalStorage(true);
            };
        }
        
        renderAffiliationsList();
    }
    
    // Show and set abstract field (only for review)
    const abstractRow = document.getElementById('abstractRow');
    const abstractEl = document.getElementById('noteAbstract');
    if (abstractRow && abstractEl) {
        abstractRow.style.display = 'flex';
        abstractEl.textContent = appData.projectReviewMeta.abstract || '';
        abstractEl.contentEditable = 'true';
        abstractEl.onblur = () => {
            appData.projectReviewMeta.abstract = abstractEl.textContent.trim();
            saveToLocalStorage(true);
        };
    }
    
    // Set current year for review
    const currentYear = new Date().getFullYear();
    document.getElementById('noteYear').textContent = currentYear;
    document.getElementById('noteYear').contentEditable = 'false';
    document.getElementById('noteTags').innerHTML = '';
    const metadataLinks = document.getElementById('metadataLinks');
    if (metadataLinks) metadataLinks.innerHTML = '';

    // Content - use CodeMirror LaTeX Editor
    const contentEl = document.getElementById('noteContent');

    // Check if we have a cached PDF for review
    const previewContainer = document.getElementById('latexPreview');
    if (previewContainer) {
        const cachedPdf = pdfCache['review'];
        if (cachedPdf && cachedPdf.pdfBlob) {
            // Try to load cached PDF if content hasn't changed
            const currentContentHash = generateContentHash(appData.projectReview || '');
            if (cachedPdf.contentHash === currentContentHash) {
                console.log('📦 Loading cached PDF for project review');
                previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">📄 Loading cached PDF preview...</div>';
                renderPDFInContainer(cachedPdf.pdfBlob, previewContainer).catch(() => {
                    // If loading fails, show compile instruction
                    previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
                });
            } else {
                // Content changed, show compile instruction
                previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
            }
        } else {
            // No cache, show instruction
            previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
        }
    }

    // Debounce timer for auto-save
    let saveTimer = null;

    // Destroy previous editor if exists (when switching between articles and review)
    if (latexEditor) {
        latexEditor.destroy();
        latexEditor = null;
    }

    // Initialize CodeMirror LaTeX Editor for project review
    latexEditor = window.initLatexEditor(contentEl, appData.projectReview || '', (content) => {
        // Auto-save after 1 second of no typing
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (appData.projectReview !== content) {
                appData.projectReview = content;
                saveToLocalStorage(true);
            }
        }, 1000);
    });
    
    // Add toggle button to preview pane label
    addPreviewToggle();
}

// Render authors list with affiliations (modern minimalist interface)
function renderAuthorsList() {
    const authorsList = document.getElementById('authorsList');
    if (!authorsList) return;

    const authorsData = appData.projectReviewMeta.authorsData || [];
    const affiliationsData = appData.projectReviewMeta.affiliationsData || [];

    authorsList.innerHTML = '';

    authorsData.forEach((author, authorIdx) => {
        const authorCard = document.createElement('div');
        authorCard.className = 'author-card';
        authorCard.style.cssText = 'background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 12px; position: relative;';

        // Top row: Name input + Remove button
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'author-name-input';
        nameInput.placeholder = 'Author name';
        nameInput.value = author.name || '';
        nameInput.style.cssText = 'flex: 1; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 14px;';
        nameInput.oninput = () => {
            appData.projectReviewMeta.authorsData[authorIdx].name = nameInput.value.trim();
            saveToLocalStorage(true);
        };

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #ef5350; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
        removeBtn.onclick = () => {
            appData.projectReviewMeta.authorsData.splice(authorIdx, 1);
            if (appData.projectReviewMeta.authorsData.length === 0) {
                appData.projectReviewMeta.authorsData = [{name: "", affiliationNumbers: [], orcid: ""}];
            }
            renderAuthorsList();
            saveToLocalStorage(true);
        };

        topRow.appendChild(nameInput);
        topRow.appendChild(removeBtn);
        authorCard.appendChild(topRow);

        // ORCID row with logo
        const orcidRow = document.createElement('div');
        orcidRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

        // ORCID logo (green iD badge)
        const orcidLogo = document.createElement('span');
        orcidLogo.innerHTML = '<svg width="16" height="16" viewBox="0 0 256 256" style="vertical-align: middle;"><rect width="256" height="256" fill="#A6CE39" rx="128"/><g><path fill="#fff" d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7C191.7 111.2 178 93 148 93h-23.7v79.4zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1s10.1 4.6 10.1 10.1z"/></g></svg>';
        orcidLogo.style.cssText = 'min-width: 16px;';

        const orcidInput = document.createElement('input');
        orcidInput.type = 'text';
        orcidInput.className = 'author-orcid-input';
        orcidInput.placeholder = '0000-0000-0000-0000';
        orcidInput.value = author.orcid || '';
        orcidInput.style.cssText = 'flex: 1; padding: 6px 10px; border: 1px solid #dee2e6; border-radius: 4px; font-size: 12px; font-family: monospace;';
        orcidInput.oninput = () => {
            // Validate ORCID format (XXXX-XXXX-XXXX-XXXX)
            let value = orcidInput.value.replace(/[^0-9X-]/g, '');
            appData.projectReviewMeta.authorsData[authorIdx].orcid = value;
            saveToLocalStorage(true);

            // Visual validation
            const isValid = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/.test(value);
            orcidInput.style.borderColor = value && !isValid ? '#ef5350' : '#dee2e6';
        };

        orcidRow.appendChild(orcidLogo);
        orcidRow.appendChild(orcidInput);
        authorCard.appendChild(orcidRow);

        // Affiliations row with checkbox badges
        const affiliationsRow = document.createElement('div');
        affiliationsRow.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; align-items: center;';

        const affiliationsLabel = document.createElement('span');
        affiliationsLabel.textContent = 'Affiliations:';
        affiliationsLabel.style.cssText = 'font-size: 12px; color: #6c757d; min-width: 80px;';
        affiliationsRow.appendChild(affiliationsLabel);

        // Create checkbox badges for each affiliation
        affiliationsData.forEach((affil, affilIdx) => {
            const badge = document.createElement('label');
            badge.className = 'affiliation-badge';
            const isChecked = (author.affiliationNumbers || []).includes(affilIdx + 1);
            badge.style.cssText = `
                display: inline-flex;
                align-items: center;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 12px;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s;
                border: 2px solid ${isChecked ? '#4a90e2' : '#dee2e6'};
                background: ${isChecked ? '#4a90e2' : 'white'};
                color: ${isChecked ? 'white' : '#495057'};
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isChecked;
            checkbox.style.cssText = 'display: none;';
            checkbox.onchange = () => {
                let affiliationNumbers = author.affiliationNumbers || [];
                const affilNum = affilIdx + 1;

                if (checkbox.checked) {
                    if (!affiliationNumbers.includes(affilNum)) {
                        affiliationNumbers.push(affilNum);
                        affiliationNumbers.sort((a, b) => a - b);
                    }
                } else {
                    affiliationNumbers = affiliationNumbers.filter(n => n !== affilNum);
                }

                appData.projectReviewMeta.authorsData[authorIdx].affiliationNumbers = affiliationNumbers;
                saveToLocalStorage(true);
                renderAuthorsList(); // Re-render to update badge styles
            };

            badge.appendChild(checkbox);

            const badgeText = document.createElement('span');
            badgeText.textContent = `${affilIdx + 1}`;
            badge.appendChild(badgeText);

            badge.onclick = () => checkbox.click();

            affiliationsRow.appendChild(badge);
        });

        authorCard.appendChild(affiliationsRow);
        authorsList.appendChild(authorCard);
    });
}

// Render affiliations list (minimalist style)
function renderAffiliationsList() {
    const affiliationsList = document.getElementById('affiliationsList');
    if (!affiliationsList) return;

    const affiliationsData = appData.projectReviewMeta.affiliationsData || [];

    affiliationsList.innerHTML = '';

    affiliationsData.forEach((affiliation, affilIdx) => {
        const affilCard = document.createElement('div');
        affilCard.className = 'affiliation-card';
        affilCard.style.cssText = 'display: flex; gap: 8px; align-items: center; background: #f8f9fa; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;';

        // Affiliation number badge
        const numberBadge = document.createElement('span');
        numberBadge.className = 'affiliation-number-badge';
        numberBadge.textContent = `${affilIdx + 1}`;
        numberBadge.style.cssText = 'min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: #4a90e2; color: white; border-radius: 6px; font-weight: 600; font-size: 13px;';

        // Affiliation text input
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'affiliation-text-input';
        textInput.placeholder = 'University Name, Department, Country';
        textInput.value = affiliation.text || '';
        textInput.style.cssText = 'flex: 1; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 13px;';
        textInput.oninput = () => {
            appData.projectReviewMeta.affiliationsData[affilIdx].text = textInput.value.trim();
            saveToLocalStorage(true);
        };

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #ef5350; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
        removeBtn.onclick = () => {
            // Remove this affiliation
            appData.projectReviewMeta.affiliationsData.splice(affilIdx, 1);
            if (appData.projectReviewMeta.affiliationsData.length === 0) {
                appData.projectReviewMeta.affiliationsData = [{text: ""}];
            }

            // Update author affiliation numbers
            appData.projectReviewMeta.authorsData.forEach(author => {
                if (author.affiliationNumbers) {
                    // Remove this affiliation number and adjust higher numbers
                    author.affiliationNumbers = author.affiliationNumbers
                        .filter(n => n !== affilIdx + 1)
                        .map(n => n > affilIdx + 1 ? n - 1 : n);
                }
            });

            renderAffiliationsList();
            renderAuthorsList(); // Update authors to reflect new affiliation count
            saveToLocalStorage(true);
        };

        affilCard.appendChild(numberBadge);
        affilCard.appendChild(textInput);
        affilCard.appendChild(removeBtn);
        affiliationsList.appendChild(affilCard);
    });

}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderLatexPreview(text, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    
    // Helper to get citation from bibtexId (supports multiple keys)
    function getCitation(bibtexKeys, style) {
        const keys = bibtexKeys.split(',').map(k => k.trim()).filter(k => k);
        
        const citations = keys.map(bibtexId => {
            const article = appData.articles.find(a => a.bibtexId === bibtexId);
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
    
    // Prepare text for LaTeX compilation
    let processedText = text;
    const citationMap = new Map();
    let citationIndex = 0;
    
    // Replace citations with placeholders
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
    
    // Process author/affiliation commands
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
    
    // Try LaTeX.js compilation for authentic LaTeX rendering
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
                                const article = appData.articles.find(a => a.bibtexId === key);
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
                            const article = appData.articles.find(a => a.bibtexId === key);
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
    
    // Render math with MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch((err) => {
            console.warn('MathJax error:', err);
        });
    }
}

// Fallback renderer when LaTeX.js fails
function renderLatexFallback(text, container, citationMap, authorMap, affiliationMap, getCitation) {
    let htmlContent = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    
    // Restore authors
    authorMap.forEach((author, placeholder) => {
        let authorHtml = author.name;
        if (author.affNums) {
            authorHtml += `<sup>${author.affNums}</sup>`;
        }
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), 
            `<span class="latex-author">${authorHtml}</span>`);
    });
    
    // Restore affiliations
    affiliationMap.forEach((affiliation, placeholder) => {
        let affHtml = affiliation.text;
        if (affiliation.num) {
            affHtml = `<sup>${affiliation.num}</sup>${affHtml}`;
        }
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), 
            `<span class="latex-affiliation" style="font-size: 0.9em; font-style: italic; display: block;">${affHtml}</span>`);
    });
    
    // Restore citations
    citationMap.forEach((citation, placeholder) => {
        const keys = citation.keys.split(',').map(k => k.trim()).filter(k => k);
        let citationHtml = '';
        
        if (keys.length > 1) {
            const prefix = citation.style === 'citep' ? '(' : citation.style === 'cite' ? '[' : '';
            const suffix = citation.style === 'citep' ? ')' : citation.style === 'cite' ? ']' : '';
            citationHtml = prefix;
            
            keys.forEach((key, idx) => {
                const article = appData.articles.find(a => a.bibtexId === key);
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
            const article = appData.articles.find(a => a.bibtexId === keys[0]);
            const color = article ? '#1976d2' : '#d32f2f';
            citationHtml = `<span class="citation-link" data-bibtex="${keys[0]}" style="color: ${color}; font-weight: 600; cursor: pointer; text-decoration: underline;">${citationText}</span>`;
        }
        
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), citationHtml);
    });
    
    // Handle LaTeX commands
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
    
    // Section numbering
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
    
    // Bind citation click handlers
    container.querySelectorAll('.citation-link').forEach(citation => {
        citation.onclick = (e) => {
            e.preventDefault();
            const bibtexId = citation.getAttribute('data-bibtex');
            const article = appData.articles.find(a => a.bibtexId === bibtexId);
            if (article) {
                selectNote(article.id);
            }
        };
    });
}

function bindEditableField(elementId, obj, prop) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.textContent = obj[prop] || '';
    el.contentEditable = 'true'; // Ensure it's editable
    el.onblur = () => {
        const val = el.textContent.trim();
        if (obj[prop] !== val) {
            obj[prop] = val;
            saveToLocalStorage(true);
            // Refresh sidebar if title/author changed
            if (['title', 'authors', 'bibtexId'].includes(prop)) {
                const searchVal = document.getElementById('sidebarSearch').value;
                renderListView(searchVal);
            }
        }
    };
    
    // Enter key behavior for single line inputs
    if (elementId !== 'noteContent') {
        el.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        };
    }
}

// Helper function for contrast color (if not already defined elsewhere)
function getContrastColor(hexcolor) {
    if (!hexcolor) return '#000';
    // Remove # if present
    hexcolor = hexcolor.replace('#', '');
    const r = parseInt(hexcolor.substr(0,2),16);
    const g = parseInt(hexcolor.substr(2,2),16);
    const b = parseInt(hexcolor.substr(4,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#000' : '#fff';
}

// Toggle authors and affiliations section
function toggleAuthorsContent() {
    const content = document.getElementById('authorsContent');
    const btn = document.getElementById('authorsCollapseBtn');

    if (!content || !btn) return;

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        btn.classList.remove('collapsed');
        btn.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        btn.classList.add('collapsed');
        btn.textContent = '▶';
    }
}

// Make function globally available
window.toggleAuthorsContent = toggleAuthorsContent;
