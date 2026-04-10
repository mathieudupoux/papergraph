import { getStore, getNetwork } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { updateGraph } from './render.js';
import { save } from '../data/persistence.js';
import { icon } from '../ui/icons.js';
import { getGraphInteractionOptions } from './interaction.js';

// ===== CONNECTIONS =====
// Connection/edge management and creation

export function createConnection(label) {
    if (!getStore().connectionMode.fromNodeId || !getStore().connectionMode.toNodeId) return;
    
    getStore().addConnection({
        id: (() => { const _id = getStore().appData.nextConnectionId; getStore().setNextConnectionId(_id + 1); return _id; })(),
        from: getStore().connectionMode.fromNodeId,
        to: getStore().connectionMode.toNodeId,
        label: label
    });
    
    cancelConnectionMode();
    updateGraph();
    save();
    showNotification('Connexion créée!', 'success');
}

export function editConnectionLabel(edgeId) {
    const connection = getStore().appData.connections.find(c => c.id === edgeId);
    if (!connection) return;
    
    const currentLabel = connection.label || '';
    const newLabel = prompt('Label de la connexion (optionnel):', currentLabel);
    
    if (newLabel !== null) {
        getStore().updateConnectionLabel(edgeId, newLabel.trim());
        updateGraph();
        save();
        showNotification('Label mis à jour!', 'success');
    }
}

export function editEdgeLabelInline(edgeId, edge, pointerDOM) {
    // Don't allow editing in gallery viewer mode
    if (getStore().isGalleryViewer) {
        return;
    }
    
    const connection = getStore().appData.connections.find(c => c.id === edgeId);
    if (!connection) {
        console.log('Connection not found:', edgeId);
        return;
    }
    
    // Use the pointer position directly (where user clicked)
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    const screenPos = {
        x: rect.left + pointerDOM.x,
        y: rect.top + pointerDOM.y
    };
    
    // Create inline input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = connection.label || '';
    input.placeholder = 'Label';
    input.style.position = 'fixed';
    input.style.left = screenPos.x + 'px';
    input.style.top = screenPos.y + 'px';
    input.style.transform = 'translate(-50%, -50%)';
    input.style.padding = '4px 8px';
    input.style.border = '1px solid #e0e0e0';
    input.style.borderRadius = '4px';
    input.style.fontSize = '11px';
    input.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    input.style.zIndex = '10000';
    input.style.background = 'rgba(255, 255, 255, 0.95)';
    input.style.backdropFilter = 'blur(8px)';
    input.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    input.style.minWidth = '80px';
    input.style.textAlign = 'center';
    input.style.outline = 'none';
    input.style.color = '#666';
    
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    getStore().setIsEditingEdgeLabel(true);
    
    const persist = save;
    const finishEdit = () => {
        const newLabel = input.value.trim();
        getStore().updateConnectionLabel(edgeId, newLabel);
        getStore().setIsEditingEdgeLabel(false);
        
        // Just rebuild this specific edge instead of calling updateGraph
        rebuildEdgeWithControlPoints(edgeId);
        
        persist();
        input.remove();
        if (newLabel) {
            showNotification('Label mis à jour!', 'success');
        }
    };
    
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishEdit();
        } else if (e.key === 'Escape') {
            getStore().setIsEditingEdgeLabel(false);
            input.remove();
        }
    });
    
    // Close when clicking outside
    const clickHandler = (e) => {
        if (e.target !== input && input.parentElement) {
            finishEdit();
            document.removeEventListener('click', clickHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', clickHandler);
    }, 100);
}

