// ===== GRAPH EVENT HANDLERS =====
// Canvas and network event handlers, extracted from initializeGraph()

import { getStore, getNetwork, pauseHistory, resumeHistory } from '../store/appStore.js';
import { getNodeAppearanceForZones } from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { showArticlePreview, closeArticlePreview } from '../ui/preview.js';
import { showRadialMenu, hideRadialMenu, updateRadialMenuPosition, updateRadialMenuIfActive, hideSelectionRadialMenu, hideEmptyAreaMenu } from '../ui/radial-menu.js';
import { showContextMenu, hideContextMenu } from '../ui/context-menu.js';
import { disableTouchZoneCreationMode, getMobileBottomDeadzonePx, isPhoneViewport } from '../ui/touch-zone-mode.js';
import {
    getZoneResizeHandle, startZoneResize, getZoneTitleClick, startEditZoneTitle,
    hideZoneDeleteButton, showZoneDeleteButton, getZoneAtPosition, findNestedZones,
    updateZoneMove, endZoneMove, updateZoneResize, endZoneResize, isNodeInZone,
    updateZoneRadialMenuPosition,
    updateZoneSizes, checkNodeZoneMembership, drawTagZones, updateZoneCursor,
    pruneStaleAutoNumberedZones
} from './zones.js';
import {
    startSelectionBox, startSelectionBoxDrag, updateSelectionBoxDrag, endSelectionBoxDrag,
    updateSelectionBox, endSelectionBox, hideSelectionBox, syncSelectionBoxToNodes, refreshSelectionOverlayPosition
} from './selection.js';
import {
    handleConnectionModeClick, hideEdgeMenu, showEdgeMenu, editEdgeLabelInline, updateEdgeMenuPosition,
    isControlPoint, showControlPointMenu, getActualEdgeId, rebuildEdgeWithControlPoints, syncControlPointNodes
} from './connections.js';
import {
    clearLockedEdgeLabelCenters,
    drawEdgeLabels,
    getEdgeLabelAtPosition,
    getEdgeLabelGeometry,
    getEdgeLabelLayoutFromGeometry,
    getEdgeLabelMoveThreshold,
    getEdgeLabelResizeHandleAtPosition,
    isEdgeLabelAtDefaultLocation,
    setLockedEdgeLabelCenter,
} from './edge-labels.js';
import { positionNodesInZones, initializeZonesFromTags } from '../data/storage.js';

let lastEdgeClickTime = 0;
let lastEdgeClickId = null;
let isAdjustingViewForNode = false;
let pendingSelectionStart = null;
let pendingZoneSelectionIndex = -1;
let hoveredNodeId = null;
let suppressNextNetworkBackgroundClick = false;
let suppressNextNetworkClick = false;
let suppressNextNetworkDoubleClick = false;
let lastCanvasPointerPosition = null;
let suppressNextNetworkClickTimer = null;
let preservedDraggedEdgeLabelCenters = new Map();

export function getLastCanvasPointerPosition() {
    return lastCanvasPointerPosition;
}

function armSuppressNextNetworkClick(timeoutMs = 180) {
    suppressNextNetworkClick = true;

    if (suppressNextNetworkClickTimer !== null) {
        window.clearTimeout(suppressNextNetworkClickTimer);
    }

    suppressNextNetworkClickTimer = window.setTimeout(() => {
        suppressNextNetworkClick = false;
        suppressNextNetworkClickTimer = null;
    }, timeoutMs);
}

function isReadOnlyInteractionMode() {
    return getStore().isReadOnlyMode || getStore().isGalleryViewer;
}

const TOUCH_LONG_PRESS_MS = 550;
const TOUCH_MOVE_TOLERANCE = 10;

const touchState = {
    active: false,
    touchId: null,
    startClientX: 0,
    startClientY: 0,
    startViewPosition: null,
    canPan: false,
    zoneSelectionArmed: false,
    panning: false,
    selection: false,
    longPressTriggered: false,
    longPressTimer: null,
};

const pinchState = {
    active: false,
    lastDistance: 0,
    lastCenter: null,
};

function updateTouchDrivenZoneMove(event) {
    if (getStore().zoneMoving.readyToMove) {
        const canvas = getNetwork().canvas.frame.canvas;
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });

        const dx = Math.abs(mousePos.x - getStore().zoneMoving.startX);
        const dy = Math.abs(mousePos.y - getStore().zoneMoving.startY);

        if (dx > 5 || dy > 5) {
            pauseHistory();
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
        updateZoneMove(event);
    }
}

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

function rememberCanvasPointer(event) {
    const { canvasPosition } = getCanvasPointer(event);
    lastCanvasPointerPosition = canvasPosition;
    return canvasPosition;
}

function clearTouchLongPressTimer() {
    if (touchState.longPressTimer !== null) {
        window.clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
    }
}

function resetPinchState() {
    pinchState.active = false;
    pinchState.lastDistance = 0;
    pinchState.lastCenter = null;
}

function resetTouchState() {
    clearTouchLongPressTimer();
    touchState.active = false;
    touchState.touchId = null;
    touchState.startClientX = 0;
    touchState.startClientY = 0;
    touchState.startViewPosition = null;
    touchState.canPan = false;
    touchState.zoneSelectionArmed = false;
    touchState.panning = false;
    touchState.selection = false;
    touchState.longPressTriggered = false;
}

function keepPhoneNodeVisible(nodeId) {
    if (!isPhoneViewport() || !getNetwork() || !nodeId) return;

    const preview = document.getElementById('articlePreview');
    const container = document.getElementById('graphContainer');
    if (!preview || !container) return;

    const nodeBounds = getNetwork().getBoundingBox(nodeId);
    const bottomRight = getNetwork().canvasToDOM({ x: nodeBounds.right, y: nodeBounds.bottom });
    const rect = container.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const bottomSheetTop = preview.classList.contains('active')
        ? previewRect.top
        : window.innerHeight - getMobileBottomDeadzonePx();
    const maxNodeBottom = bottomSheetTop - 96;
    const nodeBottom = rect.top + bottomRight.y;

    if (nodeBottom <= maxNodeBottom) return;

    const currentView = getNetwork().getViewPosition();
    const scale = Math.max(getNetwork().getScale(), 0.15);
    getNetwork().moveTo({
        position: {
            x: currentView.x,
            y: currentView.y + ((nodeBottom - maxNodeBottom) / scale),
        },
        scale,
        animation: false,
    });
}

