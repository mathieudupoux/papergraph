import { getStore, getNetwork, pauseHistory, resumeHistory } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { checkNodeZoneMembership, hideZoneDeleteButton } from './zones.js';
import { save } from '../data/persistence.js';
import { showSelectionRadialMenu, showEmptyAreaMenu } from '../ui/radial-menu.js';

// ===== MULTI-SELECTION BOX =====

const SELECTION_PADDING = 50;
const FLOATING_MENU_OFFSET_Y = 44;

function ensureSelectionBoxElement() {
    if (getStore().multiSelection.selectionBox) {
        return getStore().multiSelection.selectionBox;
    }

    const canvas = getNetwork().canvas.frame.canvas;
    getStore().updateMultiSelection({ selectionBox: document.createElement('div') });
    getStore().multiSelection.selectionBox.id = 'selectionBox';
    getStore().multiSelection.selectionBox.style.position = 'absolute';
    getStore().multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
    getStore().multiSelection.selectionBox.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    getStore().multiSelection.selectionBox.style.pointerEvents = 'none';
    getStore().multiSelection.selectionBox.style.zIndex = '1000';
    canvas.parentElement.appendChild(getStore().multiSelection.selectionBox);

    return getStore().multiSelection.selectionBox;
}

function updateSelectedZonesForDragFromNodes(nodeIds) {
    const zonesSet = new Set();

    nodeIds.forEach((nodeId) => {
        const article = getStore().appData.articles.find((a) => a.id === nodeId);
        if (!article || !(article.categories || []).length) return;

        const nodeZones = [];
        article.categories.forEach((tag) => {
            const zoneIdx = getStore().tagZones.findIndex((z) => z.tag === tag);
            if (zoneIdx !== -1) {
                const zone = getStore().tagZones[zoneIdx];
                nodeZones.push({ idx: zoneIdx, area: zone.width * zone.height });
            }
        });

        if (nodeZones.length > 0) {
            nodeZones.sort((a, b) => a.area - b.area);
            zonesSet.add(nodeZones[0].idx);
        }
    });

    getStore().updateMultiSelection({ selectedZonesForDrag: Array.from(zonesSet) });
}

function showSelectionMenuAtTopLeft(left, top, rect) {
    const menuX = rect.left + left;
    const menuY = rect.top + top - FLOATING_MENU_OFFSET_Y;
    showSelectionRadialMenu(menuX, menuY);
}

function showEmptyAreaMenuAtTopLeft(left, top, rect) {
    const menuX = rect.left + left;
    const menuY = rect.top + top - FLOATING_MENU_OFFSET_Y;
    showEmptyAreaMenu(menuX, menuY);
}

function setSelectionBoundsCanvas(bounds) {
    getStore().updateMultiSelection({
        selectionBoundsCanvas: bounds ? { ...bounds } : null
    });
}

function applySelectionBoxFromCanvasBounds(bounds) {
    if (!bounds) return null;

    const selectionBox = ensureSelectionBoxElement();
    const topLeft = getNetwork().canvasToDOM({ x: bounds.x, y: bounds.y });
    const bottomRight = getNetwork().canvasToDOM({
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height
    });
    const graphContainer = document.getElementById('graphContainer');
    const containerRect = graphContainer.getBoundingClientRect();

    selectionBox.style.left = `${topLeft.x}px`;
    selectionBox.style.top = `${topLeft.y}px`;
    selectionBox.style.width = `${bottomRight.x - topLeft.x}px`;
    selectionBox.style.height = `${bottomRight.y - topLeft.y}px`;
    selectionBox.style.display = 'block';

    return {
        left: topLeft.x,
        top: topLeft.y,
        rect: containerRect
    };
}

export function refreshSelectionOverlayPosition() {
    const selectionBox = getStore().multiSelection.selectionBox;
    if (!selectionBox || selectionBox.style.display === 'none') return;
    if (getStore().multiSelection.active || getStore().multiSelection.boxDragging) return;

    const bounds = getStore().multiSelection.selectionBoundsCanvas;
    if (!bounds) return;

    const layout = applySelectionBoxFromCanvasBounds(bounds);
    if (!layout) return;

    if (getStore().multiSelection.selectedNodes.length > 0) {
        showSelectionMenuAtTopLeft(layout.left, layout.top, layout.rect);
    } else if (getStore().multiSelection.emptyAreaSelection) {
        showEmptyAreaMenuAtTopLeft(layout.left, layout.top, layout.rect);
    }
}

