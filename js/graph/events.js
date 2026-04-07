// ===== GRAPH EVENT HANDLERS =====
// Canvas and network event handlers, extracted from initializeGraph()

import { getStore, getNetwork } from '../store/appStore.js';
import { darkenColor, getContrastColor, showNotification } from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { updateCategoryFilters } from '../ui/filters.js';
import { renderListView } from '../ui/list/sidebar.js';
import { showArticlePreview, closeArticlePreview } from '../ui/preview.js';
import { showRadialMenu, hideRadialMenu, updateRadialMenuPosition, updateRadialMenuIfActive, hideSelectionRadialMenu, showSelectionRadialMenu, hideEmptyAreaMenu } from '../ui/radial-menu.js';
import {
    getZoneResizeHandle, startZoneResize, getZoneTitleClick, startEditZoneTitle,
    hideZoneDeleteButton, showZoneDeleteButton, getZoneAtPosition, findNestedZones,
    updateZoneMove, endZoneMove, updateZoneResize, endZoneResize, isNodeInZone,
    updateZoneSizes, checkNodeZoneMembership, drawTagZones, updateZoneCursor
} from './zones.js';
import {
    startSelectionBox, startSelectionBoxDrag, updateSelectionBoxDrag, endSelectionBoxDrag,
    updateSelectionBox, endSelectionBox, hideSelectionBox
} from './selection.js';
import {
    handleConnectionModeClick, hideEdgeMenu, showEdgeMenu, editEdgeLabelInline,
    isControlPoint, showControlPointMenu
} from './connections.js';
import { positionNodesInZones, initializeZonesFromTags } from '../data/storage.js';

let dragStartPos = { x: 0, y: 0 };
let lastEdgeClickTime = 0;
let lastEdgeClickId = null;
let isAdjustingViewForNode = false;