function getTouchDistance(firstTouch, secondTouch) {
    return Math.hypot(
        secondTouch.clientX - firstTouch.clientX,
        secondTouch.clientY - firstTouch.clientY
    );
}

function getTouchCenter(firstTouch, secondTouch) {
    return {
        clientX: (firstTouch.clientX + secondTouch.clientX) / 2,
        clientY: (firstTouch.clientY + secondTouch.clientY) / 2,
    };
}

function startPinchGesture(touches) {
    if (touches.length < 2) return;

    const [firstTouch, secondTouch] = touches;
    pinchState.active = true;
    pinchState.lastDistance = getTouchDistance(firstTouch, secondTouch);
    pinchState.lastCenter = getTouchCenter(firstTouch, secondTouch);
}

function updatePinchGesture(touches) {
    if (!pinchState.active || touches.length < 2) return;

    const [firstTouch, secondTouch] = touches;
    const currentDistance = getTouchDistance(firstTouch, secondTouch);
    const currentCenter = getTouchCenter(firstTouch, secondTouch);

    if (!isFinite(currentDistance) || currentDistance <= 0 || !pinchState.lastCenter) {
        return;
    }

    const currentScale = getNetwork().getScale();
    const zoomFactor = currentDistance / Math.max(pinchState.lastDistance, 1);
    const nextScale = Math.min(3.5, Math.max(0.15, currentScale * zoomFactor));
    const { canvasPosition } = getCanvasPointer(currentCenter);
    const currentView = getNetwork().getViewPosition();
    const offsetX = canvasPosition.x - currentView.x;
    const offsetY = canvasPosition.y - currentView.y;
    const scaleRatio = currentScale / nextScale;
    const centerDx = currentCenter.clientX - pinchState.lastCenter.clientX;
    const centerDy = currentCenter.clientY - pinchState.lastCenter.clientY;

    getNetwork().moveTo({
        position: {
            x: canvasPosition.x - offsetX * scaleRatio - centerDx / nextScale,
            y: canvasPosition.y - offsetY * scaleRatio - centerDy / nextScale,
        },
        scale: nextScale,
        animation: false
    });

    pinchState.lastDistance = currentDistance;
    pinchState.lastCenter = currentCenter;

    if (getStore().selectedZoneIndex !== -1) {
        requestAnimationFrame(() => updateZoneRadialMenuPosition(getStore().selectedZoneIndex));
    }
    requestAnimationFrame(() => updateRadialMenuIfActive());
    requestAnimationFrame(() => updateEdgeMenuPosition());
    requestAnimationFrame(() => refreshSelectionOverlayPosition());
}

function getSyntheticPointerEvent(clientX, clientY) {
    const { mouseX, mouseY } = getCanvasPointer({ clientX, clientY });

    return {
        clientX,
        clientY,
        offsetX: mouseX,
        offsetY: mouseY,
        button: 0,
        buttons: 1,
        detail: 1,
        preventDefault() {},
        stopPropagation() {},
    };
}

function cloneConnections(connections = getStore().appData.connections) {
    return connections.map((connection) => ({
        ...connection,
        ...(connection.labelLayout ? { labelLayout: { ...connection.labelLayout } } : {}),
    }));
}

function getDraggedEdgeIds(nodeIds = []) {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
        return [];
    }

    const draggedNodeIds = new Set(nodeIds);
    return getStore().appData.connections
        .filter((connection) => (
            draggedNodeIds.has(connection.from)
            || draggedNodeIds.has(connection.to)
            || (getStore().edgeControlPoints[connection.id] || []).some((controlPointId) => draggedNodeIds.has(controlPointId))
        ))
        .map((connection) => connection.id);
}

function captureDraggedEdgeLabelCenters(nodeIds = []) {
    preservedDraggedEdgeLabelCenters = new Map();
    clearLockedEdgeLabelCenters();

    getDraggedEdgeIds(nodeIds).forEach((edgeId) => {
        const connection = getStore().appData.connections.find((item) => item.id === edgeId);
        if (!connection?.label || isEdgeLabelAtDefaultLocation(connection)) {
            return;
        }

        const geometry = getEdgeLabelGeometry(connection);
        if (!geometry) {
            return;
        }

        preservedDraggedEdgeLabelCenters.set(edgeId, {
            centerX: geometry.centerX,
            centerY: geometry.centerY,
        });
        setLockedEdgeLabelCenter(edgeId, {
            centerX: geometry.centerX,
            centerY: geometry.centerY,
        });
    });
}

function preserveDraggedEdgeLabelPositions(nodeIds = []) {
    if (!preservedDraggedEdgeLabelCenters.size) {
        return false;
    }

    const affectedEdgeIds = new Set(
        getDraggedEdgeIds(nodeIds).filter((edgeId) => preservedDraggedEdgeLabelCenters.has(edgeId))
    );

    if (affectedEdgeIds.size === 0) {
        return false;
    }

    let didChange = false;
    const nextConnections = cloneConnections().map((connection) => {
        if (!affectedEdgeIds.has(connection.id)) {
            return connection;
        }

        const preservedCenter = preservedDraggedEdgeLabelCenters.get(connection.id);
        if (!preservedCenter) {
            return connection;
        }

        const geometry = getEdgeLabelGeometry(connection);
        if (!geometry) {
            return connection;
        }

        const nextLayout = getEdgeLabelLayoutFromGeometry({
            ...geometry,
            centerX: preservedCenter.centerX,
            centerY: preservedCenter.centerY,
        });

        const currentLayout = connection.labelLayout || {};
        const sameLayout = currentLayout
            && currentLayout.offsetX === nextLayout.offsetX
            && currentLayout.offsetY === nextLayout.offsetY
            && currentLayout.width === nextLayout.width
            && currentLayout.height === nextLayout.height;

        if (sameLayout) {
            return connection;
        }

        didChange = true;
        return {
            ...connection,
            labelLayout: {
                ...currentLayout,
                ...nextLayout,
            },
        };
    });

    if (!didChange) {
        return false;
    }

    getStore().setConnections(nextConnections);
    clearLockedEdgeLabelCenters(Array.from(affectedEdgeIds));
    return true;
}

