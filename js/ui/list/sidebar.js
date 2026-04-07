// ===== LIST VIEW SIDEBAR =====
// Sidebar rendering, article list, and note selection

import { state } from '../../core/state.js';
import { getContrastColor } from '../../utils/helpers.js';
import { loadReviewToEditor } from './review.js';
import { loadArticleToEditor } from './editor.js';

// Bind sidebar search input (inline onkeyup can't reach ES module exports)
function _bindSidebarSearch() {
    const input = document.getElementById('sidebarSearch');
    if (input) input.addEventListener('input', (e) => renderListView(e.target.value));
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindSidebarSearch);
} else {
    _bindSidebarSearch();
}

export function generateContentHash(content) {
    let hash = 0;
    if (!content) return hash;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

export function renderListView(searchTerm = '') {
    const sidebar = document.getElementById('sidebarContent');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    // 1. Always add Review as first item
    const reviewTitle = (state.appData.projectReviewMeta && state.appData.projectReviewMeta.title) 
        ? state.appData.projectReviewMeta.title 
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
    let filtered = state.appData.articles;
    
    // Apply category filter to match graph view
    if (state.currentCategoryFilter) {
        filtered = filtered.filter(a => a.categories && a.categories.includes(state.currentCategoryFilter));
    }
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(a => 
            (a.title && a.title.toLowerCase().includes(term)) || 
            (a.authors && a.authors.toLowerCase().includes(term)) ||
            (a.bibtexId && a.bibtexId.toLowerCase().includes(term)) ||
            (a.text && a.text.toLowerCase().includes(term)) ||
            (a.categories && a.categories.some(cat => cat.toLowerCase().includes(term)))
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
                const zone = state.tagZones.find(z => z.tag === cat);
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
    if (state.activeNoteId) {
        const activeItem = sidebar.querySelector(`.sidebar-item[data-id="${state.activeNoteId}"]`);
        if(activeItem) activeItem.classList.add('active');
        
        if (state.activeNoteId === 'review') {
            loadReviewToEditor();
        } else {
            loadArticleToEditor(state.activeNoteId);
        }
    } else {
        state.activeNoteId = 'review';
        const reviewItemEl = sidebar.querySelector('.sidebar-item[data-id="review"]');
        if (reviewItemEl) reviewItemEl.classList.add('active');
        loadReviewToEditor();
    }
}

export function selectNote(id) {
    state.activeNoteId = id;
    
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.sidebar-item[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    if (id === 'review') {
        loadReviewToEditor();
    } else {
        loadArticleToEditor(id);
    }
}
