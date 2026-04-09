// ===== GRAPH EVENT HANDLERS =====
// Canvas and network event handlers, extracted from initializeGraph()

import { getStore, getNetwork, pauseHistory, resumeHistory } from '../store/appStore.js';
import { darkenColor, getContrastColor, showNotification } from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { updateCategoryFilters } from '../ui/filters.js';
import { renderListView } from '../ui/list/sidebar.js';
import { showArticlePreview, closeArticlePreview } from '../ui/preview.js';
import { showRadialMenu, hideRadialMenu, updateRadialMenuPosition, updateRadialMenuIfActive, hideSelectionRadialMenu, hideEmptyAreaMenu } from '../ui/radial-menu.js';
import { showContextMenu, hideContextMenu } from '../ui/context-menu.js';
import {
    getZoneResizeHandle, startZoneResize, getZoneTitleClick, startEditZoneTitle,
    hideZoneDeleteButton, showZoneDeleteButton, getZoneAtPosition, findNestedZones,
    updateZoneMove, endZoneMove, updateZoneResize, endZoneResize, isNodeInZone,
    updateZoneRadialMenuPosition,
    updateZoneSizes, checkNodeZoneMembership, drawTagZones, updateZoneCursor
} from './zones.js';
import {
    startSelectionBox, startSelectionBoxDrag, updateSelectionBoxDrag, endSelectionBoxDrag,
    updateSelectionBox, endSelectionBox, hideSelectionBox, syncSelectionBoxToNodes, refreshSelectionOverlayPosition
} from './selection.js';
import {
    handleConnectionModeClick, hideEdgeMenu, showEdgeMenu, editEdgeLabelInline, updateEdgeMenuPosition,
    isControlPoint, showControlPointMenu
} from './connections.js';
import { positionNodesInZones, initializeZonesFromTags } from '../data/storage.js';

let lastEdgeClickTime = 0;
let lastEdgeClickId = null;
let isAdjustingViewForNode = false;
let pendingSelectionStart = null;
let pendingZoneSelectionIndex = -1;
let hoveredNodeId = null;

function toRgba(color, alpha) {
    if (!color) return `rgba(74, 144, 226, ${alpha})`;

    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const normalized = hex.length === 3
            ? hex.split('').map((char) => char + char).join('')
            : hex;

        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }

    return `rgba(74, 144, 226, ${alpha})`;
}

function getNodeHoverColor(node) {
    const nodeId = node?.id;
    const liveNodeColor = nodeId !== undefined ? getNetwork()?.body?.data?.nodes?.get(nodeId)?.color : null;
    const nodeColor = liveNodeColor || node?.options?.color;
    if (!nodeColor) return '#4a90e2';
    if (typeof nodeColor === 'string') return nodeColor;

    const background = nodeColor.background || nodeColor.highlight?.background || nodeColor.hover?.background;
    const border = nodeColor.border;

    // Keep the original strong blue glow for untagged/default nodes.
    if (background === '#e3f2fd' || border === '#4a90e2') {
        return '#4a90e2';
    }

    return background || border || '#4a90e2';
}

function getCanvasPointer(event) {
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    return {
        rect,
        mouseX,
        mouseY,
        canvasPosition: getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY })
    };
}

function queueZoneMove(event, zoneIndex) {
    const { canvasPosition } = getCanvasPointer(event);

    getStore().setSelectedZoneIndex(zoneIndex);
    showZoneDeleteButton(zoneIndex);
    getStore().updateZoneMoving({ startX: canvasPosition.x });
    getStore().updateZoneMoving({ startY: canvasPosition.y });
    getStore().updateZoneMoving({ zoneIndex });
    getStore().updateZoneMoving({ originalZone: { ...getStore().tagZones[zoneIndex] } });
    getStore().updateZoneMoving({ readyToMove: true });
    getStore().updateZoneMoving({ originalNodePositions: {} });

    const zone = getStore().tagZones[zoneIndex];
    getStore().appData.articles.forEach((article) => {
        if ((article.categories || []).includes(zone.tag)) {
            const pos = getNetwork().getPositions([article.id])[article.id];
            if (pos) {
                getStore().zoneMoving.originalNodePositions[article.id] = { x: pos.x, y: pos.y };
            }
        }
    });

    getStore().updateZoneMoving({ originalNestedZones: findNestedZones(zoneIndex) });
    getNetwork().redraw();
}