function setConnectionLabelLayout(edgeId, nextLayout) {
    const nextConnections = getStore().appData.connections.map((connection) => {
        if (connection.id !== edgeId) return connection;
        if (!nextLayout) {
            const { labelLayout, ...rest } = connection;
            return rest;
        }
        return {
            ...connection,
            labelLayout: { ...nextLayout },
        };
    });

    getStore().setConnections(nextConnections);
}

function reenableGraphPointerInteractions() {
    if (!getNetwork()) return;

    getNetwork().setOptions({
        interaction: {
            dragNodes: !isReadOnlyInteractionMode(),
            dragView: false,
            zoomView: false,
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            tooltipDelay: 200,
            multiselect: !isReadOnlyInteractionMode(),
            selectable: true
        }
    });
}

function activateEdgeLabelSelection(edgeId) {
    clearHoveredNodeState(true);
    hideRadialMenu();
    hideEdgeMenu();
    hideZoneDeleteButton();
    hideSelectionRadialMenu();
    closeArticlePreview();

    hideSelectionBox();
    getStore().updateMultiSelection({ selectedNodes: [] });
    getStore().updateMultiSelection({ selectedZonesForDrag: [] });
    getNetwork().unselectAll();

    getStore().setSelectedNodeId(null);
    getStore().setSelectedZoneIndex(-1);
    getStore().setSelectedEdgeId(null);
    getStore().setSelectedEdgeLabelId(edgeId);
    getNetwork().redraw();
}

function clearEdgeLabelSelection() {
    if (getStore().selectedEdgeLabelId === null) {
        return;
    }

    getStore().setSelectedEdgeLabelId(null);
    if (!getStore().isEditingEdgeLabel) {
        getStore().setSelectedEdgeId(null);
    }
    getNetwork().redraw();
}

function startEdgeLabelMove(event, edgeId, geometry) {
    pauseHistory();
    const { canvasPosition } = getCanvasPointer(event);

    activateEdgeLabelSelection(edgeId);
    getStore().updateEdgeLabelMoving({
        active: false,
        readyToMove: true,
        edgeId,
        startX: canvasPosition.x,
        startY: canvasPosition.y,
        originalGeometry: geometry,
    });
}

function maybeStartEdgeLabelMove(event) {
    if (!getStore().edgeLabelMoving.readyToMove) return false;
    if ((event.buttons & 1) === 0) {
        getStore().resetEdgeLabelMoving();
        return false;
    }

    const { canvasPosition } = getCanvasPointer(event);
    const dx = Math.abs(canvasPosition.x - getStore().edgeLabelMoving.startX);
    const dy = Math.abs(canvasPosition.y - getStore().edgeLabelMoving.startY);

    if (dx <= getEdgeLabelMoveThreshold() && dy <= getEdgeLabelMoveThreshold()) {
        return false;
    }

    getStore().updateEdgeLabelMoving({ active: true, readyToMove: false });
    getNetwork().setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false
        }
    });
    return true;
}

function updateEdgeLabelMove(event) {
    if (!getStore().edgeLabelMoving.active) return;

    const { canvasPosition } = getCanvasPointer(event);
    const dx = canvasPosition.x - getStore().edgeLabelMoving.startX;
    const dy = canvasPosition.y - getStore().edgeLabelMoving.startY;
    const originalGeometry = getStore().edgeLabelMoving.originalGeometry;

    const nextGeometry = {
        ...originalGeometry,
        centerX: originalGeometry.centerX + dx,
        centerY: originalGeometry.centerY + dy,
    };

    setConnectionLabelLayout(
        getStore().edgeLabelMoving.edgeId,
        getEdgeLabelLayoutFromGeometry(nextGeometry)
    );
    getNetwork().redraw();
}

function endEdgeLabelMove() {
    const edgeId = getStore().edgeLabelMoving.edgeId;
    const originalGeometry = getStore().edgeLabelMoving.originalGeometry;
    const finalConnections = cloneConnections();

    setConnectionLabelLayout(edgeId, originalGeometry?.storedLayout || null);
    resumeHistory();
    getStore().commitTrackedGraphState({ connections: finalConnections });
    getStore().resetEdgeLabelMoving();
    reenableGraphPointerInteractions();
    save(true);
    getNetwork().redraw();
}

function startEdgeLabelResize(event, edgeId, handle, geometry) {
    pauseHistory();
    const { canvasPosition } = getCanvasPointer(event);

    activateEdgeLabelSelection(edgeId);
    getStore().updateEdgeLabelResizing({
        active: true,
        edgeId,
        handle,
        startX: canvasPosition.x,
        startY: canvasPosition.y,
        originalGeometry: geometry,
    });

    getNetwork().setOptions({
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false
        }
    });
}

