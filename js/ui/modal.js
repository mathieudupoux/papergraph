// ===== ARTICLE MODAL =====
// Article creation and editing modal

import { getStore, getNetwork } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { hideSelectionBox } from '../graph/selection.js';
import { resetImportZone } from '../data/import.js';
import { generateBibtexId } from '../data/bibtex-parser.js';
import { updateCategoryFilters } from './filters.js';
import { updateGraph } from '../graph/render.js';
import { renderListView } from './list/sidebar.js';
import { save } from '../data/persistence.js';
import { showArticlePreview } from './preview.js';

let pendingArticlePosition = null;

export function setPendingArticlePosition(position) {
    pendingArticlePosition = position ? { x: position.x, y: position.y } : null;
}

export function openArticleModal(articleId = null) {
    const modal = document.getElementById('articleModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('articleForm');
    const deleteBtn = document.getElementById('deleteArticleBtn');
    
    getStore().setCurrentEditingArticleId(articleId);
    modal.classList.toggle('modal-transparent-overlay', articleId === null);
    
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
        
        const article = getStore().appData.articles.find(a => a.id === articleId);
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
    const modal = document.getElementById('articleModal');
    modal.classList.remove('active');
    modal.classList.remove('modal-transparent-overlay');
    getStore().setCurrentEditingArticleId(null);
    getStore().setPendingImportArticle(null); // Clear pending import data
    setPendingArticlePosition(null);
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
    
    if (getStore().currentEditingArticleId) {
        // Update existing article
        const article = getStore().appData.articles.find(a => a.id === getStore().currentEditingArticleId);
        if (article) {
            const updates = {
                title, authors, year, entryType, journal, volume, number, pages,
                publisher, doi, isbn, issn, link, pdf, abstract, note,
                text: abstract || note,
                categories,
            };
            if (!article.bibtexId && (authors || title)) {
                updates.bibtexId = generateBibtexId({ ...article, ...updates });
            }
            getStore().updateArticle(getStore().currentEditingArticleId, updates);
        }
    } else {
        // Create new article
        const newArticle = {
            id: (() => { const _id = getStore().appData.nextArticleId; getStore().setNextArticleId(_id + 1); return _id; })(),
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
        if (getStore().pendingImportArticle) {
            // Preserve important BibTeX fields
            newArticle.bibtexId = getStore().pendingImportArticle.bibtexId;
            newArticle.citationKey = getStore().pendingImportArticle.citationKey;
            newArticle.entryType = getStore().pendingImportArticle.entryType;
            newArticle.originalBibTeX = getStore().pendingImportArticle.originalBibTeX;
            
            // Preserve additional BibTeX fields that might not be in the form
            if (getStore().pendingImportArticle.booktitle) newArticle.booktitle = getStore().pendingImportArticle.booktitle;
            if (getStore().pendingImportArticle.month) newArticle.month = getStore().pendingImportArticle.month;
            if (getStore().pendingImportArticle.date) newArticle.date = getStore().pendingImportArticle.date;
            if (getStore().pendingImportArticle.institution) newArticle.institution = getStore().pendingImportArticle.institution;
            if (getStore().pendingImportArticle.organization) newArticle.organization = getStore().pendingImportArticle.organization;
            if (getStore().pendingImportArticle.school) newArticle.school = getStore().pendingImportArticle.school;
            if (getStore().pendingImportArticle.edition) newArticle.edition = getStore().pendingImportArticle.edition;
            if (getStore().pendingImportArticle.series) newArticle.series = getStore().pendingImportArticle.series;
            if (getStore().pendingImportArticle.chapter) newArticle.chapter = getStore().pendingImportArticle.chapter;
            if (getStore().pendingImportArticle.address) newArticle.address = getStore().pendingImportArticle.address;
            if (getStore().pendingImportArticle.howpublished) newArticle.howpublished = getStore().pendingImportArticle.howpublished;
            if (getStore().pendingImportArticle.keywords) newArticle.keywords = getStore().pendingImportArticle.keywords;
            
            // Clear the pending import
            getStore().setPendingImportArticle(null);
        } else {
            // Generate BibTeX ID for manually created article
            if (authors || title) {
                newArticle.bibtexId = generateBibtexId(newArticle);
            }
        }
        
        // Use the requested creation point when available, otherwise fall back to the viewport center.
        if (pendingArticlePosition) {
            newArticle.x = pendingArticlePosition.x;
            newArticle.y = pendingArticlePosition.y;
        } else if (typeof getNetwork() !== 'undefined' && getNetwork()) {
            const viewCenter = getNetwork().getViewPosition();
            newArticle.x = viewCenter.x;
            newArticle.y = viewCenter.y;
        }
        
        getStore().addArticle(newArticle);
        
        // If category filter is active and new article doesn't match, reset filter
        if (getStore().currentCategoryFilter && !categories.includes(getStore().currentCategoryFilter)) {
            getStore().setCategoryFilter('');
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
    if (getStore().currentEditingArticleId && getStore().selectedNodeId === getStore().currentEditingArticleId) {
        showArticlePreview(getStore().currentEditingArticleId);
    }
}

export function deleteArticle() {
    if (!getStore().currentEditingArticleId) return;
    
    if (confirm('Delete this article?')) {
        deleteArticleById(getStore().currentEditingArticleId);
        closeModal();
    }
}

export function deleteArticleById(articleId) {
    // Remove article
    getStore().setArticles(getStore().appData.articles.filter(a => a.id !== articleId));
    
    // Find connections that will be removed
    const connectionsToRemove = getStore().appData.connections.filter(c => 
        c.from === articleId || c.to === articleId
    );
    
    // Clean up control points for these connections
    connectionsToRemove.forEach(conn => {
        if (getStore().edgeControlPoints[conn.id]) {
            const controlPointsToDelete = getStore().edgeControlPoints[conn.id];
            console.log('🗑️ Cleaning up control points for connection', conn.id, ':', controlPointsToDelete);
            
            // Remove control point nodes from network
            if (getNetwork() && getNetwork().body && getNetwork().body.data) {
                controlPointsToDelete.forEach(cpId => {
                    try {
                        getNetwork().body.data.nodes.remove(cpId);
                    } catch (error) {
                        console.error('Error removing control point node:', cpId, error);
                    }
                });
                
                // Remove segment edges - use exact matching to avoid removing wrong segments
                const segmentEdges = getNetwork().body.data.edges.get({
                    filter: (edge) => {
                        const edgeIdStr = edge.id.toString();
                        if (!edgeIdStr.includes('_seg_')) return false;
                        const parts = edgeIdStr.split('_seg_');
                        const edgeNum = parseInt(parts[0]);
                        return edgeNum === conn.id;
                    }
                });
                if (segmentEdges.length > 0) {
                    getNetwork().body.data.edges.remove(segmentEdges.map(e => e.id));
                    console.log('🗑️ Removed', segmentEdges.length, 'segment edges for connection', conn.id);
                }
            }
            
            // Remove from edgeControlPoints
            getStore().deleteEdgeControlPoints(conn.id);
        }
    });
    
    // Remove connections
    getStore().setConnections(getStore().appData.connections.filter(c => 
        c.from !== articleId && c.to !== articleId
    ));
    
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
