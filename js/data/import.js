// ===== IMPORT FUNCTIONS =====
// DOI, arXiv, and PDF import functionality

import { getStore, getNetwork, pauseHistory, resumeHistory } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { isBibTeXFormat, parseBibTeXEntry, parseMultipleBibTeXEntries } from './bibtex-parser.js';
import { save } from './persistence.js';
import { updateGraph } from '../graph/render.js';
import { closeModal } from '../ui/modal.js';
import { checkNodeZoneMembership } from '../graph/zones.js';

// ===== IMPORT ZONE SETUP =====

export function setupImportZone() {
    const dropZone = document.getElementById('dropZone');
    const quickImport = document.getElementById('quickImport');
    const browseBtn = document.getElementById('browseFileBtn');
    const fileInput = document.getElementById('pdfFileInput');
    const promptActionBtn = document.getElementById('promptActionBtn');
    
    if (!dropZone || !quickImport) return; // Elements might not exist in all views
    
    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const fileName = file.name.toLowerCase();
            
            if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
                handlePdfFile(file);
            } else if (fileName.endsWith('.bib') || fileName.endsWith('.bibtex')) {
                handleBibFile(file);
            } else {
                showImportStatus('Please drop a PDF or .bib file', 'error');
            }
        }
    });
    
    // Browse button
    if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const fileName = file.name.toLowerCase();
                
                if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
                    handlePdfFile(file);
                } else if (fileName.endsWith('.bib') || fileName.endsWith('.bibtex')) {
                    handleBibFile(file);
                } else {
                    showImportStatus('Please select a PDF or .bib file', 'error');
                }
            }
        });
    }
    
    // Quick import on Enter
    quickImport.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handlePromptAction();
        }
    });
    
    // Auto-detect BibTeX on paste
    quickImport.addEventListener('paste', (e) => {
        setTimeout(() => {
            const value = quickImport.value.trim();
            if (isBibTeXFormat(value)) {
                processQuickImport();
            }
        }, 10); // Small delay to let paste complete
    });

    quickImport.addEventListener('input', syncPromptActionState);
    quickImport.addEventListener('input', autoResizeQuickImport);

    const articleForm = document.getElementById('articleForm');
    if (articleForm) {
        articleForm.addEventListener('input', syncPromptActionState);
    }
    
    if (promptActionBtn) {
        promptActionBtn.addEventListener('click', handlePromptAction);
    }

    document.addEventListener('keydown', (e) => {
        const articleModal = document.getElementById('articleModal');
        const promptSurface = document.querySelector('.prompt-surface');

        if (!articleModal?.classList.contains('active')) return;
        if (promptSurface?.dataset.status !== 'success') return;
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

        const target = e.target;
        if (target instanceof HTMLElement) {
            const isTypingInManualField =
                (target.tagName === 'TEXTAREA' && target.id !== 'quickImport') ||
                (target.tagName === 'INPUT' && target.id !== 'quickImport') ||
                target.isContentEditable;

            if (isTypingInManualField) return;
        }

        e.preventDefault();
        handlePromptAction();
    });

    autoResizeQuickImport();
}

export function setManualFormState(shouldOpen) {
    const manualForm = document.getElementById('manualForm');
    const btn = document.getElementById('toggleManualBtn');
    
    if (!manualForm || !btn) return;

    if (shouldOpen) {
        manualForm.classList.remove('collapsed');
        const label = btn.querySelector('span');
        if (label) {
            label.textContent = 'Hide manual';
        } else {
            btn.textContent = 'Hide manual';
        }
        btn.classList.add('is-active');
    } else {
        manualForm.classList.add('collapsed');
        const label = btn.querySelector('span');
        if (label) {
            label.textContent = 'Manual entry';
        } else {
            btn.textContent = 'Manual entry';
        }
        btn.classList.remove('is-active');
    }

    syncPromptActionState();
}

export function toggleManualForm(forceState) {
    const manualForm = document.getElementById('manualForm');
    if (!manualForm) return;

    const shouldOpen = typeof forceState === 'boolean'
        ? forceState
        : manualForm.classList.contains('collapsed');

    setManualFormState(shouldOpen);
}

function canSubmitArticleForm() {
    const titleField = document.getElementById('articleTitle');
    return Boolean(titleField && titleField.value.trim());
}

function requestArticleSubmit() {
    const form = document.getElementById('articleForm');
    if (!form) return;

    if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
    } else {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
}

function autoResizeQuickImport() {
    const quickImport = document.getElementById('quickImport');
    if (!quickImport) return;

    quickImport.style.height = 'auto';
    quickImport.style.height = `${Math.min(quickImport.scrollHeight, 180)}px`;
}

const DOI_IN_TEXT_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const DOI_EXACT_PATTERN = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

