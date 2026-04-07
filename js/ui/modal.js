// ===== ARTICLE MODAL =====
// Article creation and editing modal

import { state } from '../core/state.js';
import { showNotification } from '../utils/helpers.js';
import { hideSelectionBox } from '../graph/selection.js';
import { resetImportZone } from '../data/import.js';
import { generateBibtexId } from '../data/bibtex-parser.js';
import { updateCategoryFilters } from './filters.js';
import { updateGraph } from '../graph/render.js';
import { renderListView } from './list/sidebar.js';
import { save } from '../data/persistence.js';
import { showArticlePreview } from './preview.js';

export function openArticleModal(articleId = null) {
    const modal = document.getElementById('articleModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('articleForm');
    const deleteBtn = document.getElementById('deleteArticleBtn');
    
    state.currentEditingArticleId = articleId;
    
    // Hide selection box when opening modal
    hideSelectionBox();
    
    // Reset form
    form.reset();
    
    // Reset import zone to initial state
    resetImportZone();
    
    // Always collapse manual form on open
    const manualForm = document.getElementById('manualForm');
    const toggleBtn = document.getElementById('toggleManualBtn');
    manualForm.classList.add('collapsed');
    toggleBtn.textContent = '✏️ Manual Entry / Edit';
    
    if (articleId) {
        // Edit mode - show manual form directly with data
        modalTitle.textContent = 'Éditer l\'article';
        deleteBtn.style.display = 'inline-block';
        
        const article = state.appData.articles.find(a => a.id === articleId);
        if (article) {
            document.getElementById('articleTitle').value = article.title || '';
            document.getElementById('articleAuthors').value = article.authors || '';
            document.getElementById('articleYear').value = article.year || '';
            document.getElementById('articleType').value = article.entryType || 'article';
            document.getElementById('articleJournal').value = article.journal || article.booktitle || '';
            document.getElementById('articleVolume').value = article.volume || '';
            document.getElementById('articleNumber').value = article.number || '';
            document.getElementById('articlePages').value = article.pages || '';
            document.getElementById('articlePublisher').value = article.publisher || article.institution || '';
            document.getElementById('articleDoi').value = article.doi || '';
            document.getElementById('articleIsbn').value = article.isbn || '';
            document.getElementById('articleIssn').value = article.issn || '';
            document.getElementById('articleLink').value = article.link || article.url || '';
            document.getElementById('articlePdf').value = article.pdf || '';
            document.getElementById('articleAbstract').value = article.abstract || article.text || '';
            document.getElementById('articleNote').value = article.note || '';
            document.getElementById('articleCategories').value = article.categories ? article.categories.join(', ') : '';
            
            // Hide import zone and show manual form in edit mode
            document.querySelector('.import-zone').style.display = 'none';
            document.getElementById('manualFormToggle').style.display = 'none';
            manualForm.classList.remove('collapsed');
        }
    } else {
        // New article mode
        modalTitle.textContent = 'New Article';
        deleteBtn.style.display = 'none';
        
        // Show import zone in new article mode
        document.querySelector('.import-zone').style.display = 'block';
        document.getElementById('manualFormToggle').style.display = 'block';
    }
    
    modal.classList.add('active');
}

export function closeModal() {
    document.getElementById('articleModal').classList.remove('active');
    state.currentEditingArticleId = null;
    state.pendingImportArticle = null; // Clear pending import data
    resetImportZone();
}

export function saveArticle(e) {
    e.preventDefault();
    
    const title = document.getElementById('articleTitle').value.trim();
    const authors = document.getElementById('articleAuthors').value.trim();
    const year = document.getElementById('articleYear').value.trim();
    const entryType = document.getElementById('articleType').value;
    const journal = document.getElementById('articleJournal').value.trim();
    const volume = document.getElementById('articleVolume').value.trim();
    const number = document.getElementById('articleNumber').value.trim();
    const pages = document.getElementById('articlePages').value.trim();
    const publisher = document.getElementById('articlePublisher').value.trim();
    const doi = document.getElementById('articleDoi').value.trim();
    const isbn = document.getElementById('articleIsbn').value.trim();
    const issn = document.getElementById('articleIssn').value.trim();
    const link = document.getElementById('articleLink').value.trim();
    const pdf = document.getElementById('articlePdf').value.trim();
    const abstract = document.getElementById('articleAbstract').value.trim();
    const note = document.getElementById('articleNote').value.trim();
    const categoriesText = document.getElementById('articleCategories').value.trim();
    
    const categories = categoriesText 
        ? categoriesText.split(',').map(c => c.trim()).filter(c => c)
        : [];
    
    if (state.currentEditingArticleId) {
        // Update existing article
        const article = state.appData.articles.find(a => a.id === state.currentEditingArticleId);
        if (article) {
            article.title = title;
            article.authors = authors;
            article.year = year;
            article.entryType = entryType;
            article.journal = journal;
            article.volume = volume;
            article.number = number;
            article.pages = pages;
            article.publisher = publisher;
            article.doi = doi;
            article.isbn = isbn;
            article.issn = issn;
            article.link = link;
            article.pdf = pdf;
            article.abstract = abstract;
            article.note = note;
            article.text = abstract || note; // Keep backward compatibility
            article.categories = categories;
            
            // Generate BibTeX ID if missing
            if (!article.bibtexId && (article.authors || article.title)) {
                article.bibtexId = generateBibtexId(article);
            }
        }
    } else {
        // Create new article
        const newArticle = {
            id: state.appData.nextArticleId++,
            title,
            authors,
            year,
            entryType,
            journal,
            volume,
            number,
            pages,
            publisher,
            doi,
            isbn,
            issn,
            link,
            pdf,
            abstract,
            note,
            text: abstract || note,
            categories
        };
        
        // If this is from a BibTeX import, preserve imported fields
        if (state.pendingImportArticle) {
            // Preserve important BibTeX fields
            newArticle.bibtexId = state.pendingImportArticle.bibtexId;
            newArticle.citationKey = state.pendingImportArticle.citationKey;
            newArticle.entryType = state.pendingImportArticle.entryType;
            newArticle.originalBibTeX = state.pendingImportArticle.originalBibTeX;
            
            // Preserve additional BibTeX fields that might not be in the form
            if (state.pendingImportArticle.booktitle) newArticle.booktitle = state.pendingImportArticle.booktitle;
            if (state.pendingImportArticle.month) newArticle.month = state.pendingImportArticle.month;
            if (state.pendingImportArticle.date) newArticle.date = state.pendingImportArticle.date;
            if (state.pendingImportArticle.institution) newArticle.institution = state.pendingImportArticle.institution;
            if (state.pendingImportArticle.organization) newArticle.organization = state.pendingImportArticle.organization;
            if (state.pendingImportArticle.school) newArticle.school = state.pendingImportArticle.school;
            if (state.pendingImportArticle.edition) newArticle.edition = state.pendingImportArticle.edition;
            if (state.pendingImportArticle.series) newArticle.series = state.pendingImportArticle.series;
            if (state.pendingImportArticle.chapter) newArticle.chapter = state.pendingImportArticle.chapter;
            if (state.pendingImportArticle.address) newArticle.address = state.pendingImportArticle.address;
            if (state.pendingImportArticle.howpublished) newArticle.howpublished = state.pendingImportArticle.howpublished;
            if (state.pendingImportArticle.keywords) newArticle.keywords = state.pendingImportArticle.keywords;
            
            // Clear the pending import
            state.pendingImportArticle = null;
        } else {
            // Generate BibTeX ID for manually created article
            if (authors || title) {
                newArticle.bibtexId = generateBibtexId(newArticle);
            }
        }
        
        // Position at the center of the current viewport (not project center)
        if (typeof state.network !== 'undefined' && state.network) {
            const viewCenter = state.network.getViewPosition();
            newArticle.x = viewCenter.x;
            newArticle.y = viewCenter.y;
        }
        
        state.appData.articles.push(newArticle);
        
        // If category filter is active and new article doesn't match, reset filter
        if (state.currentCategoryFilter && !categories.includes(state.currentCategoryFilter)) {
            state.currentCategoryFilter = '';
            document.getElementById('categoryFilter').value = '';
        }
    }
    
    closeModal();
    updateCategoryFilters();
    updateGraph();
    renderListView();
    save(true);  // Silent save, notification already shown
    showNotification('Article saved!', 'success');
    
    // Update preview if it's open
    if (state.currentEditingArticleId && state.selectedNodeId === state.currentEditingArticleId) {
        showArticlePreview(state.currentEditingArticleId);
    }
}

export function deleteArticle() {
    if (!state.currentEditingArticleId) return;
    
    if (confirm('Delete this article?')) {
        deleteArticleById(state.currentEditingArticleId);
        closeModal();
    }
}

export function deleteArticleById(articleId) {
    // Remove article
    state.appData.articles = state.appData.articles.filter(a => a.id !== articleId);
    
    // Find connections that will be removed
    const connectionsToRemove = state.appData.connections.filter(c => 
        c.from === articleId || c.to === articleId
    );
    
    // Clean up control points for these connections
    connectionsToRemove.forEach(conn => {
        if (state.edgeControlPoints[conn.id]) {
            const controlPointsToDelete = state.edgeControlPoints[conn.id];
            console.log('🗑️ Cleaning up control points for connection', conn.id, ':', controlPointsToDelete);
            
            // Remove control point nodes from network
            if (state.network && state.network.body && state.network.body.data) {
                controlPointsToDelete.forEach(cpId => {
                    try {
                        state.network.body.data.nodes.remove(cpId);
                    } catch (error) {
                        console.error('Error removing control point node:', cpId, error);
                    }
                });
                
                // Remove segment edges - use exact matching to avoid removing wrong segments
                const segmentEdges = state.network.body.data.edges.get({
                    filter: (edge) => {
                        const edgeIdStr = edge.id.toString();
                        if (!edgeIdStr.includes('_seg_')) return false;
                        const parts = edgeIdStr.split('_seg_');
                        const edgeNum = parseInt(parts[0]);
                        return edgeNum === conn.id;
                    }
                });
                if (segmentEdges.length > 0) {
                    state.network.body.data.edges.remove(segmentEdges.map(e => e.id));
                    console.log('🗑️ Removed', segmentEdges.length, 'segment edges for connection', conn.id);
                }
            }
            
            // Remove from edgeControlPoints
            delete state.edgeControlPoints[conn.id];
        }
    });
    
    // Remove connections
    state.appData.connections = state.appData.connections.filter(c => 
        c.from !== articleId && c.to !== articleId
    );
    
    updateCategoryFilters();
    updateGraph();
    renderListView();
    save();
    showNotification('Article deleted', 'info');
}

export function toggleManualForm() {
    const manualForm = document.getElementById('manualForm');
    const toggleBtn = document.getElementById('toggleManualBtn');
    
    if (manualForm.classList.contains('collapsed')) {
        manualForm.classList.remove('collapsed');
        toggleBtn.textContent = '🔼 Collapse';
    } else {
        manualForm.classList.add('collapsed');
        toggleBtn.textContent = '✏️ Manual Entry / Edit';
    }
}
