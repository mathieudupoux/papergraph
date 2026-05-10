import { getStore, getNetwork, appStore, pauseHistory, resumeHistory } from '../store/appStore.js';
import { getArticleZones, getDefaultEdgeFont, getNodeAppearanceForZones } from '../utils/helpers.js';
import { getNodeLabel } from './selection.js';
import { rebuildEdgeWithControlPoints, syncControlPointNodes } from './connections.js';
import { initializeGraph } from './init.js';
import { checkNodeZoneMembership } from './zones.js';
import { icon } from '../ui/icons.js';

// ===== GRAPH RENDERING & DATA =====
// Graph data preparation, update logic, and permissions

let searchHighlightedNodes = [];
let pendingControlPointRebuildFrame = null;

function samePosition(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y;
}

function sameColorValue(a, b) {
    if (typeof a === 'string' || typeof b === 'string') {
        return a === b;
    }

    return (a?.background || null) === (b?.background || null)
        && (a?.border || null) === (b?.border || null);
}

function sameFontValue(a, b) {
    return (a?.color || null) === (b?.color || null)
        && (a?.strokeWidth || 0) === (b?.strokeWidth || 0)
        && (a?.strokeColor || null) === (b?.strokeColor || null)
        && (a?.align || null) === (b?.align || null);
}

function sameSmoothValue(a, b) {
    return Boolean(a?.enabled) === Boolean(b?.enabled)
        && (a?.type || null) === (b?.type || null)
        && (a?.roundness || 0) === (b?.roundness || 0);
}

function hasManagedControlPoints(edgeControlPoints, edgeId) {
    const controlPoints = edgeControlPoints?.[edgeId];
    return Array.isArray(controlPoints) && controlPoints.length > 0;
}

function scheduleDeferredControlPointRebuild(edgeIds) {
    const managedEdgeIds = [...new Set(
        (edgeIds || []).filter((edgeId) => Number.isFinite(edgeId))
    )];

    if (pendingControlPointRebuildFrame !== null) {
        window.cancelAnimationFrame(pendingControlPointRebuildFrame);
        pendingControlPointRebuildFrame = null;
    }

    if (managedEdgeIds.length === 0) return;

    pendingControlPointRebuildFrame = window.requestAnimationFrame(() => {
        pendingControlPointRebuildFrame = null;

        const network = getNetwork();
        if (!network) return;

        managedEdgeIds.forEach((edgeId) => {
            if (hasManagedControlPoints(getStore().edgeControlPoints, edgeId)) {
                rebuildEdgeWithControlPoints(edgeId);
            }
        });
        network.redraw();
    });
}

function getFinitePosition(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return null;
    }

    return { x: position.x, y: position.y };
}

function syncZoneMembershipForNewNodes(network, articles, addedNodes, tagZones) {
    if (!network || !Array.isArray(addedNodes) || addedNodes.length === 0 || tagZones.length === 0) {
        return;
    }

    const addedNodeIds = addedNodes
        .map((node) => node.id)
        .filter((nodeId) => Number.isFinite(nodeId) && nodeId > 0);
    const addedNodeIdSet = new Set(addedNodeIds);

    if (addedNodeIds.length === 0) {
        return;
    }

    const livePositions = network.getPositions(addedNodeIds);
    const positions = {};

    addedNodes.forEach((node) => {
        if (!addedNodeIdSet.has(node.id)) {
            return;
        }

        const resolvedPosition = getFinitePosition(livePositions[node.id]) || getFinitePosition(node);
        if (resolvedPosition) {
            positions[node.id] = resolvedPosition;
        }
    });

    if (Object.keys(positions).length === 0) {
        return;
    }

    pauseHistory();
    try {
        checkNodeZoneMembership({
            positions,
            tagZones,
            articles,
            persistToStore: true,
            saveChanges: false,
        });
    } finally {
        resumeHistory();
    }
}

export function getGraphData() {
    const { appData, tagZones, savedNodePositions, edgeControlPoints } = getStore();

    const nodes = new vis.DataSet(appData.articles.map((article) => {
        const { color: nodeColor, font } = getNodeAppearanceForZones(getArticleZones(article, tagZones));

        const labelFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
        const nodeData = {
            id: article.id,
            label: getNodeLabel(article, labelFormat),
            color: nodeColor,
            font,
            title: null,
        };

        const savedPos = savedNodePositions && savedNodePositions[article.id];
        if (savedPos && isFinite(savedPos.x) && isFinite(savedPos.y)) {
            nodeData.x = savedPos.x;
            nodeData.y = savedPos.y;
            nodeData.fixed = { x: false, y: false };
        } else if (article.x !== undefined && article.y !== undefined && isFinite(article.x) && isFinite(article.y)) {
            nodeData.x = article.x;
            nodeData.y = article.y;
            nodeData.fixed = { x: false, y: false };
        }

        return nodeData;
    }));

    const articleIds = new Set(appData.articles.map((article) => article.id));

    const edges = new vis.DataSet(appData.connections
        .filter((conn) => {
            if (!articleIds.has(conn.from) || !articleIds.has(conn.to)) return false;
            if (hasManagedControlPoints(edgeControlPoints, conn.id)) return false;
            return true;
        })
        .map((conn) => ({
            id: conn.id,
            from: conn.from,
            to: conn.to,
            font: getDefaultEdgeFont(),
            smooth: { enabled: true, type: 'continuous', roundness: 0.3 },
        })));

    return { nodes, edges };
}