export function deleteConnection(edgeId) {
    console.log('🗑️ Deleting connection:', edgeId);
    
    // Check if edgeId is a segment, extract actual edge ID
    let actualEdgeId = edgeId;
    if (typeof edgeId === 'string' && edgeId.includes('_seg_')) {
        actualEdgeId = parseInt(edgeId.split('_seg_')[0]);
        console.log('📍 Detected segment edge, actual edge ID:', actualEdgeId);
    }
    
    // Delete all control points for THIS SPECIFIC edge only
    if (getStore().edgeControlPoints[actualEdgeId]) {
        const controlPointsToDelete = getStore().edgeControlPoints[actualEdgeId];
        console.log('🗑️ Deleting', controlPointsToDelete.length, 'control points for edge', actualEdgeId, ':', controlPointsToDelete);
        
        // Remove control point nodes from network
        controlPointsToDelete.forEach(cpId => {
            try {
                getNetwork().body.data.nodes.remove(cpId);
                console.log('✅ Removed control point node:', cpId);
            } catch (error) {
                console.error('❌ Error removing control point node:', cpId, error);
            }
        });
        
        // Remove segment edges for THIS SPECIFIC edge only
        // Use exact matching to avoid removing segments from other edges
        const segmentEdgesToRemove = getNetwork().body.data.edges.get({
            filter: (edge) => {
                const edgeIdStr = edge.id.toString();
                if (!edgeIdStr.includes('_seg_')) return false;
                const parts = edgeIdStr.split('_seg_');
                const edgeNum = parseInt(parts[0]);
                return edgeNum === actualEdgeId;
            }
        });
        
        if (segmentEdgesToRemove.length > 0) {
            console.log('🗑️ Removing', segmentEdgesToRemove.length, 'segment edges for edge', actualEdgeId);
            getNetwork().body.data.edges.remove(segmentEdgesToRemove.map(e => e.id));
        }
        
        // Remove from edgeControlPoints map
        getStore().deleteEdgeControlPoints(actualEdgeId);
        console.log('✅ Cleared control points for edge', actualEdgeId);
    }
    
    // Remove the main edge if it exists (it might not if it has control points)
    try {
        if (getNetwork().body.data.edges.get(actualEdgeId)) {
            getNetwork().body.data.edges.remove(actualEdgeId);
            console.log('✅ Removed main edge:', actualEdgeId);
        }
    } catch (error) {
        console.log('Note: Main edge', actualEdgeId, 'not found in network (this is ok if it had control points)');
    }
    
    // Remove the connection from appData
    getStore().setConnections(getStore().appData.connections.filter(c => c.id !== actualEdgeId));
    console.log('✅ Connection removed from appData');
    
    updateGraph();
    save();
    showNotification('Connexion supprimée', 'info');
}

export function showEdgeMenu(x, y, edgeId) {
    // Don't show edge menu in gallery viewer mode
    if (getStore().isGalleryViewer) {
        return;
    }
    
    const menu = document.getElementById('edgeMenu');
    
    console.log('📍 ========== SHOWING EDGE MENU ==========');
    console.log('📍 Position:', x, y);
    console.log('📍 Edge ID:', edgeId, 'Type:', typeof edgeId);
    console.log('📍 =========================================');
    
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    const anchorDom = {
        x: x - rect.left,
        y: y - rect.top
    };
    const anchorCanvas = getNetwork().DOMtoCanvas(anchorDom);

    // Store original click position in canvas coordinates so the menu follows pan/zoom
    menu.dataset.anchorCanvasX = anchorCanvas.x;
    menu.dataset.anchorCanvasY = anchorCanvas.y;
    menu.classList.add('active');

    // Position menu with offset (down and left)
    updateEdgeMenuPosition();

    // Position buttons in a circle around the click point
    const buttons = menu.querySelectorAll('.edge-btn');
    console.log('Found', buttons.length, 'buttons in edge menu');
    
    const radius = 60;
    const startAngle = -Math.PI / 2; // Start at top
    const angleStep = (2 * Math.PI) / buttons.length;

    // Store edgeId for the menu actions
    menu.dataset.edgeId = edgeId;
    getStore().setSelectedEdgeId(edgeId);
    console.log('✓ Edge menu shown, selectedEdgeId:', getStore().selectedEdgeId);

    buttons.forEach((button, index) => {
        const angle = startAngle + angleStep * index;
        const btnX = Math.cos(angle) * radius;
        const btnY = Math.sin(angle) * radius;
        
        button.style.left = (btnX - 22) + 'px';
        button.style.top = (btnY - 22) + 'px';
        
        // Clone button to remove ALL old event listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // Attach click handler to the clean button with the correct edgeId captured in closure
        newButton.addEventListener('click', function handleEdgeButtonClick(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 Edge button clicked:', newButton.dataset.action, 'for edge:', edgeId);
            
            const action = newButton.dataset.action;
            
            if (action === 'add-control') {
                console.log('Adding control point to edge:', edgeId);
                const clickCanvasPos = getEdgeMenuAnchorCanvasPosition();
                hideEdgeMenu();
                
                if (clickCanvasPos) {
                    console.log('📍 Canvas position for control point:', clickCanvasPos);
                    addControlPointToEdge(edgeId, clickCanvasPos);
                }
            } else if (action === 'edit-label') {
                console.log('Editing label for edge:', edgeId);
                const clickPointerDom = getEdgeMenuAnchorPointerDOM();
                hideEdgeMenu();
                
                if (clickPointerDom) {
                    console.log('Opening edit at anchor position:', clickPointerDom);
                    editEdgeLabelInline(edgeId, null, clickPointerDom);
                }
            } else if (action === 'delete') {
                console.log('Deleting edge:', edgeId);
                hideEdgeMenu();
                deleteConnection(edgeId);
            }
        });
        
        console.log(`Button ${index} (${newButton.dataset.action}) positioned at:`, newButton.style.left, newButton.style.top);
    });
}