function maybeStartSelectionDrag(event) {
    if (!pendingSelectionStart) return false;
    if ((event.buttons & 1) === 0) {
        pendingSelectionStart = null;
        pendingZoneSelectionIndex = -1;
        return false;
    }

    const dx = Math.abs(event.clientX - pendingSelectionStart.clientX);
    const dy = Math.abs(event.clientY - pendingSelectionStart.clientY);

    if (dx <= 5 && dy <= 5) {
        return false;
    }

    if (pendingZoneSelectionIndex !== -1) {
        getStore().setSelectedZoneIndex(-1);
        hideZoneDeleteButton();
        getNetwork().redraw();
    }

    startSelectionBox(pendingSelectionStart);
    updateSelectionBox(event);
    pendingSelectionStart = null;
    pendingZoneSelectionIndex = -1;
    return true;
}

function normalizeWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return { x: event.deltaX * 16, y: event.deltaY * 16 };
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return { x: event.deltaX * window.innerWidth, y: event.deltaY * window.innerHeight };
    }

    return { x: event.deltaX, y: event.deltaY };
}

function panViewFromWheel(event) {
    const { x, y } = normalizeWheelDelta(event);
    const dx = event.shiftKey && Math.abs(x) < 0.5 ? y : x;
    const dy = event.shiftKey && Math.abs(x) < 0.5 ? 0 : y;
    const currentPos = getNetwork().getViewPosition();
    const scale = getNetwork().getScale();

    getNetwork().moveTo({
        position: {
            x: currentPos.x + dx / scale,
            y: currentPos.y + dy / scale
        },
        scale,
        animation: false
    });

        if (getStore().selectedZoneIndex !== -1) {
            requestAnimationFrame(() => updateZoneRadialMenuPosition(getStore().selectedZoneIndex));
        }
        requestAnimationFrame(() => updateRadialMenuIfActive());
        requestAnimationFrame(() => updateEdgeMenuPosition());
        requestAnimationFrame(() => refreshSelectionOverlayPosition());
}

function zoomTowardPointer(event) {
    const { y } = normalizeWheelDelta(event);
    const { mouseX, mouseY, canvasPosition } = getCanvasPointer(event);
    const currentScale = getNetwork().getScale();
    const zoomFactor = Math.exp(-y * 0.0015);
    const nextScale = Math.min(3.5, Math.max(0.15, currentScale * zoomFactor));

    if (nextScale === currentScale) return;

    const currentView = getNetwork().getViewPosition();
    const offsetX = canvasPosition.x - currentView.x;
    const offsetY = canvasPosition.y - currentView.y;
    const scaleRatio = currentScale / nextScale;
    const nextView = {
        x: canvasPosition.x - offsetX * scaleRatio,
        y: canvasPosition.y - offsetY * scaleRatio
    };

    getNetwork().moveTo({
        position: nextView,
        scale: nextScale,
        animation: false
    });
    requestAnimationFrame(() => updateRadialMenuIfActive());
    requestAnimationFrame(() => updateEdgeMenuPosition());
}

function setNodeHoverOutline(nodeId, hovering, forceReset = false) {
    const node = getNetwork()?.body?.nodes?.[nodeId];
    if (!node || !node.options) return;

    if (hovering) {
        const hoverColor = getNodeHoverColor(node);
        node.options.shadow = {
            enabled: true,
            color: toRgba(hoverColor, 0.45),
            size: 16,
            x: 0,
            y: 0
        };
        node.options.borderWidth = Math.max(node.options.borderWidth || 3, 3.5);
    } else if (forceReset || getStore().selectedNodeId !== nodeId) {
        node.options.shadow = false;
        node.options.borderWidth = 3;
    }
}

function clearHoveredNodeState(forceReset = false) {
    if (hoveredNodeId === null) return;
    setNodeHoverOutline(hoveredNodeId, false, forceReset);
    if (forceReset) {
        hoveredNodeId = null;
    }
    getNetwork()?.redraw();
}

