import { getStore, getNetwork } from '../../store/appStore.js';
import { getContrastColor } from '../../utils/helpers.js';
import { initLatexEditor } from '../../utils/codemirror-latex.js';
import { save } from '../../data/persistence.js';
import { renderListView } from './sidebar.js';
import { generateContentHash } from './sidebar.js';
import { renderPDFInContainer, addPreviewToggle } from './pdf-preview.js';
import { listState } from './shared.js';

// ===== ARTICLE EDITOR PANE =====
// Article loading, field binding, and editor initialization

export function loadArticleToEditor(id) {
    const article = getStore().appData.articles.find(a => a.id === id);
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
    
    // Add link and PDF buttons
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

    if (listState.latexEditor) {
        listState.latexEditor.destroy();
        listState.latexEditor = null;
    }

    // Check if we have a cached PDF for this article
    const previewContainer = document.getElementById('latexPreview');
    if (previewContainer) {
        const cachedPdf = listState.pdfCache[id];
        if (cachedPdf && cachedPdf.pdfBlob) {
            const currentContentHash = generateContentHash(article.text || '');
            if (cachedPdf.contentHash === currentContentHash) {
                console.log(`📦 Loading cached PDF for article ${id}`);
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
    const isReadOnly = getStore().isReadOnlyMode || getStore().isGalleryViewer || false;
    listState.latexEditor = initLatexEditor(contentEl, article.text || '', isReadOnly ? null : (content) => {
        if (getStore().isReadOnlyMode) return;
        
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (article.text !== content) {
                getStore().updateArticle(article.id, { text: content });
                save(true);
            }
        }, 1000);
    }, isReadOnly);
    
    if (getStore().isReadOnlyMode && listState.latexEditor && listState.latexEditor.element) {
        listState.latexEditor.element.readOnly = true;
        listState.latexEditor.element.style.cursor = 'default';
        listState.latexEditor.element.style.backgroundColor = '#f7f9fb';
    }
    
    // Render tags
    const tagsContainer = document.getElementById('noteTags');
    tagsContainer.innerHTML = '';
    if (article.categories) {
        article.categories.forEach(cat => {
            const tag = document.createElement('span');
            tag.className = 'category-tag';
            tag.textContent = cat;
            
            const zone = getStore().tagZones.find(z => z.tag === cat);
            if (zone) {
                tag.style.background = zone.color;
                tag.style.borderColor = zone.color;
                tag.style.color = getContrastColor(zone.color);
            }
            
            tagsContainer.appendChild(tag);
        });
    }
    
    addPreviewToggle();
}

export function bindEditableField(elementId, obj, prop) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.textContent = obj[prop] || '';
    
    if (getStore().isReadOnlyMode) {
        el.contentEditable = 'false';
        el.style.cursor = 'default';
        return;
    }
    
    el.contentEditable = 'true';
    el.onblur = () => {
        const val = el.textContent.trim();
        if (obj[prop] !== val) {
            obj[prop] = val;
            save(true);
            if (['title', 'authors', 'bibtexId'].includes(prop)) {
                const searchVal = document.getElementById('sidebarSearch').value;
                renderListView(searchVal);
            }
        }
    };
    
    if (elementId !== 'noteContent') {
        el.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        };
    }
}

