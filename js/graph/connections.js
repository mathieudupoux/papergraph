import { getStore, getNetwork } from '../store/appStore.js';
import { getDefaultEdgeFont, getThemeCssVar, showNotification } from '../utils/helpers.js';
import { updateGraph } from './render.js';
import { save } from '../data/persistence.js';
import { getEdgeLabelGeometry, getEdgeLabelTextStyle, normalizeEdgeId } from './edge-labels.js';
import { icon } from '../ui/icons.js';

// ===== CONNECTIONS =====
// Connection/edge management and creation

function cloneConnections(connections = getStore().appData.connections) {
    return connections.map((connection) => ({
        ...connection,
        ...(connection.labelLayout ? { labelLayout: { ...connection.labelLayout } } : {}),
    }));
}

function updateConnectionGeometryPreview(element, geometry) {
    const graphContainer = document.getElementById('graphContainer');
    if (!graphContainer || !geometry) return;

    const scale = Math.max(getNetwork()?.getScale?.() || 1, 0.15);
    const rect = graphContainer.getBoundingClientRect();
    const topLeft = getNetwork().canvasToDOM({
        x: geometry.centerX - (geometry.width / 2),
        y: geometry.centerY - (geometry.height / 2)
    });
    const bottomRight = getNetwork().canvasToDOM({
        x: geometry.centerX + (geometry.width / 2),
        y: geometry.centerY + (geometry.height / 2)
    });

    element.style.left = `${rect.left + topLeft.x}px`;
    element.style.top = `${rect.top + topLeft.y}px`;
    element.style.width = `${Math.max(40, bottomRight.x - topLeft.x)}px`;
    element.style.height = `${Math.max(24, bottomRight.y - topLeft.y)}px`;
    element.style.minHeight = `${Math.max(24, bottomRight.y - topLeft.y)}px`;
    element.style.padding = `${geometry.paddingY * scale}px ${geometry.paddingX * scale}px`;
}

function applyInlineEdgeEditorScale(element, textStyle) {
    const scale = Math.max(getNetwork()?.getScale?.() || 1, 0.15);
    element.style.fontSize = `${textStyle.fontSize * scale}px`;
    element.style.lineHeight = `${textStyle.fontSize * textStyle.lineHeight * scale}px`;
}

function buildInlineEditingConnection(connection, pointerDOM) {
    if (!connection) return null;

    const hasExistingLabel = Boolean((connection.label || '').trim());
    if (hasExistingLabel || connection.labelLayout || !pointerDOM || !getNetwork()) {
        return {
            ...connection,
            ...(connection.labelLayout ? { labelLayout: { ...connection.labelLayout } } : {}),
        };
    }

    const baseGeometry = getEdgeLabelGeometry(connection, { allowEmptyLabel: true });
    if (!baseGeometry) {
        return { ...connection };
    }

    const pointerCanvas = getNetwork().DOMtoCanvas(pointerDOM);

    return {
        ...connection,
        labelLayout: {
            offsetX: pointerCanvas.x - baseGeometry.anchorX,
            offsetY: pointerCanvas.y - baseGeometry.anchorY,
            width: baseGeometry.width,
            height: baseGeometry.height,
        },
    };
}

function getInlineEdgeEditorText(editor) {
    return String(editor.innerText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u00A0/g, ' ');
}

function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

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
        const nextLabel = newLabel.trim();
        const nextConnections = cloneConnections().map((item) => (
            item.id === edgeId ? { ...item, label: nextLabel } : item
        ));
        getStore().commitTrackedGraphState({ connections: nextConnections });
        updateGraph();
        save();
        showNotification('Label mis à jour!', 'success');
    }
}

