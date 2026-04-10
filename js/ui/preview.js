// ===== ARTICLE PREVIEW =====
// Preview panel display and management

import { getStore, getNetwork } from '../store/appStore.js';
import { getContrastColor, showNotification } from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { renderMarkdown } from '../utils/markdown.js';

const MAX_CITATION_SUGGESTIONS = 8;
const citationAutocompleteTimers = new WeakMap();
let citationNavigationTimeout = null;

function renderNoteContent(element, markdown = '') {
    element.dataset.rawMarkdown = markdown;
    element.innerHTML = renderMarkdown(markdown);
}

function ensureAutocompleteContainer(descriptionElement) {
    const section = descriptionElement.closest('.article-section');
    if (!section) return null;

    let container = section.querySelector('.note-link-autocomplete');
    if (container) return container;

    container = document.createElement('div');
    container.className = 'note-link-autocomplete';
    container.style.display = 'none';
    section.appendChild(container);
    return container;
}

function hideAutocomplete(descriptionElement) {
    const container = descriptionElement.closest('.article-section')?.querySelector('.note-link-autocomplete');
    if (!container) return;

    container.style.display = 'none';
    container.innerHTML = '';
    descriptionElement.dataset.autocompleteOpen = 'false';
    descriptionElement.dataset.autocompleteSelectedIndex = '0';
}

function getCaretOffsetWithin(element) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    if (!element.contains(range.endContainer)) return 0;

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
}

function getPlainTextFromElement(element) {
    return (element.innerText || element.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '');
}

function getTextBeforeCaretWithin(element) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';

    const range = selection.getRangeAt(0);
    if (!element.contains(range.endContainer)) return '';

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString()
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '');
}

function setCaretOffsetWithin(element, offset) {
    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let textNode = null;

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const nextOffset = currentOffset + node.textContent.length;
        if (offset <= nextOffset) {
            textNode = node;
            offset -= currentOffset;
            break;
        }
        currentOffset = nextOffset;
    }

    if (!textNode) {
        element.focus();
        selection.selectAllChildren(element);
        selection.collapseToEnd();
        return;
    }

    const range = document.createRange();
    range.setStart(textNode, Math.max(0, Math.min(offset, textNode.textContent.length)));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

function getTextNodePosition(element, targetOffset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const nextOffset = currentOffset + node.textContent.length;
        if (targetOffset <= nextOffset) {
            return {
                node,
                offset: Math.max(0, Math.min(targetOffset - currentOffset, node.textContent.length)),
            };
        }
        currentOffset = nextOffset;
    }

    return null;
}