function getEdgeMenuAnchorCanvasPosition() {
    const menu = document.getElementById('edgeMenu');
    const x = parseFloat(menu.dataset.anchorCanvasX);
    const y = parseFloat(menu.dataset.anchorCanvasY);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return { x, y };
}

function getEdgeMenuAnchorPointerDOM() {
    const anchorCanvas = getEdgeMenuAnchorCanvasPosition();
    if (!anchorCanvas) return null;

    const anchorDom = getNetwork().canvasToDOM(anchorCanvas);

    return {
        x: anchorDom.x,
        y: anchorDom.y
    };
}

export function updateEdgeMenuPosition() {
    const menu = document.getElementById('edgeMenu');
    if (!menu || !menu.classList.contains('active')) {
        return;
    }

    const anchorCanvas = getEdgeMenuAnchorCanvasPosition();
    if (!anchorCanvas) {
        return;
    }

    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    const anchorDom = getNetwork().canvasToDOM(anchorCanvas);

    // Position menu with offset (down and left)
    const offsetX = -30;  // Décalage vers la gauche
    const offsetY = 30;   // Décalage vers le bas
    menu.style.left = (rect.left + anchorDom.x + offsetX) + 'px';
    menu.style.top = (rect.top + anchorDom.y + offsetY) + 'px';
    menu.classList.add('active');
}

export function hideEdgeMenu() {
    const menu = document.getElementById('edgeMenu');
    menu.classList.remove('active');
    delete menu.dataset.anchorCanvasX;
    delete menu.dataset.anchorCanvasY;
    delete menu.dataset.edgeId;
    getStore().setSelectedEdgeId(null);
    
    // Re-enable interactions
    if (getNetwork()) {
        getNetwork().setOptions({ 
            interaction: getGraphInteractionOptions({
                dragNodes: true,
                hover: true,
                tooltipDelay: 200
            })
        });
    }
}

export function startConnectionMode(fromNodeId) {
    // Cannot start connection from a control point
    if (fromNodeId < 0) {
        console.log('⚠️ Cannot start connection from control point:', fromNodeId);
        return;
    }
    
    getStore().updateConnectionMode({ active: true });
    getStore().updateConnectionMode({ fromNodeId: fromNodeId });
    getStore().updateConnectionMode({ hoveredNodeId: null });
    
    // Show indicator
    document.getElementById('connectionModeIndicator').classList.add('active');
    
    // Change cursor
    if (getNetwork()) {
        getNetwork().canvas.body.container.style.cursor = 'crosshair';
        getNetwork().setOptions({
            interaction: {
                hover: true,
                hoverConnectedEdges: false,
                selectConnectedEdges: false
            },
            edges: {
                hoverWidth: 0,
                selectionWidth: 0,
                color: {
                    hover: '#848484'
                }
            }
        });
        
        // Create temporary invisible node for cursor tracking
        const tempNodeId = 'temp-cursor-node';
        getStore().updateConnectionMode({ tempNode: tempNodeId });
        
        const sourcePos = getNetwork().getPositions([fromNodeId])[fromNodeId];
        
        getNetwork().body.data.nodes.add({
            id: tempNodeId,
            x: sourcePos.x,
            y: sourcePos.y,
            shape: 'dot',
            size: 1,
            physics: false,
            opacity: 0,
            color: {
                background: 'transparent',
                border: 'transparent'
            }
        });
        
        // Create temporary preview edge
        const tempEdgeId = 'temp-connection-preview';
        getStore().updateConnectionMode({ tempEdge: tempEdgeId });
        
        getNetwork().body.data.edges.add({
            id: tempEdgeId,
            from: fromNodeId,
            to: tempNodeId,
            color: {
                color: '#3498db',
                opacity: 0.5
            },
            dashes: [5, 5],
            width: 2,
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 0.5
                }
            },
            physics: false,
            smooth: false
        });
        
        // Update temp node on mouse move
        const canvas = getNetwork().canvas.frame.canvas;
        const mouseMoveHandler = function(event) {
            if (!getStore().connectionMode.active) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const canvasPos = getNetwork().DOMtoCanvas({x, y});
            if (!getStore().connectionMode.hoveredNodeId) {
                getNetwork().body.data.nodes.update({ id: tempNodeId, x: canvasPos.x, y: canvasPos.y });
            }
        };
        getStore().updateConnectionMode({ mouseMoveHandler });
        canvas.addEventListener('pointermove', getStore().connectionMode.mouseMoveHandler);
        
        // Track hover for snapping
        const hoverHandler = function(params) {
            if (getStore().connectionMode.active && params.node !== getStore().connectionMode.fromNodeId) {
                getStore().updateConnectionMode({ hoveredNodeId: params.node });
                getNetwork().body.data.edges.update({
                    id: tempEdgeId,
                    to: params.node,
                    color: { color: '#27ae60', opacity: 0.7 },
                });
            }
        };
        getStore().updateConnectionMode({ hoverHandler });
        
        const blurHandler = function() {
            if (getStore().connectionMode.active) {
                getStore().updateConnectionMode({ hoveredNodeId: null });
                getNetwork().body.data.edges.update({
                    id: tempEdgeId,
                    to: tempNodeId,
                    color: { color: '#3498db', opacity: 0.5 },
                });
            }
        };
        getStore().updateConnectionMode({ blurHandler });
        
        getNetwork().on('hoverNode', getStore().connectionMode.hoverHandler);
        getNetwork().on('blurNode', getStore().connectionMode.blurHandler);
    }
    
    showNotification('Cliquez sur un nœud pour créer la connexion', 'info');
}

