import { state } from '../core/state.js';
import { showNotification } from '../utils/helpers.js';
import { checkNodeZoneMembership } from './zones.js';
import { save } from '../data/persistence.js';
import { showSelectionRadialMenu, showEmptyAreaMenu } from '../ui/radial-menu.js';

// ===== MULTI-SELECTION BOX =====

export function hideSelectionBox() {
    if (state.multiSelection.selectionBox) {
        state.multiSelection.selectionBox.style.display = 'none';
    }
    // NOTE: Don't reset selectedNodes here - it's managed elsewhere
    state.multiSelection.active = false;
}

export function startSelectionBox(event) {
    if (state.connectionMode.active) return;
    
    state.multiSelection.active = true;
    
    state.network.setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false,
            hover: false
        }
    });
    
    const canvas = state.network.canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    
    state.multiSelection.startX = event.clientX - rect.left;
    state.multiSelection.startY = event.clientY - rect.top;
    
    if (!state.multiSelection.selectionBox) {
        state.multiSelection.selectionBox = document.createElement('div');
        state.multiSelection.selectionBox.id = 'selectionBox';
        state.multiSelection.selectionBox.style.position = 'absolute';
        state.multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
        state.multiSelection.selectionBox.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
        state.multiSelection.selectionBox.style.pointerEvents = 'none';
        state.multiSelection.selectionBox.style.zIndex = '1000';
        canvas.parentElement.appendChild(state.multiSelection.selectionBox);
    }
    
    state.multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
    state.multiSelection.selectionBox.style.left = state.multiSelection.startX + 'px';
    state.multiSelection.selectionBox.style.top = state.multiSelection.startY + 'px';
    state.multiSelection.selectionBox.style.width = '0px';
    state.multiSelection.selectionBox.style.height = '0px';
    state.multiSelection.selectionBox.style.display = 'block';
}

export function startSelectionBoxDrag(event, mouseX, mouseY, boxLeft, boxTop) {
    state.multiSelection.boxDragging = true;
    state.multiSelection.boxDragStart = { x: mouseX, y: mouseY };
    state.multiSelection.originalBoxPosition = { left: boxLeft, top: boxTop };
    
    // Store initial positions of nodes and zones for dragging
    const canvas = state.network.canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const boxWidth = parseFloat(state.multiSelection.selectionBox.style.width);
    const boxHeight = parseFloat(state.multiSelection.selectionBox.style.height);
    
    const topLeft = state.network.DOMtoCanvas({ x: boxLeft, y: boxTop });
    const bottomRight = state.network.DOMtoCanvas({ x: boxLeft + boxWidth, y: boxTop + boxHeight });
    
    // Store initial node positions
    state.multiSelection.nodeDragStart = {};
    state.multiSelection.selectedNodes.forEach(nodeId => {
        const pos = state.network.getPositions([nodeId])[nodeId];
        if (pos) {
            state.multiSelection.nodeDragStart[nodeId] = { x: pos.x, y: pos.y };
        }
    });
    
    // Store initial zone positions for zones fully inside the selection
    state.multiSelection.zonesDragStart = {};
    console.log(`📦 Storing start positions for ${state.multiSelection.selectedZonesForDrag.length} zones...`);
    state.multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
        const zone = state.tagZones[zoneIdx];
        state.multiSelection.zonesDragStart[zoneIdx] = { x: zone.x, y: zone.y };
        console.log(`  Zone ${zoneIdx} (${zone.tag}): start at x=${zone.x.toFixed(1)}, y=${zone.y.toFixed(1)}`);
    });
    
    state.network.setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false,
            hover: false
        }
    });
}

