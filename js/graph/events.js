// ===== GRAPH EVENT HANDLERS =====
// Canvas and network event handlers, extracted from initializeGraph()

import { state } from '../core/state.js';
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
    const canvas = state.network.canvas.frame.canvas;
    
    canvas.addEventListener('mousedown', (event) => {
        // In gallery viewer mode - allow node selection, right-click panning only
        
        if (state.isGalleryViewer) {
            // Right-click for panning (same as normal editor)
            if (event.button === 2) {
                event.preventDefault();
                event.stopPropagation();
                state.isDraggingView = true;
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
            state.isDraggingView = true;
            dragStartPos = { x: event.clientX, y: event.clientY };
            
            // Hide selection box and radial menus when starting to pan
            hideSelectionBox();
            hideRadialMenu();
            hideSelectionRadialMenu();
            return;
        }
        
        // Left click interactions (only in normal editor mode)
        if (event.button === 0 && !state.connectionMode.active) {
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
                state.selectedZoneIndex = titleClick.zoneIndex;
                
                const canvas = state.network.canvas.frame.canvas;
                const rect = canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const mousePos = state.network.DOMtoCanvas({ x: mouseX, y: mouseY });
                
                state.zoneMoving.startX = mousePos.x;
                state.zoneMoving.startY = mousePos.y;
                state.zoneMoving.zoneIndex = titleClick.zoneIndex;
                state.zoneMoving.originalZone = { ...state.tagZones[titleClick.zoneIndex] };
                state.zoneMoving.readyToMove = true;
                
                const zone = state.tagZones[titleClick.zoneIndex];
                state.zoneMoving.originalNodePositions = {};
                state.appData.articles.forEach(article => {
                    if (article.categories.includes(zone.tag)) {
                        const pos = state.network.getPositions([article.id])[article.id];
                        if (pos) {
                            state.zoneMoving.originalNodePositions[article.id] = { x: pos.x, y: pos.y };
                        }
                    }
                });
                
                // Find and store nested zones
                state.zoneMoving.originalNestedZones = findNestedZones(titleClick.zoneIndex);
                
                state.network.redraw();
                return;
            }
            
            // Check if clicking inside a zone or selection box
            const clickPos = { x: event.offsetX, y: event.offsetY };
            const nodeId = state.network.getNodeAt(clickPos);
            const edgeId = state.network.getEdgeAt(clickPos);
            
            if (!nodeId && !edgeId) {
                // PRIORITY 1: Check if clicking inside an existing selection box FIRST
                if (state.multiSelection.selectionBox && state.multiSelection.selectionBox.style.display !== 'none') {
                    const canvas = state.network.canvas.frame.canvas;
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    
                    const boxLeft = parseFloat(state.multiSelection.selectionBox.style.left);
                    const boxTop = parseFloat(state.multiSelection.selectionBox.style.top);
                    const boxWidth = parseFloat(state.multiSelection.selectionBox.style.width);
                    const boxHeight = parseFloat(state.multiSelection.selectionBox.style.height);
                    
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
                    state.selectedZoneIndex = zoneClick.zoneIndex;
                    
                    const canvas = state.network.canvas.frame.canvas;
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    const mousePos = state.network.DOMtoCanvas({ x: mouseX, y: mouseY });
                    
                    state.zoneMoving.startX = mousePos.x;
                    state.zoneMoving.startY = mousePos.y;
                    state.zoneMoving.zoneIndex = zoneClick.zoneIndex;
                    state.zoneMoving.originalZone = { ...state.tagZones[zoneClick.zoneIndex] };
                    state.zoneMoving.readyToMove = true;
                    
                    const zone = state.tagZones[zoneClick.zoneIndex];
                    state.zoneMoving.originalNodePositions = {};
                    state.appData.articles.forEach(article => {
                        if (article.categories.includes(zone.tag)) {
                            const pos = state.network.getPositions([article.id])[article.id];
                            if (pos) {
                                state.zoneMoving.originalNodePositions[article.id] = { x: pos.x, y: pos.y };
                            }
                        }
                    });
                    
                    // Find and store nested zones
                    state.zoneMoving.originalNestedZones = findNestedZones(zoneClick.zoneIndex);
                    
                    state.network.redraw();
                    return;
                } else {
                    if (state.selectedZoneIndex !== -1) {
                        state.selectedZoneIndex = -1;
                        hideZoneDeleteButton();
                        state.network.redraw();
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
        if (!state.connectionMode.active && !state.isGalleryViewer) {
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
        if (state.isDraggingView) {
            const dx = event.clientX - dragStartPos.x;
            const dy = event.clientY - dragStartPos.y;
            
            const currentPos = state.network.getViewPosition();
            const scale = state.network.getScale();
            
            state.network.moveTo({
                position: {
                    x: currentPos.x - dx / scale,
                    y: currentPos.y - dy / scale
                },
                animation: false
            });
            
            dragStartPos = { x: event.clientX, y: event.clientY };
        } else if (state.zoneMoving.readyToMove) {
            const canvas = state.network.canvas.frame.canvas;
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const mousePos = state.network.DOMtoCanvas({ x: mouseX, y: mouseY });
            
            const dx = Math.abs(mousePos.x - state.zoneMoving.startX);
            const dy = Math.abs(mousePos.y - state.zoneMoving.startY);
            
            if (dx > 5 || dy > 5) {
                state.zoneMoving.active = true;
                state.zoneMoving.readyToMove = false;
                
                state.network.setOptions({
                    interaction: {
                        dragNodes: false,
                        dragView: false,
                        zoomView: false
                    }
                });
            }
        } else if (state.zoneMoving.active) {
            event.preventDefault();
            event.stopPropagation();
            updateZoneMove(event);
        } else if (state.zoneResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            updateZoneResize(event);
        } else if (state.multiSelection.boxDragging) {
            event.preventDefault();
            event.stopPropagation();
            updateSelectionBoxDrag(event);
        } else if (state.multiSelection.active) {
            event.preventDefault();
            event.stopPropagation();
            updateSelectionBox(event);
        }
        
        if (!state.isDraggingView && !state.zoneMoving.active && !state.zoneResizing.active && !state.multiSelection.active && !state.multiSelection.boxDragging && !state.connectionMode.active) {
            updateZoneCursor(event);
        }
    }, true);
    
    canvas.addEventListener('mouseup', (event) => {
        
        // Stop panning on right click release
        if (event.button === 2) {
            state.isDraggingView = false;
            return;
        }
        
        // Stop panning on left click release in gallery viewer
        if (event.button === 0 && state.isGalleryViewer) {
            if (state.isDraggingView) {
                state.isDraggingView = false;
            }
            return; // Exit early - no other interactions in gallery viewer
        }
        
        // Normal editor interactions for left click
        if (event.button === 0 && (state.zoneMoving.active || state.zoneMoving.readyToMove)) {
            event.preventDefault();
            event.stopPropagation();
            
            if (state.zoneMoving.readyToMove && !state.zoneMoving.active && state.selectedZoneIndex !== -1) {
                showZoneDeleteButton(state.selectedZoneIndex);
            }
            
            if (state.zoneMoving.active) {
                endZoneMove();
            }
            state.zoneMoving.readyToMove = false;
            state.zoneMoving.active = false;
        } else if (event.button === 0 && state.zoneResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            endZoneResize();
        } else if (event.button === 0 && state.multiSelection.boxDragging) {
            event.preventDefault();
            event.stopPropagation();
            endSelectionBoxDrag();
        } else if (event.button === 0 && state.multiSelection.active) {
            event.preventDefault();
            event.stopPropagation();
            endSelectionBox();
        }
    }, true);
    
    state.network.canvas.body.container.addEventListener('mousemove', (event) => {
        if (!state.isDraggingView && !state.zoneMoving.active && !state.zoneResizing.active && !state.multiSelection.active && !state.multiSelection.boxDragging && !state.connectionMode.active && !state.zoneEditing.active) {
            updateZoneCursor(event);
        }
    }, false);
}

export function setupNetworkEvents() {
    state.network.on('stabilizationIterationsDone', function () {
        console.log('=== Graph stabilization complete ===');
        console.log('Saved positions available:', state.savedNodePositions ? Object.keys(state.savedNodePositions).length : 0);
        
        if (state.savedNodePositions && Object.keys(state.savedNodePositions).length > 0) {
            console.log('Restoring saved positions for', Object.keys(state.savedNodePositions).length, 'nodes');
            const nodesToUpdate = [];
            Object.keys(state.savedNodePositions).forEach(nodeId => {
                const pos = state.savedNodePositions[nodeId];
                nodesToUpdate.push({
                    id: parseInt(nodeId),
                    x: pos.x,
                    y: pos.y,
                    fixed: { x: false, y: false }
                });
            });
            if (nodesToUpdate.length > 0) {
                state.network.body.data.nodes.update(nodesToUpdate);
                console.log('✓ Applied saved positions to', nodesToUpdate.length, 'nodes');
                
                setTimeout(() => {
                    if (typeof checkNodeZoneMembership === 'function' && state.tagZones.length > 0) {
                        console.log('🎨 Checking zone membership after project load...');
                        checkNodeZoneMembership();
                    }
                }, 100);
            }
        } else {
            console.log('No saved positions, initializing zones from tags');
            if (state.tagZones.length === 0 && state.appData.articles.length > 0) {
                initializeZonesFromTags();
            }
            positionNodesInZones();
            state.network.fit();
        }
    });
    
    state.network.on('click', (params) => {
        if (state.connectionMode.active) {
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
                
                if (!state.multiSelection.selectedNodes.includes(nodeId)) {
                    state.multiSelection.selectedNodes.push(nodeId);
                    state.selectedNodeId = nodeId;
                } else {
                    state.multiSelection.selectedNodes = state.multiSelection.selectedNodes.filter(id => id !== nodeId);
                    state.selectedNodeId = state.multiSelection.selectedNodes.length > 0 ? state.multiSelection.selectedNodes[state.multiSelection.selectedNodes.length - 1] : null;
                }
                
                console.log('→ Selection now:', state.multiSelection.selectedNodes);
                
                if (state.multiSelection.selectedNodes.length > 0) {
                    state.network.selectNodes(state.multiSelection.selectedNodes);
                    
                    const positions = state.network.getPositions(state.multiSelection.selectedNodes);
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
                    
                    const topLeft = state.network.canvasToDOM({ x: minX, y: minY });
                    const bottomRight = state.network.canvasToDOM({ x: maxX, y: maxY });
                    
                    const graphContainer = document.getElementById('graphContainer');
                    const containerRect = graphContainer.getBoundingClientRect();
                    
                    if (!state.multiSelection.selectionBox) {
                        state.multiSelection.selectionBox = document.createElement('div');
                        state.multiSelection.selectionBox.id = 'selectionBox';
                        state.multiSelection.selectionBox.style.position = 'absolute';
                        state.multiSelection.selectionBox.style.pointerEvents = 'none';
                        state.multiSelection.selectionBox.style.zIndex = '1000';
                        document.querySelector('#graphContainer > div').appendChild(state.multiSelection.selectionBox);
                    }
                    
                    state.multiSelection.selectionBox.style.border = '2px dashed #4a90e2';
                    state.multiSelection.selectionBox.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                    state.multiSelection.selectionBox.style.left = topLeft.x + 'px';
                    state.multiSelection.selectionBox.style.top = topLeft.y + 'px';
                    state.multiSelection.selectionBox.style.width = (bottomRight.x - topLeft.x) + 'px';
                    state.multiSelection.selectionBox.style.height = (bottomRight.y - topLeft.y) + 'px';
                    state.multiSelection.selectionBox.style.display = 'block';
                    
                    console.log('📦 Calculating zones for selected nodes...');
                    const zonesSet = new Set();
                    state.multiSelection.selectedNodes.forEach(nodeId => {
                        const article = state.appData.articles.find(a => a.id === nodeId);
                        console.log(`Node ${nodeId} categories:`, article?.categories);
                        if (article && article.categories.length > 0) {
                            const nodeZones = [];
                            article.categories.forEach(tag => {
                                const zoneIdx = state.tagZones.findIndex(z => z.tag === tag);
                                if (zoneIdx !== -1) {
                                    const zone = state.tagZones[zoneIdx];
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
                    state.multiSelection.selectedZonesForDrag = Array.from(zonesSet);
                    
                    const menuX = containerRect.left + (topLeft.x + bottomRight.x) / 2;
                    const menuY = containerRect.top + topLeft.y - 30;
                    
                    showSelectionRadialMenu(menuX, menuY);
                } else {
                    hideSelectionRadialMenu();
                    hideSelectionBox();
                    state.network.unselectAll();
                }
                
                closeArticlePreview();
                hideRadialMenu();
                
                return;
            }
            
            // Set selected node ID for keyboard shortcuts
            state.selectedNodeId = nodeId;
            state.selectedEdgeId = null;
            console.log('✅ Set selectedNodeId to:', state.selectedNodeId);
            
            hideSelectionBox();
            
            if (state.selectedNodeId !== null && state.selectedNodeId !== nodeId) {
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
            
            if (!state.connectionMode.active) {
                state.selectedEdgeId = edgeId;
                state.selectedNodeId = null;
                
                hideRadialMenu();
                hideZoneDeleteButton();
                hideSelectionRadialMenu();
                closeArticlePreview();
                
                hideSelectionBox();
                state.multiSelection.selectedNodes = [];
                state.multiSelection.selectedZonesForDrag = [];
                if (state.network) state.network.unselectAll();
                
                const container = document.getElementById('graphContainer');
                const rect = container.getBoundingClientRect();
                
                const screenX = rect.left + params.pointer.DOM.x + 30;
                const screenY = rect.top + params.pointer.DOM.y - 22;
                
                showEdgeMenu(screenX, screenY, edgeId);
                
                state.network.setOptions({ 
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
            state.multiSelection.selectedNodes = [];
            state.multiSelection.selectedZonesForDrag = [];
            if (state.network) state.network.unselectAll();
        }
    });
    
    // Prevent dragging in gallery viewer mode
    state.network.on('dragStart', (params) => {
        if (state.isGalleryViewer && params.nodes && params.nodes.length > 0) {
            return false;
        }
    });
    
    state.network.on('dragging', (params) => {
        if (state.isGalleryViewer) {
            return false;
        }
        
        if (params.nodes.length > 0 && !state.multiSelection.wasDragging) {
            state.multiSelection.wasDragging = true;
            
            const isDraggingSelection = params.nodes.some(nodeId => 
                state.multiSelection.selectedNodes.includes(nodeId)
            );
            
            if (isDraggingSelection) {
                state.multiSelection.menuActive = document.getElementById('selectionRadialMenu')?.classList.contains('active') || 
                                           state.multiSelection.selectedNodes.length > 0;
                console.log('Dragging selection, saved state:', state.multiSelection);
                
                if (state.multiSelection.selectedZonesForDrag.length > 0) {
                    state.multiSelection.zonesDragStart = {};
                    state.multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
                        const zone = state.tagZones[zoneIdx];
                        state.multiSelection.zonesDragStart[zoneIdx] = { x: zone.x, y: zone.y };
                    });
                    
                    const firstNode = params.nodes[0];
                    const pos = state.network.getPositions([firstNode])[firstNode];
                    state.multiSelection.nodeDragStart = { x: pos.x, y: pos.y };
                }
            }
        }
        
        if (params.nodes.length > 0 && state.multiSelection.selectedZonesForDrag.length > 0 && state.multiSelection.nodeDragStart) {
            const firstNode = params.nodes[0];
            const currentPos = state.network.getPositions([firstNode])[firstNode];
            
            const dx = currentPos.x - state.multiSelection.nodeDragStart.x;
            const dy = currentPos.y - state.multiSelection.nodeDragStart.y;
            
            state.multiSelection.selectedZonesForDrag.forEach(zoneIdx => {
                const zone = state.tagZones[zoneIdx];
                const startPos = state.multiSelection.zonesDragStart[zoneIdx];
                zone.x = startPos.x + dx;
                zone.y = startPos.y + dy;
            });
            
            state.network.redraw();
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
            if (nodeId === state.selectedNodeId) {
                const nodePosition = state.network.getPositions([nodeId])[nodeId];
                const canvasPosition = state.network.canvasToDOM(nodePosition);
                
                const container = document.getElementById('graphContainer');
                const rect = container.getBoundingClientRect();
                
                const screenX = rect.left + canvasPosition.x;
                const screenY = rect.top + canvasPosition.y;
                
                const node = state.network.body.nodes[nodeId];
                const nodeWidth = node.shape.width || 100;
                const nodeHeight = node.shape.height || 50;
                
                updateRadialMenuPosition(screenX, screenY, nodeWidth, nodeHeight);
            }
        }
        
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const nodePos = state.network.getPositions([nodeId])[nodeId];
            const article = state.appData.articles.find(a => a.id === nodeId);
            
            if (article) {
                state.tagZones.forEach(zone => {
                    const isInZone = isNodeInZone(nodePos, zone);
                    const hasTag = article.categories.includes(zone.tag);
                    
                    if (isInZone && !hasTag) {
                        article.categories.push(zone.tag);
                        state.network.body.data.nodes.update({
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
                        article.categories = article.categories.filter(c => c !== zone.tag);
                        state.network.body.data.nodes.update({
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
    
    state.network.on('dragEnd', (params) => {
        if (state.isGalleryViewer) {
            return false;
        }
        
        if (params.nodes.length > 0) {
            if (state.multiSelection.selectedZonesForDrag.length > 0) {
                save(true);
            }
            
            state.multiSelection.zonesDragStart = {};
            state.multiSelection.nodeDragStart = null;
            
            updateZoneSizes();
            checkNodeZoneMembership();
            
            const positions = state.network.getPositions();
            state.savedNodePositions = positions;
            console.log('Node dragged - positions updated in memory:', Object.keys(positions).length, 'nodes');
            
            const draggedControlPoints = params.nodes.filter(nodeId => nodeId < 0);
            
            if (draggedControlPoints.length > 0) {
                console.log('🎯 Control point(s) moved:', draggedControlPoints);
                
                const edgesToRebuild = new Set();
                for (const edgeId in state.edgeControlPoints) {
                    const controlPoints = state.edgeControlPoints[edgeId];
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
            
            state.multiSelection.wasDragging = false;
            
            state.network.redraw();
        }
    });
    
    state.network.on('stabilizationProgress', (params) => {
        updateRadialMenuIfActive();
    });
    
    state.network.on('beforeDrawing', (ctx) => {
        // Draw grid if enabled
        if (state.gridEnabled) {
            const scale = state.network.getScale();
            const viewPosition = state.network.getViewPosition();
            const canvasSize = state.network.canvas.frame.canvas;
            
            const topLeft = state.network.DOMtoCanvas({ x: 0, y: 0 });
            const bottomRight = state.network.DOMtoCanvas({ 
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
    
    state.network.on('hoverNode', (params) => {
        if (state.connectionMode.active && params.node !== state.connectionMode.fromNodeId) {
            state.network.canvas.body.container.style.cursor = "pointer";
        }
    });
    
    state.network.on('blurNode', () => {
        if (state.connectionMode.active) {
            state.network.canvas.body.container.style.cursor = "crosshair";
        }
    });
    
    state.network.on('zoom', () => {
        if (state.multiSelection.selectionBox && state.multiSelection.selectionBox.style.display !== 'none') {
            hideSelectionBox();
            hideSelectionRadialMenu();
            hideEmptyAreaMenu();
            if (state.network) state.network.unselectAll();
            state.multiSelection.selectedNodes = [];
            state.multiSelection.selectedZonesForDrag = [];
            state.multiSelection.emptyAreaSelection = null;
        }
    });
}

export function openRadialMenuForNode(nodeId) {
    if (isAdjustingViewForNode) return;
    
    state.selectedNodeId = nodeId;
    state.selectedEdgeId = null;
    
    const nodePosition = state.network.getPositions([nodeId])[nodeId];
    const canvasPosition = state.network.canvasToDOM(nodePosition);
    
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    
    const node = state.network.body.nodes[nodeId];
    const nodeWidth = node.shape.width || 100;
    const nodeHeight = node.shape.height || 50;
    
    const previewWidth = 400;
    const menuRadius = 70;
    const margin = 70;
    const leftThreshold = previewWidth + margin;
    
    const menuLeft = canvasPosition.x - menuRadius;
    
    if (menuLeft < leftThreshold) {
        isAdjustingViewForNode = true;
        
        const currentView = state.network.getViewPosition();
        const currentScale = state.network.getScale();
        
        const targetX = leftThreshold + menuRadius;
        const shiftNeeded = (targetX - canvasPosition.x) / currentScale;
        
        state.network.moveTo({
            position: { x: currentView.x - shiftNeeded, y: currentView.y },
            scale: currentScale,
            animation: false
        });
        
        setTimeout(() => {
            const newCanvasPosition = state.network.canvasToDOM(nodePosition);
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
    
    state.network.setOptions({ 
        interaction: { 
            dragNodes: true,
            dragView: false,
            zoomView: false,
            hover: true,
            hoverConnectedEdges: false
        } 
    });
}