function updateEdgeLabelResize(event) {
    if (!getStore().edgeLabelResizing.active) return;

    const { canvasPosition } = getCanvasPointer(event);
    const dx = canvasPosition.x - getStore().edgeLabelResizing.startX;
    const dy = canvasPosition.y - getStore().edgeLabelResizing.startY;
    const geometry = getStore().edgeLabelResizing.originalGeometry;
    const bounds = {
        left: geometry.centerX - (geometry.width / 2),
        right: geometry.centerX + (geometry.width / 2),
        top: geometry.centerY - (geometry.height / 2),
        bottom: geometry.centerY + (geometry.height / 2),
    };

    const minWidth = 72;
    const minHeight = 28;
    const clampLeft = (nextLeft) => Math.min(nextLeft, bounds.right - minWidth);
    const clampRight = (nextRight) => Math.max(nextRight, bounds.left + minWidth);
    const clampTop = (nextTop) => Math.min(nextTop, bounds.bottom - minHeight);
    const clampBottom = (nextBottom) => Math.max(nextBottom, bounds.top + minHeight);

    let { left, right, top, bottom } = bounds;
    switch (getStore().edgeLabelResizing.handle) {
        case 'nw':
            left = clampLeft(bounds.left + dx);
            top = clampTop(bounds.top + dy);
            break;
        case 'n':
            top = clampTop(bounds.top + dy);
            break;
        case 'ne':
            right = clampRight(bounds.right + dx);
            top = clampTop(bounds.top + dy);
            break;
        case 'e':
            right = clampRight(bounds.right + dx);
            break;
        case 'sw':
            left = clampLeft(bounds.left + dx);
            bottom = clampBottom(bounds.bottom + dy);
            break;
        case 's':
            bottom = clampBottom(bounds.bottom + dy);
            break;
        case 'se':
            right = clampRight(bounds.right + dx);
            bottom = clampBottom(bounds.bottom + dy);
            break;
        case 'w':
            left = clampLeft(bounds.left + dx);
            break;
    }

    const nextGeometry = {
        ...geometry,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        width: right - left,
        height: bottom - top,
    };

    setConnectionLabelLayout(
        getStore().edgeLabelResizing.edgeId,
        getEdgeLabelLayoutFromGeometry(nextGeometry)
    );
    getNetwork().redraw();
}

function endEdgeLabelResize() {
    const edgeId = getStore().edgeLabelResizing.edgeId;
    const originalGeometry = getStore().edgeLabelResizing.originalGeometry;
    const finalConnections = cloneConnections();

    setConnectionLabelLayout(edgeId, originalGeometry?.storedLayout || null);
    resumeHistory();
    getStore().commitTrackedGraphState({ connections: finalConnections });
    getStore().resetEdgeLabelResizing();
    reenableGraphPointerInteractions();
    save(true);
    getNetwork().redraw();
}

function updateEdgeLabelCursor(event) {
    const canvas = getNetwork().canvas.frame.canvas;
    const resizeHandle = getEdgeLabelResizeHandleAtPosition(event);

    if (resizeHandle.edgeId !== null) {
        const cursorMap = {
            nw: 'nw-resize',
            n: 'n-resize',
            ne: 'ne-resize',
            e: 'e-resize',
            sw: 'sw-resize',
            s: 's-resize',
            se: 'se-resize',
            w: 'w-resize',
        };
        canvas.style.cursor = cursorMap[resizeHandle.handle] || 'move';
        return true;
    }

    const labelHit = getEdgeLabelAtPosition(event);
    if (labelHit) {
        canvas.style.cursor = 'move';
        return true;
    }

    return false;
}

function getCanvasHitState(clientX, clientY) {
    const syntheticEvent = getSyntheticPointerEvent(clientX, clientY);
    const edgeLabelResizeHandle = getEdgeLabelResizeHandleAtPosition(syntheticEvent);
    const edgeLabel = edgeLabelResizeHandle.edgeId !== null
        ? { edgeId: edgeLabelResizeHandle.edgeId, geometry: edgeLabelResizeHandle.geometry }
        : getEdgeLabelAtPosition(syntheticEvent);
    const clickPos = { x: syntheticEvent.offsetX, y: syntheticEvent.offsetY };
    const nodeId = edgeLabel ? null : getNetwork().getNodeAt(clickPos);
    const edgeId = edgeLabel ? edgeLabel.edgeId : getNetwork().getEdgeAt(clickPos);
    const zoneClick = !nodeId && !edgeId && !edgeLabel ? getZoneAtPosition(syntheticEvent) : { zoneIndex: -1, zone: null };

    return {
        syntheticEvent,
        nodeId,
        edgeId,
        edgeLabel,
        zoneClick,
        edgeLabelResizeHandle,
        resizeHandle: getZoneResizeHandle(syntheticEvent),
        titleClick: getZoneTitleClick(syntheticEvent),
    };
}

function openContextMenuAtClientPosition(clientX, clientY) {
    const { nodeId, edgeId, edgeLabel, zoneClick } = getCanvasHitState(clientX, clientY);
    const { canvasPosition } = getCanvasPointer({ clientX, clientY });

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
        getStore().setSelectedEdgeLabelId(null);
        getStore().setSelectedZoneIndex(-1);
        getNetwork().selectNodes(isMultiContext ? getStore().multiSelection.selectedNodes : [nodeId]);
    } else if (edgeLabel) {
        hideSelectionBox();
        getStore().updateMultiSelection({ selectedNodes: [] });
        getStore().updateMultiSelection({ selectedZonesForDrag: [] });
        getStore().setSelectedNodeId(null);
        getStore().setSelectedEdgeId(null);
        getStore().setSelectedEdgeLabelId(edgeLabel.edgeId);
        getStore().setSelectedZoneIndex(-1);
        getNetwork().redraw();
    } else if (edgeId) {
        hideSelectionBox();
        getStore().updateMultiSelection({ selectedNodes: [] });
        getStore().updateMultiSelection({ selectedZonesForDrag: [] });
        getStore().setSelectedNodeId(null);
        getStore().setSelectedEdgeId(getActualEdgeId(edgeId));
        getStore().setSelectedEdgeLabelId(null);
        getStore().setSelectedZoneIndex(-1);
    } else if (zoneClick.zone !== null) {
        hideSelectionBox();
        getStore().updateMultiSelection({ selectedNodes: [] });
        getStore().updateMultiSelection({ selectedZonesForDrag: [] });
        getStore().setSelectedNodeId(null);
        getStore().setSelectedEdgeId(null);
        getStore().setSelectedEdgeLabelId(null);
        getStore().setSelectedZoneIndex(zoneClick.zoneIndex);
        showZoneDeleteButton(zoneClick.zoneIndex);
        getNetwork().redraw();
    } else {
        getStore().setSelectedNodeId(null);
        getStore().setSelectedEdgeId(null);
        getStore().setSelectedEdgeLabelId(null);
        getStore().setSelectedZoneIndex(-1);
    }

    showContextMenu(clientX, clientY, {
        canvasPosition,
        nodeId,
        edgeId,
        zoneIndex: zoneClick.zoneIndex
    });
}