function replaceTextWithin(element, startOffset, endOffset, replacement) {
    const selection = window.getSelection();
    if (!selection) return false;

    const start = getTextNodePosition(element, startOffset);
    const end = getTextNodePosition(element, endOffset);

    if (!start || !end) {
        const text = getPlainTextFromElement(element);
        element.innerText = text.slice(0, startOffset) + replacement + text.slice(endOffset);
        setCaretOffsetWithin(element, startOffset + replacement.length);
        return true;
    }

    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    selection.removeAllRanges();
    selection.addRange(range);

    if (typeof document.execCommand === 'function') {
        try {
            if (document.execCommand('insertText', false, replacement)) {
                setCaretOffsetWithin(element, startOffset + replacement.length);
                return true;
            }
        } catch (_) {
            // Fall back to manual DOM replacement below.
        }
    }

    range.deleteContents();
    const textNode = document.createTextNode(replacement);
    range.insertNode(textNode);
    range.setStart(textNode, replacement.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function getActiveCitationQuery(descriptionElement, options = {}) {
    const { anticipateOpenBrace = false } = options;
    const beforeCaret = getTextBeforeCaretWithin(descriptionElement);
    const caretOffset = beforeCaret.length;
    const text = getPlainTextFromElement(descriptionElement);
    const match = beforeCaret.match(/\{([A-Za-z0-9:_./-]*)$/);

    if (!match) {
        if (!anticipateOpenBrace) return null;

        return {
            query: '',
            startOffset: caretOffset,
            caretOffset,
            text,
        };
    }

    return {
        query: match[1],
        startOffset: caretOffset - match[0].length,
        caretOffset,
        text,
    };
}

function getCitationSuggestions(query = '') {
    const normalized = query.trim().toLowerCase();

    return getStore().appData.articles
        .filter((article) => article.bibtexId && article.bibtexId.trim())
        .filter((article) => {
            if (!normalized) return true;
            return article.bibtexId.toLowerCase().includes(normalized)
                || (article.title || '').toLowerCase().includes(normalized);
        })
        .sort((a, b) => a.bibtexId.localeCompare(b.bibtexId))
        .slice(0, MAX_CITATION_SUGGESTIONS);
}

function applyCitationSuggestion(descriptionElement, bibtexId) {
    const context = getActiveCitationQuery(descriptionElement);
    if (!context) return;

    const replacement = `{${bibtexId}}`;
    replaceTextWithin(descriptionElement, context.startOffset, context.caretOffset, replacement);
    hideAutocomplete(descriptionElement);
    scheduleCitationAutocompleteUpdate(descriptionElement);
}

function renderAutocompleteSuggestions(descriptionElement, suggestions) {
    const container = ensureAutocompleteContainer(descriptionElement);
    if (!container) return;

    if (suggestions.length === 0) {
        hideAutocomplete(descriptionElement);
        return;
    }

    const selectedIndex = Math.min(
        Number(descriptionElement.dataset.autocompleteSelectedIndex || 0),
        suggestions.length - 1
    );
    descriptionElement.dataset.autocompleteSelectedIndex = String(selectedIndex);
    descriptionElement.dataset.autocompleteOpen = 'true';

    container.innerHTML = '';

    suggestions.forEach((article, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `note-link-suggestion${index === selectedIndex ? ' selected' : ''}`;
        item.dataset.bibtexId = article.bibtexId;
        item.innerHTML = `
            <span class="note-link-suggestion-key">${article.bibtexId}</span>
            <span class="note-link-suggestion-title">${article.title || 'Untitled article'}</span>
        `;

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyCitationSuggestion(descriptionElement, article.bibtexId);
        });

        container.appendChild(item);
    });

    container.style.display = 'flex';
}

function updateCitationAutocomplete(descriptionElement, options = {}) {
    if (!descriptionElement.classList.contains('editing')) {
        hideAutocomplete(descriptionElement);
        return [];
    }

    const context = getActiveCitationQuery(descriptionElement, options);
    if (!context) {
        hideAutocomplete(descriptionElement);
        return [];
    }

    const suggestions = getCitationSuggestions(context.query);
    renderAutocompleteSuggestions(descriptionElement, suggestions);
    return suggestions;
}

function scheduleCitationAutocompleteUpdate(descriptionElement) {
    const existingTimer = citationAutocompleteTimers.get(descriptionElement);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        citationAutocompleteTimers.delete(descriptionElement);
        if (!descriptionElement.isConnected) return;
        updateCitationAutocomplete(descriptionElement);
    }, 0);

    citationAutocompleteTimers.set(descriptionElement, timer);
}

function isNodeVisibleInGraphViewport(nodeId) {
    if (!getNetwork()) return false;

    const nodePosition = getNetwork().getPositions([nodeId])[nodeId];
    if (!nodePosition) return false;

    const canvasPosition = getNetwork().canvasToDOM(nodePosition);
    const container = document.getElementById('graphContainer');
    if (!container) return false;

    const node = getNetwork().body.nodes[nodeId];
    const nodeWidth = node?.shape?.width || 100;
    const nodeHeight = node?.shape?.height || 50;
    const padding = 24;

    const left = canvasPosition.x - nodeWidth / 2;
    const right = canvasPosition.x + nodeWidth / 2;
    const top = canvasPosition.y - nodeHeight / 2;
    const bottom = canvasPosition.y + nodeHeight / 2;

    return left >= padding
        && right <= container.clientWidth - padding
        && top >= padding
        && bottom <= container.clientHeight - padding;
}

async function selectNodeFromCitation(bibtexId) {
    const article = getStore().appData.articles.find(a => a.bibtexId === bibtexId);
    if (!article || !getNetwork()) return;

    getNetwork().unselectAll();
    getNetwork().selectNodes([article.id]);

    if (citationNavigationTimeout) {
        clearTimeout(citationNavigationTimeout);
    }

    const { openRadialMenuForNode } = await import('../graph/events.js');
    if (isNodeVisibleInGraphViewport(article.id)) {
        openRadialMenuForNode(article.id);
        return;
    }

    const currentScale = getNetwork().getScale();
    getNetwork().focus(article.id, {
        scale: currentScale,
        animation: {
            duration: 350,
            easingFunction: 'easeInOutQuad'
        }
    });

    citationNavigationTimeout = setTimeout(() => {
        citationNavigationTimeout = null;
        openRadialMenuForNode(article.id);
    }, 360);
}