export function handleConnectionModeClick(params) {
    if (params.nodes.length > 0) {
        const toNodeId = params.nodes[0];
        
        // Ignore control points (negative IDs) - they are not valid connection targets
        if (toNodeId < 0) {
            console.log('⚠️ Cannot connect to control point:', toNodeId);
            return;
        }
        
        if (toNodeId === getStore().connectionMode.tempNode) {
            return;
        }
        
        if (toNodeId === getStore().connectionMode.fromNodeId) {
            showNotification('Un article ne peut pas se connecter à lui-même', 'error');
            return;
        }
        
        // Check if connection exists
        const exists = getStore().appData.connections.some(c => 
            c.from === getStore().connectionMode.fromNodeId && c.to === toNodeId
        );
        
        if (exists) {
            showNotification('This connection already exists', 'error');
            cancelConnectionMode();
            return;
        }
        
        // Remove temporary preview
        if (getStore().connectionMode.tempEdge && getNetwork()) {
            try {
                getNetwork().body.data.edges.remove(getStore().connectionMode.tempEdge);
            } catch (e) {}
            getStore().updateConnectionMode({ tempEdge: null });
        }
        
        // Remove temporary node
        if (getStore().connectionMode.tempNode && getNetwork()) {
            try {
                getNetwork().body.data.nodes.remove(getStore().connectionMode.tempNode);
            } catch (e) {}
            getStore().updateConnectionMode({ tempNode: null });
        }
        
        // Create connection
        getStore().updateConnectionMode({ toNodeId: toNodeId });
        createConnection('');
    } else {
        // Cancel on empty click
        cancelConnectionMode();
    }
}

export function cancelConnectionMode() {
    getStore().updateConnectionMode({ active: false });
    getStore().updateConnectionMode({ fromNodeId: null });
    getStore().updateConnectionMode({ toNodeId: null });
    getStore().updateConnectionMode({ hoveredNodeId: null });
    
    // Remove listeners
    if (getStore().connectionMode.mouseMoveHandler && getNetwork()) {
        const canvas = getNetwork().canvas.frame.canvas;
        canvas.removeEventListener('pointermove', getStore().connectionMode.mouseMoveHandler);
        getStore().updateConnectionMode({ mouseMoveHandler: null });
    }
    
    if (getStore().connectionMode.hoverHandler && getNetwork()) {
        getNetwork().off('hoverNode', getStore().connectionMode.hoverHandler);
        getStore().updateConnectionMode({ hoverHandler: null });
    }
    if (getStore().connectionMode.blurHandler && getNetwork()) {
        getNetwork().off('blurNode', getStore().connectionMode.blurHandler);
        getStore().updateConnectionMode({ blurHandler: null });
    }
    
    // Remove temporary edge
    if (getStore().connectionMode.tempEdge && getNetwork()) {
        try {
            getNetwork().body.data.edges.remove(getStore().connectionMode.tempEdge);
        } catch (e) {}
    }
    getStore().updateConnectionMode({ tempEdge: null });
    
    // Remove temporary node
    if (getStore().connectionMode.tempNode && getNetwork()) {
        try {
            getNetwork().body.data.nodes.remove(getStore().connectionMode.tempNode);
        } catch (e) {}
    }
    getStore().updateConnectionMode({ tempNode: null });
    
    document.getElementById('connectionModeIndicator').classList.remove('active');
    
    if (getNetwork()) {
        getNetwork().canvas.body.container.style.cursor = "default";
        getNetwork().setOptions({
            interaction: {
                hover: true,
                hoverConnectedEdges: true,
                selectConnectedEdges: true
            },
            edges: {
                hoverWidth: 0.5,
                selectionWidth: 1,
                color: {
                    hover: '#4a90e2'
                }
            }
        });
    }
    
    showNotification('Connection mode cancelled', 'info');
}