// ── updateGraph helpers ────────────────────────────────────────────────

/**
 * Calculates which article nodes need to be added, removed, or updated
 * in the vis.js network relative to the new graph data.
 */
function _calcNodeDiffs(network, savedPositions, newNodesData) {
    const currentPositions = network.getPositions();
    const existingNodes = network.body.data.nodes.get();
    const existingArticleNodeMap = new Map(
        existingNodes
            .filter((node) => node.id > 0)
            .map((node) => [node.id, node])
    );
    const existingArticleNodeIds = existingNodes.filter((n) => n.id > 0).map((n) => n.id);
    const newNodeIds = new Set(newNodesData.map((n) => n.id));

    const toRemove = existingArticleNodeIds.filter((id) => !newNodeIds.has(id));

    const toAdd = newNodesData.filter((node) => !existingArticleNodeMap.has(node.id));

    const toUpdate = [];
    newNodesData.forEach((node) => {
        const existingNode = existingArticleNodeMap.get(node.id);
        if (!existingNode) return;

        const targetPosition = (savedPositions[node.id] && isFinite(savedPositions[node.id].x) && isFinite(savedPositions[node.id].y))
            ? { x: savedPositions[node.id].x, y: savedPositions[node.id].y }
            : (currentPositions[node.id] && isFinite(currentPositions[node.id].x) && isFinite(currentPositions[node.id].y))
                ? { x: currentPositions[node.id].x, y: currentPositions[node.id].y }
                : null;

        const currentPosition = currentPositions[node.id] && isFinite(currentPositions[node.id].x) && isFinite(currentPositions[node.id].y)
            ? { x: currentPositions[node.id].x, y: currentPositions[node.id].y }
            : null;

        const needsUpdate = existingNode.label !== node.label
            || !sameColorValue(existingNode.color, node.color)
            || !sameFontValue(existingNode.font, node.font)
            || !samePosition(currentPosition, targetPosition);

        if (!needsUpdate) return;

        const update = { id: node.id, label: node.label, color: node.color, font: node.font, title: null };
        if (targetPosition) {
            update.x = targetPosition.x;
            update.y = targetPosition.y;
            update.fixed = { x: false, y: false };
        }
        toUpdate.push(update);
    });

    return { toAdd, toRemove, toUpdate };
}

/**
 * Calculates which edges need to be added, removed, or updated in
 * the vis.js network relative to the new graph data.
 */
function _calcEdgeDiffs(network, newEdgesData, edgeControlPoints) {
    const existingEdges = network.body.data.edges.get();
    const existingEdgeMap = new Map(
        existingEdges
            .filter((edge) => !edge.id.toString().includes('_seg_'))
            .map((edge) => [edge.id, edge])
    );
    const existingEdgeIds = new Set(existingEdges.map((e) => e.id));
    const newEdgeIds = new Set(newEdgesData.map((e) => e.id));

    const toRemove = existingEdges
        .filter((e) => !e.id.toString().includes('_seg_') && !newEdgeIds.has(e.id))
        .map((e) => e.id);

    const toAdd = [];
    const toUpdate = [];
    newEdgesData.forEach((edge) => {
        if (hasManagedControlPoints(edgeControlPoints, edge.id)) return; // managed separately
        if (existingEdgeIds.has(edge.id)) {
            const existingEdge = existingEdgeMap.get(edge.id);
            if (
                existingEdge
                && existingEdge.from === edge.from
                && existingEdge.to === edge.to
                && sameFontValue(existingEdge.font, edge.font)
                && sameSmoothValue(existingEdge.smooth, edge.smooth)
            ) {
                return;
            }
            toUpdate.push(edge);
        } else {
            toAdd.push(edge);
        }
    });

    return { toAdd, toRemove, toUpdate };
}

/**
 * Removes orphaned control-point data and rebuilds vis.js segment edges
 * for every edge that still has control points in the store.
 */
function _manageControlPoints(network, connections, edgeControlPoints) {
    syncControlPointNodes();
    const managedEdgeIds = [];

    Object.keys(edgeControlPoints).forEach((edgeId) => {
        const edgeIdNum = parseInt(edgeId, 10);
        const connectionExists = connections.find((c) => c.id === edgeIdNum);
        const controlPointIds = edgeControlPoints[edgeId] || [];

        if (!connectionExists) {
            const cpsToDelete = edgeControlPoints[edgeIdNum];
            if (cpsToDelete) {
                cpsToDelete.forEach((cpId) => {
                    try { network.body.data.nodes.remove(cpId); } catch (_) {}
                });
            }
            getStore().deleteEdgeControlPoints(edgeIdNum);
            return;
        }

        if (!Array.isArray(controlPointIds) || controlPointIds.length === 0) {
            getStore().deleteEdgeControlPoints(edgeIdNum);
            return;
        }

        if (network.body.data.edges.get(edgeIdNum)) {
            network.body.data.edges.remove(edgeIdNum);
        }
        rebuildEdgeWithControlPoints(edgeIdNum);
        managedEdgeIds.push(edgeIdNum);
    });

    scheduleDeferredControlPointRebuild(managedEdgeIds);
}

