import { state } from '../core/state.js';
import { darkenColor, getContrastColor } from '../utils/helpers.js';
import { getNodeLabel } from './selection.js';
import { rebuildEdgeWithControlPoints } from './connections.js';
import { initializeGraph } from './init.js';

// ===== GRAPH RENDERING & DATA =====
// Graph data preparation, update logic, and permissions

let searchHighlightedNodes = [];

export function getGraphData() {
    const filteredArticles = state.currentCategoryFilter 
        ? state.appData.articles.filter(a => a.categories && a.categories.includes(state.currentCategoryFilter))
        : state.appData.articles;
    
    console.log('📊 getGraphData called:');
    console.log('  - Current filter:', state.currentCategoryFilter);
    console.log('  - Total articles:', state.appData?.articles?.length || 0);
    console.log('  - Filtered articles:', filteredArticles?.length || 0);
    console.log('  - appData:', state.appData);
    console.log('  - window.state.appData:', window.state.appData);
    
    const nodes = new vis.DataSet(filteredArticles.map(article => {
        let nodeColor = { border: '#4a90e2', background: '#e3f2fd' };
        let fontColor = '#333333'; // Default dark text
        
        const categories = article.categories || [];
        if (categories.length > 0) {
            // Find the SMALLEST zone for this article (in case of nested zones)
            const articleZones = [];
            categories.forEach(tag => {
                const zone = state.tagZones.find(z => z.tag === tag);
                if (zone) {
                    articleZones.push({ zone, area: zone.width * zone.height });
                }
            });
            
            if (articleZones.length > 0) {
                // Sort by area and use the smallest zone
                articleZones.sort((a, b) => a.area - b.area);
                const smallestZone = articleZones[0].zone;
                
                nodeColor = {
                    background: smallestZone.color,
                    border: darkenColor(smallestZone.color, 20)
                };
                // Calculate appropriate text color based on background
                fontColor = getContrastColor(smallestZone.color);
            }
        }
        
        const labelFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
        
        const nodeData = {
            id: article.id,
            label: getNodeLabel(article, labelFormat),
            color: nodeColor,
            font: { color: fontColor }
        };
        
        // Load saved position if available (validate coordinates are finite numbers)
        const savedPos = state.savedNodePositions && state.savedNodePositions[article.id];
        if (savedPos && isFinite(savedPos.x) && isFinite(savedPos.y)) {
            nodeData.x = savedPos.x;
            nodeData.y = savedPos.y;
            nodeData.fixed = { x: false, y: false };
        }
        // Check for initial position on article object (for newly imported articles)
        else if (article.x !== undefined && article.y !== undefined && isFinite(article.x) && isFinite(article.y)) {
            nodeData.x = article.x;
            nodeData.y = article.y;
            nodeData.fixed = { x: false, y: false };
        }
        
        return nodeData;
    }));
    
    const articleIds = new Set(filteredArticles.map(a => a.id));
    
    // Only create edges for connections WITHOUT control points
    const edges = new vis.DataSet(state.appData.connections
        .filter(conn => {
            if (!articleIds.has(conn.from) || !articleIds.has(conn.to)) {
                return false;
            }
            if (state.edgeControlPoints && state.edgeControlPoints[conn.id]) {
                console.log('⏭️ Skipping edge', conn.id, 'in getGraphData (has control points)');
                return false;
            }
            return true;
        })
        .map(conn => ({
            id: conn.id,
            from: conn.from,
            to: conn.to,
            label: conn.label || '',
            smooth: {
                enabled: true,
                type: 'continuous',
                roundness: 0.15
            }
        })));
    
    console.log('Nodes:', nodes.get());
    console.log('Edges:', edges.get());
    
    return { nodes, edges };
}