export function showArticlePreview(articleId) {
    const article = getStore().appData.articles.find(a => a.id === articleId);
    if (!article) return;
    
    getStore().setCurrentPreviewArticleId(articleId);
    console.log('showArticlePreview: Loading article', articleId, article);
    
    const preview = document.getElementById('articlePreview');
    
    // Update BibTeX ID if available
    const citationKeyElement = document.getElementById('previewCitationKey');
    if (article.bibtexId) {
        citationKeyElement.textContent = article.bibtexId;
        citationKeyElement.style.display = 'inline-block';
        citationKeyElement.setAttribute('data-field', 'bibtexId');
    } else {
        citationKeyElement.style.display = 'none';
    }
    
    // Update title
    document.getElementById('previewTitle').textContent = article.title || 'Sans titre';
    
    // Update authors/meta
    const authorsElement = document.getElementById('previewAuthors');
    if (article.authors) {
        authorsElement.textContent = article.authors;
    } else {
        authorsElement.textContent = '';
    }
    
    // Update category badges - show ALL categories with same colors as graph
    const categoryBadge = document.getElementById('previewCategoryBadge');
    if (article.categories && article.categories.length > 0) {
        // Clear existing content
        categoryBadge.innerHTML = '';
        
        // Create a badge for each category
        article.categories.forEach(category => {
            const badge = document.createElement('span');
            badge.className = 'category-badge';
            badge.textContent = category;
            
            // Use zone color if available (same as graph)
            const zone = getStore().tagZones.find(z => z.tag === category);
            if (zone) {
                badge.style.background = zone.color;
                badge.style.borderColor = zone.color;
                badge.style.color = getContrastColor(zone.color);
            }
            
            categoryBadge.appendChild(badge);
        });
        
        categoryBadge.style.display = 'flex';
        categoryBadge.style.flexWrap = 'wrap';
        categoryBadge.style.gap = '4px';
    } else {
        categoryBadge.style.display = 'none';
    }
    
    // Update note content with Markdown rendering
    const textElement = document.getElementById('previewText');
    const noteContent = article.note || '';
    if (getStore().currentEditingElement !== textElement) {
        renderNoteContent(textElement, noteContent);
    }
    
    console.log('Preview updated with:', {
        title: article.title,
        authors: article.authors,
        note: article.note
    });
    
    // Handle DOI
    const doiContainer = document.getElementById('previewDoiContainer');
    const doiElement = document.getElementById('previewDoi');
    if (article.doi) {
        doiElement.href = `https://doi.org/${article.doi}`;
        doiElement.textContent = article.doi;
        doiContainer.style.display = 'flex';
    } else {
        doiContainer.style.display = 'none';
    }
    
    // Handle Link
    const linkContainer = document.getElementById('previewLinkContainer');
    const linkElement = document.getElementById('previewLink');
    if (article.link) {
        linkElement.href = article.link;
        const displayLink = article.link.length > 40 ? article.link.substring(0, 37) + '...' : article.link;
        linkElement.textContent = displayLink;
        linkContainer.style.display = 'flex';
    } else {
        linkContainer.style.display = 'none';
    }
    
    // Handle PDF
    const pdfContainer = document.getElementById('previewPdfContainer');
    const pdfElement = document.getElementById('previewPdf');
    if (article.pdf) {
        pdfElement.href = article.pdf;
        const displayPdf = article.pdf.length > 40 ? article.pdf.substring(0, 37) + '...' : article.pdf;
        pdfElement.textContent = displayPdf;
        pdfContainer.style.display = 'flex';
    } else {
        pdfContainer.style.display = 'none';
    }
    
    // Show preview panel
    preview.classList.add('active');
    
    // Setup inline editing once (but not in gallery viewer mode)
    if (!getStore().inlineEditingSetup && !getStore().isGalleryViewer) {
        setupInlineEditing();
        getStore().setInlineEditingSetup(true);
    }
}

