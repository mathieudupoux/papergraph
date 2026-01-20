// ===== LIST VIEW (NOTEBOOK MODE) =====

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

    // Content & LaTeX
    const contentEl = document.getElementById('noteContent');
    contentEl.textContent = article.text || '';
    renderLatexPreview(article.text || '', 'latexPreview');

    // Debounce timer for auto-save
    let saveTimer = null;
    
    // Prevent Enter from creating <div> or <br>, insert plain newline
    contentEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode('\n');
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Trigger save and preview update
            renderLatexPreview(contentEl.textContent, 'latexPreview');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                if(article.text !== contentEl.textContent) {
                    article.text = contentEl.textContent;
                    saveToLocalStorage(true);
                }
            }, 1000);
        }
    };
    
    // Real-time Preview + Auto-save on keyup
    contentEl.onkeyup = () => {
        renderLatexPreview(contentEl.textContent, 'latexPreview');
        
        // Auto-save after 1 second of no typing
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if(article.text !== contentEl.textContent) {
                article.text = contentEl.textContent;
                saveToLocalStorage(true);
            }
        }, 1000);
    };
    
    contentEl.onblur = () => {
        clearTimeout(saveTimer);
        if(article.text !== contentEl.textContent) {
            article.text = contentEl.textContent;
            saveToLocalStorage(true);
        }
    };
    
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

// Toggle preview pane visibility and add PDF compile button
function addPreviewToggle() {
    const previewLabel = document.querySelector('.preview-pane .pane-label');
    if (!previewLabel) return;

    // Remove existing buttons if any
    const existingToggle = previewLabel.querySelector('.toggle-preview-btn');
    if (existingToggle) existingToggle.remove();
    const existingCompile = previewLabel.querySelector('.compile-pdf-btn');
    if (existingCompile) existingCompile.remove();

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    // PDF Compile button
    const compileBtn = document.createElement('button');
    compileBtn.className = 'compile-pdf-btn';
    compileBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>';
    compileBtn.title = 'Compile to PDF Preview';
    compileBtn.style.cssText = 'background: #0d6efd; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 12px;';

    const compileText = document.createElement('span');
    compileText.textContent = 'Compile PDF';
    compileText.style.cssText = 'font-weight: 500;';
    compileBtn.appendChild(compileText);

    compileBtn.onclick = async () => {
        await compileToPDFPreview();
    };

    // Toggle visibility button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-preview-btn';
    toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggleBtn.title = 'Hide Preview';
    toggleBtn.style.cssText = 'background: none; border: none; cursor: pointer; padding: 4px; color: #6c757d;';

    toggleBtn.onclick = () => {
        const previewPane = document.querySelector('.preview-pane');
        const sourcePane = document.querySelector('.source-pane');

        if (previewPane.classList.contains('hidden')) {
            previewPane.classList.remove('hidden');
            sourcePane.classList.remove('full-width');
            toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            toggleBtn.title = 'Hide Preview';
        } else {
            previewPane.classList.add('hidden');
            sourcePane.classList.add('full-width');
            toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            toggleBtn.title = 'Show Preview';
        }
    };

    buttonContainer.appendChild(compileBtn);
    buttonContainer.appendChild(toggleBtn);
    previewLabel.appendChild(buttonContainer);
}