function normalizeDoiIdentifier(value = '') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    let normalizedValue = trimmedValue;

    if (/^doi:\s*/i.test(normalizedValue)) {
        normalizedValue = normalizedValue.replace(/^doi:\s*/i, '');
    }

    normalizedValue = normalizedValue.replace(/[.,;:!?]+$/, '');

    const doiMatch = normalizedValue.match(DOI_IN_TEXT_PATTERN);
    if (!doiMatch) {
        return null;
    }

    const doi = doiMatch[0].replace(/[.,;:!?]+$/, '');
    return DOI_EXACT_PATTERN.test(doi) ? doi : null;
}

function safeDecodeURIComponent(value = '') {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return value;
    }
}

function extractDoiFromUrl(value = '') {
    const urlCandidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
        ? value
        : /^[^/\s?#]+\.[^/\s?#]+/.test(value)
            ? `https://${value}`
            : null;

    if (!urlCandidate) {
        return null;
    }

    try {
        const parsedUrl = new URL(urlCandidate);
        const candidates = [
            parsedUrl.pathname,
            parsedUrl.search,
            parsedUrl.hash,
            `${parsedUrl.pathname}${parsedUrl.search}`,
            `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
        ]
            .map((candidate) => safeDecodeURIComponent(candidate))
            .map((candidate) => candidate.replace(/^\/+/, ''))
            .filter(Boolean);

        for (const candidate of candidates) {
            const doi = normalizeDoiIdentifier(candidate);
            if (doi) {
                return doi;
            }
        }

        return null;
    } catch (_) {
        return null;
    }
}

function buildCrossrefWorksUrl(doi, includeBibtexTransform = false) {
    const normalizedDoi = normalizeDoiIdentifier(doi);
    if (!normalizedDoi) {
        throw new Error('DOI invalide');
    }

    const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(normalizedDoi)}`);
    if (includeBibtexTransform) {
        url.pathname += '/transform/application/x-bibtex';
    }

    return url.toString();
}

function extractDoiFromText(value = '') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const doiFromUrl = extractDoiFromUrl(trimmedValue);
    if (doiFromUrl) {
        return doiFromUrl;
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue)) {
        return null;
    }

    return normalizeDoiIdentifier(trimmedValue);
}

function extractArxivIdFromText(value = '') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    if (!trimmedValue.toLowerCase().includes('arxiv') && !/\d{4}\.\d{4,5}/.test(trimmedValue) && !/[a-z\-]+\/\d{7}/i.test(trimmedValue)) {
        return null;
    }

    const numericMatch = trimmedValue.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
    if (numericMatch) {
        return numericMatch[1];
    }

    const legacyMatch = trimmedValue.match(/([a-z\-]+\/\d{7})(?:v\d+)?/i);
    return legacyMatch ? legacyMatch[1] : null;
}

function detectImportPayload(value = '') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    if (isBibTeXFormat(trimmedValue)) {
        return { type: 'bibtex', value: trimmedValue };
    }

    const doi = extractDoiFromText(trimmedValue);
    if (doi) {
        return { type: 'doi', value: doi };
    }

    const arxivId = extractArxivIdFromText(trimmedValue);
    if (arxivId) {
        return { type: 'arxiv', value: arxivId };
    }

    return null;
}

export function isSupportedImportText(value = '') {
    return Boolean(detectImportPayload(value));
}

function getImportAnchorPosition(position = null) {
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        return { x: position.x, y: position.y };
    }

    if (typeof getNetwork() !== 'undefined' && getNetwork()) {
        return getNetwork().getViewPosition();
    }

    return { x: 0, y: 0 };
}

function normalizeImportedArticle(article = {}) {
    return {
        ...article,
        categories: Array.isArray(article.categories) ? article.categories : [],
        text: article.text || article.note || article.abstract || '',
    };
}

function confirmDirectImport(existingArticle, sourceLabel) {
    if (!existingArticle) return true;

    return confirm(
        `⚠️ Warning: An article with this ${sourceLabel} already exists:\n\n` +
        `"${existingArticle.title}"\n\n` +
        'Do you want to import it anyway?'
    );
}

