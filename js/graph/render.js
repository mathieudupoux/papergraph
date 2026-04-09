import { getStore, getNetwork, appStore } from '../store/appStore.js';
import { darkenColor, getContrastColor } from '../utils/helpers.js';
import { getNodeLabel } from './selection.js';
import { rebuildEdgeWithControlPoints } from './connections.js';
import { initializeGraph } from './init.js';
import { icon } from '../ui/icons.js';

// ===== GRAPH RENDERING & DATA =====
// Graph data preparation, update logic, and permissions

let searchHighlightedNodes = [];

export function getGraphData() {
    const { appData, tagZones, savedNodePositions, edgeControlPoints, currentCategoryFilter } = getStore();

    const filteredArticles = currentCategoryFilter
        ? appData.articles.filter((a) => a.categories && a.categories.includes(currentCategoryFilter))
        : appData.articles;

    const nodes = new vis.DataSet(filteredArticles.map((article) => {
        let nodeColor = { border: '#4a90e2', background: '#e3f2fd' };
        let fontColor = '#333333';

        const categories = article.categories || [];
        if (categories.length > 0) {
            const articleZones = [];
            categories.forEach((tag) => {
                const zone = tagZones.find((z) => z.tag === tag);
                if (zone) articleZones.push({ zone, area: zone.width * zone.height });
            });

            if (articleZones.length > 0) {
                articleZones.sort((a, b) => a.area - b.area);
                const smallestZone = articleZones[0].zone;
                nodeColor = {
                    background: smallestZone.color,
                    border: darkenColor(smallestZone.color, 20),
                };
                fontColor = getContrastColor(smallestZone.color);
            }
        }

        const labelFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
        const nodeData = {
            id: article.id,
            label: getNodeLabel(article, labelFormat),
            color: nodeColor,
            font: { color: fontColor },
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

    const articleIds = new Set(filteredArticles.map((a) => a.id));

    const edges = new vis.DataSet(appData.connections
        .filter((conn) => {
            if (!articleIds.has(conn.from) || !articleIds.has(conn.to)) return false;
            if (edgeControlPoints && edgeControlPoints[conn.id]) return false;
            return true;
        })
        .map((conn) => ({
            id: conn.id,
            from: conn.from,
            to: conn.to,
            label: conn.label || '',
            smooth: { enabled: true, type: 'continuous', roundness: 0.15 },
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
    const existingArticleNodeIds = existingNodes.filter((n) => n.id > 0).map((n) => n.id);
    const newNodeIds = new Set(newNodesData.map((n) => n.id));

    const toRemove = existingArticleNodeIds.filter((id) => !newNodeIds.has(id));

    const toAdd = newNodesData.filter((node) => !network.body.data.nodes.get(node.id));

    const toUpdate = [];
    newNodesData.forEach((node) => {
        if (!network.body.data.nodes.get(node.id)) return;
        const update = { id: node.id, label: node.label, color: node.color, font: node.font };
        if (savedPositions[node.id] && isFinite(savedPositions[node.id].x) && isFinite(savedPositions[node.id].y)) {
            update.x = savedPositions[node.id].x;
            update.y = savedPositions[node.id].y;
            update.fixed = { x: false, y: false };
        } else if (currentPositions[node.id] && isFinite(currentPositions[node.id].x) && isFinite(currentPositions[node.id].y)) {
            update.x = currentPositions[node.id].x;
            update.y = currentPositions[node.id].y;
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
    const existingEdgeIds = new Set(existingEdges.map((e) => e.id));
    const newEdgeIds = new Set(newEdgesData.map((e) => e.id));

    const toRemove = existingEdges
        .filter((e) => !e.id.toString().includes('_seg_') && !newEdgeIds.has(e.id))
        .map((e) => e.id);

    const toAdd = [];
    const toUpdate = [];
    newEdgesData.forEach((edge) => {
        if (edgeControlPoints[edge.id]) return; // managed separately
        if (existingEdgeIds.has(edge.id)) {
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
    Object.keys(edgeControlPoints).forEach((edgeId) => {
        const edgeIdNum = parseInt(edgeId);
        const connectionExists = connections.find((c) => c.id === edgeIdNum);

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

        if (network.body.data.edges.get(edgeIdNum)) {
            network.body.data.edges.remove(edgeIdNum);
        }
        rebuildEdgeWithControlPoints(edgeIdNum);
    });
}

export function updateGraph() {
    const network = getNetwork();
    if (!network) {
        initializeGraph();
        return;
    }

    try {
        searchHighlightedNodes = [];

        const { appData, savedNodePositions, edgeControlPoints } = getStore();
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

        // ── Edge diffs ──
        const { toAdd: edgesToAdd, toRemove: edgesToRemove, toUpdate: edgesToUpdate } =
            _calcEdgeDiffs(network, newEdgesData, edgeControlPoints);

        if (edgesToRemove.length > 0) {
            network.body.data.edges.remove(edgesToRemove);

            // Clean up control points belonging to removed edges
            edgesToRemove.forEach((edgeId) => {
                if (edgeControlPoints[edgeId]) {
                    edgeControlPoints[edgeId].forEach((cpId) => {
                        try { network.body.data.nodes.remove(cpId); } catch (_) {}
                    });
                    const segmentEdges = network.body.data.edges.get({
                        filter: (e) => {
                            const s = e.id.toString();
                            if (!s.includes('_seg_')) return false;
                            return parseInt(s.split('_seg_')[0]) === edgeId;
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