export function setupCanvasEvents() {
    const canvas = getNetwork().canvas.frame.canvas;
    
    canvas.addEventListener('mousedown', (event) => {
        // In gallery viewer mode - allow node selection, right-click panning only
        
        if (getStore().isGalleryViewer) {
            // Right-click for panning (same as normal editor)
            if (event.button === 2) {
                event.preventDefault();
                event.stopPropagation();
                getStore().setIsDraggingView(true);
                dragStartPos = { x: event.clientX, y: event.clientY };
                hideSelectionBox();
                hideRadialMenu();
                hideSelectionRadialMenu();
            }
            // Left-click: let vis-network handle node selection naturally
            return;
        }
        
        // Normal editor mode - right click for panning
        if (event.button === 2) {
            event.preventDefault();
            event.stopPropagation();
            getStore().setIsDraggingView(true);
            dragStartPos = { x: event.clientX, y: event.clientY };
            
            // Hide selection box and radial menus when starting to pan
            hideSelectionBox();
            hideRadialMenu();
            hideSelectionRadialMenu();
            return;
        }
        
        // Left click interactions (only in normal editor mode)
        if (event.button === 0 && !getStore().connectionMode.active) {
            // Check if clicking on zone edge/corner for resize first
            const resizeHandle = getZoneResizeHandle(event);
            if (resizeHandle.zone !== null) {
                event.preventDefault();
                event.stopPropagation();
                startZoneResize(event, resizeHandle.zoneIndex, resizeHandle.handle);
                return;
            }
            
            // Check if clicking on zone title
            const titleClick = getZoneTitleClick(event);
            if (titleClick.zone !== null) {
                event.preventDefault();
                event.stopPropagation();
                getStore().setSelectedZoneIndex(titleClick.zoneIndex);
                
                const canvas = getNetwork().canvas.frame.canvas;
                const rect = canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
                
                getStore().updateZoneMoving({ startX: mousePos.x });
                getStore().updateZoneMoving({ startY: mousePos.y });
                getStore().updateZoneMoving({ zoneIndex: titleClick.zoneIndex });
                getStore().updateZoneMoving({ originalZone: { ...state.tagZones[titleClick.zoneIndex] } });
                getStore().updateZoneMoving({ readyToMove: true });
                
                const zone = getStore().tagZones[titleClick.zoneIndex];
                getStore().updateZoneMoving({ originalNodePositions: {} });
                getStore().appData.articles.forEach(article => {
                    if (article.categories.includes(zone.tag)) {
                        const pos = getNetwork().getPositions([article.id])[article.id];
                        if (pos) {
                            getStore().zoneMoving.originalNodePositions[article.id] = { x: pos.x, y: pos.y };
                        }
                    }
                });
                
                // Find and store nested zones
                getStore().updateZoneMoving({ originalNestedZones: findNestedZones(titleClick.zoneIndex) });
                
                getNetwork().redraw();
                return;
            }
            
            // Check if clicking inside a zone or selection box
            const clickPos = { x: event.offsetX, y: event.offsetY };
            const nodeId = getNetwork().getNodeAt(clickPos);
            const edgeId = getNetwork().getEdgeAt(clickPos);
            
            if (!nodeId && !edgeId) {
                // PRIORITY 1: Check if clicking inside an existing selection box FIRST
                if (getStore().multiSelection.selectionBox && getStore().multiSelection.selectionBox.style.display !== 'none') {
                    const canvas = getNetwork().canvas.frame.canvas;
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    
                    const boxLeft = parseFloat(getStore().multiSelection.selectionBox.style.left);
                    const boxTop = parseFloat(getStore().multiSelection.selectionBox.style.top);
                    const boxWidth = parseFloat(getStore().multiSelection.selectionBox.style.width);
                    const boxHeight = parseFloat(getStore().multiSelection.selectionBox.style.height);
                    
                    // Check if click is inside the selection box
                    if (mouseX >= boxLeft && mouseX <= boxLeft + boxWidth &&
                        mouseY >= boxTop && mouseY <= boxTop + boxHeight) {
                        event.preventDefault();
                        event.stopPropagation();
                        startSelectionBoxDrag(event, mouseX, mouseY, boxLeft, boxTop);
                        return;
                    }
                }
                
                // PRIORITY 2: Check if clicking inside a zone (only if NOT inside selection box)
                const zoneClick = getZoneAtPosition(event);
                if (zoneClick.zone !== null) {
                    event.preventDefault();
                    event.stopPropagation();
                    getStore().setSelectedZoneIndex(zoneClick.zoneIndex);
                    
                    const canvas = getNetwork().canvas.frame.canvas;
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
                    
                    getStore().updateZoneMoving({ startX: mousePos.x });
                    getStore().updateZoneMoving({ startY: mousePos.y });
                    getStore().updateZoneMoving({ zoneIndex: zoneClick.zoneIndex });
                    getStore().updateZoneMoving({ originalZone: { ...state.tagZones[zoneClick.zoneIndex] } });
                    getStore().updateZoneMoving({ readyToMove: true });
                    
                    const zone = getStore().tagZones[zoneClick.zoneIndex];
                    getStore().updateZoneMoving({ originalNodePositions: {} });
                    getStore().appData.articles.forEach(article => {
                        if (article.categories.includes(zone.tag)) {
                            const pos = getNetwork().getPositions([article.id])[article.id];
                            if (pos) {
                                getStore().zoneMoving.originalNodePositions[article.id] = { x: pos.x, y: pos.y };
                            }
                        }
                    });
                    
                    // Find and store nested zones
                    getStore().updateZoneMoving({ originalNestedZones: findNestedZones(zoneClick.zoneIndex) });
                    
                    getNetwork().redraw();
                    return;
                } else {
                    if (getStore().selectedZoneIndex !== -1) {
                        getStore().setSelectedZoneIndex(-1);
                        hideZoneDeleteButton();
                        getNetwork().redraw();
                    }
                    
                    // PRIORITY 3: Start new selection box
                    event.preventDefault();
                    event.stopPropagation();
                    startSelectionBox(event);
                }
            }
        }
    }, true);
    
    canvas.addEventListener('dblclick', (event) => {
        // Disable zone title editing in gallery viewer mode
        if (!getStore().connectionMode.active && !getStore().isGalleryViewer) {
            const titleClick = getZoneTitleClick(event);
            if (titleClick.zone !== null) {
                event.preventDefault();
                event.stopPropagation();
                hideZoneDeleteButton();
                startEditZoneTitle(event, titleClick.zoneIndex);
            }
        }
    }, true);
    
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });
    
    canvas.addEventListener('mousemove', (event) => {
        if (getStore().isDraggingView) {
            const dx = event.clientX - dragStartPos.x;
            const dy = event.clientY - dragStartPos.y;
            
            const currentPos = getNetwork().getViewPosition();
            const scale = getNetwork().getScale();
            
            getNetwork().moveTo({
                position: {
                    x: currentPos.x - dx / scale,
                    y: currentPos.y - dy / scale
                },
                animation: false
            });
            
            dragStartPos = { x: event.clientX, y: event.clientY };
        } else if (getStore().zoneMoving.readyToMove) {
            const canvas = getNetwork().canvas.frame.canvas;
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
            
            const dx = Math.abs(mousePos.x - getStore().zoneMoving.startX);
            const dy = Math.abs(mousePos.y - getStore().zoneMoving.startY);
            
            if (dx > 5 || dy > 5) {
                getStore().updateZoneMoving({ active: true });
                getStore().updateZoneMoving({ readyToMove: false });
                
                getNetwork().setOptions({
                    interaction: {
                        dragNodes: false,
                        dragView: false,
                        zoomView: false
                    }
                });
            }
        } else if (getStore().zoneMoving.active) {
            event.preventDefault();
            event.stopPropagation();
            updateZoneMove(event);
        } else if (getStore().zoneResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            updateZoneResize(event);
        } else if (getStore().multiSelection.boxDragging) {
            event.preventDefault();
            event.stopPropagation();
            updateSelectionBoxDrag(event);
        } else if (getStore().multiSelection.active) {
            event.preventDefault();
            event.stopPropagation();
            updateSelectionBox(event);
        }
        
        if (!getStore().isDraggingView && !getStore().zoneMoving.active && !getStore().zoneResizing.active && !getStore().multiSelection.active && !getStore().multiSelection.boxDragging && !getStore().connectionMode.active) {
            updateZoneCursor(event);
        }
    }, true);
    
    canvas.addEventListener('mouseup', (event) => {
        
        // Stop panning on right click release
        if (event.button === 2) {
            getStore().setIsDraggingView(false);
            return;
        }
        
        // Stop panning on left click release in gallery viewer
        if (event.button === 0 && getStore().isGalleryViewer) {
            if (getStore().isDraggingView) {
                getStore().setIsDraggingView(false);
            }
            return; // Exit early - no other interactions in gallery viewer
        }
        
        // Normal editor interactions for left click
        if (event.button === 0 && (getStore().zoneMoving.active || getStore().zoneMoving.readyToMove)) {
            event.preventDefault();
            event.stopPropagation();
            
            if (getStore().zoneMoving.readyToMove && !getStore().zoneMoving.active && getStore().selectedZoneIndex !== -1) {
                showZoneDeleteButton(getStore().selectedZoneIndex);
            }
            
            if (getStore().zoneMoving.active) {
                endZoneMove();
            }
            getStore().updateZoneMoving({ readyToMove: false });
            getStore().updateZoneMoving({ active: false });
        } else if (event.button === 0 && getStore().zoneResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            endZoneResize();
        } else if (event.button === 0 && getStore().multiSelection.boxDragging) {
            event.preventDefault();
            event.stopPropagation();
            endSelectionBoxDrag();
        } else if (event.button === 0 && getStore().multiSelection.active) {
            event.preventDefault();
            event.stopPropagation();
            endSelectionBox();
        }
    }, true);
    
    getNetwork().canvas.body.container.addEventListener('mousemove', (event) => {
        if (!getStore().isDraggingView && !getStore().zoneMoving.active && !getStore().zoneResizing.active && !getStore().multiSelection.active && !getStore().multiSelection.boxDragging && !getStore().connectionMode.active && !getStore().zoneEditing.active) {
            updateZoneCursor(event);
        }
    }, false);
}