export function editEdgeLabelInline(edgeId, edge, pointerDOM) {
    // Don't allow editing in gallery viewer mode
    if (getStore().isReadOnlyMode || getStore().isGalleryViewer) {
        return;
    }
    
    const connection = getStore().appData.connections.find(c => c.id === edgeId);
    if (!connection) {
        console.log('Connection not found:', edgeId);
        return;
    }

    getStore().setSelectedEdgeId(null);
    getStore().setSelectedEdgeLabelId(edgeId);

    let editingConnection = buildInlineEditingConnection(connection, pointerDOM);
    const geometry = getEdgeLabelGeometry(editingConnection, { allowEmptyLabel: true });
    if (!geometry) return;
    const textStyle = getEdgeLabelTextStyle();

    const initialLabel = connection.label || '';
    const isCreatingNewLabel = !initialLabel.trim();

    // Create inline editor with the same visual language as the rendered label
    const editorShell = document.createElement('div');
    editorShell.style.position = 'fixed';
    editorShell.style.boxSizing = 'border-box';
    editorShell.style.border = isCreatingNewLabel ? '1px dashed rgba(74, 144, 226, 0.8)' : 'none';
    editorShell.style.borderRadius = '0';
    editorShell.style.zIndex = '10000';
    editorShell.style.background = isCreatingNewLabel
        ? (document.body.classList.contains('dark-theme')
            ? 'rgba(74, 144, 226, 0.14)'
            : 'rgba(49, 95, 212, 0.08)')
        : 'transparent';
    editorShell.style.boxShadow = 'none';
    editorShell.style.display = 'flex';
    editorShell.style.alignItems = 'center';
    editorShell.style.justifyContent = 'center';
    editorShell.style.transform = 'translateZ(0)';
    editorShell.style.pointerEvents = 'auto';
    updateConnectionGeometryPreview(editorShell, geometry);

    const input = document.createElement('div');
    input.contentEditable = 'true';
    input.spellcheck = false;
    input.textContent = initialLabel;
    input.style.width = '100%';
    input.style.maxWidth = '100%';
    input.style.boxSizing = 'border-box';
    input.style.border = 'none';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.fontFamily = textStyle.fontFamily;
    input.style.background = 'transparent';
    input.style.textAlign = 'center';
    input.style.outline = 'none';
    input.style.color = getDefaultEdgeFont().color;
    input.style.caretColor = getDefaultEdgeFont().color;
    input.style.whiteSpace = 'pre-wrap';
    input.style.wordBreak = 'break-word';
    input.style.overflowWrap = 'break-word';
    input.style.cursor = 'text';
    applyInlineEdgeEditorScale(input, textStyle);

    editorShell.appendChild(input);
    document.body.appendChild(editorShell);
    input.focus();
    placeCaretAtEnd(input);
    
    getStore().setIsEditingEdgeLabel(true);
    getStore().setCurrentEditingEdgeLabelId(edgeId);
    if (getNetwork()) {
        getNetwork().redraw();
    }
    
    const persist = save;
    let editFinalized = false;
    const removeClickHandler = () => {
        document.removeEventListener('click', clickHandler);
    };
    const syncEditorPreview = () => {
        const nextLabel = getInlineEdgeEditorText(input);
        editingConnection = {
            ...editingConnection,
            label: nextLabel,
        };
        const previewGeometry = getEdgeLabelGeometry(editingConnection, { allowEmptyLabel: true });
        if (previewGeometry) {
            updateConnectionGeometryPreview(editorShell, previewGeometry);
        }
        applyInlineEdgeEditorScale(input, textStyle);
    };
    const network = getNetwork();
    const syncEditorToViewport = () => {
        if (editFinalized) return;
        syncEditorPreview();
    };
    syncEditorPreview();
    network?.on?.('zoom', syncEditorToViewport);
    network?.on?.('dragging', syncEditorToViewport);

    const finishEdit = () => {
        if (editFinalized) return;
        editFinalized = true;

        const newLabel = getInlineEdgeEditorText(input).trim();
        getStore().setIsEditingEdgeLabel(false);
        getStore().setCurrentEditingEdgeLabelId(null);
        removeClickHandler();
        network?.off?.('zoom', syncEditorToViewport);
        network?.off?.('dragging', syncEditorToViewport);

        if (newLabel !== initialLabel) {
            const nextConnections = cloneConnections().map((item) => (
                item.id === edgeId
                    ? {
                        ...item,
                        label: newLabel,
                        ...(editingConnection.labelLayout
                            ? { labelLayout: { ...editingConnection.labelLayout } }
                            : {}),
                    }
                    : item
            ));
            getStore().commitTrackedGraphState({ connections: nextConnections });
            if (getNetwork()) getNetwork().redraw();
            persist();
            if (newLabel) {
                showNotification('Label mis à jour!', 'success');
            }
        }

        if (editorShell.isConnected) editorShell.remove();
        if (getNetwork()) {
            getNetwork().redraw();
        }
    };
    
    input.addEventListener('blur', finishEdit);
    input.addEventListener('input', syncEditorPreview);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            editFinalized = true;
            getStore().setIsEditingEdgeLabel(false);
            getStore().setCurrentEditingEdgeLabelId(null);
            removeClickHandler();
            network?.off?.('zoom', syncEditorToViewport);
            network?.off?.('dragging', syncEditorToViewport);
            if (editorShell.isConnected) editorShell.remove();
            if (getNetwork()) {
                getNetwork().redraw();
            }
        }
    });
    
    // Close when clicking outside
    const clickHandler = (e) => {
        if (editorShell.parentElement && !editorShell.contains(e.target)) {
            finishEdit();
        }
    };
    setTimeout(() => {
        document.addEventListener('click', clickHandler);
    }, 100);
}