function activateZoneSelection(zoneIndex) {
    clearHoveredNodeState(true);
    hideRadialMenu();
    hideEdgeMenu();
    hideSelectionRadialMenu();
    closeArticlePreview();

    hideSelectionBox();
    getStore().updateMultiSelection({ selectedNodes: [] });
    getStore().updateMultiSelection({ selectedZonesForDrag: [] });
    getNetwork().unselectAll();

    getStore().setSelectedNodeId(null);
    getStore().setSelectedEdgeId(null);
    getStore().setSelectedEdgeLabelId(null);
    getStore().setSelectedZoneIndex(zoneIndex);
    showZoneDeleteButton(zoneIndex);
    getNetwork().redraw();
}

function queueZoneMove(event, zoneIndex) {
    const { canvasPosition } = getCanvasPointer(event);

    activateZoneSelection(zoneIndex);
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

        if (isReadOnlyInteractionMode()) {
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            return;
        }

        const edgeLabelResizeHandle = getEdgeLabelResizeHandleAtPosition(event);
        if (edgeLabelResizeHandle.edgeId !== null) {
            event.preventDefault();
            event.stopPropagation();
            suppressNextNetworkClick = true;
            suppressNextNetworkBackgroundClick = true;
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;
            startEdgeLabelResize(
                event,
                edgeLabelResizeHandle.edgeId,
                edgeLabelResizeHandle.handle,
                edgeLabelResizeHandle.geometry
            );
            return;
        }

        const edgeLabelHit = getEdgeLabelAtPosition(event);
        if (edgeLabelHit) {
            event.preventDefault();
            event.stopPropagation();
            suppressNextNetworkClick = true;
            suppressNextNetworkBackgroundClick = true;
            pendingSelectionStart = null;
            pendingZoneSelectionIndex = -1;

            if (edgeLabelHit.edgeId === getStore().selectedEdgeLabelId) {
                startEdgeLabelMove(event, edgeLabelHit.edgeId, edgeLabelHit.geometry);
            } else {
                activateEdgeLabelSelection(edgeLabelHit.edgeId);
            }
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
            suppressNextNetworkBackgroundClick = true;
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

        clearEdgeLabelSelection();

        event.preventDefault();
        event.stopPropagation();
        pendingSelectionStart = { clientX: event.clientX, clientY: event.clientY };
        pendingZoneSelectionIndex = -1;
    }, true);
    
    canvas.addEventListener('dblclick', (event) => {
        const edgeLabelHit = getEdgeLabelAtPosition(event);
        if (edgeLabelHit) {
            event.preventDefault();
            event.stopPropagation();
            suppressNextNetworkClick = true;
            suppressNextNetworkBackgroundClick = true;
            suppressNextNetworkDoubleClick = true;
            activateEdgeLabelSelection(edgeLabelHit.edgeId);
            const pointerDOM = getNetwork().canvasToDOM({
                x: edgeLabelHit.geometry.centerX,
                y: edgeLabelHit.geometry.centerY
            });
            editEdgeLabelInline(edgeLabelHit.edgeId, null, pointerDOM);
            return;
        }

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
        openContextMenuAtClientPosition(event.clientX, event.clientY);
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
        rememberCanvasPointer(event);

        if (maybeStartSelectionDrag(event)) {
            return;
        }

        if (maybeStartEdgeLabelMove(event)) {
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
                pauseHistory();
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
        } else if (getStore().edgeLabelMoving.active) {
            event.preventDefault();
            event.stopPropagation();
            updateEdgeLabelMove(event);
        } else if (getStore().edgeLabelResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            updateEdgeLabelResize(event);
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
        
        if (!getStore().zoneMoving.active && !getStore().edgeLabelMoving.active && !getStore().edgeLabelResizing.active && !getStore().zoneResizing.active && !getStore().multiSelection.active && !getStore().multiSelection.boxDragging && !getStore().connectionMode.active) {
            if (!updateEdgeLabelCursor(event)) {
                updateZoneCursor(event);
            }
        }
    }, true);

    canvas.addEventListener('mouseenter', (event) => {
        rememberCanvasPointer(event);
    }, true);

    canvas.addEventListener('contextmenu', (event) => {
        rememberCanvasPointer(event);
    }, true);
    
    canvas.addEventListener('mouseup', (event) => {
        if (event.button === 0 && pendingSelectionStart) {
            if (pendingZoneSelectionIndex !== -1) {
                activateZoneSelection(pendingZoneSelectionIndex);
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
        } else if (event.button === 0 && (getStore().edgeLabelMoving.active || getStore().edgeLabelMoving.readyToMove)) {
            event.preventDefault();
            event.stopPropagation();
            if (getStore().edgeLabelMoving.active) {
                endEdgeLabelMove();
            } else {
                getStore().resetEdgeLabelMoving();
                getNetwork().redraw();
            }
        } else if (event.button === 0 && getStore().edgeLabelResizing.active) {
            event.preventDefault();
            event.stopPropagation();
            endEdgeLabelResize();
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
    
    canvas.addEventListener('touchstart', (event) => {
        if (event.touches.length === 2) {
            suppressNextNetworkClick = true;
            clearTouchLongPressTimer();
            resetTouchState();
            startPinchGesture(event.touches);
            return;
        }

        if (event.touches.length !== 1) {
            suppressNextNetworkClick = true;
            resetTouchState();
            resetPinchState();
            return;
        }

        const touch = event.changedTouches[0];
        const hitState = getCanvasHitState(touch.clientX, touch.clientY);
        const touchZoneModeActive = getStore().touchZoneCreationMode
            && !hitState.nodeId
            && !hitState.edgeId
            && hitState.resizeHandle.zone === null
            && hitState.titleClick.zone === null;

        hideContextMenu();

        if (!touchZoneModeActive && hitState.resizeHandle.zone !== null) {
            event.preventDefault();
            startZoneResize(hitState.syntheticEvent, hitState.resizeHandle.zoneIndex, hitState.resizeHandle.handle);
            suppressNextNetworkClick = true;
            resetTouchState();
            return;
        }

        if (!touchZoneModeActive && hitState.edgeLabelResizeHandle.edgeId !== null) {
            event.preventDefault();
            startEdgeLabelResize(
                hitState.syntheticEvent,
                hitState.edgeLabelResizeHandle.edgeId,
                hitState.edgeLabelResizeHandle.handle,
                hitState.edgeLabelResizeHandle.geometry
            );
            suppressNextNetworkClick = true;
            resetTouchState();
            return;
        }

        if (!touchZoneModeActive && hitState.edgeLabel) {
            event.preventDefault();
            activateEdgeLabelSelection(hitState.edgeLabel.edgeId);
            suppressNextNetworkClick = true;
            resetTouchState();
            return;
        }

        if (!touchZoneModeActive && hitState.titleClick.zone !== null) {
            event.preventDefault();
            suppressNextNetworkBackgroundClick = true;
            queueZoneMove(hitState.syntheticEvent, hitState.titleClick.zoneIndex);
            suppressNextNetworkClick = true;
            resetTouchState();
            return;
        }

        if (!touchZoneModeActive && hitState.zoneClick.zone !== null) {
            event.preventDefault();

            if (hitState.zoneClick.zoneIndex === getStore().selectedZoneIndex) {
                queueZoneMove(hitState.syntheticEvent, hitState.zoneClick.zoneIndex);
                suppressNextNetworkClick = true;
                resetTouchState();
                return;
            }

            activateZoneSelection(hitState.zoneClick.zoneIndex);
            suppressNextNetworkClick = true;
            resetTouchState();
            return;
        }

        clearEdgeLabelSelection();

        touchState.active = true;
        touchState.touchId = touch.identifier;
        touchState.startClientX = touch.clientX;
        touchState.startClientY = touch.clientY;
        touchState.startViewPosition = getNetwork().getViewPosition();
        touchState.canPan = !touchZoneModeActive
            && !hitState.nodeId
            && !hitState.edgeId
            && hitState.resizeHandle.zone === null
            && hitState.titleClick.zone === null;
        touchState.zoneSelectionArmed = touchZoneModeActive;
        touchState.panning = false;
        touchState.selection = false;
        touchState.longPressTriggered = false;

        clearTouchLongPressTimer();
        if (!touchZoneModeActive) {
            touchState.longPressTimer = window.setTimeout(() => {
                touchState.longPressTriggered = true;
                suppressNextNetworkClick = true;
                openContextMenuAtClientPosition(touchState.startClientX, touchState.startClientY);
            }, TOUCH_LONG_PRESS_MS);
        }
    }, { passive: true, capture: true });

    canvas.addEventListener('touchmove', (event) => {
        if (pinchState.active || event.touches.length >= 2) {
            event.preventDefault();
            clearTouchLongPressTimer();
            resetTouchState();
            if (!pinchState.active) {
                startPinchGesture(event.touches);
            }
            updatePinchGesture(event.touches);
            return;
        }

        const touch = event.changedTouches[0];

        if (getStore().zoneResizing.active) {
            event.preventDefault();
            updateZoneResize(getSyntheticPointerEvent(touch.clientX, touch.clientY));
            return;
        }

        if (getStore().edgeLabelResizing.active) {
            event.preventDefault();
            updateEdgeLabelResize(getSyntheticPointerEvent(touch.clientX, touch.clientY));
            return;
        }

        if (getStore().zoneMoving.readyToMove || getStore().zoneMoving.active) {
            event.preventDefault();
            updateTouchDrivenZoneMove(getSyntheticPointerEvent(touch.clientX, touch.clientY));
            return;
        }

        if (getStore().edgeLabelMoving.readyToMove || getStore().edgeLabelMoving.active) {
            event.preventDefault();
            const pointerEvent = getSyntheticPointerEvent(touch.clientX, touch.clientY);
            if (maybeStartEdgeLabelMove(pointerEvent) || getStore().edgeLabelMoving.active) {
                updateEdgeLabelMove(pointerEvent);
            }
            return;
        }

        if (!touchState.active) return;

        const trackedTouch = Array.from(event.changedTouches).find((item) => item.identifier === touchState.touchId)
            || event.changedTouches[0];
        if (!trackedTouch) return;

        const dx = trackedTouch.clientX - touchState.startClientX;
        const dy = trackedTouch.clientY - touchState.startClientY;
        const movedEnough = Math.abs(dx) > TOUCH_MOVE_TOLERANCE || Math.abs(dy) > TOUCH_MOVE_TOLERANCE;

        if (movedEnough) {
            clearTouchLongPressTimer();
        }

        if (touchState.longPressTriggered) {
            event.preventDefault();
            return;
        }

        if (touchState.zoneSelectionArmed) {
            if (!touchState.selection && movedEnough) {
                startSelectionBox(getSyntheticPointerEvent(touchState.startClientX, touchState.startClientY));
                touchState.selection = true;
            }

            if (touchState.selection) {
                event.preventDefault();
                updateSelectionBox(getSyntheticPointerEvent(trackedTouch.clientX, trackedTouch.clientY));
            }
            return;
        }

        if (touchState.canPan && movedEnough) {
            event.preventDefault();
            touchState.panning = true;

            const scale = getNetwork().getScale();
            getNetwork().moveTo({
                position: {
                    x: touchState.startViewPosition.x - dx / scale,
                    y: touchState.startViewPosition.y - dy / scale
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
    }, { passive: false, capture: true });

    canvas.addEventListener('touchend', (event) => {
        if (pinchState.active) {
            if (event.touches.length < 2) {
                resetPinchState();
            }
            suppressNextNetworkClick = true;
            return;
        }

        if (getStore().zoneResizing.active) {
            event.preventDefault();
            endZoneResize();
            suppressNextNetworkClick = true;
            return;
        }

        if (getStore().edgeLabelResizing.active) {
            event.preventDefault();
            endEdgeLabelResize();
            suppressNextNetworkClick = true;
            return;
        }

        if (getStore().zoneMoving.active || getStore().zoneMoving.readyToMove) {
            event.preventDefault();

            if (getStore().zoneMoving.active) {
                endZoneMove();
            }

            getStore().updateZoneMoving({ readyToMove: false });
            getStore().updateZoneMoving({ active: false });
            suppressNextNetworkClick = true;
            return;
        }

        if (getStore().edgeLabelMoving.active || getStore().edgeLabelMoving.readyToMove) {
            event.preventDefault();

            if (getStore().edgeLabelMoving.active) {
                endEdgeLabelMove();
            } else {
                getStore().resetEdgeLabelMoving();
                getNetwork().redraw();
            }

            suppressNextNetworkClick = true;
            return;
        }

        if (!touchState.active) return;

        clearTouchLongPressTimer();

        if (touchState.longPressTriggered || touchState.panning) {
            suppressNextNetworkClick = true;
        }

        if (touchState.selection) {
            event.preventDefault();
            endSelectionBox();
            disableTouchZoneCreationMode();
        }

        if (!touchState.longPressTriggered && !touchState.panning && !touchState.selection && isPhoneViewport()) {
            const touch = event.changedTouches[0];
            const hitState = touch ? getCanvasHitState(touch.clientX, touch.clientY) : null;
            if (hitState?.nodeId && hitState.nodeId > 0) {
                event.preventDefault();
                armSuppressNextNetworkClick();
                openRadialMenuForNode(hitState.nodeId);
            }
        }

        resetTouchState();
    }, { passive: false, capture: true });

    canvas.addEventListener('touchcancel', () => {
        resetPinchState();
        clearTouchLongPressTimer();

        if (getStore().edgeLabelResizing.active) {
            endEdgeLabelResize();
        }

        if (getStore().edgeLabelMoving.active) {
            endEdgeLabelMove();
        } else if (getStore().edgeLabelMoving.readyToMove) {
            getStore().resetEdgeLabelMoving();
        }

        if (touchState.selection) {
            endSelectionBox();
            disableTouchZoneCreationMode();
        }

        resetTouchState();
    }, { passive: true, capture: true });
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
                const numericNodeId = parseInt(nodeId, 10);
                if (!Number.isFinite(numericNodeId) || numericNodeId <= 0) {
                    return;
                }
                nodesToUpdate.push({
                    id: numericNodeId,
                    x: pos.x,
                    y: pos.y,
                    fixed: { x: false, y: false }
                });
            });
            if (nodesToUpdate.length > 0) {
                getNetwork().body.data.nodes.update(nodesToUpdate);
                console.log('✓ Applied saved positions to', nodesToUpdate.length, 'nodes');

                syncControlPointNodes();
                Object.keys(getStore().edgeControlPoints || {}).forEach((edgeId) => {
                    rebuildEdgeWithControlPoints(parseInt(edgeId, 10));
                });
                getNetwork().redraw();
                
                setTimeout(() => {
                    if (typeof checkNodeZoneMembership === 'function' && getStore().tagZones.length > 0) {
                        console.log('🎨 Checking zone membership after project load...');
                        checkNodeZoneMembership();
                        pruneStaleAutoNumberedZones({ saveChanges: false });
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
        if (suppressNextNetworkClick) {
            suppressNextNetworkClick = false;
            if (suppressNextNetworkClickTimer !== null) {
                window.clearTimeout(suppressNextNetworkClickTimer);
                suppressNextNetworkClickTimer = null;
            }
            return;
        }

        if (getStore().connectionMode.active) {
            handleConnectionModeClick(params);
            return;
        }
        
        if (params.nodes.length > 0) {
            suppressNextNetworkBackgroundClick = false;
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
                    getStore().setSelectedEdgeLabelId(null);
                } else {
                    clearHoveredNodeState(true);
                    hideSelectionRadialMenu();
                    hideSelectionBox();
                    getStore().updateMultiSelection({ selectedNodes: [] });
                    getStore().updateMultiSelection({ selectedZonesForDrag: [] });
                    getStore().setSelectedNodeId(null);
                    getStore().setSelectedEdgeLabelId(null);
                    getNetwork().unselectAll();
                }
                
                closeArticlePreview();
                hideRadialMenu();
                
                return;
            }
            
            // Set selected node ID for keyboard shortcuts
            getStore().setSelectedNodeId(nodeId);
            getStore().setSelectedEdgeId(null);
            getStore().setSelectedEdgeLabelId(null);
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
            suppressNextNetworkBackgroundClick = false;
            const edgeId = params.edges[0];
            const now = Date.now();
            const actualEdgeId = getActualEdgeId(edgeId);
            
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
                getStore().setSelectedEdgeId(actualEdgeId);
                getStore().setSelectedEdgeLabelId(null);
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
                
                const screenX = rect.left + params.pointer.DOM.x;
                const screenY = rect.top + params.pointer.DOM.y;
                
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
            if (suppressNextNetworkBackgroundClick) {
                suppressNextNetworkBackgroundClick = false;
                return;
            }
            clearHoveredNodeState(true);
            hideRadialMenu();
            hideEdgeMenu();
            hideZoneDeleteButton();
            hideSelectionRadialMenu();
            closeArticlePreview();
            
            hideSelectionBox();
            getStore().updateMultiSelection({ selectedNodes: [] });
            getStore().updateMultiSelection({ selectedZonesForDrag: [] });
            getStore().setSelectedEdgeLabelId(null);
            if (getNetwork()) getNetwork().unselectAll();
        }
    });

    getNetwork().on('doubleClick', (params) => {
        if (suppressNextNetworkDoubleClick) {
            suppressNextNetworkDoubleClick = false;
            return;
        }

        if (getStore().connectionMode.active || isReadOnlyInteractionMode()) {
            return;
        }

        if (params.edges.length === 0) {
            return;
        }

        const actualEdgeId = getActualEdgeId(params.edges[0]);
        hideEdgeMenu();
        activateEdgeLabelSelection(actualEdgeId);
        editEdgeLabelInline(actualEdgeId, null, params.pointer.DOM);
        lastEdgeClickTime = 0;
        lastEdgeClickId = null;
    });
    
    // Prevent dragging in gallery viewer mode
    getNetwork().on('dragStart', (params) => {
        if (isReadOnlyInteractionMode() && params.nodes && params.nodes.length > 0) {
            return false;
        }
        // Pause undo history during drag so the whole drag = one undo step
        if (params.nodes && params.nodes.length > 0) {
            pauseHistory();
            captureDraggedEdgeLabelCenters(params.nodes);
        }
    });
    
    getNetwork().on('dragging', (params) => {
        if (isReadOnlyInteractionMode()) {
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
                const startPos = getStore().multiSelection.zonesDragStart[zoneIdx];
                getStore().updateTagZone(zoneIdx, {
                    x: startPos.x + dx,
                    y: startPos.y + dy,
                });
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
                const containingZones = [];

                getStore().tagZones.forEach(zone => {
                    const isInZone = isNodeInZone(nodePos, zone);
                    if (isInZone) {
                        containingZones.push(zone);
                    }
                });

                const { color, font } = getNodeAppearanceForZones(containingZones);
                getNetwork().body.data.nodes.update({
                    id: nodeId,
                    color,
                    font,
                });
            }
        }

        if (params.nodes.length > 0 && preservedDraggedEdgeLabelCenters.size > 0) {
            getNetwork().redraw();
        }
    });
    
    getNetwork().on('dragEnd', (params) => {
        if (isReadOnlyInteractionMode()) {
            preservedDraggedEdgeLabelCenters = new Map();
            clearLockedEdgeLabelCenters();
            return false;
        }
        
        if (params.nodes.length > 0) {
            preserveDraggedEdgeLabelPositions(params.nodes);
            const draggedZoneIndexes = getStore().multiSelection.selectedZonesForDrag || [];
            const draggedControlPoints = params.nodes.filter(nodeId => nodeId < 0);
            const draggedArticleIds = params.nodes.filter(nodeId => nodeId > 0);
            const currentTagZones = getStore().tagZones;
            const finalTagZones = draggedZoneIndexes.length > 0
                ? currentTagZones.map((zone) => ({ ...zone }))
                : null;

            if (finalTagZones) {
                const revertedTagZones = currentTagZones.map((zone, index) => {
                    const startPos = getStore().multiSelection.zonesDragStart[index];
                    return startPos
                        ? { ...zone, x: startPos.x, y: startPos.y }
                        : { ...zone };
                });
                getStore().setTagZones(revertedTagZones);
            }

            getStore().updateMultiSelection({ zonesDragStart: {} });
            getStore().updateMultiSelection({ nodeDragStart: null });
            const allPositions = getNetwork().getPositions();

            if (draggedArticleIds.length === 0 && draggedControlPoints.length > 0 && !finalTagZones) {
                resumeHistory();
                getStore().commitTrackedGraphState({
                    savedNodePositions: allPositions,
                });

                const edgesToRebuild = new Set();
                for (const edgeId in getStore().edgeControlPoints) {
                    const controlPoints = getStore().edgeControlPoints[edgeId];
                    if (controlPoints.some(cpId => draggedControlPoints.includes(cpId))) {
                        edgesToRebuild.add(edgeId);
                    }
                }

                edgesToRebuild.forEach(edgeId => {
                    if (typeof window.rebuildEdgeWithControlPoints === 'function') {
                        window.rebuildEdgeWithControlPoints(parseInt(edgeId));
                    }
                });

                save(true);
                getStore().updateMultiSelection({ wasDragging: false });
                preservedDraggedEdgeLabelCenters = new Map();
                clearLockedEdgeLabelCenters();
                getNetwork().redraw();
                return;
            }

            updateZoneSizes();
            const positions = getNetwork().getPositions(getStore().appData.articles.map((article) => article.id));
            const { articles: finalArticles } = checkNodeZoneMembership({
                positions,
                tagZones: finalTagZones || getStore().tagZones,
                persistToStore: false,
                saveChanges: false,
            });

            // Resume history and record ONE snapshot for the whole drag
            resumeHistory();
            getStore().commitTrackedGraphState({
                articles: finalArticles,
                savedNodePositions: allPositions,
                ...(finalTagZones ? { tagZones: finalTagZones } : {}),
            });
            console.log('Node dragged - positions updated in memory:', Object.keys(positions).length, 'nodes');

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
            preservedDraggedEdgeLabelCenters = new Map();
            clearLockedEdgeLabelCenters();
            
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

    getNetwork().on('afterDrawing', (ctx) => {
        drawEdgeLabels(ctx);
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
    getStore().setSelectedEdgeLabelId(null);
    
    const nodePosition = getNetwork().getPositions([nodeId])[nodeId];
    const canvasPosition = getNetwork().canvasToDOM(nodePosition);
    
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    
    const node = getNetwork().body.nodes[nodeId];
    const nodeWidth = node.shape.width || 100;
    const nodeHeight = node.shape.height || 50;

    if (isPhoneViewport()) {
        showArticlePreview(nodeId);
        requestAnimationFrame(() => {
            keepPhoneNodeVisible(nodeId);
            const adjustedNodePosition = getNetwork().getPositions([nodeId])[nodeId];
            const adjustedCanvasPosition = getNetwork().canvasToDOM(adjustedNodePosition);
            const screenX = rect.left + adjustedCanvasPosition.x;
            const screenY = rect.top + adjustedCanvasPosition.y;
            showRadialMenu(screenX, screenY, nodeId, nodeWidth, nodeHeight);
        });
        getNetwork().setOptions({ 
            interaction: { 
                dragNodes: true,
                dragView: false,
                zoomView: false,
                hover: true,
                hoverConnectedEdges: false
            } 
        });
        return;
    }
    
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