function addImportedArticlesToGraph(articles, position = null) {
    if (!Array.isArray(articles) || articles.length === 0) return 0;

    const normalizedArticles = articles.map(normalizeImportedArticle);
    const anchor = getImportAnchorPosition(position);
    const verticalSpacing = 100;
    const horizontalSpacing = 300;
    const maxPerColumn = 10;
    const totalColumns = Math.ceil(normalizedArticles.length / maxPerColumn);

    normalizedArticles.forEach((article, index) => {
        let x = anchor.x;
        let y = anchor.y;

        if (normalizedArticles.length > 1) {
            const columnIndex = Math.floor(index / maxPerColumn);
            const rowIndex = index % maxPerColumn;
            const itemsInColumn = Math.min(maxPerColumn, normalizedArticles.length - columnIndex * maxPerColumn);
            x = anchor.x + (columnIndex - (totalColumns - 1) / 2) * horizontalSpacing;
            y = anchor.y + (rowIndex - (itemsInColumn - 1) / 2) * verticalSpacing;
        }

        getStore().createArticle({
            ...article,
            x,
            y,
        });
    });

    updateGraph();
    save();

    setTimeout(() => {
        if (!getNetwork()) return;

        pauseHistory();
        try {
            if (getStore().savedNodePositions) {
                const positions = getNetwork().getPositions();
                getStore().setSavedNodePositions({ ...getStore().savedNodePositions, ...positions });
            }

            if (typeof checkNodeZoneMembership === 'function') {
                checkNodeZoneMembership();
            }
        } finally {
            resumeHistory();
        }

        save(true);
    }, 200);

    return normalizedArticles.length;
}

export function syncPromptActionState() {
    const quickImport = document.getElementById('quickImport');

    if (quickImport && quickImport.value.trim()) {
        updatePromptActionState('import');
        return;
    }

    updatePromptActionState(canSubmitArticleForm() ? 'save' : 'import');
}

export function updatePromptActionState(mode = 'import') {
    const modal = document.getElementById('articleModal');
    const button = document.getElementById('promptActionBtn');
    if (!modal || !button) return;

    modal.dataset.promptMode = mode;
    button.classList.toggle('is-ready', mode === 'save');
    button.title = mode === 'save' ? 'Add node to graph' : 'Import metadata';
    button.setAttribute('aria-label', mode === 'save' ? 'Add node to graph' : 'Import metadata');
}

export function handlePromptAction() {
    const quickImport = document.getElementById('quickImport');

    if (quickImport && quickImport.value.trim()) {
        processQuickImport();
        return;
    }

    if (canSubmitArticleForm()) {
        requestArticleSubmit();
        return;
    }

    if (quickImport) {
        quickImport.focus();
    }
}

export function processQuickImport() {
    const input = document.getElementById('quickImport');
    if (!input) return;
    
    const value = input.value.trim();
    if (!value) return;

    const payload = detectImportPayload(value);
    if (!payload) {
        showImportStatus('Format non reconnu. Utilisez un DOI (10.xxxx/...), arXiv ID (2301.12345, 1210.0686 ou cs/0701001) ou BibTeX (@article{...})', 'error');
        return;
    }

    if (payload.type === 'bibtex') {
        processBibTeXImport();
        return;
    }

    if (payload.type === 'doi') {
        importFromDoi(payload.value);
        return;
    }

    importFromArxiv(payload.value);
}

// ===== BIBTEX HANDLING =====

export function showBibTeXPasteArea(initialValue = '') {
    const quickImport = document.getElementById('quickImport');
    if (!quickImport) return;

    quickImport.value = initialValue;
    autoResizeQuickImport();
    quickImport.focus();
    syncPromptActionState();
}

export function hideBibTeXPasteArea() {
    const quickImport = document.getElementById('quickImport');
    if (quickImport) {
        quickImport.value = '';
        autoResizeQuickImport();
    }
    syncPromptActionState();
}