export function syncSelectionBoxToNodes(nodeIds) {
    const selectedNodes = [...new Set(nodeIds)];

    if (selectedNodes.length === 0) {
        hideSelectionBox();
        getStore().updateMultiSelection({ selectedZonesForDrag: [] });
        return;
    }

    getStore().setSelectedZoneIndex(-1);
    hideZoneDeleteButton();

    const positions = getNetwork().getPositions(selectedNodes);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    Object.values(positions).forEach((pos) => {
        if (!pos) return;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x);
        maxY = Math.max(maxY, pos.y);
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        hideSelectionBox();
        getStore().updateMultiSelection({ selectedNodes: [] });
        getStore().updateMultiSelection({ selectedZonesForDrag: [] });
        return;
    }

    minX -= SELECTION_PADDING;
    minY -= SELECTION_PADDING;
    maxX += SELECTION_PADDING;
    maxY += SELECTION_PADDING;

    const topLeft = getNetwork().canvasToDOM({ x: minX, y: minY });
    const bottomRight = getNetwork().canvasToDOM({ x: maxX, y: maxY });
    const graphContainer = document.getElementById('graphContainer');
    const containerRect = graphContainer.getBoundingClientRect();
    const selectionBox = ensureSelectionBoxElement();

    selectionBox.style.border = '2px dashed #4a90e2';
    selectionBox.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    selectionBox.style.left = topLeft.x + 'px';
    selectionBox.style.top = topLeft.y + 'px';
    selectionBox.style.width = (bottomRight.x - topLeft.x) + 'px';
    selectionBox.style.height = (bottomRight.y - topLeft.y) + 'px';
    selectionBox.style.display = 'block';

    getStore().updateMultiSelection({ selectedNodes });
    setSelectionBoundsCanvas({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    });
    updateSelectedZonesForDragFromNodes(selectedNodes);
    getNetwork().selectNodes(selectedNodes);
    showSelectionMenuAtTopLeft(topLeft.x, topLeft.y, containerRect);
}

export function hideSelectionBox() {
    if (getStore().multiSelection.selectionBox) {
        getStore().multiSelection.selectionBox.style.display = 'none';
    }
    // NOTE: Don't reset selectedNodes here - it's managed elsewhere
    getStore().updateMultiSelection({ active: false });
}

export function startSelectionBox(event) {
    if (getStore().connectionMode.active) return;
    
    getStore().updateMultiSelection({ active: true });
    
    getNetwork().setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false,
            hover: false
        }
    });
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    
    getStore().updateMultiSelection({ startX: event.clientX - rect.left });
    getStore().updateMultiSelection({ startY: event.clientY - rect.top });
    
    ensureSelectionBoxElement();
    
    getStore().multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
    getStore().multiSelection.selectionBox.style.left = getStore().multiSelection.startX + 'px';
    getStore().multiSelection.selectionBox.style.top = getStore().multiSelection.startY + 'px';
    getStore().multiSelection.selectionBox.style.width = '0px';
    getStore().multiSelection.selectionBox.style.height = '0px';
    getStore().multiSelection.selectionBox.style.display = 'block';
}

export function startSelectionBoxDrag(event, mouseX, mouseY, boxLeft, boxTop) {
    pauseHistory();
    getStore().updateMultiSelection({ boxDragging: true });
    getStore().updateMultiSelection({ boxDragStart: { x: mouseX, y: mouseY } });
    getStore().updateMultiSelection({ originalBoxPosition: { left: boxLeft, top: boxTop } });
    
    // Store initial positions of nodes and zones for dragging
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const boxWidth = parseFloat(getStore().multiSelection.selectionBox.style.width);
    const boxHeight = parseFloat(getStore().multiSelection.selectionBox.style.height);
    
    const topLeft = getNetwork().DOMtoCanvas({ x: boxLeft, y: boxTop });
    const bottomRight = getNetwork().DOMtoCanvas({ x: boxLeft + boxWidth, y: boxTop + boxHeight });
    
    // Store initial node positions
    getStore().updateMultiSelection({ nodeDragStart: {} });
    getStore().multiSelection.selectedNodes.forEach(nodeId => {
        const pos = getNetwork().getPositions([nodeId])[nodeId];
        if (pos) {
            getStore().multiSelection.nodeDragStart[nodeId] = { x: pos.x, y: pos.y };
        }
    });
    
    // Store initial zone positions for zones fully inside the selection
    getStore().updateMultiSelection({ zonesDragStart: {} });
    console.log(`📦 Storing start positions for ${getStore().multiSelection.selectedZonesForDrag.length} zones...`);
    getStore().multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
        const zone = getStore().tagZones[zoneIdx];
        getStore().multiSelection.zonesDragStart[zoneIdx] = { x: zone.x, y: zone.y };
        console.log(`  Zone ${zoneIdx} (${zone.tag}): start at x=${zone.x.toFixed(1)}, y=${zone.y.toFixed(1)}`);
    });
    
    getNetwork().setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false,
            hover: false
        }
    });
}