// ===== EDGE CONTROL POINTS =====
// System for adding/removing control points on edges to route them around nodes
// Variables edgeControlPoints and nextControlPointId are declared in getStore().js

// Add control point to an edge
export function addControlPointToEdge(edgeId, clickPosition = null) {
    console.log('🔵 ========== ADD CONTROL POINT TO EDGE ==========');
    console.log('🔵 Called with edgeId:', edgeId, 'Type:', typeof edgeId);
    console.log('🔵 Click position:', clickPosition);
    console.log('� Current edgeControlPoints:', JSON.stringify(getStore().edgeControlPoints));
    console.log('� Next control point ID:', getStore().nextControlPointId);
    console.log('🔵 ================================================');
    
    // Check if this is a segment edge (contains _seg_)
    let actualEdgeId = edgeId;
    let segmentIndex = -1;
    
    if (typeof edgeId === 'string' && edgeId.includes('_seg_')) {
        // Extract original edge ID and segment index
        const parts = edgeId.split('_seg_');
        actualEdgeId = parseInt(parts[0]);
        segmentIndex = parseInt(parts[1]);
        console.log('📍 Detected segment edge. Original edge:', actualEdgeId, 'Segment:', segmentIndex);
    }
    
    const connection = getStore().appData.connections.find(c => c.id === actualEdgeId);
    if (!connection) {
        console.error('❌ Connection not found for edgeId:', actualEdgeId);
        console.log('Available connections:', getStore().appData.connections);
        return;
    }
    
    console.log('✓ Connection found:', connection);
    
    // Get edge position (we need to find the actual visual edge)
    let edge;
    if (segmentIndex >= 0) {
        // Get the segment edge
        edge = getNetwork().body.data.edges.get(edgeId);
        console.log('📍 Using segment edge:', edgeId, edge);
    } else {
        edge = getNetwork().body.data.edges.get(actualEdgeId);
        console.log('📍 Using main edge:', actualEdgeId, edge);
    }
    
    if (!edge) {
        console.error('❌ Edge not found in vis-network:', edgeId);
        console.log('Available edges:', getNetwork().body.data.edges.get());
        return;
    }
    
    console.log('✓ Edge found in network:', edge);
    console.log('✓ Edge connects from node', edge.from, 'to node', edge.to);
    
    // Verify the edge belongs to the correct connection
    if (segmentIndex < 0) {
        // For main edges, verify from/to match the connection
        if (edge.from !== connection.from || edge.to !== connection.to) {
            console.error('❌ Edge mismatch! Edge:', edge, 'Connection:', connection);
            console.error('This edge does not belong to the expected connection!');
            return;
        }
    }
    
    const fromPos = getNetwork().getPositions([edge.from])[edge.from];
    const toPos = getNetwork().getPositions([edge.to])[edge.to];
    
    console.log('📍 From node', edge.from, 'position:', fromPos);
    console.log('📍 To node', edge.to, 'position:', toPos);
    
    if (!fromPos || !toPos) {
        console.error('❌ Could not get positions for edge nodes');
        return;
    }
    
    // Create control point node at click position or middle of the segment
    const controlPointId = getStore().decrementNextControlPointId();
    
    const controlPoint = clickPosition ? {
        x: clickPosition.x,
        y: clickPosition.y
    } : {
        x: (fromPos.x + toPos.x) / 2,
        y: (fromPos.y + toPos.y) / 2
    };
    
    console.log('🎯 Creating control point node:', controlPointId, 'at:', controlPoint, clickPosition ? '(click position)' : '(center)');
    console.log('🎯 For edge', actualEdgeId, 'connecting', connection.from, '->', connection.to);
    
    // Add control point node - small center with transparent border for larger interaction
    try {
        getNetwork().body.data.nodes.add({
            id: controlPointId,
            x: controlPoint.x,
            y: controlPoint.y,
            shape: 'dot',
            size: 2, // Small visible center
            color: {
                background: '#848484', // Grey visible center
                border: 'rgba(132, 132, 132, 0.01)', // Nearly transparent border for interaction
                highlight: {
                    background: '#4a90e2',
                    border: '#3578ba'
                }
            },
            borderWidth: 3, // Wide transparent border = larger click area
            physics: false,
            fixed: false,
            label: '',
            group: 'controlPoint',
            chosen: {
                node: function(values, id, selected, hovering) {
                    if (hovering) {
                        // On hover: larger visible size with visible border
                        values.size = 5;
                        values.borderWidth = 2;
                        values.borderColor = '#666666';
                    } else {
                        // Not hovering: small visible center with transparent border
                        values.size = 2;
                        values.borderWidth = 3;
                        values.borderColor = 'rgba(132, 132, 132, 0.01)';
                    }
                }
            }
        });
        console.log('✅ Control point node added to network');
    } catch (error) {
        console.error('❌ Error adding control point node:', error);
        return;
    }
    
    // Store control point at the right position - ONLY for this specific edge
    if (!getStore().edgeControlPoints[actualEdgeId]) {
        getStore().initEdgeControlPoints(actualEdgeId);
        console.log('📝 Created new control points array for edge', actualEdgeId);
    }
    
    // Double-check that this control point doesn't already exist in ANY edge
    for (const [existingEdgeId, existingPoints] of Object.entries(getStore().edgeControlPoints)) {
        if (existingPoints.includes(controlPointId)) {
            console.error('❌ Control point', controlPointId, 'already exists in edge', existingEdgeId);
            return;
        }
    }
    
    if (segmentIndex >= 0 && getStore().edgeControlPoints[actualEdgeId].length > 0) {
        // We're clicking on a segment between existing control points
        // segmentIndex corresponds to the position in the chain
        // Chain is: from -> cp[0] -> cp[1] -> ... -> to
        // Segment 0: from -> cp[0]
        // Segment 1: cp[0] -> cp[1]
        // Segment N: cp[N-1] -> to
        // So clicking on segment i means we want to insert AFTER cp[i-1]
        // which is at position i in the array
        getStore().edgeControlPoints[actualEdgeId].splice(segmentIndex, 0, controlPointId);
        console.log('✅ Control point', controlPointId, 'inserted at index', segmentIndex, 'in existing chain for edge', actualEdgeId);
    } else {
        // First control point or clicking on original edge
        getStore().edgeControlPoints[actualEdgeId].push(controlPointId);
        console.log('✅ Control point', controlPointId, 'added to edge', actualEdgeId, '(first or at end)');
    }
    
    console.log('✅ Edge', actualEdgeId, 'now has points:', getStore().edgeControlPoints[actualEdgeId]);
    console.log('📊 All edgeControlPoints:', getStore().edgeControlPoints);
    
    // Rebuild edges through control points
    console.log('🔄 Calling rebuildEdgeWithControlPoints...');
    rebuildEdgeWithControlPoints(actualEdgeId);
    
    console.log('💾 Saving to localStorage...');
    save();
    
    showNotification('Point de contrôle ajouté', 'success');
    console.log('✅ addControlPointToEdge complete');
}