export async function processBibTeXImport() {
    const quickImport = document.getElementById('quickImport');
    if (!quickImport) return;
    
    const bibtexText = quickImport.value.trim();
    if (!bibtexText) {
        showImportStatus('Please paste a BibTeX entry', 'error');
        return;
    }
    
    showImportStatus('Processing BibTeX entries...', 'loading');
    
    try {
        // Parse BibTeX entries (now async to fetch arXiv abstracts)
        const articles = await parseMultipleBibTeXEntries(bibtexText);
        
        if (articles.length === 0) {
            showImportStatus('No valid BibTeX entry found', 'error');
            return;
        }
        
        if (articles.length === 1) {
            // Single entry: populate form (don't auto-open manual form)
            const article = articles[0];
            
            // Store the imported article data globally so it can be used when saving
            getStore().setPendingImportArticle(article);
            
            fillFormWithArticleData(article);
            showImportSuccess({
                title: article.title || 'Imported entry',
                subtitle: 'BibTeX imported. Press Enter or Send to add it.'
            });
            quickImport.value = '';
            autoResizeQuickImport();
            quickImport.focus();
            // Don't automatically open manual form - let user decide
        } else {
            // Multiple entries: import all directly with column layout
            const verticalSpacing = 100; // Vertical spacing between nodes
            const horizontalSpacing = 300; // Horizontal spacing between columns
            const maxPerColumn = 10; // Maximum articles per column
            
            const numColumns = Math.ceil(articles.length / maxPerColumn);
            
            // Get viewport center so nodes appear on screen, not at project origin
            const viewCenter = (typeof getNetwork() !== 'undefined' && getNetwork())
                ? getNetwork().getViewPosition()
                : { x: 0, y: 0 };
            
            articles.forEach((article, index) => {
                // Calculate column and row position
                const columnIndex = Math.floor(index / maxPerColumn);
                const rowIndex = index % maxPerColumn;
                const articlesInColumn = Math.min(maxPerColumn, articles.length - columnIndex * maxPerColumn);
                
                // Position in grid centered on the current viewport
                article.x = viewCenter.x + (columnIndex - (numColumns - 1) / 2) * horizontalSpacing;
                article.y = viewCenter.y + (rowIndex - (articlesInColumn - 1) / 2) * verticalSpacing;
                
                getStore().createArticle(article);
            });
            
            save();
            updateGraph();
            
            // Save initial positions to ensure they persist
            setTimeout(() => {
                if (getNetwork() && getStore().savedNodePositions) {
                    pauseHistory();
                    try {
                        const positions = getNetwork().getPositions();
                        getStore().setSavedNodePositions({ ...getStore().savedNodePositions, ...positions });
                        console.log('Saved positions for newly imported articles');
                        
                        // Check node zone membership to update colors after positions are set
                        if (typeof checkNodeZoneMembership === 'function') {
                            console.log('Checking zone membership for imported nodes...');
                            checkNodeZoneMembership();
                            console.log('Applied zone colors to imported nodes');
                            
                            // Force graph update to reflect new colors
                            const currentView = getNetwork().getViewPosition();
                            const currentScale = getNetwork().getScale();
                            updateGraph();
                            // Restore view position
                            getNetwork().moveTo({
                                position: currentView,
                                scale: currentScale,
                                animation: false
                            });
                            console.log('Graph updated with correct colors');
                        }
                    } finally {
                        resumeHistory();
                    }
                    
                    save(true); // Silent save after all updates
                }
            }, 200);
            
            closeModal();
            
            showNotification(`✓ ${articles.length} articles imported from BibTeX`, 'success');
        }
    } catch (error) {
        console.error('BibTeX parse error:', error);
        showImportStatus('Error processing BibTeX entry', 'error');
    }
}

export function fillFormWithArticleData(article) {
    // Fill all form fields with article data
    const fieldMap = {
        'articleTitle': article.title,
        'articleAuthors': article.authors,
        'articleYear': article.year,
        'articleType': article.entryType || 'article',
        'articleJournal': article.journal || article.booktitle,
        'articleVolume': article.volume,
        'articleNumber': article.number,
        'articlePages': article.pages,
        'articlePublisher': article.publisher || article.institution,
        'articleDoi': article.doi,
        'articleIsbn': article.isbn,
        'articleIssn': article.issn,
        'articleLink': article.link || article.url,
        'articlePdf': article.pdf,
        'articleAbstract': article.abstract,
        'articleNote': article.note,
        'articleCategories': article.categories ? article.categories.join(', ') : article.keywords
    };
    
    for (const [fieldId, value] of Object.entries(fieldMap)) {
        const field = document.getElementById(fieldId);
        if (field && value) {
            field.value = value;
        }
    }
}

// ===== BIB FILE HANDLING =====

export async function handleBibFile(file) {
    showImportStatus('Reading .bib file...', 'loading');
    
    try {
        const text = await file.text();
        
        if (!text.trim()) {
            showImportStatus('Empty .bib file', 'error');
            return;
        }
        
        // Load into the main prompt area for review/editing
        showBibTeXPasteArea(text);
        showImportStatus('.bib loaded. Review and send when ready.', 'success');
        
    } catch (error) {
        console.error('Error reading .bib file:', error);
        showImportStatus('Error reading .bib file', 'error');
    }
}

// ===== PDF HANDLING =====

export async function handlePdfFile(file) {
    showImportStatus('Extracting PDF metadata...', 'loading');
    
    try {
        // Use PDF.js library if available, otherwise extract basic info
        if (typeof pdfjsLib !== 'undefined') {
            await extractPdfMetadata(file);
        } else {
            // Fallback: just use filename
            const filename = file.name.replace('.pdf', '');
            const titleField = document.getElementById('articleTitle');
            const pdfField = document.getElementById('articlePdf');
            
            if (titleField) titleField.value = filename;
            
            // Create local URL
            const pdfUrl = URL.createObjectURL(file);
            if (pdfField) pdfField.value = pdfUrl;
            
            // Try to extract DOI from filename
            const doiMatch = filename.match(/10\.\d{4,}[^\s]*/);
            if (doiMatch) {
                const doiField = document.getElementById('articleDoi');
                if (doiField) doiField.value = doiMatch[0];
                showImportStatus('PDF loaded. Attempting import via found DOI...', 'loading');
                await importFromDoi(doiMatch[0]);
            } else {
                showImportStatus('PDF loaded. Press Send to add it or keep refining.', 'success');
                toggleManualForm(true);
                updatePromptActionState('save');
            }
        }
    } catch (error) {
        console.error('PDF processing error:', error);
        showImportStatus('Error processing PDF', 'error');
    }
}