export function updateGraph() {
    const network = getNetwork();
    if (!network) {
        initializeGraph();
        return;
    }

    try {
        searchHighlightedNodes = [];

        const { appData, savedNodePositions, edgeControlPoints, tagZones } = getStore();
        const viewPosition = network.getViewPosition();
        const scale = network.getScale();

        const graphData = getGraphData();
        const newNodesData = graphData.nodes.get();
        const newEdgesData = graphData.edges.get();

        // ── Node diffs ──
        const { toAdd: nodesToAdd, toRemove: nodesToRemove, toUpdate: nodesToUpdate } =
            _calcNodeDiffs(network, savedNodePositions, newNodesData);

        if (nodesToRemove.length > 0) network.body.data.nodes.remove(nodesToRemove);
        if (nodesToAdd.length > 0)    network.body.data.nodes.add(nodesToAdd);
        if (nodesToUpdate.length > 0) network.body.data.nodes.update(nodesToUpdate);

        syncZoneMembershipForNewNodes(network, appData.articles, nodesToAdd, tagZones);

        // ── Edge diffs ──
        const { toAdd: edgesToAdd, toRemove: edgesToRemove, toUpdate: edgesToUpdate } =
            _calcEdgeDiffs(network, newEdgesData, edgeControlPoints);

        if (edgesToRemove.length > 0) {
            network.body.data.edges.remove(edgesToRemove);

            // Clean up control points belonging to removed edges
            edgesToRemove.forEach((edgeId) => {
                const connectionStillExists = appData.connections.some((connection) => connection.id === edgeId);
                if (connectionStillExists) {
                    return;
                }

                if (edgeControlPoints[edgeId]) {
                    edgeControlPoints[edgeId].forEach((cpId) => {
                        try { network.body.data.nodes.remove(cpId); } catch (_) {}
                    });
                    const segmentEdges = network.body.data.edges.get({
                        filter: (e) => {
                            const s = e.id.toString();
                            if (!s.includes('_seg_')) return false;
                            return parseInt(s.split('_seg_')[0], 10) === edgeId;
                        },
                    });
                    if (segmentEdges.length > 0) {
                        network.body.data.edges.remove(segmentEdges.map((e) => e.id));
                    }
                    getStore().deleteEdgeControlPoints(edgeId);
                }
            });
        }

        edgesToUpdate.forEach((edge) => network.body.data.edges.update(edge));
        edgesToAdd.forEach((edge) => network.body.data.edges.add(edge));

        network.moveTo({ position: viewPosition, scale, animation: false });

        // ── Control-point management ──
        _manageControlPoints(network, appData.connections, getStore().edgeControlPoints);

    } catch (error) {
        console.error('Error updating graph:', error);
    }
}

// ===== PERMISSIONS & READ-ONLY MODE =====

/**
 * Applies the DOM-side read-only UI state (toolbar buttons + indicator).
 * Separated from graph interaction options so it can be driven by store subscription.
 */
export function applyReadOnlyUI(readOnly) {
    const editButtons = ['addArticleBtn', 'deleteArticleBtn', 'toggleGridBtn'];
    editButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = readOnly;
        btn.classList.toggle('disabled', readOnly);
        btn.title = readOnly ? 'View-only access - you cannot edit this project' : '';
    });
    if (readOnly) {
        showReadOnlyIndicator();
    } else {
        hideReadOnlyIndicator();
    }
}

export function setGraphInteractionMode(readOnly = false) {
    const network = getNetwork();
    if (!network) return;

    network.setOptions({
        interaction: {
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            tooltipDelay: 200,
            dragView: false,
            multiselect: !readOnly,
            selectable: true,
            dragNodes: !readOnly,
        },
        manipulation: { enabled: false },
    });

    applyReadOnlyUI(readOnly);
}

// Subscribe to store so the read-only UI updates whenever isReadOnlyMode changes.
appStore.subscribe((state, prevState) => {
    if (getStore().isReadOnlyMode !== prevState.isReadOnlyMode) {
        applyReadOnlyUI(getStore().isReadOnlyMode);
    }
});

export function showReadOnlyIndicator() {
    if (getStore().isGalleryViewer) {
        hideReadOnlyIndicator();
        return;
    }

    let indicator = document.getElementById('readOnlyIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'readOnlyIndicator';
        indicator.className = 'read-only-indicator';
        indicator.innerHTML = `
            ${icon('lock', { size: 'sm' })}
            <span>View Only</span>
        `;
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) toolbar.parentNode.insertBefore(indicator, toolbar.nextSibling);
    }
    indicator.style.display = 'flex';
}

export function hideReadOnlyIndicator() {
    const indicator = document.getElementById('readOnlyIndicator');
    if (indicator) indicator.style.display = 'none';
}