// Compile current content to PDF and display in preview
async function compileToPDFPreview() {
    const contentEl = document.getElementById('noteContent');
    if (!contentEl) return;

    const latexContent = contentEl.textContent || '';
    if (!latexContent.trim()) {
        showNotification('No content to compile', 'warning');
        return;
    }

    const previewContainer = document.getElementById('latexPreview');
    if (!previewContainer) return;

    // Show loading state
    const compileBtn = document.querySelector('.compile-pdf-btn');
    if (compileBtn) {
        compileBtn.disabled = true;
        const btnText = compileBtn.querySelector('span');
        if (btnText) btnText.textContent = 'Compiling...';
    }

    previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">Compiling LaTeX to PDF...</div>';

    try {
        // Generate BibTeX content from articles
        let bibtexContent = '';
        if (appData.articles && appData.articles.length > 0) {
            appData.articles.forEach(article => {
                if (article.bibtexId) {
                    bibtexContent += articleToBibTeX(article) + '\n';
                }
            });
        }

        // Compile using online service
        const pdfBlob = await generateLatexPreviewPDF(latexContent, bibtexContent);

        // Render PDF using PDF.js
        await renderPDFInContainer(pdfBlob, previewContainer);

        showNotification('PDF compiled successfully!', 'success');
    } catch (error) {
        console.error('PDF compilation error:', error);
        previewContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #dc3545;">
                <strong>Compilation Error:</strong><br>
                <span style="font-size: 14px;">${escapeHtml(error.message)}</span><br>
                <div style="margin-top: 12px; font-size: 13px; color: #6c757d;">
                    The HTML preview is still shown below.
                </div>
            </div>
        `;
        // Fall back to HTML preview
        renderLatexPreview(latexContent, 'latexPreview');
    } finally {
        // Restore button state
        if (compileBtn) {
            compileBtn.disabled = false;
            const btnText = compileBtn.querySelector('span');
            if (btnText) btnText.textContent = 'Compile PDF';
        }
    }
}

// Render PDF blob in a container using PDF.js
async function renderPDFInContainer(pdfBlob, container) {
    if (!window.pdfjsLib) {
        throw new Error('PDF.js library not loaded');
    }

    // Clear container
    container.innerHTML = '';
    container.style.cssText = 'overflow-y: auto; background: #525252; padding: 20px;';

    // Convert blob to array buffer
    const arrayBuffer = await pdfBlob.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    // Render each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Create canvas for this page
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display: block; margin: 0 auto 20px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';

        const context = canvas.getContext('2d');

        // Set scale for good quality (2x for retina displays)
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        container.appendChild(canvas);
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

    // Content & LaTeX
    const contentEl = document.getElementById('noteContent');
    contentEl.textContent = appData.projectReview || '';
    renderLatexPreview(appData.projectReview || '', 'latexPreview');

    // Debounce timer for auto-save
    let saveTimer = null;
    
    // Prevent Enter from creating <div> or <br>, insert plain newline
    contentEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode('\n');
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Trigger save and preview update
            renderLatexPreview(contentEl.textContent, 'latexPreview');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                appData.projectReview = contentEl.textContent;
                saveToLocalStorage(true);
            }, 1000);
        }
    };

    contentEl.onkeyup = () => {
        renderLatexPreview(contentEl.textContent, 'latexPreview');
        
        // Auto-save after 1 second of no typing
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            appData.projectReview = contentEl.textContent;
            saveToLocalStorage(true);
        }, 1000);
    };
    
    contentEl.onblur = () => {
        clearTimeout(saveTimer);
        appData.projectReview = contentEl.textContent;
        saveToLocalStorage(true);
    };
    
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
            updateAuthorPreview();
        };

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #dc3545; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
        removeBtn.onclick = () => {
            appData.projectReviewMeta.authorsData.splice(authorIdx, 1);
            if (appData.projectReviewMeta.authorsData.length === 0) {
                appData.projectReviewMeta.authorsData = [{name: "", affiliationNumbers: [], orcid: ""}];
            }
            renderAuthorsList();
            saveToLocalStorage(true);
            updateAuthorPreview();
        };

        topRow.appendChild(nameInput);
        topRow.appendChild(removeBtn);
        authorCard.appendChild(topRow);

        // ORCID row
        const orcidRow = document.createElement('div');
        orcidRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

        const orcidLabel = document.createElement('span');
        orcidLabel.textContent = 'ORCID:';
        orcidLabel.style.cssText = 'font-size: 12px; color: #6c757d; min-width: 50px;';

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
            orcidInput.style.borderColor = value && !isValid ? '#dc3545' : '#dee2e6';
        };

        orcidRow.appendChild(orcidLabel);
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
                border: 2px solid ${isChecked ? '#0d6efd' : '#dee2e6'};
                background: ${isChecked ? '#0d6efd' : 'white'};
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
                updateAuthorPreview();
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

    // Update author preview after rendering
    updateAuthorPreview();
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
        numberBadge.style.cssText = 'min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: #0d6efd; color: white; border-radius: 6px; font-weight: 600; font-size: 13px;';

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
            updateAuthorPreview();
        };

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #dc3545; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
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
            updateAuthorPreview();
        };

        affilCard.appendChild(numberBadge);
        affilCard.appendChild(textInput);
        affilCard.appendChild(removeBtn);
        affiliationsList.appendChild(affilCard);
    });

    // Update author preview after rendering
    updateAuthorPreview();
}

// Live LaTeX preview for authors and affiliations
function updateAuthorPreview() {
    // Check if we're in the review editor
    if (activeNoteId !== 'review') return;

    // Find or create the preview container
    let previewContainer = document.getElementById('authorsPreviewContainer');
    if (!previewContainer) {
        // Create preview container after the affiliations list
        const affiliationsSection = document.getElementById('affiliationsList');
        if (!affiliationsSection || !affiliationsSection.parentNode) return;

        previewContainer = document.createElement('div');
        previewContainer.id = 'authorsPreviewContainer';
        previewContainer.style.cssText = 'margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #0d6efd;';

        const previewLabel = document.createElement('div');
        previewLabel.textContent = 'LaTeX Preview:';
        previewLabel.style.cssText = 'font-size: 12px; color: #6c757d; margin-bottom: 8px; font-weight: 600;';
        previewContainer.appendChild(previewLabel);

        const previewContent = document.createElement('div');
        previewContent.id = 'authorsPreviewContent';
        previewContent.style.cssText = 'font-family: Georgia, serif; font-size: 14px; line-height: 1.6;';
        previewContainer.appendChild(previewContent);

        affiliationsSection.parentNode.appendChild(previewContainer);
    }

    const previewContent = document.getElementById('authorsPreviewContent');
    if (!previewContent) return;

    // Generate preview HTML
    const authorsData = appData.projectReviewMeta.authorsData || [];
    const affiliationsData = appData.projectReviewMeta.affiliationsData || [];

    let html = '';

    // Authors with superscript affiliation numbers
    if (authorsData.length > 0) {
        const authorStrings = authorsData.map(author => {
            if (!author.name || !author.name.trim()) return '';

            let authorHtml = `<span style="font-weight: 500;">${escapeHtml(author.name)}</span>`;

            // Add affiliation superscripts
            if (author.affiliationNumbers && author.affiliationNumbers.length > 0) {
                const superscripts = author.affiliationNumbers.map(n => `<sup>${n}</sup>`).join(',');
                authorHtml += superscripts;
            }

            return authorHtml;
        }).filter(s => s);

        if (authorStrings.length > 0) {
            html += '<div style="text-align: center; margin-bottom: 8px;">';
            html += authorStrings.join(', ');
            html += '</div>';
        }
    }

    // Affiliations
    if (affiliationsData.length > 0) {
        html += '<div style="font-size: 12px; text-align: center; color: #6c757d; font-style: italic;">';
        affiliationsData.forEach((affil, idx) => {
            if (affil.text && affil.text.trim()) {
                html += `<div style="margin: 2px 0;"><sup>${idx + 1}</sup>${escapeHtml(affil.text)}</div>`;
            }
        });
        html += '</div>';
    }

    previewContent.innerHTML = html || '<span style="color: #adb5bd; font-style: italic;">No authors or affiliations yet</span>';
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