export function setupNetworkEvents() {
    getNetwork().on('stabilizationIterationsDone', function () {
        console.log('=== Graph stabilization complete ===');
        console.log('Saved positions available:', getStore().savedNodePositions ? Object.keys(getStore().savedNodePositions).length : 0);
        
        if (getStore().savedNodePositions && Object.keys(getStore().savedNodePositions).length > 0) {
            console.log('Restoring saved positions for', Object.keys(getStore().savedNodePositions).length, 'nodes');
            const nodesToUpdate = [];
            Object.keys(getStore().savedNodePositions).forEach(nodeId => {
                const pos = getStore().savedNodePositions[nodeId];
                nodesToUpdate.push({
                    id: parseInt(nodeId),
                    x: pos.x,
                    y: pos.y,
                    fixed: { x: false, y: false }
                });
            });
            if (nodesToUpdate.length > 0) {
                getNetwork().body.data.nodes.update(nodesToUpdate);
                console.log('✓ Applied saved positions to', nodesToUpdate.length, 'nodes');
                
                setTimeout(() => {
                    if (typeof checkNodeZoneMembership === 'function' && getStore().tagZones.length > 0) {
                        console.log('🎨 Checking zone membership after project load...');
                        checkNodeZoneMembership();
                    }
                }, 100);
            }
        } else {
            console.log('No saved positions, initializing zones from tags');
            if (getStore().tagZones.length === 0 && getStore().appData.articles.length > 0) {
                initializeZonesFromTags();
            }
            positionNodesInZones();
            getNetwork().fit();
        }
    });
    
    getNetwork().on('click', (params) => {
        if (getStore().connectionMode.active) {
            handleConnectionModeClick(params);
            return;
        }
        
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            
            // Check if it's a control point (negative ID)
            if (isControlPoint(nodeId)) {
                const container = document.getElementById('graphContainer');
                const rect = container.getBoundingClientRect();
                const screenX = rect.left + params.pointer.DOM.x;
                const screenY = rect.top + params.pointer.DOM.y;
                
                showControlPointMenu(screenX, screenY, nodeId);
                return;
            }
            
            // Ctrl+Click for multi-selection
            if (params.event.srcEvent.ctrlKey || params.event.srcEvent.metaKey) {
                console.log('🔵 Ctrl+Click on node:', nodeId);
                
                if (!getStore().multiSelection.selectedNodes.includes(nodeId)) {
                    getStore().multiSelection.selectedNodes.push(nodeId);
                    getStore().setSelectedNodeId(nodeId);
                } else {
                    getStore().updateMultiSelection({ selectedNodes: getStore().multiSelection.selectedNodes.filter(id => id !== nodeId) });
                    getStore().setSelectedNodeId(getStore().multiSelection.selectedNodes.length > 0 ? getStore().multiSelection.selectedNodes[getStore().multiSelection.selectedNodes.length - 1] : null);
                }
                
                console.log('→ Selection now:', getStore().multiSelection.selectedNodes);
                
                if (getStore().multiSelection.selectedNodes.length > 0) {
                    getNetwork().selectNodes(getStore().multiSelection.selectedNodes);
                    
                    const positions = getNetwork().getPositions(getStore().multiSelection.selectedNodes);
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    
                    Object.values(positions).forEach(pos => {
                        minX = Math.min(minX, pos.x);
                        minY = Math.min(minY, pos.y);
                        maxX = Math.max(maxX, pos.x);
                        maxY = Math.max(maxY, pos.y);
                    });
                    
                    const padding = 50;
                    minX -= padding;
                    minY -= padding;
                    maxX += padding;
                    maxY += padding;
                    
                    const topLeft = getNetwork().canvasToDOM({ x: minX, y: minY });
                    const bottomRight = getNetwork().canvasToDOM({ x: maxX, y: maxY });
                    
                    const graphContainer = document.getElementById('graphContainer');
                    const containerRect = graphContainer.getBoundingClientRect();
                    
                    if (!getStore().multiSelection.selectionBox) {
                        getStore().updateMultiSelection({ selectionBox: document.createElement('div') });
                        getStore().multiSelection.selectionBox.id = 'selectionBox';
                        getStore().multiSelection.selectionBox.style.position = 'absolute';
                        getStore().multiSelection.selectionBox.style.pointerEvents = 'none';
                        getStore().multiSelection.selectionBox.style.zIndex = '1000';
                        document.querySelector('#graphContainer > div').appendChild(getStore().multiSelection.selectionBox);
                    }
                    
                    getStore().multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
                    getStore().multiSelection.selectionBox.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                    getStore().multiSelection.selectionBox.style.left = topLeft.x + 'px';
                    getStore().multiSelection.selectionBox.style.top = topLeft.y + 'px';
                    getStore().multiSelection.selectionBox.style.width = (bottomRight.x - topLeft.x) + 'px';
                    getStore().multiSelection.selectionBox.style.height = (bottomRight.y - topLeft.y) + 'px';
                    getStore().multiSelection.selectionBox.style.display = 'block';
                    
                    console.log('📦 Calculating zones for selected nodes...');
                    const zonesSet = new Set();
                    getStore().multiSelection.selectedNodes.forEach(nodeId => {
                        const article = getStore().appData.articles.find(a => a.id === nodeId);
                        console.log(`Node ${nodeId} categories:`, article?.categories);
                        if (article && article.categories.length > 0) {
                            const nodeZones = [];
                            article.categories.forEach(tag => {
                                const zoneIdx = getStore().tagZones.findIndex(z => z.tag === tag);
                                if (zoneIdx !== -1) {
                                    const zone = getStore().tagZones[zoneIdx];
                                    nodeZones.push({ idx: zoneIdx, zone: zone, area: zone.width * zone.height });
                                }
                            });
                            
                            console.log(`Node ${nodeId} has ${nodeZones.length} zones:`, nodeZones);
                            if (nodeZones.length > 0) {
                                nodeZones.sort((a, b) => a.area - b.area);
                                zonesSet.add(nodeZones[0].idx);
                                console.log(`Selected smallest zone ${nodeZones[0].idx} for node ${nodeId}`);
                            }
                        }
                    });
                    
                    console.log('Final zones to drag:', Array.from(zonesSet));
                    getStore().updateMultiSelection({ selectedZonesForDrag: Array.from(zonesSet) });
                    
                    const menuX = containerRect.left + (topLeft.x + bottomRight.x) / 2;
                    const menuY = containerRect.top + topLeft.y - 30;
                    
                    showSelectionRadialMenu(menuX, menuY);
                } else {
                    hideSelectionRadialMenu();
                    hideSelectionBox();
                    getNetwork().unselectAll();
                }
                
                closeArticlePreview();
                hideRadialMenu();
                
                return;
            }
            
            // Set selected node ID for keyboard shortcuts
            getStore().setSelectedNodeId(nodeId);
            getStore().setSelectedEdgeId(null);
            console.log('✅ Set selectedNodeId to:', getStore().selectedNodeId);
            
            hideSelectionBox();
            
            if (getStore().selectedNodeId !== null && getStore().selectedNodeId !== nodeId) {
                hideRadialMenu();
                hideEdgeMenu();
                hideZoneDeleteButton();
                hideSelectionRadialMenu();
                setTimeout(() => {
                    openRadialMenuForNode(nodeId);
                }, 1);
            } else {
                hideEdgeMenu();
                hideZoneDeleteButton();
                hideSelectionRadialMenu();
                openRadialMenuForNode(nodeId);
            }
        } else if (params.edges.length > 0) {
            const edgeId = params.edges[0];
            const now = Date.now();
            
            let actualEdgeId = edgeId;
            if (typeof edgeId === 'string' && edgeId.includes('_seg_')) {
                actualEdgeId = parseInt(edgeId.split('_seg_')[0]);
            }
            
            if (actualEdgeId === lastEdgeClickId && now - lastEdgeClickTime < 300) {
                hideEdgeMenu();
                editEdgeLabelInline(actualEdgeId, null, params.pointer.DOM);
                lastEdgeClickTime = 0;
                lastEdgeClickId = null;
                return;
            }
            
            lastEdgeClickTime = now;
            lastEdgeClickId = actualEdgeId;
            
            if (!getStore().connectionMode.active) {
                getStore().setSelectedEdgeId(edgeId);
                getStore().setSelectedNodeId(null);
                
                hideRadialMenu();
                hideZoneDeleteButton();
                hideSelectionRadialMenu();
                closeArticlePreview();
                
                hideSelectionBox();
                getStore().updateMultiSelection({ selectedNodes: [] });
                getStore().updateMultiSelection({ selectedZonesForDrag: [] });
                if (getNetwork()) getNetwork().unselectAll();
                
                const container = document.getElementById('graphContainer');
                const rect = container.getBoundingClientRect();
                
                const screenX = rect.left + params.pointer.DOM.x + 30;
                const screenY = rect.top + params.pointer.DOM.y - 22;
                
                showEdgeMenu(screenX, screenY, edgeId);
                
                getNetwork().setOptions({ 
                    interaction: { 
                        dragNodes: false,
                        dragView: false,
                        zoomView: false
                    } 
                });
            }
        } else {
            hideRadialMenu();
            hideEdgeMenu();
            hideZoneDeleteButton();
            hideSelectionRadialMenu();
            closeArticlePreview();
            
            hideSelectionBox();
            getStore().updateMultiSelection({ selectedNodes: [] });
            getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            if (getNetwork()) getNetwork().unselectAll();
        }
    });
    
    // Prevent dragging in gallery viewer mode
    getNetwork().on('dragStart', (params) => {
        if (getStore().isGalleryViewer && params.nodes && params.nodes.length > 0) {
            return false;
        }
    });
    
    getNetwork().on('dragging', (params) => {
        if (getStore().isGalleryViewer) {
            return false;
        }
        
        if (params.nodes.length > 0 && !getStore().multiSelection.wasDragging) {
            getStore().updateMultiSelection({ wasDragging: true });
            
            const isDraggingSelection = params.nodes.some(nodeId => 
                getStore().multiSelection.selectedNodes.includes(nodeId)
            );
            
            if (isDraggingSelection) {
                getStore().updateMultiSelection({ menuActive: document.getElementById('selectionRadialMenu')?.classList.contains('active') || 
                                           getStore().multiSelection.selectedNodes.length > 0 });
                console.log('Dragging selection, saved state:', getStore().multiSelection);
                
                if (getStore().multiSelection.selectedZonesForDrag.length > 0) {
                    getStore().updateMultiSelection({ zonesDragStart: {} });
                    getStore().multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
                        const zone = getStore().tagZones[zoneIdx];
                        getStore().multiSelection.zonesDragStart[zoneIdx] = { x: zone.x, y: zone.y };
                    });
                    
                    const firstNode = params.nodes[0];
                    const pos = getNetwork().getPositions([firstNode])[firstNode];
                    getStore().updateMultiSelection({ nodeDragStart: { x: pos.x, y: pos.y } });
                }
            }
        }
        
        if (params.nodes.length > 0 && getStore().multiSelection.selectedZonesForDrag.length > 0 && getStore().multiSelection.nodeDragStart) {
            const firstNode = params.nodes[0];
            const currentPos = getNetwork().getPositions([firstNode])[firstNode];
            
            const dx = currentPos.x - getStore().multiSelection.nodeDragStart.x;
            const dy = currentPos.y - getStore().multiSelection.nodeDragStart.y;
            
            getStore().multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
                const zone = getStore().tagZones[zoneIdx];
                const startPos = getStore().multiSelection.zonesDragStart[zoneIdx];
                zone.x = startPos.x + dx;
                zone.y = startPos.y + dy;
            });
            
            getNetwork().redraw();
        }
        
        if (params.nodes.length > 0) {
            hideSelectionBox();
            hideSelectionRadialMenu();
            
            if (params.nodes.length > 1) {
                hideRadialMenu();
            }
        }
        
        if (params.nodes.length === 1 && document.getElementById('radialMenu').classList.contains('active')) {
            const nodeId = params.nodes[0];
            if (nodeId === getStore().selectedNodeId) {
                const nodePosition = getNetwork().getPositions([nodeId])[nodeId];
                const canvasPosition = getNetwork().canvasToDOM(nodePosition);
                
                const container = document.getElementById('graphContainer');
                const rect = container.getBoundingClientRect();
                
                const screenX = rect.left + canvasPosition.x;
                const screenY = rect.top + canvasPosition.y;
                
                const node = getNetwork().body.nodes[nodeId];
                const nodeWidth = node.shape.width || 100;
                const nodeHeight = node.shape.height || 50;
                
                updateRadialMenuPosition(screenX, screenY, nodeWidth, nodeHeight);
            }
        }
        
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const nodePos = getNetwork().getPositions([nodeId])[nodeId];
            const article = getStore().appData.articles.find(a => a.id === nodeId);
            
            if (article) {
                getStore().tagZones.forEach(zone => {
                    const isInZone = isNodeInZone(nodePos, zone);
                    const hasTag = article.categories.includes(zone.tag);
                    
                    if (isInZone && !hasTag) {
                        getStore().addArticleCategory(nodeId, zone.tag);
                        getNetwork().body.data.nodes.update({
                            id: nodeId,
                            color: {
                                background: zone.color,
                                border: darkenColor(zone.color, 20)
                            },
                            font: { color: getContrastColor(zone.color) }
                        });
                        save();
                        updateCategoryFilters();
                        renderListView();
                        showNotification(`Tag "${zone.tag}" ajouté`, 'success');
                    } else if (!isInZone && hasTag) {
                        getStore().removeArticleCategory(nodeId, zone.tag);
                        getNetwork().body.data.nodes.update({
                            id: nodeId,
                            color: {
                                border: '#4a90e2',
                                background: '#e3f2fd'
                            },
                            font: { color: '#333333' }
                        });
                        save();
                        updateCategoryFilters();
                        renderListView();
                        showNotification(`Tag "${zone.tag}" retiré`, 'info');
                    }
                });
            }
        }
    });
    
    getNetwork().on('dragEnd', (params) => {
        if (getStore().isGalleryViewer) {
            return false;
        }
        
        if (params.nodes.length > 0) {
            if (getStore().multiSelection.selectedZonesForDrag.length > 0) {
                save(true);
            }
            
            getStore().updateMultiSelection({ zonesDragStart: {} });
            getStore().updateMultiSelection({ nodeDragStart: null });
            
            updateZoneSizes();
            checkNodeZoneMembership();
            
            const positions = getNetwork().getPositions();
            getStore().setSavedNodePositions(positions);
            console.log('Node dragged - positions updated in memory:', Object.keys(positions).length, 'nodes');
            
            const draggedControlPoints = params.nodes.filter(nodeId => nodeId < 0);
            
            if (draggedControlPoints.length > 0) {
                console.log('🎯 Control point(s) moved:', draggedControlPoints);
                
                const edgesToRebuild = new Set();
                for (const edgeId in getStore().edgeControlPoints) {
                    const controlPoints = getStore().edgeControlPoints[edgeId];
                    if (controlPoints.some(cpId => draggedControlPoints.includes(cpId))) {
                        edgesToRebuild.add(edgeId);
                    }
                }
                
                console.log('🔄 Rebuilding', edgesToRebuild.size, 'edges to recalculate label position');
                edgesToRebuild.forEach(edgeId => {
                    if (typeof window.rebuildEdgeWithControlPoints === 'function') {
                        window.rebuildEdgeWithControlPoints(parseInt(edgeId));
                    }
                });
            }
            
            save(true);
            
            getStore().updateMultiSelection({ wasDragging: false });
            
            getNetwork().redraw();
        }
    });
    
    getNetwork().on('stabilizationProgress', (params) => {
        updateRadialMenuIfActive();
    });
    
    getNetwork().on('beforeDrawing', (ctx) => {
        // Draw grid if enabled
        if (getStore().gridEnabled) {
            const scale = getNetwork().getScale();
            const viewPosition = getNetwork().getViewPosition();
            const canvasSize = getNetwork().canvas.frame.canvas;
            
            const topLeft = getNetwork().DOMtoCanvas({ x: 0, y: 0 });
            const bottomRight = getNetwork().DOMtoCanvas({ 
                x: canvasSize.width, 
                y: canvasSize.height 
            });
            
            const spacing = 60;
            
            const minX = Math.floor(topLeft.x / spacing) * spacing;
            const maxX = Math.ceil(bottomRight.x / spacing) * spacing;
            const minY = Math.floor(topLeft.y / spacing) * spacing;
            const maxY = Math.ceil(bottomRight.y / spacing) * spacing;
            
            const isDarkTheme = document.body.classList.contains('dark-theme');
            ctx.fillStyle = isDarkTheme ? 'rgba(232, 234, 240, 0.2)' : 'rgba(0, 0, 0, 0.15)';
            for (let x = minX; x <= maxX; x += spacing) {
                for (let y = minY; y <= maxY; y += spacing) {
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // Draw tag zones
        drawTagZones(ctx);
    });
    
    getNetwork().on('hoverNode', (params) => {
        if (getStore().connectionMode.active && params.node !== getStore().connectionMode.fromNodeId) {
            getNetwork().canvas.body.container.style.cursor = "pointer";
        }
    });
    
    getNetwork().on('blurNode', () => {
        if (getStore().connectionMode.active) {
            getNetwork().canvas.body.container.style.cursor = "crosshair";
        }
    });
    
    getNetwork().on('zoom', () => {
        if (getStore().multiSelection.selectionBox && getStore().multiSelection.selectionBox.style.display !== 'none') {
            hideSelectionBox();
            hideSelectionRadialMenu();
            hideEmptyAreaMenu();
            if (getNetwork()) getNetwork().unselectAll();
            getStore().updateMultiSelection({ selectedNodes: [] });
            getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            getStore().updateMultiSelection({ emptyAreaSelection: null });
        }
    });
}

export function openRadialMenuForNode(nodeId) {
    if (isAdjustingViewForNode) return;
    
    getStore().setSelectedNodeId(nodeId);
    getStore().setSelectedEdgeId(null);
    
    const nodePosition = getNetwork().getPositions([nodeId])[nodeId];
    const canvasPosition = getNetwork().canvasToDOM(nodePosition);
    
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    
    const node = getNetwork().body.nodes[nodeId];
    const nodeWidth = node.shape.width || 100;
    const nodeHeight = node.shape.height || 50;
    
    const previewWidth = 400;
    const menuRadius = 70;
    const margin = 70;
    const leftThreshold = previewWidth + margin;
    
    const menuLeft = canvasPosition.x - menuRadius;
    
    if (menuLeft < leftThreshold) {
        isAdjustingViewForNode = true;
        
        const currentView = getNetwork().getViewPosition();
        const currentScale = getNetwork().getScale();
        
        const targetX = leftThreshold + menuRadius;
        const shiftNeeded = (targetX - canvasPosition.x) / currentScale;
        
        getNetwork().moveTo({
            position: { x: currentView.x - shiftNeeded, y: currentView.y },
            scale: currentScale,
            animation: false
        });
        
        setTimeout(() => {
            const newCanvasPosition = getNetwork().canvasToDOM(nodePosition);
            const screenX = rect.left + newCanvasPosition.x;
            const screenY = rect.top + newCanvasPosition.y;
            showRadialMenu(screenX, screenY, nodeId, nodeWidth, nodeHeight);
            showArticlePreview(nodeId);
            isAdjustingViewForNode = false;
        }, 50);
    } else {
        const screenX = rect.left + canvasPosition.x;
        const screenY = rect.top + canvasPosition.y;
        showRadialMenu(screenX, screenY, nodeId, nodeWidth, nodeHeight);
        showArticlePreview(nodeId);
    }
    
    getNetwork().setOptions({ 
        interaction: { 
            dragNodes: true,
            dragView: false,
            zoomView: false,
            hover: true,
            hoverConnectedEdges: false
        } 
    });
}