// Remove control point from edge
function removeControlPointFromEdge(controlPointId) {
    console.log('🗑️ Removing control point:', controlPointId);
    
    // Find which edge this control point belongs to
    let edgeId = null;
    let pointIndex = -1;
    
    for (const [eid, points] of Object.entries(getStore().edgeControlPoints)) {
        const idx = points.indexOf(controlPointId);
        if (idx !== -1) {
            edgeId = parseInt(eid);
            pointIndex = idx;
            break;
        }
    }
    
    if (edgeId === null) {
        console.error('❌ Control point not found in any edge');
        return;
    }
    
    // Remove control point node
    getNetwork().body.data.nodes.remove(controlPointId);
    
    // Remove from array
    getStore().edgeControlPoints[edgeId].splice(pointIndex, 1);
    
    // Remove entry if no more control points
    if (getStore().edgeControlPoints[edgeId].length === 0) {
        getStore().deleteEdgeControlPoints(edgeId);
    }
    
    // Rebuild edges
    rebuildEdgeWithControlPoints(edgeId);
    save();
    showNotification('Point de contrôle supprimé', 'success');
}

// Rebuild edge path through control points
export function rebuildEdgeWithControlPoints(edgeId) {
    console.log('🔄 rebuildEdgeWithControlPoints called for edge:', edgeId);
    
    const connection = getStore().appData.connections.find(c => c.id === edgeId);
    if (!connection) {
        console.error('❌ Connection not found for edge:', edgeId);
        return;
    }
    
    const controlPoints = getStore().edgeControlPoints[edgeId] || [];
    
    console.log('� Edge', edgeId, 'has', controlPoints.length, 'control points:', controlPoints);
    console.log('📊 Connection:', connection);
    
    // Remove all intermediate edges for this connection - use exact matching
    const edgesToRemove = getNetwork().body.data.edges.get({
        filter: (edge) => {
            const edgeIdStr = edge.id.toString();
            if (!edgeIdStr.includes('_seg_')) return false;
            const parts = edgeIdStr.split('_seg_');
            const edgeNum = parseInt(parts[0]);
            return edgeNum === edgeId;
        }
    });
    
    console.log('🗑️ Removing', edgesToRemove.length, 'segment edges for edge', edgeId);
    getNetwork().body.data.edges.remove(edgesToRemove.map(e => e.id));
    
    if (controlPoints.length === 0) {
        // No control points - restore original edge with label
        console.log('⚪ No control points - restoring original edge');
        if (!getNetwork().body.data.edges.get(edgeId)) {
            getNetwork().body.data.edges.add({
                id: edgeId,
                from: connection.from,
                to: connection.to,
                label: connection.label || '', // Always show label
                smooth: {
                    enabled: true,
                    type: 'continuous', // Same as segments for consistency
                    roundness: 0.15
                }
            });
            console.log('✅ Original edge restored with label:', connection.label);
        } else {
            // Edge exists, just update its label and smooth
            getNetwork().body.data.edges.update({
                id: edgeId,
                label: connection.label || '',
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.15
                }
            });
            console.log('✅ Edge label updated:', connection.label);
        }
    } else {
        // Has control points - create chain of smooth curved edges
        console.log('🔗 Building edge chain with control points');
        
        // Remove original edge if it exists
        if (getNetwork().body.data.edges.get(edgeId)) {
            getNetwork().body.data.edges.remove(edgeId);
            console.log('🗑️ Removed original edge', edgeId);
        }
        
        // Build chain: from -> cp1 -> cp2 -> ... -> to
        const chain = [connection.from, ...controlPoints, connection.to];
        console.log('📍 Chain:', chain);
        
        // Find the longest segment to place the label
        let longestSegmentIndex = 0;
        let maxDistance = 0;
        
        for (let i = 0; i < chain.length - 1; i++) {
            const fromPos = getNetwork().getPositions([chain[i]])[chain[i]];
            const toPos = getNetwork().getPositions([chain[i + 1]])[chain[i + 1]];
            const distance = Math.sqrt(
                Math.pow(toPos.x - fromPos.x, 2) + 
                Math.pow(toPos.y - fromPos.y, 2)
            );
            
            if (distance > maxDistance) {
                maxDistance = distance;
                longestSegmentIndex = i;
            }
        }
        
        console.log('📏 Longest segment is', longestSegmentIndex, 'with distance', maxDistance);
        
        // Create segments
        for (let i = 0; i < chain.length - 1; i++) {
            const segmentId = `${edgeId}_seg_${i}`;
            const isLast = (i === chain.length - 2);
            const isLongest = (i === longestSegmentIndex);
            
            const newEdge = {
                id: segmentId,
                from: chain[i],
                to: chain[i + 1],
                label: isLongest ? (connection.label || '') : '', // Label on longest segment
                arrows: isLast ? { to: { enabled: true } } : { to: { enabled: false } }, // Arrow only on last segment
                smooth: {
                    enabled: true,
                    type: 'continuous', // Continuous for smoother transitions at control points
                    roundness: 0.15 // Lower roundness to avoid sharp angles at control points
                },
                color: {
                    color: '#848484',
                    highlight: '#4a90e2'
                }
            };
            
            console.log(`➕ Adding/updating segment ${i}:`, segmentId, 'from', chain[i], 'to', chain[i + 1], 'label:', newEdge.label);
            
            // Use update if exists, add if not
            try {
                const existing = getNetwork().body.data.edges.get(segmentId);
                if (existing) {
                    getNetwork().body.data.edges.update(newEdge);
                } else {
                    getNetwork().body.data.edges.add(newEdge);
                }
            } catch (e) {
                console.error('Error adding/updating segment:', e);
            }
        }
        
        console.log('✅ Created', chain.length - 1, 'segment edges');
    }
    
    console.log('🎨 Redrawing network...');
    
    // Force network to update smooth settings
    getNetwork().setOptions({
        edges: {
            smooth: {
                enabled: true,
                type: 'continuous',
                roundness: 0.15
            }
        }
    });
    
    getNetwork().redraw();
    console.log('✅ rebuildEdgeWithControlPoints complete');
}