export function setupCanvasEvents() {
    const canvas = getNetwork().canvas.frame.canvas;
    
    canvas.addEventListener('mousedown', (event) => {
        hideContextMenu();

        if (event.button !== 0) {
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            return;
        }

        if (getStore().connectionMode.active) {
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            return;
        }

        if (getStore().isGalleryViewer) {
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            return;
        }

        const resizeHandle = getZoneResizeHandle(event);
        if (resizeHandle.zone !== null) {
            event.preventDefault();
            event.stopPropagation();
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            startZoneResize(event, resizeHandle.zoneIndex, resizeHandle.handle);
            return;
        }

        const titleClick = getZoneTitleClick(event);
        if (titleClick.zone !== null) {
            if (event.detail > 1) {
                pendingSelectionStart = null;
                pendingZoneSelectionIndex = -1;
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            queueZoneMove(event, titleClick.zoneIndex);
            return;
        }

        const clickPos = { x: event.offsetX, y: event.offsetY };
        const nodeId = getNetwork().getNodeAt(clickPos);
        const edgeId = getNetwork().getEdgeAt(clickPos);

        if (nodeId || edgeId) {
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            return;
        }

        if (getStore().multiSelection.selectionBox && getStore().multiSelection.selectionBox.style.display !== 'none') {
            const { mouseX, mouseY } = getCanvasPointer(event);
            const boxLeft = parseFloat(getStore().multiSelection.selectionBox.style.left);
            const boxTop = parseFloat(getStore().multiSelection.selectionBox.style.top);
            const boxWidth = parseFloat(getStore().multiSelection.selectionBox.style.width);
            const boxHeight = parseFloat(getStore().multiSelection.selectionBox.style.height);

            if (mouseX >= boxLeft && mouseX <= boxLeft + boxWidth &&
                mouseY >= boxTop && mouseY <= boxTop + boxHeight) {
                event.preventDefault();
                event.stopPropagation();
                pendingSelectionStart = null;
                pendingZoneSelectionIndex = -1;
                startSelectionBoxDrag(event, mouseX, mouseY, boxLeft, boxTop);
                return;
            }
        }

        const zoneClick = getZoneAtPosition(event);
        if (zoneClick.zone !== null) {
            event.preventDefault();
            event.stopPropagation();
            if (zoneClick.zoneIndex === getStore().selectedZoneIndex) {
                queueZoneMove(event, zoneClick.zoneIndex);
                return;
            }
            pendingSelectionStart = { clientX: event.clientX, clientY: event.clientY };
            pendingZoneSelectionIndex = zoneClick.zoneIndex;
            return;
        }

        if (getStore().selectedZoneIndex !== -1) {
            getStore().setSelectedZoneIndex(-1);
            hideZoneDeleteButton();
            getNetwork().redraw();
        }

        event.preventDefault();
        event.stopPropagation();
        pendingSelectionStart = { clientX: event.clientX, clientY: event.clientY };
        pendingZoneSelectionIndex = -1;
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
        event.stopPropagation();

        const clickPos = { x: event.offsetX, y: event.offsetY };
        const nodeId = getNetwork().getNodeAt(clickPos);
        const edgeId = getNetwork().getEdgeAt(clickPos);
        const zoneClick = !nodeId && !edgeId ? getZoneAtPosition(event) : { zoneIndex: -1, zone: null };
        const { canvasPosition } = getCanvasPointer(event);

        hideRadialMenu();
        hideEdgeMenu();
        hideZoneDeleteButton();
        hideSelectionRadialMenu();

        if (nodeId) {
            const isMultiContext = getStore().multiSelection.selectedNodes.includes(nodeId) &&
                getStore().multiSelection.selectedNodes.length > 1;

            if (!isMultiContext) {
                hideSelectionBox();
                getStore().updateMultiSelection({ selectedNodes: [] });
                getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            }
            getStore().setSelectedNodeId(isMultiContext ? null : nodeId);
            getStore().setSelectedEdgeId(null);
            getStore().setSelectedZoneIndex(-1);
            getNetwork().selectNodes(isMultiContext ? getStore().multiSelection.selectedNodes : [nodeId]);
        } else if (edgeId) {
            hideSelectionBox();
            getStore().updateMultiSelection({ selectedNodes: [] });
            getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            getStore().setSelectedNodeId(null);
            getStore().setSelectedEdgeId(edgeId);
            getStore().setSelectedZoneIndex(-1);
        } else if (zoneClick.zone !== null) {
            hideSelectionBox();
            getStore().updateMultiSelection({ selectedNodes: [] });
            getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            getStore().setSelectedNodeId(null);
            getStore().setSelectedEdgeId(null);
            getStore().setSelectedZoneIndex(zoneClick.zoneIndex);
            showZoneDeleteButton(zoneClick.zoneIndex);
            getNetwork().redraw();
        }

        showContextMenu(event.clientX, event.clientY, {
            canvasPosition,
            nodeId,
            edgeId,
            zoneIndex: zoneClick.zoneIndex
        });
    }, true);

    canvas.addEventListener('wheel', (event) => {
        if (getStore().zoneEditing.active) return;

        event.preventDefault();
        hideContextMenu();

        if (event.ctrlKey || event.metaKey) {
            zoomTowardPointer(event);
        } else {
            panViewFromWheel(event);
        }
    }, { passive: false });
    
    canvas.addEventListener('mousemove', (event) => {
        if (maybeStartSelectionDrag(event)) {
            return;
        }

        if (getStore().zoneMoving.readyToMove) {
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
        
        if (!getStore().zoneMoving.active && !getStore().zoneResizing.active && !getStore().multiSelection.active && !getStore().multiSelection.boxDragging && !getStore().connectionMode.active) {
            updateZoneCursor(event);
        }
    }, true);
    
    canvas.addEventListener('mouseup', (event) => {
        if (event.button === 0 && pendingSelectionStart) {
            if (pendingZoneSelectionIndex !== -1) {
                getStore().setSelectedZoneIndex(pendingZoneSelectionIndex);
                showZoneDeleteButton(pendingZoneSelectionIndex);
                getNetwork().redraw();
            }
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
        }

        if (event.button === 0 && getStore().isGalleryViewer) {
            return;
        }

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
        if (!getStore().zoneMoving.active && !getStore().zoneResizing.active && !getStore().multiSelection.active && !getStore().multiSelection.boxDragging && !getStore().connectionMode.active && !getStore().zoneEditing.active) {
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
            const clickedNodeId = getNetwork().getNodeAt(params.pointer.DOM) ?? params.nodes[params.nodes.length - 1];
            const nodeId = clickedNodeId;
            
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

                const baseSelection = getStore().multiSelection.selectedNodes.length > 0
                    ? [...getStore().multiSelection.selectedNodes]
                    : (getStore().selectedNodeId !== null ? [getStore().selectedNodeId] : []);

                const nextSelectedNodes = baseSelection.includes(nodeId)
                    ? baseSelection.filter((id) => id !== nodeId)
                    : [...baseSelection, nodeId];

                console.log('→ Selection now:', nextSelectedNodes);

                if (nextSelectedNodes.length > 0) {
                    syncSelectionBoxToNodes(nextSelectedNodes);
                    getStore().setSelectedNodeId(nextSelectedNodes.length === 1 ? nextSelectedNodes[0] : null);
                } else {
                    clearHoveredNodeState(true);
                    hideSelectionRadialMenu();
                    hideSelectionBox();
                    getStore().updateMultiSelection({ selectedNodes: [] });
                    getStore().updateMultiSelection({ selectedZonesForDrag: [] });
                    getStore().setSelectedNodeId(null);
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
            clearHoveredNodeState(true);
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
        // Pause undo history during drag so the whole drag = one undo step
        if (params.nodes && params.nodes.length > 0) {
            pauseHistory();
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

        if (params.nodes.length === 0 && getStore().selectedZoneIndex !== -1) {
            updateZoneRadialMenuPosition(getStore().selectedZoneIndex);
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
                    const hasTag = (article.categories || []).includes(zone.tag);
                    
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
            // Resume history and record ONE snapshot for the whole drag
            resumeHistory();
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
        if (hoveredNodeId !== null && hoveredNodeId !== params.node) {
            setNodeHoverOutline(hoveredNodeId, false);
        }

        hoveredNodeId = params.node;
        setNodeHoverOutline(params.node, true);

        if (getStore().connectionMode.active && params.node !== getStore().connectionMode.fromNodeId) {
            getNetwork().canvas.body.container.style.cursor = "pointer";
        }

        getNetwork().redraw();
    });
    
    getNetwork().on('blurNode', () => {
        if (hoveredNodeId !== null) {
            setNodeHoverOutline(hoveredNodeId, false);
            hoveredNodeId = null;
            getNetwork().redraw();
        }

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

        hideContextMenu();

        if (getStore().selectedZoneIndex !== -1) {
            requestAnimationFrame(() => updateZoneRadialMenuPosition(getStore().selectedZoneIndex));
        }
        requestAnimationFrame(() => updateRadialMenuIfActive());
        requestAnimationFrame(() => updateEdgeMenuPosition());
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
    const menuButtonSize = 44;
    const previewThreshold = window.innerWidth - previewWidth - margin;
    const menuRight = rect.left + canvasPosition.x + nodeWidth / 2 + menuRadius + menuButtonSize;
    
    if (menuRight > previewThreshold) {
        isAdjustingViewForNode = true;
        
        const currentView = getNetwork().getViewPosition();
        const currentScale = getNetwork().getScale();
        
        const targetScreenX = previewThreshold - menuRadius - menuButtonSize - nodeWidth / 2;
        const shiftNeeded = (canvasPosition.x - targetScreenX) / currentScale;
        
        getNetwork().moveTo({
            position: { x: currentView.x + shiftNeeded, y: currentView.y },
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