export function updateGraph() {
    if (!state.network) {
        console.log('Network not initialized, initializing now...');
        initializeGraph();
        return;
    }
    
    try {
        searchHighlightedNodes = [];
        
        const viewPosition = state.network.getViewPosition();
        const scale = state.network.getScale();
        
        console.log('=== UPDATE GRAPH - Preserving view ===');
        console.log('View position:', viewPosition, 'Scale:', scale);
        
        const currentPositions = state.network.getPositions();
        const savedPositions = state.savedNodePositions || {};
        
        const existingNodes = state.network.body.data.nodes.get();
        const controlPointNodes = existingNodes.filter(node => node.id < 0);
        const existingControlPointIds = new Set(controlPointNodes.map(n => n.id));
        
        console.log('📊 Found', controlPointNodes.length, 'existing control point nodes');
        
        const graphData = getGraphData();
        const newNodesData = graphData.nodes.get();
        const newEdgesData = graphData.edges.get();
        
        const newNodeIds = new Set(newNodesData.map(n => n.id));
        const existingArticleNodeIds = existingNodes.filter(n => n.id > 0).map(n => n.id);
        
        const nodesToRemove = existingArticleNodeIds.filter(id => !newNodeIds.has(id));
        
        const nodesToAdd = newNodesData.filter(node => {
            const existing = state.network.body.data.nodes.get(node.id);
            return !existing;
        });
        
        const nodesToUpdate = [];
        
        newNodesData.forEach(node => {
            const existing = state.network.body.data.nodes.get(node.id);
            if (!existing) return; // Will be handled by nodesToAdd
            
            // Build update with full visual properties (label, color, font)
            const update = {
                id: node.id,
                label: node.label,
                color: node.color,
                font: node.font
            };
            
            // Apply valid position: prefer saved, then current, then existing
            if (savedPositions[node.id] && isFinite(savedPositions[node.id].x) && isFinite(savedPositions[node.id].y)) {
                update.x = savedPositions[node.id].x;
                update.y = savedPositions[node.id].y;
                update.fixed = { x: false, y: false };
            } else if (currentPositions[node.id] && isFinite(currentPositions[node.id].x) && isFinite(currentPositions[node.id].y)) {
                update.x = currentPositions[node.id].x;
                update.y = currentPositions[node.id].y;
                update.fixed = { x: false, y: false };
            }
            
            nodesToUpdate.push(update);
        });
        
        if (nodesToRemove.length > 0) {
            console.log('🗑️ Removing', nodesToRemove.length, 'nodes');
            state.network.body.data.nodes.remove(nodesToRemove);
        }
        
        if (nodesToAdd.length > 0) {
            console.log('➕ Adding', nodesToAdd.length, 'new nodes');
            state.network.body.data.nodes.add(nodesToAdd);
        }
        
        if (nodesToUpdate.length > 0) {
            console.log('🔄 Updating', nodesToUpdate.length, 'node positions');
            state.network.body.data.nodes.update(nodesToUpdate);
        }
        
        const existingEdges = state.network.body.data.edges.get();
        const existingEdgeIds = new Set(existingEdges.map(e => e.id));
        const newEdgeIds = new Set(newEdgesData.map(e => e.id));
        
        const edgesToRemove = existingEdges
            .filter(e => !e.id.toString().includes('_seg_') && !newEdgeIds.has(e.id))
            .map(e => e.id);
        
        if (edgesToRemove.length > 0) {
            console.log('🗑️ Removing', edgesToRemove.length, 'edges');
            state.network.body.data.edges.remove(edgesToRemove);
            
            edgesToRemove.forEach(edgeId => {
                if (state.edgeControlPoints[edgeId]) {
                    const controlPointsToDelete = state.edgeControlPoints[edgeId];
                    console.log('🗑️ Cleaning up control points for removed edge', edgeId, ':', controlPointsToDelete);
                    
                    controlPointsToDelete.forEach(cpId => {
                        try {
                            state.network.body.data.nodes.remove(cpId);
                        } catch (error) {
                            console.error('Error removing control point node:', cpId, error);
                        }
                    });
                    
                    const segmentEdges = state.network.body.data.edges.get({
                        filter: (edge) => {
                            const edgeIdStr = edge.id.toString();
                            if (!edgeIdStr.includes('_seg_')) return false;
                            const parts = edgeIdStr.split('_seg_');
                            const edgeNum = parseInt(parts[0]);
                            return edgeNum === edgeId;
                        }
                    });
                    if (segmentEdges.length > 0) {
                        state.network.body.data.edges.remove(segmentEdges.map(e => e.id));
                        console.log('🗑️ Removed', segmentEdges.length, 'segment edges for edge', edgeId);
                    }
                    
                    delete state.edgeControlPoints[edgeId];
                }
            });
        }
        
        newEdgesData.forEach(edge => {
            if (state.edgeControlPoints[edge.id]) {
                console.log('⏭️ Skipping edge', edge.id, 'in updateGraph (has control points)');
                return;
            }
            
            if (existingEdgeIds.has(edge.id)) {
                state.network.body.data.edges.update(edge);
            } else {
                state.network.body.data.edges.add(edge);
            }
        });
        
        state.network.moveTo({
            position: viewPosition,
            scale: scale,
            animation: false
        });
        
        Object.keys(state.edgeControlPoints).forEach(edgeId => {
            const edgeIdNum = parseInt(edgeId);
            
            const connectionExists = state.appData.connections.find(c => c.id === edgeIdNum);
            if (!connectionExists) {
                console.warn('⚠️ Edge', edgeIdNum, 'has control points but no connection in appData - cleaning up');
                const controlPointsToDelete = state.edgeControlPoints[edgeIdNum];
                if (controlPointsToDelete) {
                    controlPointsToDelete.forEach(cpId => {
                        try {
                            state.network.body.data.nodes.remove(cpId);
                        } catch (error) {
                            console.error('Error removing orphaned control point:', cpId, error);
                        }
                    });
                }
                delete state.edgeControlPoints[edgeIdNum];
                return;
            }
            
            if (state.network.body.data.edges.get(edgeIdNum)) {
                console.log('Removing simple edge', edgeIdNum, 'before rebuilding with control points');
                state.network.body.data.edges.remove(edgeIdNum);
            }
            
            console.log('🔄 Rebuilding edge', edgeIdNum, 'with control points');
            rebuildEdgeWithControlPoints(edgeIdNum);
        });
        
        console.log('✓ Graph updated, view preserved');
    } catch (error) {
        console.error('Error updating graph:', error);
    }
}