export function closeArticlePreview() {
    const previewText = document.getElementById('previewText');
    if (previewText) {
        hideAutocomplete(previewText);
    }

    // Save any ongoing edits before closing
    if (getStore().currentEditingElement) {
        // Determine which field is being edited
        let field = null;
        if (getStore().currentEditingElement.id === 'previewTitle') field = 'title';
        else if (getStore().currentEditingElement.id === 'previewAuthors') field = 'authors';
        else if (getStore().currentEditingElement.id === 'previewText') field = 'note';
        if (field) {
            saveInlineEdit(getStore().currentEditingElement, field);
        }
    }
    
    const preview = document.getElementById('articlePreview');
    preview.classList.remove('active');
    getStore().setCurrentPreviewArticleId(null);
}

export function setupInlineEditing() {
    // Make BibTeX ID editable
    const bibtexIdElement = document.getElementById('previewCitationKey');
    bibtexIdElement.contentEditable = 'true';
    
    bibtexIdElement.addEventListener('focus', () => {
        getStore().setCurrentEditingElement(bibtexIdElement);
        getStore().setOriginalContent(bibtexIdElement.textContent);
        bibtexIdElement.classList.add('editing');
    });
    
    bibtexIdElement.addEventListener('blur', () => {
        if (getStore().currentEditingElement === bibtexIdElement) {
            saveInlineEdit(bibtexIdElement, 'bibtexId');
        }
    });
    
    bibtexIdElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(bibtexIdElement, 'bibtexId');
            bibtexIdElement.blur();
        }
        if (e.key === 'Escape') {
            bibtexIdElement.textContent = getStore().originalContent;
            bibtexIdElement.classList.remove('editing');
            getStore().setCurrentEditingElement(null);
            bibtexIdElement.blur();
        }
    });
    
    // Make title editable
    const titleElement = document.getElementById('previewTitle');
    titleElement.contentEditable = 'true';
    
    titleElement.addEventListener('focus', () => {
        getStore().setCurrentEditingElement(titleElement);
        getStore().setOriginalContent(titleElement.textContent);
        titleElement.classList.add('editing');
    });
    
    titleElement.addEventListener('blur', () => {
        if (getStore().currentEditingElement === titleElement) {
            saveInlineEdit(titleElement, 'title');
        }
    });
    
    titleElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(titleElement, 'title');
            titleElement.blur();
        }
        if (e.key === 'Escape') {
            titleElement.textContent = getStore().originalContent;
            titleElement.classList.remove('editing');
            getStore().setCurrentEditingElement(null);
            titleElement.blur();
        }
    });
    
    // Make authors editable
    const authorsElement = document.getElementById('previewAuthors');
    authorsElement.contentEditable = 'true';
    
    authorsElement.addEventListener('focus', () => {
        getStore().setCurrentEditingElement(authorsElement);
        getStore().setOriginalContent(authorsElement.textContent);
        authorsElement.classList.add('editing');
    });
    
    authorsElement.addEventListener('blur', () => {
        if (getStore().currentEditingElement === authorsElement) {
            saveInlineEdit(authorsElement, 'authors');
        }
    });
    
    authorsElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(authorsElement, 'authors');
            authorsElement.blur();
        }
        if (e.key === 'Escape') {
            authorsElement.textContent = getStore().originalContent;
            authorsElement.classList.remove('editing');
            getStore().setCurrentEditingElement(null);
            authorsElement.blur();
        }
    });

    // Make notes editable as raw Markdown on focus, then render on save
    const descriptionElement = document.getElementById('previewText');
    descriptionElement.contentEditable = 'true';
    descriptionElement.spellcheck = true;

    descriptionElement.addEventListener('focus', () => {
        getStore().setCurrentEditingElement(descriptionElement);
        getStore().setOriginalContent(descriptionElement.dataset.rawMarkdown || '');
        descriptionElement.classList.add('editing');
        descriptionElement.closest('.article-section')?.classList.add('editing');
        descriptionElement.textContent = getStore().originalContent;
        descriptionElement.dataset.autocompleteSelectedIndex = '0';
        hideAutocomplete(descriptionElement);
    });

    descriptionElement.addEventListener('blur', () => {
        if (getStore().currentEditingElement === descriptionElement) {
            saveInlineEdit(descriptionElement, 'note');
        }
    });

    descriptionElement.addEventListener('keydown', (e) => {
        const anticipateOpenBrace = e.key === '{' && !e.ctrlKey && !e.metaKey && !e.altKey;
        const suggestions = updateCitationAutocomplete(descriptionElement, { anticipateOpenBrace });
        const autocompleteOpen = descriptionElement.dataset.autocompleteOpen === 'true' && suggestions.length > 0;

        if (autocompleteOpen && e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (Number(descriptionElement.dataset.autocompleteSelectedIndex || 0) + 1) % suggestions.length;
            descriptionElement.dataset.autocompleteSelectedIndex = String(nextIndex);
            renderAutocompleteSuggestions(descriptionElement, suggestions);
            return;
        }

        if (autocompleteOpen && e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = Number(descriptionElement.dataset.autocompleteSelectedIndex || 0);
            const nextIndex = (currentIndex - 1 + suggestions.length) % suggestions.length;
            descriptionElement.dataset.autocompleteSelectedIndex = String(nextIndex);
            renderAutocompleteSuggestions(descriptionElement, suggestions);
            return;
        }

        if (autocompleteOpen && (e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const selected = suggestions[Number(descriptionElement.dataset.autocompleteSelectedIndex || 0)];
            if (selected) {
                applyCitationSuggestion(descriptionElement, selected.bibtexId);
            }
            return;
        }

        if (autocompleteOpen && e.key === 'Escape') {
            e.preventDefault();
            hideAutocomplete(descriptionElement);
            return;
        }

        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveInlineEdit(descriptionElement, 'note');
            descriptionElement.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            saveInlineEdit(descriptionElement, 'note');
            descriptionElement.blur();
        }
    });

    descriptionElement.addEventListener('input', (e) => {
        descriptionElement.dataset.autocompleteSelectedIndex = '0';

        if (e.inputType === 'insertText' && e.data === '{') {
            updateCitationAutocomplete(descriptionElement);
            return;
        }

        scheduleCitationAutocompleteUpdate(descriptionElement);
    });

    descriptionElement.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText' && e.data === '{') {
            descriptionElement.dataset.autocompleteSelectedIndex = '0';
            scheduleCitationAutocompleteUpdate(descriptionElement);
        }
    });

    descriptionElement.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
        scheduleCitationAutocompleteUpdate(descriptionElement);
    });

    descriptionElement.addEventListener('mouseup', () => {
        scheduleCitationAutocompleteUpdate(descriptionElement);
    });

    descriptionElement.addEventListener('click', () => {
        scheduleCitationAutocompleteUpdate(descriptionElement);
    });

    descriptionElement.addEventListener('keypress', (e) => {
        if (e.key === '{') {
            scheduleCitationAutocompleteUpdate(descriptionElement);
        }
    });

    descriptionElement.addEventListener('mousedown', (e) => {
        if (descriptionElement.classList.contains('editing')) return;
        if (e.target.closest('.markdown-citation')) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    descriptionElement.addEventListener('click', async (e) => {
        if (descriptionElement.classList.contains('editing')) return;
        const citation = e.target.closest('.markdown-citation');
        if (!citation) return;

        e.preventDefault();
        e.stopPropagation();
        await selectNodeFromCitation(citation.dataset.bibtexId);
    });
}

export function saveInlineEdit(element, field) {
    // Prevent double save
    if (!getStore().currentEditingElement || getStore().currentEditingElement !== element) {
        return;
    }
    
    hideAutocomplete(element);
    element.classList.remove('editing');
    element.closest('.article-section')?.classList.remove('editing');
    getStore().setCurrentEditingElement(null);
    
    if (!getStore().currentPreviewArticleId) return;
    
    const article = getStore().appData.articles.find(a => a.id === getStore().currentPreviewArticleId);
    if (!article) return;
    
    const newValue = field === 'note'
        ? element.innerText.replace(/\u00a0/g, ' ').replace(/\r/g, '').trim()
        : element.textContent.trim();
    const originalValue = getStore().originalContent.trim();

    if (newValue !== originalValue) {
        article[field] = newValue;
        if (field === 'note') {
            article.text = newValue;
        }
        
        // Update graph node
        if (getNetwork()) {
            if (field === 'title') {
                const labelFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
                if (labelFormat === 'title') {
                    getNetwork().body.data.nodes.update({
                        id: getStore().currentPreviewArticleId,
                        label: newValue
                    });
                }
            } else if (field === 'bibtexId') {
                const labelFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
                if (labelFormat === 'bibtexId') {
                    getNetwork().body.data.nodes.update({
                        id: getStore().currentPreviewArticleId,
                        label: newValue
                    });
                }
            }
        }
        
        save(true);
        showNotification('Article mis à jour!', 'success');
    }

    if (field === 'note') {
        renderNoteContent(element, article.note || '');
    }
}