// Update all edges with control points after node movement
function updateAllEdgesWithControlPoints() {
    Object.keys(getStore().edgeControlPoints).forEach(edgeId => {
        rebuildEdgeWithControlPoints(parseInt(edgeId));
    });
}

// Restore control point nodes after loading from storage
function restoreControlPointNodes() {
    console.log('🔄 Restoring control point nodes from storage...');
    
    const savedPositions = savedNodePositions || {};
    const controlPointsToRestore = [];
    
    Object.entries(getStore().edgeControlPoints).forEach(([edgeId, controlPointIds]) => {
        const connection = getStore().appData.connections.find(c => c.id === parseInt(edgeId));
        if (!connection) {
            console.warn('⚠️ Connection not found for edge:', edgeId);
            return;
        }
        
        controlPointIds.forEach((cpId, index) => {
            // Check if node already exists
            if (getNetwork().body.data.nodes.get(cpId)) {
                console.log('✓ Control point node', cpId, 'already exists');
                return;
            }
            
            // Try to get saved position first
            let position;
            if (savedPositions[cpId]) {
                position = savedPositions[cpId];
                console.log('✓ Using saved position for control point', cpId, ':', position);
            } else {
                // Calculate default position if not saved
                console.warn('⚠️ No saved position for control point', cpId, ', calculating default');
                
                const fromPos = savedPositions[connection.from] || getNetwork().getPositions([connection.from])[connection.from];
                const toPos = savedPositions[connection.to] || getNetwork().getPositions([connection.to])[connection.to];
                
                if (!fromPos || !toPos) {
                    console.error('❌ Cannot calculate position for control point', cpId);
                    return;
                }
                
                // Distribute evenly along the edge
                const ratio = (index + 1) / (controlPointIds.length + 1);
                position = {
                    x: fromPos.x + (toPos.x - fromPos.x) * ratio,
                    y: fromPos.y + (toPos.y - fromPos.y) * ratio
                };
            }
            
            controlPointsToRestore.push({
                id: cpId,
                x: position.x,
                y: position.y,
                shape: 'dot',
                size: 2, // Small visible center
                color: {
                    background: '#848484',
                    border: 'rgba(132, 132, 132, 0.01)', // Nearly transparent border for interaction
                    highlight: {
                        background: '#4a90e2',
                        border: '#3578ba'
                    }
                },
                borderWidth: 3, // Wide transparent border = larger click area
                physics: false,
                fixed: false,
                label: '',
                group: 'controlPoint',
                chosen: {
                    node: function(values, id, selected, hovering) {
                        if (hovering) {
                            // On hover: larger visible size with visible border
                            values.size = 5;
                            values.borderWidth = 2;
                            values.borderColor = '#666666';
                        } else {
                            // Not hovering: small visible center with transparent border
                            values.size = 2;
                            values.borderWidth = 3;
                            values.borderColor = 'rgba(132, 132, 132, 0.01)';
                        }
                    }
                }
            });
        });
    });
    
    if (controlPointsToRestore.length > 0) {
        getNetwork().body.data.nodes.add(controlPointsToRestore);
        console.log('✅ Restored', controlPointsToRestore.length, 'control point nodes');
    } else {
        console.log('⚪ No control points to restore');
    }
}