export function deleteEdgeLabel(edgeId) {
    const connection = getStore().appData.connections.find((item) => item.id === edgeId);
    if (!connection || !connection.label) {
        return;
    }

    const nextConnections = cloneConnections().map((item) => (
        item.id === edgeId
            ? { ...item, label: '', labelLayout: null }
            : item
    ));
    getStore().commitTrackedGraphState({ connections: nextConnections });
    getStore().setSelectedEdgeLabelId(null);
    getStore().setSelectedEdgeId(null);
    if (getNetwork()) {
        getNetwork().redraw();
    }
    save();
    showNotification('Label supprimé', 'info');
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
    if (getStore().isReadOnlyMode || getStore().isGalleryViewer) {
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
    const actualEdgeId = normalizeEdgeId(edgeId);

    // Store edgeId for the menu actions
    menu.dataset.edgeId = edgeId;
    menu.dataset.actualEdgeId = actualEdgeId;
    getStore().setSelectedEdgeId(actualEdgeId);
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
                console.log('Editing label for edge:', actualEdgeId);
                const clickPointerDom = getEdgeMenuAnchorPointerDOM();
                hideEdgeMenu();
                
                if (clickPointerDom) {
                    console.log('Opening edit at anchor position:', clickPointerDom);
                    editEdgeLabelInline(actualEdgeId, null, clickPointerDom);
                }
            } else if (action === 'delete') {
                console.log('Deleting edge:', actualEdgeId);
                hideEdgeMenu();
                deleteConnection(actualEdgeId);
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
            interaction: { 
                dragNodes: true,
                dragView: false,
                zoomView: false,
                hover: true,
                tooltipDelay: 200
            } 
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
        canvas.addEventListener('mousemove', getStore().connectionMode.mouseMoveHandler);
        
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
        canvas.removeEventListener('mousemove', getStore().connectionMode.mouseMoveHandler);
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

const CONTROL_POINT_BASE_SIZE = 7;
const CONTROL_POINT_HOVER_SIZE = 10;
const CONTROL_POINT_BORDER_WIDTH = 3;
const CONTROL_POINT_HOVER_BORDER_WIDTH = 4;

function getControlPointPalette() {
    return {
        fill: getThemeCssVar('--color-bg', '#ffffff'),
        border: getThemeCssVar('--color-primary', '#315fd4'),
        hoverFill: getThemeCssVar('--color-bg-primary-hover', '#f5f8ff'),
        hoverBorder: getThemeCssVar('--color-primary-hover', '#284fb5'),
        shadow: getThemeCssVar('--color-primary-shadow', 'rgba(49, 95, 212, 0.28)'),
    };
}

function getEdgeSegmentPalette() {
    return {
        color: getThemeCssVar('--color-text-secondary', '#666666'),
        highlight: getThemeCssVar('--color-primary', '#315fd4'),
    };
}

function projectPointOntoSegment(point, from, to) {
    if (!point || !from || !to) return point;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = (dx * dx) + (dy * dy);

    if (lengthSquared === 0) {
        return { x: from.x, y: from.y };
    }

    const t = Math.max(0, Math.min(1, (((point.x - from.x) * dx) + ((point.y - from.y) * dy)) / lengthSquared));
    return {
        x: from.x + (dx * t),
        y: from.y + (dy * t),
    };
}

function cloneEdgeControlPoints(edgeControlPoints = getStore().edgeControlPoints) {
    return Object.fromEntries(
        Object.entries(edgeControlPoints || {}).map(([edgeId, pointIds]) => [edgeId, [...pointIds]])
    );
}

function commitControlPointGraphState({
    edgeControlPoints,
    nextControlPointId = getStore().nextControlPointId,
    savedNodePositions = getStore().savedNodePositions,
}) {
    getStore().commitTrackedGraphState({
        edgeControlPoints,
        nextControlPointId,
        savedNodePositions,
    });
    updateGraph();
    save(true);
    import('../data/cloud-storage.js')
        .then(({ isCloudStorageEnabled, forceSaveToCloud }) => {
            if (isCloudStorageEnabled()) {
                forceSaveToCloud();
            }
        })
        .catch(() => {});
}

function getStoredControlPointPosition(controlPointId) {
    return getStore().savedNodePositions?.[controlPointId] || null;
}

function buildControlPointNode(controlPointId, position) {
    const palette = getControlPointPalette();

    return {
        id: controlPointId,
        x: position.x,
        y: position.y,
        shape: 'dot',
        size: CONTROL_POINT_BASE_SIZE,
        color: {
            background: palette.fill,
            border: palette.border,
            highlight: {
                background: palette.hoverFill,
                border: palette.hoverBorder
            },
            hover: {
                background: palette.hoverFill,
                border: palette.hoverBorder
            }
        },
        borderWidth: CONTROL_POINT_BORDER_WIDTH,
        shadow: {
            enabled: true,
            color: palette.shadow,
            size: 16,
            x: 0,
            y: 0,
        },
        physics: false,
        fixed: false,
        label: '',
        group: 'controlPoint',
        chosen: {
            node(values, id, selected, hovering) {
                if (hovering || selected) {
                    values.size = CONTROL_POINT_HOVER_SIZE;
                    values.borderWidth = CONTROL_POINT_HOVER_BORDER_WIDTH;
                    values.borderColor = palette.hoverBorder;
                    values.color = palette.hoverFill;
                } else {
                    values.size = CONTROL_POINT_BASE_SIZE;
                    values.borderWidth = CONTROL_POINT_BORDER_WIDTH;
                    values.borderColor = palette.border;
                    values.color = palette.fill;
                }
            }
        }
    };
}

function getDefaultControlPointPosition(connection, index, totalControlPoints) {
    const fromPos = getStoredControlPointPosition(connection.from)
        || getNetwork().getPositions([connection.from])[connection.from];
    const toPos = getStoredControlPointPosition(connection.to)
        || getNetwork().getPositions([connection.to])[connection.to];

    if (!fromPos || !toPos) return null;

    const ratio = (index + 1) / (totalControlPoints + 1);
    return {
        x: fromPos.x + ((toPos.x - fromPos.x) * ratio),
        y: fromPos.y + ((toPos.y - fromPos.y) * ratio)
    };
}

export function syncControlPointNodes() {
    if (!getNetwork()) return;

    const referencedControlPointIds = new Set(
        Object.values(getStore().edgeControlPoints || {}).flat()
    );
    const existingControlPointNodes = getNetwork().body.data.nodes.get().filter((node) => node.id < 0);
    const staleControlPointIds = existingControlPointNodes
        .map((node) => node.id)
        .filter((nodeId) => !referencedControlPointIds.has(nodeId));

    if (staleControlPointIds.length > 0) {
        getNetwork().body.data.nodes.remove(staleControlPointIds);
    }

    Object.entries(getStore().edgeControlPoints || {}).forEach(([edgeId, controlPointIds]) => {
        const connection = getStore().appData.connections.find((item) => item.id === parseInt(edgeId, 10));
        if (!connection) return;

        controlPointIds.forEach((controlPointId, index) => {
            const existingNode = getNetwork().body.data.nodes.get(controlPointId);
            const savedPosition = getStoredControlPointPosition(controlPointId);
            const existingPosition = existingNode
                ? { x: existingNode.x, y: existingNode.y }
                : null;
            const position = savedPosition
                || existingPosition
                || getDefaultControlPointPosition(connection, index, controlPointIds.length);

            if (!position) return;

            const nodeData = buildControlPointNode(controlPointId, position);
            if (existingNode) {
                getNetwork().body.data.nodes.update(nodeData);
            } else {
                getNetwork().body.data.nodes.add(nodeData);
            }
        });
    });
}

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
    const controlPointId = getStore().nextControlPointId;
    const nextControlPointId = controlPointId - 1;
    
    const controlPoint = clickPosition ? projectPointOntoSegment(clickPosition, fromPos, toPos) : {
        x: (fromPos.x + toPos.x) / 2,
        y: (fromPos.y + toPos.y) / 2
    };
    
    console.log('🎯 Creating control point node:', controlPointId, 'at:', controlPoint, clickPosition ? '(click position)' : '(center)');
    console.log('🎯 For edge', actualEdgeId, 'connecting', connection.from, '->', connection.to);
    
    const nextEdgeControlPoints = cloneEdgeControlPoints();
    const edgeControlPointIds = nextEdgeControlPoints[actualEdgeId] || [];

    for (const [existingEdgeId, existingPoints] of Object.entries(nextEdgeControlPoints)) {
        if (existingPoints.includes(controlPointId)) {
            console.error('❌ Control point', controlPointId, 'already exists in edge', existingEdgeId);
            return;
        }
    }

    if (segmentIndex >= 0 && edgeControlPointIds.length > 0) {
        edgeControlPointIds.splice(segmentIndex, 0, controlPointId);
    } else {
        edgeControlPointIds.push(controlPointId);
    }

    nextEdgeControlPoints[actualEdgeId] = edgeControlPointIds;

    const nextSavedNodePositions = {
        ...getStore().savedNodePositions,
        [controlPointId]: controlPoint,
    };

    // Seed the live network immediately so the first save/redraw sees the node.
    try {
        const existingControlPointNode = getNetwork().body.data.nodes.get(controlPointId);
        const nodeData = buildControlPointNode(controlPointId, controlPoint);
        if (existingControlPointNode) {
            getNetwork().body.data.nodes.update(nodeData);
        } else {
            getNetwork().body.data.nodes.add(nodeData);
        }
    } catch (error) {
        console.warn('Unable to seed control point node before rebuild:', error);
    }

    commitControlPointGraphState({
        edgeControlPoints: nextEdgeControlPoints,
        nextControlPointId,
        savedNodePositions: nextSavedNodePositions,
    });

    console.log('✅ Edge', actualEdgeId, 'now has points:', nextEdgeControlPoints[actualEdgeId]);
    console.log('📊 All edgeControlPoints:', nextEdgeControlPoints);
    
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
    
    const nextEdgeControlPoints = cloneEdgeControlPoints();
    const nextSavedNodePositions = { ...getStore().savedNodePositions };
    delete nextSavedNodePositions[controlPointId];

    const updatedControlPoints = (nextEdgeControlPoints[edgeId] || []).filter((id) => id !== controlPointId);
    if (updatedControlPoints.length > 0) {
        nextEdgeControlPoints[edgeId] = updatedControlPoints;
    } else {
        delete nextEdgeControlPoints[edgeId];
    }

    commitControlPointGraphState({
        edgeControlPoints: nextEdgeControlPoints,
        nextControlPointId: getStore().nextControlPointId,
        savedNodePositions: nextSavedNodePositions,
    });
    showNotification('Point de contrôle supprimé', 'success');
}

// Rebuild edge path through control points
export function rebuildEdgeWithControlPoints(edgeId) {
    console.log('🔄 rebuildEdgeWithControlPoints called for edge:', edgeId);
    const segmentPalette = getEdgeSegmentPalette();
    
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
                font: getDefaultEdgeFont(),
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.3
                }
            });
            console.log('✅ Original edge restored with label:', connection.label);
        } else {
            // Edge exists, just update its label and smooth
            getNetwork().body.data.edges.update({
                id: edgeId,
                font: getDefaultEdgeFont(),
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.3
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

        // Create segments
        for (let i = 0; i < chain.length - 1; i++) {
            const segmentId = `${edgeId}_seg_${i}`;
            const isLast = (i === chain.length - 2);
            
            const newEdge = {
                id: segmentId,
                from: chain[i],
                to: chain[i + 1],
                font: getDefaultEdgeFont(),
                width: 2,
                arrows: isLast ? { to: { enabled: true } } : { to: { enabled: false } }, // Arrow only on last segment
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.3
                },
                color: {
                    color: segmentPalette.color,
                    highlight: segmentPalette.highlight
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
                roundness: 0.3
            }
        }
    });
    
    getNetwork().redraw();
    console.log('✅ rebuildEdgeWithControlPoints complete');
}

export function getActualEdgeId(edgeId) {
    return normalizeEdgeId(edgeId);
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
    
    const savedPositions = getStore().savedNodePositions || {};
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
            
            controlPointsToRestore.push(buildControlPointNode(cpId, position));
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
                interaction: { 
                    dragNodes: true,
                    dragView: false,
                    zoomView: false
                } 
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
                        interaction: { 
                            dragNodes: true,
                            dragView: false,
                            zoomView: false
                        } 
                    });
                }
            }
        };
        document.addEventListener('click', clickOutside);
    }, 100);
}

// Expose functions globally for access from other modules
window.rebuildEdgeWithControlPoints = rebuildEdgeWithControlPoints;