export async function extractPdfMetadata(file) {
    // This would use PDF.js to extract metadata from PDF
    const arrayBuffer = await file.arrayBuffer();
    
    // Try to find DOI in PDF content (basic search)
    const text = await extractTextFromPdf(arrayBuffer);
    const doiMatch = text.match(/10\.\d{4,}\/[^\s\n]+/);
    
    if (doiMatch) {
        const doi = doiMatch[0].replace(/[.,;]$/, ''); // Remove trailing punctuation
        showImportStatus('DOI found in PDF, importing...', 'loading');
        await importFromDoi(doi);
    } else {
        const filename = file.name.replace('.pdf', '');
        const titleField = document.getElementById('articleTitle');
        const pdfField = document.getElementById('articlePdf');
        
        if (titleField) titleField.value = filename;
        const pdfUrl = URL.createObjectURL(file);
        if (pdfField) pdfField.value = pdfUrl;
        
        showImportStatus('PDF loaded. Press Send to add it or keep refining.', 'success');
        toggleManualForm(true);
        updatePromptActionState('save');
    }
}

export async function extractTextFromPdf(arrayBuffer) {
    // Simple text extraction - would need PDF.js for full implementation
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder().decode(uint8Array);
    return text;
}

// ===== DOI IMPORT =====

async function fetchArticleFromDoi(doi) {
    const normalizedDoi = normalizeDoiIdentifier(doi);
    if (!normalizedDoi) {
        throw new Error('DOI invalide');
    }

    let bibtexData = null;

    try {
        const bibtexResponse = await fetch(buildCrossrefWorksUrl(normalizedDoi, true));
        if (bibtexResponse.ok) {
            const bibtexText = await bibtexResponse.text();
            bibtexData = await parseBibTeXEntry(bibtexText);
        }
    } catch (error) {
        console.log('BibTeX fetch failed, falling back to CrossRef JSON:', error);
    }

    const response = await fetch(buildCrossrefWorksUrl(normalizedDoi));
    if (!response.ok) {
        throw new Error(`DOI non trouvé (status ${response.status})`);
    }

    const data = await response.json();
    const work = data.message;

    const authors = work.author?.map((author) => {
        return `${author.given || ''} ${author.family || ''}`.trim();
    }).join(', ') || bibtexData?.author || '';

    const year = work.published?.['date-parts']?.[0]?.[0] ||
        work.created?.['date-parts']?.[0]?.[0] ||
        bibtexData?.year ||
        '';

    const article = {
        title: (bibtexData?.title || work.title?.[0] || 'Imported article').replace(/[{}]/g, ''),
        authors,
        abstract: work.abstract || bibtexData?.abstract || '',
        doi: normalizedDoi,
        year: year ? String(year) : '',
        journal: work['container-title']?.[0] || bibtexData?.journal || bibtexData?.booktitle || '',
        volume: work.volume || bibtexData?.volume || '',
        pages: work.page || bibtexData?.pages || '',
        publisher: work.publisher || bibtexData?.publisher || '',
        link: work.URL || bibtexData?.link || bibtexData?.url || '',
        entryType: ({
            'journal-article': 'article',
            'proceedings-article': 'inproceedings',
            'book-chapter': 'inbook',
            'book': 'book',
            'dissertation': 'phdthesis'
        })[work.type] || bibtexData?.entryType || 'article',
        bibtexId: bibtexData?.bibtexId || bibtexData?.citationKey || '',
        citationKey: bibtexData?.citationKey || bibtexData?.bibtexId || '',
        originalBibTeX: bibtexData?.originalBibTeX || '',
    };

    return article;
}

