// ===== PROJECT REVIEW PANE =====
// Review editor, authors, and affiliations management

import { state } from '../../core/state.js';
import { initLatexEditor } from '../../utils/codemirror-latex.js';
import { save } from '../../data/persistence.js';
import { generateContentHash } from './sidebar.js';
import { renderPDFInContainer, addPreviewToggle } from './pdf-preview.js';
import { listState } from './shared.js';

export function loadReviewToEditor() {
    document.getElementById('editorEmptyState').style.display = 'none';
    document.getElementById('articleEditorState').style.display = 'flex';

    // Initialize review metadata if not exists
    if (!state.appData.projectReviewMeta) {
        state.appData.projectReviewMeta = {
            title: "Project Review",
            authorsData: [{name: "", affiliationNumbers: []}],
            affiliationsData: [{text: ""}],
            abstract: ""
        };
    }
    
    if (!state.appData.projectReviewMeta.authorsData) {
        state.appData.projectReviewMeta.authorsData = [{name: "", affiliationNumbers: []}];
    }
    if (!state.appData.projectReviewMeta.affiliationsData) {
        state.appData.projectReviewMeta.affiliationsData = [{text: ""}];
    }

    // Hide regular authors row (for articles only)
    const authorsRow = document.querySelector('.authors-row');
    if (authorsRow) authorsRow.style.display = 'none';

    // Set metadata for review
    document.getElementById('noteCitationKey').textContent = 'review';
    document.getElementById('noteCitationKey').contentEditable = 'false';
    
    const titleEl = document.getElementById('noteTitle');
    titleEl.textContent = state.appData.projectReviewMeta.title || 'Project Review';
    
    if (state.isReadOnlyMode) {
        titleEl.contentEditable = 'false';
        titleEl.style.cursor = 'default';
    } else {
        titleEl.contentEditable = 'true';
        titleEl.onblur = () => {
            state.appData.projectReviewMeta.title = titleEl.textContent.trim();
            save(true);
            const reviewItem = document.querySelector('.sidebar-item.review-item .sidebar-item-title');
            if (reviewItem) reviewItem.textContent = '📄 ' + state.appData.projectReviewMeta.title;
        };
    }
    
    // Show and setup authors section
    const authorsSection = document.getElementById('authorsSection');
    if (authorsSection) {
        authorsSection.style.display = 'block';
        renderAuthorsList();
        
        const addBtn = document.getElementById('addAuthorBtn');
        if (addBtn) {
            if (state.isReadOnlyMode) {
                addBtn.style.display = 'none';
            } else {
                addBtn.style.display = '';
                addBtn.onclick = () => {
                    state.appData.projectReviewMeta.authorsData.push({name: "", affiliationNumbers: []});
                    renderAuthorsList();
                    save(true);
                };
            }
        }
        
        const addAffilBtn = document.getElementById('addAffiliationBtn');
        if (addAffilBtn) {
            if (state.isReadOnlyMode) {
                addAffilBtn.style.display = 'none';
            } else {
                addAffilBtn.style.display = '';
                addAffilBtn.onclick = () => {
                    state.appData.projectReviewMeta.affiliationsData.push({text: ""});
                    renderAffiliationsList();
                    renderAuthorsList();
                    save(true);
                };
            }
        }
        
        renderAffiliationsList();
    }
    
    // Show and set abstract field
    const abstractRow = document.getElementById('abstractRow');
    const abstractEl = document.getElementById('noteAbstract');
    if (abstractRow && abstractEl) {
        abstractRow.style.display = 'flex';
        abstractEl.textContent = state.appData.projectReviewMeta.abstract || '';
        
        if (state.isReadOnlyMode) {
            abstractEl.contentEditable = 'false';
            abstractEl.style.cursor = 'default';
        } else {
            abstractEl.contentEditable = 'true';
            abstractEl.onblur = () => {
                state.appData.projectReviewMeta.abstract = abstractEl.textContent.trim();
                save(true);
            };
        }
    }
    
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
        const cachedPdf = listState.pdfCache['review'];
        if (cachedPdf && cachedPdf.pdfBlob) {
            const currentContentHash = generateContentHash(state.appData.projectReview || '');
            if (cachedPdf.contentHash === currentContentHash) {
                console.log('📦 Loading cached PDF for project review');
                previewContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">📄 Loading cached PDF preview...</div>';
                renderPDFInContainer(cachedPdf.pdfBlob, previewContainer).catch(() => {
                    previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
                });
            } else {
                previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
            }
        } else {
            previewContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">Click "Compile PDF" to preview your LaTeX document</div>';
        }
    }

    let saveTimer = null;

    if (listState.latexEditor) {
        listState.latexEditor.destroy();
        listState.latexEditor = null;
    }

    const isReadOnly = state.isReadOnlyMode || state.isGalleryViewer || false;
    listState.latexEditor = initLatexEditor(contentEl, state.appData.projectReview || '', isReadOnly ? null : (content) => {
        if (state.isReadOnlyMode) return;
        
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (state.appData.projectReview !== content) {
                state.appData.projectReview = content;
                save(true);
            }
        }, 1000);
    }, isReadOnly);
    
    if (state.isReadOnlyMode && listState.latexEditor && listState.latexEditor.element) {
        listState.latexEditor.element.readOnly = true;
        listState.latexEditor.element.style.cursor = 'default';
        listState.latexEditor.element.style.backgroundColor = '#f7f9fb';
    }
    
    addPreviewToggle();
}