export function updateSelectionBoxDrag(event) {
    if (!state.multiSelection.boxDragging) return;
    
    const canvas = state.network.canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const dx = mouseX - state.multiSelection.boxDragStart.x;
    const dy = mouseY - state.multiSelection.boxDragStart.y;
    
    // Move the selection box
    const newLeft = state.multiSelection.originalBoxPosition.left + dx;
    const newTop = state.multiSelection.originalBoxPosition.top + dy;
    
    state.multiSelection.selectionBox.style.left = newLeft + 'px';
    state.multiSelection.selectionBox.style.top = newTop + 'px';
    
    // Calculate canvas coordinate delta
    const canvasDxStart = state.network.DOMtoCanvas({ x: state.multiSelection.boxDragStart.x, y: state.multiSelection.boxDragStart.y });
    const canvasDxCurrent = state.network.DOMtoCanvas({ x: mouseX, y: mouseY });
    const canvasDx = canvasDxCurrent.x - canvasDxStart.x;
    const canvasDy = canvasDxCurrent.y - canvasDxStart.y;
    
    // Move all selected nodes
    Object.keys(state.multiSelection.nodeDragStart).forEach(nodeId => {
        const startPos = state.multiSelection.nodeDragStart[nodeId];
        state.network.moveNode(nodeId, startPos.x + canvasDx, startPos.y + canvasDy);
    });
    
    // Move all selected zones
    if (state.multiSelection.selectedZonesForDrag && state.multiSelection.selectedZonesForDrag.length > 0) {
        console.log(`📦 Moving ${state.multiSelection.selectedZonesForDrag.length} zones with selection box...`);
        state.multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
            const zone = state.tagZones[zoneIdx];
            const startPos = state.multiSelection.zonesDragStart[zoneIdx];
            if (startPos) {
                zone.x = startPos.x + canvasDx;
                zone.y = startPos.y + canvasDy;
                console.log(`  Moved zone ${zoneIdx} (${zone.tag}) by dx=${canvasDx.toFixed(1)}, dy=${canvasDy.toFixed(1)}`);
            } else {
                console.warn(`  ⚠️ No start position for zone ${zoneIdx}`);
            }
        });
    } else {
        console.log('No zones to move (selectedZonesForDrag empty)');
    }
    
    state.network.redraw();
}

export function endSelectionBoxDrag() {
    if (!state.multiSelection.boxDragging) return;
    
    state.multiSelection.boxDragging = false;
    
    // Update zone membership for moved nodes
    checkNodeZoneMembership();
    
    // Save positions
    const positions = state.network.getPositions();
    state.savedNodePositions = positions;
    save(true);
    
    state.network.setOptions({
        interaction: {
            dragNodes: true,
            dragView: false,
            zoomView: true,
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            multiselect: true,
            selectable: true
        }
    });
}

export function updateSelectionBox(event) {
    if (!state.multiSelection.active || !state.multiSelection.selectionBox) return;
    
    const canvas = state.network.canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    const left = Math.min(state.multiSelection.startX, currentX);
    const top = Math.min(state.multiSelection.startY, currentY);
    const width = Math.abs(currentX - state.multiSelection.startX);
    const height = Math.abs(currentY - state.multiSelection.startY);
    
    state.multiSelection.selectionBox.style.left = left + 'px';
    state.multiSelection.selectionBox.style.top = top + 'px';
    state.multiSelection.selectionBox.style.width = width + 'px';
    state.multiSelection.selectionBox.style.height = height + 'px';
}