// Check if a node is a control point
export function isControlPoint(nodeId) {
    return nodeId < 0;
}

// Show menu for control point
export function showControlPointMenu(x, y, controlPointId) {
    const existingMenu = document.getElementById('controlPointMenu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.id = 'controlPointMenu';
    menu.style.position = 'fixed';
    menu.style.left = (x - 22) + 'px';
    menu.style.top = (y - 22) + 'px';
    menu.style.zIndex = '10000';
    menu.className = 'edge-menu active';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'edge-btn edge-delete';
    deleteBtn.style.left = '-22px';
    deleteBtn.style.top = '-22px';
    deleteBtn.title = 'Delete control point';
    deleteBtn.innerHTML = icon('delete');
    deleteBtn.onclick = () => {
        removeControlPointFromEdge(controlPointId);
        menu.remove();
        // Re-enable interactions
        if (getNetwork()) {
            getNetwork().setOptions({ 
                interaction: getGraphInteractionOptions({
                    dragNodes: true
                })
            });
        }
    };
    
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);
    
    // Auto-hide when clicking elsewhere
    setTimeout(() => {
        const clickOutside = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', clickOutside);
                // Re-enable interactions
                if (getNetwork()) {
                    getNetwork().setOptions({ 
                        interaction: getGraphInteractionOptions({
                            dragNodes: true
                        })
                    });
                }
            }
        };
        document.addEventListener('click', clickOutside);
    }, 100);
}

// Expose functions globally for access from other modules
window.rebuildEdgeWithControlPoints = rebuildEdgeWithControlPoints;