export function updateSelectionBoxDrag(event) {
    if (!getStore().multiSelection.boxDragging) return;
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const dx = mouseX - getStore().multiSelection.boxDragStart.x;
    const dy = mouseY - getStore().multiSelection.boxDragStart.y;
    
    // Move the selection box
    const newLeft = getStore().multiSelection.originalBoxPosition.left + dx;
    const newTop = getStore().multiSelection.originalBoxPosition.top + dy;
    
    getStore().multiSelection.selectionBox.style.left = newLeft + 'px';
    getStore().multiSelection.selectionBox.style.top = newTop + 'px';
    
    // Calculate canvas coordinate delta
    const canvasDxStart = getNetwork().DOMtoCanvas({ x: getStore().multiSelection.boxDragStart.x, y: getStore().multiSelection.boxDragStart.y });
    const canvasDxCurrent = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    const canvasDx = canvasDxCurrent.x - canvasDxStart.x;
    const canvasDy = canvasDxCurrent.y - canvasDxStart.y;
    
    // Move all selected nodes
    Object.keys(getStore().multiSelection.nodeDragStart).forEach(nodeId => {
        const startPos = getStore().multiSelection.nodeDragStart[nodeId];
        getNetwork().moveNode(nodeId, startPos.x + canvasDx, startPos.y + canvasDy);
    });
    
    // Move all selected zones
    if (getStore().multiSelection.selectedZonesForDrag && getStore().multiSelection.selectedZonesForDrag.length > 0) {
        console.log(`📦 Moving ${getStore().multiSelection.selectedZonesForDrag.length} zones with selection box...`);
        getStore().multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
            const zone = getStore().tagZones[zoneIdx];
            const startPos = getStore().multiSelection.zonesDragStart[zoneIdx];
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
    
    getNetwork().redraw();
}

export function endSelectionBoxDrag() {
    if (!getStore().multiSelection.boxDragging) return;
    
    getStore().updateMultiSelection({ boxDragging: false });
    
    // Update zone membership for moved nodes
    checkNodeZoneMembership();
    
    // Save positions and create undo snapshot
    const positions = getNetwork().getPositions();
    const boxLeft = parseFloat(getStore().multiSelection.selectionBox.style.left);
    const boxTop = parseFloat(getStore().multiSelection.selectionBox.style.top);
    const boxWidth = parseFloat(getStore().multiSelection.selectionBox.style.width);
    const boxHeight = parseFloat(getStore().multiSelection.selectionBox.style.height);
    const topLeft = getNetwork().DOMtoCanvas({ x: boxLeft, y: boxTop });
    const bottomRight = getNetwork().DOMtoCanvas({ x: boxLeft + boxWidth, y: boxTop + boxHeight });
    setSelectionBoundsCanvas({
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
    });
    resumeHistory();
    getStore().setSavedNodePositions(positions);
    save(true);
    
    getNetwork().setOptions({
        interaction: {
            dragNodes: true,
            dragView: false,
            zoomView: false,
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            multiselect: true,
            selectable: true
        }
    });
}

export function updateSelectionBox(event) {
    if (!getStore().multiSelection.active || !getStore().multiSelection.selectionBox) return;
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    const left = Math.min(getStore().multiSelection.startX, currentX);
    const top = Math.min(getStore().multiSelection.startY, currentY);
    const width = Math.abs(currentX - getStore().multiSelection.startX);
    const height = Math.abs(currentY - getStore().multiSelection.startY);
    
    getStore().multiSelection.selectionBox.style.left = left + 'px';
    getStore().multiSelection.selectionBox.style.top = top + 'px';
    getStore().multiSelection.selectionBox.style.width = width + 'px';
    getStore().multiSelection.selectionBox.style.height = height + 'px';
}

export function endSelectionBox() {
    if (!getStore().multiSelection.active) return;
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    
    const boxLeft = parseFloat(getStore().multiSelection.selectionBox.style.left);
    const boxTop = parseFloat(getStore().multiSelection.selectionBox.style.top);
    const boxWidth = parseFloat(getStore().multiSelection.selectionBox.style.width);
    const boxHeight = parseFloat(getStore().multiSelection.selectionBox.style.height);
    
    // If box is too small (just a click), hide it and cancel
    if (boxWidth < 10 && boxHeight < 10) {
        getStore().multiSelection.selectionBox.style.display = 'none';
        getStore().updateMultiSelection({ active: false });
        
        getNetwork().setOptions({
            interaction: {
                dragNodes: true,
                dragView: false,
                zoomView: false,
                hover: true,
                hoverConnectedEdges: true,
                selectConnectedEdges: true,
                multiselect: true,
                selectable: true
            }
        });
        return;
    }
    
    const topLeft = getNetwork().DOMtoCanvas({ 
        x: boxLeft, 
        y: boxTop 
    });
    const bottomRight = getNetwork().DOMtoCanvas({ 
        x: boxLeft + boxWidth, 
        y: boxTop + boxHeight 
    });
    
    getStore().updateMultiSelection({ selectedNodes: [] });
    
    // Check if any tag zones are completely within the selection
    const fullySelectedZones = [];
    console.log('🔍 Checking for zones in selection box...');
    getStore().tagZones.forEach((zone, idx) => {
        const zoneFullyInSelection = zone.x >= topLeft.x && 
                                     zone.y >= topLeft.y &&
                                     zone.x + zone.width <= bottomRight.x &&
                                     zone.y + zone.height <= bottomRight.y;
        
        if (zoneFullyInSelection) {
            console.log(`✅ Zone "${zone.tag}" is fully selected`);
            fullySelectedZones.push({ zone, idx });
            
            // Add all nodes with this zone's tag to selection
            getStore().appData.articles.forEach(article => {
                if (article.categories.includes(zone.tag) && !getStore().multiSelection.selectedNodes.includes(article.id)) {
                    getStore().multiSelection.selectedNodes.push(article.id);
                    console.log(`  Added node ${article.id} (has tag "${zone.tag}")`);
                }
            });
        }
    });
    
    console.log(`📦 Found ${fullySelectedZones.length} fully selected zones`);
    
    // Add nodes that are directly in the selection box
    getStore().appData.articles.forEach(article => {
        const pos = getNetwork().getPositions([article.id])[article.id];
        if (pos) {
            if (pos.x >= topLeft.x && pos.x <= bottomRight.x &&
                pos.y >= topLeft.y && pos.y <= bottomRight.y) {
                if (!getStore().multiSelection.selectedNodes.includes(article.id)) {
                    getStore().multiSelection.selectedNodes.push(article.id);
                }
            }
        }
    });
    
    if (getStore().multiSelection.selectionBox) {
        getStore().multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
    }
    getStore().updateMultiSelection({ active: false });
    
    // Store fully selected zones for dragging, sorted by size (smallest first)
    fullySelectedZones.sort((a, b) => {
        const areaA = a.zone.width * a.zone.height;
        const areaB = b.zone.width * b.zone.height;
        return areaA - areaB;
    });
    getStore().updateMultiSelection({ selectedZonesForDrag: fullySelectedZones.map(fz => fz.idx) });
    setSelectionBoundsCanvas({
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
    });
    console.log(`📦 Zones to drag:`, getStore().multiSelection.selectedZonesForDrag);
    console.log(`📦 Selected ${getStore().multiSelection.selectedNodes.length} nodes total`);
    
    getNetwork().setOptions({
        interaction: {
            dragNodes: true,
            dragView: false,
            zoomView: false,
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            multiselect: true,
            selectable: true
        }
    });
    
    if (getStore().multiSelection.selectedNodes.length > 0) {
        getNetwork().selectNodes(getStore().multiSelection.selectedNodes);
        
        showSelectionMenuAtTopLeft(boxLeft, boxTop, rect);
    } else {
        // Store the area for zone creation
        getStore().updateMultiSelection({ emptyAreaSelection: {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        } });
        
        console.log('Empty area selection:', getStore().multiSelection.emptyAreaSelection);
        showEmptyAreaMenuAtTopLeft(boxLeft, boxTop, rect);
    }
}

// ===== SNAP TO GRID =====
export function snapNodesToGrid(nodeIds, realtime = false) {
    if (!getNetwork()) return;
    
    const gridSpacing = 60; // Match the grid display spacing
    const positions = getNetwork().getPositions(nodeIds);
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
        getNetwork().body.data.nodes.update(nodesToUpdate);
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
    
    if (!getNetwork()) return;
    
    const nodesToUpdate = getStore().appData.articles.map(article => ({
        id: article.id,
        label: getNodeLabel(article, format)
    }));
    
    getNetwork().body.data.nodes.update(nodesToUpdate);
    showNotification(`Node labels updated to: ${format}`, 'success');
}