// ===== PERMISSIONS & READ-ONLY MODE =====

export function setGraphInteractionMode(readOnly = false) {
    if (!state.network) {
        console.warn('Cannot set interaction mode: network not initialized');
        return;
    }
    
    console.log(`🔒 Setting graph interaction mode: ${readOnly ? 'READ-ONLY' : 'EDIT'}`);
    
    state.network.setOptions({
        interaction: {
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            tooltipDelay: 200,
            dragView: false,
            multiselect: !readOnly,
            selectable: true,
            dragNodes: !readOnly
        },
        manipulation: {
            enabled: false
        }
    });
    
    if (readOnly) {
        const editButtons = ['addArticleBtn', 'deleteArticleBtn', 'toggleGridBtn'];
        editButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = true;
                btn.classList.add('disabled');
                btn.title = 'View-only access - you cannot edit this project';
            }
        });
        showReadOnlyIndicator();
    } else {
        const editButtons = ['addArticleBtn', 'deleteArticleBtn', 'toggleGridBtn'];
        editButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('disabled');
                btn.title = '';
            }
        });
        hideReadOnlyIndicator();
    }
}

export function showReadOnlyIndicator() {
    let indicator = document.getElementById('readOnlyIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'readOnlyIndicator';
        indicator.className = 'read-only-indicator';
        indicator.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>View Only</span>
        `;
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            toolbar.parentNode.insertBefore(indicator, toolbar.nextSibling);
        }
    }
    indicator.style.display = 'flex';
}

export function hideReadOnlyIndicator() {
    const indicator = document.getElementById('readOnlyIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Legacy bridge
window.setGraphInteractionMode = setGraphInteractionMode;