export function renderAuthorsList() {
    const authorsList = document.getElementById('authorsList');
    if (!authorsList) return;

    const authorsData = state.appData.projectReviewMeta.authorsData || [];
    const affiliationsData = state.appData.projectReviewMeta.affiliationsData || [];

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
        
        if (state.isReadOnlyMode) {
            nameInput.readOnly = true;
            nameInput.style.backgroundColor = '#f7f9fb';
            nameInput.style.cursor = 'default';
        } else {
            nameInput.oninput = () => {
                state.appData.projectReviewMeta.authorsData[authorIdx].name = nameInput.value.trim();
                save(true);
            };
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #ef5350; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
        
        if (state.isReadOnlyMode) {
            removeBtn.style.display = 'none';
        } else {
            removeBtn.onclick = () => {
                state.appData.projectReviewMeta.authorsData.splice(authorIdx, 1);
                if (state.appData.projectReviewMeta.authorsData.length === 0) {
                    state.appData.projectReviewMeta.authorsData = [{name: "", affiliationNumbers: [], orcid: ""}];
                }
                renderAuthorsList();
                save(true);
            };
        }

        topRow.appendChild(nameInput);
        topRow.appendChild(removeBtn);
        authorCard.appendChild(topRow);

        // ORCID row
        const orcidRow = document.createElement('div');
        orcidRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

        const orcidLogo = document.createElement('span');
        orcidLogo.innerHTML = '<svg width="16" height="16" viewBox="0 0 256 256" style="vertical-align: middle;"><rect width="256" height="256" fill="#A6CE39" rx="128"/><g><path fill="#fff" d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7C191.7 111.2 178 93 148 93h-23.7v79.4zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1s10.1 4.6 10.1 10.1z"/></g></svg>';
        orcidLogo.style.cssText = 'min-width: 16px;';

        const orcidInput = document.createElement('input');
        orcidInput.type = 'text';
        orcidInput.className = 'author-orcid-input';
        orcidInput.placeholder = '0000-0000-0000-0000';
        orcidInput.value = author.orcid || '';
        orcidInput.style.cssText = 'flex: 1; padding: 6px 10px; border: 1px solid #dee2e6; border-radius: 4px; font-size: 12px; font-family: monospace;';
        
        if (state.isReadOnlyMode) {
            orcidInput.readOnly = true;
            orcidInput.style.backgroundColor = '#f7f9fb';
            orcidInput.style.cursor = 'default';
        } else {
            orcidInput.oninput = () => {
                let value = orcidInput.value.replace(/[^0-9X-]/g, '');
                state.appData.projectReviewMeta.authorsData[authorIdx].orcid = value;
                save(true);
                const isValid = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/.test(value);
                orcidInput.style.borderColor = value && !isValid ? '#ef5350' : '#dee2e6';
            };
        }

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
            
            if (!state.isReadOnlyMode) {
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

                    state.appData.projectReviewMeta.authorsData[authorIdx].affiliationNumbers = affiliationNumbers;
                    save(true);
                    renderAuthorsList();
                };
            }

            badge.appendChild(checkbox);

            const badgeText = document.createElement('span');
            badgeText.textContent = `${affilIdx + 1}`;
            badge.appendChild(badgeText);

            if (!state.isReadOnlyMode) {
                badge.onclick = () => checkbox.click();
            } else {
                badge.style.cursor = 'default';
            }

            affiliationsRow.appendChild(badge);
        });

        authorCard.appendChild(affiliationsRow);
        authorsList.appendChild(authorCard);
    });
}

export function renderAffiliationsList() {
    const affiliationsList = document.getElementById('affiliationsList');
    if (!affiliationsList) return;

    const affiliationsData = state.appData.projectReviewMeta.affiliationsData || [];

    affiliationsList.innerHTML = '';

    affiliationsData.forEach((affiliation, affilIdx) => {
        const affilCard = document.createElement('div');
        affilCard.className = 'affiliation-card';
        affilCard.style.cssText = 'display: flex; gap: 8px; align-items: center; background: #f8f9fa; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;';

        const numberBadge = document.createElement('span');
        numberBadge.className = 'affiliation-number-badge';
        numberBadge.textContent = `${affilIdx + 1}`;
        numberBadge.style.cssText = 'min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: #4a90e2; color: white; border-radius: 6px; font-weight: 600; font-size: 13px;';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'affiliation-text-input';
        textInput.placeholder = 'University Name, Department, Country';
        textInput.value = affiliation.text || '';
        textInput.style.cssText = 'flex: 1; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 13px;';
        
        if (state.isReadOnlyMode) {
            textInput.readOnly = true;
            textInput.style.backgroundColor = '#f7f9fb';
            textInput.style.cursor = 'default';
        } else {
            textInput.oninput = () => {
                state.appData.projectReviewMeta.affiliationsData[affilIdx].text = textInput.value.trim();
                save(true);
            };
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-author';
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'width: 28px; height: 28px; border: none; background: #ef5350; color: white; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1; padding: 0;';
        
        if (state.isReadOnlyMode) {
            removeBtn.style.display = 'none';
        } else {
            removeBtn.onclick = () => {
                state.appData.projectReviewMeta.affiliationsData.splice(affilIdx, 1);
                if (state.appData.projectReviewMeta.affiliationsData.length === 0) {
                    state.appData.projectReviewMeta.affiliationsData = [{text: ""}];
                }

                state.appData.projectReviewMeta.authorsData.forEach(author => {
                    if (author.affiliationNumbers) {
                        author.affiliationNumbers = author.affiliationNumbers
                            .filter(n => n !== affilIdx + 1)
                            .map(n => n > affilIdx + 1 ? n - 1 : n);
                    }
                });

                renderAffiliationsList();
                renderAuthorsList();
                save(true);
            };
        }

        affilCard.appendChild(numberBadge);
        affilCard.appendChild(textInput);
        affilCard.appendChild(removeBtn);
        affiliationsList.appendChild(affilCard);
    });
}

export function toggleAuthorsContent() {
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

window.toggleAuthorsContent = toggleAuthorsContent;