export async function importFromDoi(doi) {
    if (!doi) {
        const input = document.getElementById('quickImport');
        if (input) doi = input.value.trim();
    }

    const normalizedDoi = normalizeDoiIdentifier(doi || '');
    if (!normalizedDoi) {
        showImportStatus('Please enter a DOI', 'error');
        return;
    }
    
    // Check if DOI already exists
    const existingArticle = getStore().appData.articles.find((a) => {
        const articleDoi = normalizeDoiIdentifier(a.doi || '');
        return articleDoi && articleDoi.toLowerCase() === normalizedDoi.toLowerCase();
    });
    if (existingArticle) {
        const confirmImport = confirm(
            `⚠️ Warning: An article with this DOI already exists:\n\n` +
            `"${existingArticle.title}"\n\n` +
            `Do you want to import this DOI anyway?`
        );
        if (!confirmImport) {
            showImportStatus('Import cancelled', 'info');
            const input = document.getElementById('quickImport');
            if (input) input.value = '';
            resetImportZone();
            return;
        }
    }
    
    console.log('📚 Importing DOI:', normalizedDoi);
    showImportStatus('Fetching metadata...', 'loading');
    
    try {
        const article = await fetchArticleFromDoi(normalizedDoi);
        getStore().setPendingImportArticle(article);
        fillFormWithArticleData(article);
        
        showImportSuccess({
            title: article.title || 'Imported article',
            subtitle: 'Metadata ready. Press Enter or Send to add it.'
        });
        
        // Clear quick import
        const input = document.getElementById('quickImport');
        if (input) {
            input.value = '';
            autoResizeQuickImport();
            input.focus();
        }
        
    } catch (error) {
        console.error('Error importing DOI:', error);
        showImportStatus(`Error: ${error.message}`, 'error');
        toggleManualForm(true);
    }
}

// ===== ARXIV IMPORT =====

