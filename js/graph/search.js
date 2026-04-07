import { state } from '../core/state.js';
import { darkenColor } from '../utils/helpers.js';

// ===== GRAPH SEARCH =====

let searchHighlightedNodes = [];

export function searchInGraph(searchTerm = '') {
    console.log('[SEARCH] Function called with term:', searchTerm);
    if (!state.network) return;
    
    const resultCount = document.getElementById('searchResultCount');
    
    // Clear previous highlights first
    if (searchHighlightedNodes.length > 0) {
        console.log('Clearing previous search highlights:', searchHighlightedNodes.length);
        const nodesToUpdate = searchHighlightedNodes.map(nodeId => {
            const article = state.appData.articles.find(a => a.id === nodeId);
            let resetBorder = '#4a90e2';
            let resetBackground = '#e3f2fd';
            
            // Restore original color based on category
            if (article && article.categories.length > 0) {
                const firstCategory = article.categories[0];
                const zone = state.tagZones.find(z => z.tag === firstCategory);
                if (zone) {
                    resetBackground = zone.color;
                    resetBorder = darkenColor(zone.color, 20);
                }
            }
            
            return {
                id: nodeId,
                borderWidth: 3,
                color: {
                    border: resetBorder,
                    background: resetBackground,
                    highlight: {
                        border: resetBorder,
                        background: resetBackground
                    }
                }
            };
        });
        state.network.body.data.nodes.update(nodesToUpdate);
        searchHighlightedNodes = [];
        state.network.redraw();  // Force redraw after clearing
    }
    
    if (!searchTerm || searchTerm.trim() === '') {
        if (resultCount) resultCount.textContent = '';
        return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    const matchingArticles = [];
    
    state.appData.articles.forEach(article => {
        let matches = false;
        
        if (article.title.toLowerCase().includes(term)) {
            matches = true;
        }
        
        if (article.categories.some(cat => cat.toLowerCase().includes(term))) {
            matches = true;
        }
        
        if (article.authors && article.authors.toLowerCase().includes(term)) {
            matches = true;
        }
        
        if (article.text && article.text.toLowerCase().includes(term)) {
            matches = true;
        }
        
        if (matches) {
            matchingArticles.push(article);
        }
    });
    
    if (resultCount) {
        if (matchingArticles.length === 0) {
            resultCount.textContent = '0';
            resultCount.style.color = '#999';
        } else {
            resultCount.textContent = `${matchingArticles.length}`;
            resultCount.style.color = '#4a90e2';
        }
    }
    
    if (matchingArticles.length === 0) {
        return;
    }
    
    const matchingNodeIds = matchingArticles.map(a => a.id);
    searchHighlightedNodes = matchingNodeIds;
    
    console.log('Highlighting nodes with yellow border:', matchingNodeIds.length);
    
    const nodesToUpdate = matchingNodeIds.map(nodeId => {
        const article = state.appData.articles.find(a => a.id === nodeId);
        
        // Get original border color
        let originalBorder = '#4a90e2';
        let originalBackground = '#e3f2fd';
        
        if (article && article.categories.length > 0) {
            const firstCategory = article.categories[0];
            const zone = state.tagZones.find(z => z.tag === firstCategory);
            if (zone) {
                originalBorder = darkenColor(zone.color, 20);
                originalBackground = zone.color;
            }
        }
        
        return {
            id: nodeId,
            borderWidth: 4,
            color: {
                border: '#ffd54f',  // Yellow border like list view
                background: originalBackground,  // Keep original background
                highlight: {
                    border: '#ffb300',
                    background: originalBackground
                }
            }
        };
    });
    state.network.body.data.nodes.update(nodesToUpdate);
    state.network.redraw();  // Force redraw after highlighting
    
    if (matchingNodeIds.length === 1) {
        state.network.selectNodes([matchingNodeIds[0]]);
        state.network.focus(matchingNodeIds[0], {
            scale: 1.5,
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });
    } else {
        state.network.fit({
            nodes: matchingNodeIds,
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });
    }
}