export function endSelectionBox() {
    if (!state.multiSelection.active) return;
    
    const canvas = state.network.canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    
    const boxLeft = parseFloat(state.multiSelection.selectionBox.style.left);
    const boxTop = parseFloat(state.multiSelection.selectionBox.style.top);
    const boxWidth = parseFloat(state.multiSelection.selectionBox.style.width);
    const boxHeight = parseFloat(state.multiSelection.selectionBox.style.height);
    
    // If box is too small (just a click), hide it and cancel
    if (boxWidth < 10 && boxHeight < 10) {
        state.multiSelection.selectionBox.style.display = 'none';
        state.multiSelection.active = false;
        
        state.network.setOptions({
            interaction: {
                dragNodes: true,
                dragView: false,
                zoomView: true,
                hover: true,
                hoverConnectedEdges: true,
                selectConnectedEdges: true,
                multiselect: true,
                selectable: true
            }
        });
        return;
    }
    
    const topLeft = state.network.DOMtoCanvas({ 
        x: boxLeft, 
        y: boxTop 
    });
    const bottomRight = state.network.DOMtoCanvas({ 
        x: boxLeft + boxWidth, 
        y: boxTop + boxHeight 
    });
    
    state.multiSelection.selectedNodes = [];
    
    // Check if any tag zones are completely within the selection
    const fullySelectedZones = [];
    console.log('🔍 Checking for zones in selection box...');
    state.tagZones.forEach((zone, idx) => {
        const zoneFullyInSelection = zone.x >= topLeft.x && 
                                     zone.y >= topLeft.y &&
                                     zone.x + zone.width <= bottomRight.x &&
                                     zone.y + zone.height <= bottomRight.y;
        
        if (zoneFullyInSelection) {
            console.log(`✅ Zone "${zone.tag}" is fully selected`);
            fullySelectedZones.push({ zone, idx });
            
            // Add all nodes with this zone's tag to selection
            state.appData.articles.forEach(article => {
                if (article.categories.includes(zone.tag) && !state.multiSelection.selectedNodes.includes(article.id)) {
                    state.multiSelection.selectedNodes.push(article.id);
                    console.log(`  Added node ${article.id} (has tag "${zone.tag}")`);
                }
            });
        }
    });
    
    console.log(`📦 Found ${fullySelectedZones.length} fully selected zones`);
    
    // Add nodes that are directly in the selection box
    state.appData.articles.forEach(article => {
        const pos = state.network.getPositions([article.id])[article.id];
        if (pos) {
            if (pos.x >= topLeft.x && pos.x <= bottomRight.x &&
                pos.y >= topLeft.y && pos.y <= bottomRight.y) {
                if (!state.multiSelection.selectedNodes.includes(article.id)) {
                    state.multiSelection.selectedNodes.push(article.id);
                }
            }
        }
    });
    
    if (state.multiSelection.selectionBox) {
        state.multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
    }
    state.multiSelection.active = false;
    
    // Store fully selected zones for dragging, sorted by size (smallest first)
    fullySelectedZones.sort((a, b) => {
        const areaA = a.zone.width * a.zone.height;
        const areaB = b.zone.width * b.zone.height;
        return areaA - areaB;
    });
    state.multiSelection.selectedZonesForDrag = fullySelectedZones.map(fz => fz.idx);
    console.log(`📦 Zones to drag:`, state.multiSelection.selectedZonesForDrag);
    console.log(`📦 Selected ${state.multiSelection.selectedNodes.length} nodes total`);
    
    state.network.setOptions({
        interaction: {
            dragNodes: true,
            dragView: false,
            zoomView: true,
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            multiselect: true,
            selectable: true
        }
    });
    
    if (state.multiSelection.selectedNodes.length > 0) {
        state.network.selectNodes(state.multiSelection.selectedNodes);
        
        const menuX = rect.left + boxLeft + boxWidth / 2;
        const menuY = rect.top + boxTop - 30;
        
        showSelectionRadialMenu(menuX, menuY);
    } else {
        // No nodes selected, but allow creating a zone on the selected area
        const menuX = rect.left + boxLeft + boxWidth / 2;
        const menuY = rect.top + boxTop - 30;
        
        // Store the area for zone creation
        state.multiSelection.emptyAreaSelection = {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
        
        console.log('Empty area selection:', state.multiSelection.emptyAreaSelection);
        showEmptyAreaMenu(menuX, menuY);
    }
}

// ===== SNAP TO GRID =====
export function snapNodesToGrid(nodeIds, realtime = false) {
    if (!state.network) return;
    
    const gridSpacing = 60; // Match the grid display spacing
    const positions = state.network.getPositions(nodeIds);
    const nodesToUpdate = [];
    
    nodeIds.forEach(nodeId => {
        const pos = positions[nodeId];
        if (pos) {
            const snappedX = Math.round(pos.x / gridSpacing) * gridSpacing;
            const snappedY = Math.round(pos.y / gridSpacing) * gridSpacing;
            
            nodesToUpdate.push({
                id: nodeId,
                x: snappedX,
                y: snappedY,
                fixed: false
            });
        }
    });
    
    if (nodesToUpdate.length > 0) {
        state.network.body.data.nodes.update(nodesToUpdate);
    }
}

// ===== NODE LABEL FORMATTING =====

export function getNodeLabel(article, format) {
    switch(format) {
        case 'bibtexId':
            return article.bibtexId || article.id;
        case 'title':
            return article.title || 'Untitled';
        case 'citation':
            const authorsList = article.authors ? article.authors.split(/,| and /i) : [];
            const author = authorsList.length > 0 ? authorsList[0].trim() : 'Unknown';
            const year = article.year || 'n.d.';
            return `${author}, ${year}`;
        case 'author':
            const authors = article.authors ? article.authors.split(/,| and /i) : [];
            return authors.length > 0 ? authors[0].trim() : 'Unknown Author';
        default:
            return article.title || 'Untitled';
    }
}

export function applyNodeLabelFormat(format) {
    localStorage.setItem('nodeLabelFormat', format);
    
    if (!state.network) return;
    
    const nodesToUpdate = state.appData.articles.map(article => ({
        id: article.id,
        label: getNodeLabel(article, format)
    }));
    
    state.network.body.data.nodes.update(nodesToUpdate);
    showNotification(`Node labels updated to: ${format}`, 'success');
}