async function fetchArticleFromArxiv(arxivId) {
    let text = '';

    try {
        const response = await window.supabaseClient.functions.invoke('fetch-arxiv', {
            body: { arxivId: arxivId }
        });

        const { data, error } = response;

        if (error) {
            let errorDetails = error.message || 'Unknown error';
            try {
                if (error.context && error.context.body) {
                    const bodyText = await error.context.body.text();
                    errorDetails += ' | Body: ' + bodyText;
                }
            } catch (_) {}
            throw new Error(`Supabase function failed: ${errorDetails}`);
        }

        if (!data || typeof data !== 'string') {
            throw new Error('Invalid response from Supabase function');
        }

        if (!data.includes('<feed') && !data.includes('<?xml') && !data.includes('<entry')) {
            throw new Error('Response is not valid XML');
        }

        text = data;
    } catch (supabaseError) {
        const arxivApiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
        const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(arxivApiUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(arxivApiUrl)}`,
        ];
        const proxyErrors = [];

        for (const proxyUrl of proxies) {
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`Proxy returned status ${response.status}`);
                }
                text = await response.text();
                break;
            } catch (proxyError) {
                proxyErrors.push(proxyError.message);
            }
        }

        if (!text) {
            throw new Error(`Could not fetch arXiv metadata. Supabase: ${supabaseError.message}. Proxies: ${proxyErrors.join('; ')}`);
        }
    }

    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const parserError = xml.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing error from arXiv response');
    }

    const entry = xml.querySelector('entry');
    if (!entry) {
        const totalResults = xml.querySelector('totalResults')?.textContent;
        if (totalResults === '0') {
            throw new Error(`arXiv article not found for ID: ${arxivId}`);
        }
        throw new Error('arXiv article not found - invalid response');
    }

    const title = entry.querySelector('title')?.textContent.trim().replace(/\s+/g, ' ') || '';
    const summary = entry.querySelector('summary')?.textContent.trim().replace(/\s+/g, ' ') || '';
    const authors = Array.from(entry.querySelectorAll('author name'))
        .map((author) => author.textContent.trim())
        .join(', ');
    const pdfLink = entry.querySelector('link[title="pdf"]')?.getAttribute('href') || '';
    const htmlLink = entry.querySelector('id')?.textContent.trim() || '';
    const publishedDate = entry.querySelector('published')?.textContent.trim() || '';
    const year = publishedDate ? new Date(publishedDate).getFullYear() : '';

    if (!title || title.length < 5) {
        throw new Error('Title not found in arXiv response');
    }

    let bibtexData = null;
    try {
        const bibtexResponse = await window.supabaseClient.functions.invoke('fetch-arxiv', {
            body: { arxivId: arxivId, format: 'bibtex' }
        });
        if (!bibtexResponse.error && bibtexResponse.data && typeof bibtexResponse.data === 'string') {
            bibtexData = await parseBibTeXEntry(bibtexResponse.data);
        }
    } catch (error) {
        console.log('BibTeX fetch failed, generating from arXiv metadata:', error.message);
    }

    if (!bibtexData) {
        const firstAuthorLast = authors.split(',')[0].trim().split(/\s+/).pop() || 'unknown';
        bibtexData = {
            entryType: 'misc',
            title: title,
            author: authors,
            year: String(year),
            journal: 'arXiv preprint',
            eprint: arxivId,
            archivePrefix: 'arXiv',
            citationKey: `${firstAuthorLast.toLowerCase()}${year}`,
        };
    }

    return {
        title: (bibtexData?.title || title).replace(/[{}]/g, ''),
        authors: bibtexData?.author || authors,
        abstract: summary,
        link: htmlLink,
        pdf: pdfLink,
        year: bibtexData?.year || String(year || ''),
        entryType: bibtexData?.entryType || 'misc',
        journal: bibtexData?.journal || 'arXiv preprint',
        bibtexId: bibtexData?.bibtexId || bibtexData?.citationKey || '',
        citationKey: bibtexData?.citationKey || bibtexData?.bibtexId || '',
        originalBibTeX: bibtexData?.originalBibTeX || '',
    };
}

export async function importFromArxiv(arxivId) {
    console.log('importFromArxiv called with:', arxivId);
    
    if (!arxivId) {
        const input = document.getElementById('quickImport');
        if (input) arxivId = input.value.trim();
    }
    
    if (!arxivId) {
        showImportStatus('Please enter an arXiv ID', 'error');
        return;
    }
    
    console.log('Processing arXiv ID:', arxivId);
    
    // Check if arXiv ID already exists (in link or pdf fields)
    const existingArticle = getStore().appData.articles.find(a => {
        const linkHasArxiv = a.link && a.link.includes(arxivId);
        const pdfHasArxiv = a.pdf && a.pdf.includes(arxivId);
        return linkHasArxiv || pdfHasArxiv;
    });
    
    if (existingArticle) {
        const confirmImport = confirm(
            `⚠️ Warning: An article with this arXiv ID already exists:\n\n` +
            `"${existingArticle.title}"\n\n` +
            `Do you want to import this article anyway?`
        );
        if (!confirmImport) {
            showImportStatus('Import cancelled', 'info');
            const input = document.getElementById('quickImport');
            if (input) input.value = '';
            resetImportZone();
            return;
        }
    }
    
    showImportStatus('Fetching arXiv metadata...', 'loading');
    
    try {
        const article = await fetchArticleFromArxiv(arxivId);
        getStore().setPendingImportArticle(article);
        fillFormWithArticleData(article);
        
        showImportSuccess({
            title: article.title || 'Imported article',
            subtitle: 'arXiv metadata ready. Press Enter or Send to add it.'
        });
        
        // Clear quick import
        const input = document.getElementById('quickImport');
        if (input) {
            input.value = '';
            autoResizeQuickImport();
            input.focus();
        }
        
    } catch (error) {
        console.error('Error importing arXiv:', error);
        showImportStatus(`Erreur: ${error.message}`, 'error');
        toggleManualForm(true);
    }
}

// ===== IMPORT UI HELPERS =====

export function showImportStatus(message, type) {
    const status = document.getElementById('importStatus');
    const promptSurface = document.querySelector('.prompt-surface');
    if (!status) return;

    if (typeof message === 'object' && message !== null) {
        const { title = '', subtitle = '' } = message;
        status.innerHTML = '';

        if (title) {
            const titleElement = document.createElement('div');
            titleElement.className = 'import-status-title';
            titleElement.textContent = title;
            status.appendChild(titleElement);
        }

        if (subtitle) {
            const subtitleElement = document.createElement('div');
            subtitleElement.className = 'import-status-subtitle';
            subtitleElement.textContent = subtitle;
            status.appendChild(subtitleElement);
        }
    } else {
        status.textContent = message;
    }

    status.className = `import-status show ${type}`;
    if (promptSurface) {
        if (type) {
            promptSurface.dataset.status = type;
        } else {
            delete promptSurface.dataset.status;
        }
    }
}

export function resetImportZone() {
    // Clear quick import input
    const quickInput = document.getElementById('quickImport');
    const promptSurface = document.querySelector('.prompt-surface');
    if (quickInput) {
        quickInput.value = '';
        autoResizeQuickImport();
    }
    
    // Hide import status
    const status = document.getElementById('importStatus');
    if (status) {
        status.classList.remove('show', 'loading', 'success', 'error', 'info');
        status.textContent = '';
    }
    if (promptSurface) {
        delete promptSurface.dataset.status;
    }

    // Show drop zone
    const dropZone = document.getElementById('dropZone');
    // Show drop zone
    if (dropZone) dropZone.style.display = 'block';

    hideBibTeXPasteArea();
    setManualFormState(false);
    updatePromptActionState('import');
}

export function showImportSuccess(message = {
    title: 'Imported article',
    subtitle: 'Metadata ready. Press Enter or Send to add it.'
}) {
    showImportStatus(message, 'success');
    updatePromptActionState('save');

    const promptActionBtn = document.getElementById('promptActionBtn');
    promptActionBtn?.focus();
}

export async function importTextToGraph(text, position = null) {
    const payload = detectImportPayload(text);
    if (!payload) return false;

    try {
        if (payload.type === 'bibtex') {
            showNotification('Importing BibTeX to graph...', 'info');
            const articles = await parseMultipleBibTeXEntries(payload.value);
            if (!articles.length) {
                throw new Error('No valid BibTeX entry found');
            }

            const importedCount = addImportedArticlesToGraph(articles, position);
            showNotification(
                importedCount === 1
                    ? `Imported "${articles[0].title || 'article'}"`
                    : `Imported ${importedCount} articles from BibTeX`,
                'success'
            );
            return true;
        }

        if (payload.type === 'doi') {
            const existingArticle = getStore().appData.articles.find((article) =>
                article.doi && article.doi.toLowerCase() === payload.value.toLowerCase()
            );
            if (!confirmDirectImport(existingArticle, 'DOI')) {
                return false;
            }

            showNotification('Fetching DOI metadata...', 'info');
            const article = await fetchArticleFromDoi(payload.value);
            addImportedArticlesToGraph([article], position);
            showNotification(`Imported "${article.title || 'article'}"`, 'success');
            return true;
        }

        const existingArticle = getStore().appData.articles.find((article) => {
            const linkHasArxiv = article.link && article.link.includes(payload.value);
            const pdfHasArxiv = article.pdf && article.pdf.includes(payload.value);
            return linkHasArxiv || pdfHasArxiv;
        });
        if (!confirmDirectImport(existingArticle, 'arXiv ID')) {
            return false;
        }

        showNotification('Fetching arXiv metadata...', 'info');
        const article = await fetchArticleFromArxiv(payload.value);
        addImportedArticlesToGraph([article], position);
        showNotification(`Imported "${article.title || 'article'}"`, 'success');
        return true;
    } catch (error) {
        console.error('Direct graph import failed:', error);
        showNotification(`Import failed: ${error.message}`, 'error');
        return false;
    }
}

// ===== BIBTEX FILE IMPORT =====

export async function importBibtexFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const articles = await parseMultipleBibTeXEntries(text);
        
        if (articles.length === 0) {
            showNotification('❌ No valid BibTeX entry found in file', 'error');
            return;
        }
        
        // Import all articles with column layout
        const verticalSpacing = 100; // Vertical spacing between nodes
        const horizontalSpacing = 300; // Horizontal spacing between columns
        const maxPerColumn = 10; // Maximum articles per column
        
        const numColumns = Math.ceil(articles.length / maxPerColumn);
        
        // Get viewport center so nodes appear on screen, not at project origin
        const viewCenter = (typeof getNetwork() !== 'undefined' && getNetwork())
            ? getNetwork().getViewPosition()
            : { x: 0, y: 0 };
        
        articles.forEach((article, index) => {
            // Calculate column and row position
            const columnIndex = Math.floor(index / maxPerColumn);
            const rowIndex = index % maxPerColumn;
            const articlesInColumn = Math.min(maxPerColumn, articles.length - columnIndex * maxPerColumn);
            
            // Position in grid centered on the current viewport
            article.x = viewCenter.x + (columnIndex - (numColumns - 1) / 2) * horizontalSpacing;
            article.y = viewCenter.y + (rowIndex - (articlesInColumn - 1) / 2) * verticalSpacing;
            
            getStore().createArticle(article);
        });
        
        save();
        updateGraph();
        
        // Save initial positions to ensure they persist
        setTimeout(() => {
            if (getNetwork() && getStore().savedNodePositions) {
                pauseHistory();
                try {
                    const positions = getNetwork().getPositions();
                    getStore().setSavedNodePositions({ ...getStore().savedNodePositions, ...positions });
                    console.log('Saved positions for newly imported articles from .bib file');
                    
                    // Check node zone membership to update colors after positions are set
                    if (typeof checkNodeZoneMembership === 'function') {
                        console.log('Checking zone membership for imported nodes from .bib file...');
                        checkNodeZoneMembership();
                        console.log('Applied zone colors to imported nodes from .bib file');
                        
                        // Force graph update to reflect new colors
                        const currentView = getNetwork().getViewPosition();
                        const currentScale = getNetwork().getScale();
                        updateGraph();
                        // Restore view position
                        getNetwork().moveTo({
                            position: currentView,
                            scale: currentScale,
                            animation: false
                        });
                        console.log('Graph updated with correct colors');
                    }
                } finally {
                    resumeHistory();
                }
                
                save(true); // Silent save after all updates
            }
        }, 200);
        
        // Center view on imported nodes
        if (typeof getNetwork() !== 'undefined' && getNetwork()) {
            getNetwork().fit({
                animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad'
                }
            });
        }
        
        showNotification(`✓ ${articles.length} article(s) imported from BibTeX`, 'success');
        
    } catch (error) {
        console.error('Error importing BibTeX file:', error);
        showNotification('❌ Error importing BibTeX file', 'error');
    } finally {
        // Reset file input
        event.target.value = '';
    }
}
