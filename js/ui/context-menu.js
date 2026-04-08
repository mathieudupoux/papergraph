import { getStore, getNetwork } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { updateGraph } from '../graph/render.js';
import { renderListView } from './list/sidebar.js';
import { updateCategoryFilters } from './filters.js';
import { deleteConnection } from '../graph/connections.js';
import { deleteZone } from '../graph/zones.js';
import { deleteArticleById } from './modal.js';
import { openMultiTagDialog, deleteSelectedNodes } from './toolbar.js';

let graphClipboard = null;
let lastPasteOffset = 0;
let outsideClickHandler = null;
let escapeHandler = null;

function getMenu() {
    let menu = document.getElementById('graphContextMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'graphContextMenu';
        menu.className = 'graph-context-menu';
        menu.setAttribute('role', 'menu');
        menu.style.display = 'none';
        document.body.appendChild(menu);
    }

    return menu;
}

function getSelectedNodeIds() {
    if (getStore().multiSelection.selectedNodes.length > 0) {
        return [...getStore().multiSelection.selectedNodes];
    }

    if (getStore().selectedNodeId !== null) {
        return [getStore().selectedNodeId];
    }

    return [];
}

function getDeleteState() {
    const selectedNodeIds = getSelectedNodeIds();

    if (selectedNodeIds.length > 1) {
        return { type: 'multi-node', enabled: true };
    }

    if (selectedNodeIds.length === 1 && getStore().selectedEdgeId === null && getStore().selectedZoneIndex === -1) {
        return { type: 'node', enabled: true };
    }

    if (getStore().selectedEdgeId !== null) {
        return { type: 'edge', enabled: true };
    }

    if (getStore().selectedZoneIndex !== -1) {
        return { type: 'zone', enabled: true };
    }

    return { type: null, enabled: false };
}

function copySelectionToClipboard() {
    const network = getNetwork();
    const selectedNodeIds = getSelectedNodeIds();

    if (!network || selectedNodeIds.length === 0) {
        showNotification('Select at least one node to copy', 'info');
        return;
    }

    const positions = network.getPositions(selectedNodeIds);
    const selectedIdSet = new Set(selectedNodeIds);

    graphClipboard = {
        articles: selectedNodeIds
            .map((nodeId) => getStore().appData.articles.find((article) => article.id === nodeId))
            .filter(Boolean)
            .map((article) => ({
                ...article,
                categories: [...(article.categories || [])]
            })),
        connections: getStore().appData.connections
            .filter((connection) => selectedIdSet.has(connection.from) && selectedIdSet.has(connection.to))
            .map((connection) => ({ ...connection })),
        positions
    };

    showNotification(
        selectedNodeIds.length === 1 ? 'Node copied' : `${selectedNodeIds.length} nodes copied`,
        'success'
    );
}

function pasteClipboard(targetPosition = null) {
    if (!graphClipboard || graphClipboard.articles.length === 0) {
        showNotification('Copy a node selection first', 'info');
        return;
    }

    const network = getNetwork();
    if (!network) return;

    lastPasteOffset += 40;

    const fallbackPosition = network.getViewPosition();
    const pasteCenter = targetPosition || {
        x: fallbackPosition.x + lastPasteOffset,
        y: fallbackPosition.y + lastPasteOffset
    };

    const sourcePositions = graphClipboard.articles
        .map((article) => graphClipboard.positions[article.id])
        .filter(Boolean);

    const sourceCenter = sourcePositions.length > 0
        ? sourcePositions.reduce(
            (acc, position) => ({
                x: acc.x + position.x / sourcePositions.length,
                y: acc.y + position.y / sourcePositions.length
            }),
            { x: 0, y: 0 }
        )
        : { x: 0, y: 0 };

    const idMap = new Map();
    const newNodeIds = [];

    graphClipboard.articles.forEach((article) => {
        const { id, x, y, ...articleFields } = article;
        const newId = getStore().createArticle({
            ...articleFields,
            categories: [...(article.categories || [])]
        });

        idMap.set(article.id, newId);
        newNodeIds.push(newId);
    });

    graphClipboard.connections.forEach((connection) => {
        const newFrom = idMap.get(connection.from);
        const newTo = idMap.get(connection.to);

        if (newFrom && newTo) {
            getStore().createConnection(newFrom, newTo, connection.label || '');
        }
    });

    updateGraph();

    const updatedPositions = { ...getStore().savedNodePositions };
    graphClipboard.articles.forEach((article) => {
        const newId = idMap.get(article.id);
        const originalPosition = graphClipboard.positions[article.id] || sourceCenter;
        const x = pasteCenter.x + (originalPosition.x - sourceCenter.x);
        const y = pasteCenter.y + (originalPosition.y - sourceCenter.y);

        network.moveNode(newId, x, y);
        updatedPositions[newId] = { x, y };
    });

    getStore().setSavedNodePositions(updatedPositions);
    getStore().updateMultiSelection({ selectedNodes: newNodeIds });
    getStore().setSelectedNodeId(newNodeIds.length === 1 ? newNodeIds[0] : null);
    getStore().setSelectedEdgeId(null);
    getStore().setSelectedZoneIndex(-1);

    network.selectNodes(newNodeIds);
    renderListView();
    updateCategoryFilters();
    save(true);

    showNotification(
        newNodeIds.length === 1 ? 'Node pasted' : `${newNodeIds.length} nodes pasted`,
        'success'
    );
}

function tagSelectedNodes() {
    const selectedNodeIds = getSelectedNodeIds();

    if (selectedNodeIds.length === 0) {
        showNotification('Select at least one node to tag', 'info');
        return;
    }

    getStore().updateMultiSelection({ selectedNodes: selectedNodeIds });
    openMultiTagDialog();
}

function deleteSelection() {
    const deleteState = getDeleteState();

    if (!deleteState.enabled) {
        showNotification('Nothing selected to delete', 'info');
        return;
    }

    if (deleteState.type === 'multi-node') {
        deleteSelectedNodes();
        return;
    }

    if (deleteState.type === 'node') {
        deleteArticleById(getSelectedNodeIds()[0]);
        return;
    }

    if (deleteState.type === 'edge') {
        deleteConnection(getStore().selectedEdgeId);
        return;
    }

    if (deleteState.type === 'zone') {
        deleteZone(getStore().selectedZoneIndex);
    }
}

function buildMenuItems(context = {}) {
    const readOnly = getStore().isReadOnlyMode || getStore().isGalleryViewer;
    const selectedNodeIds = getSelectedNodeIds();
    const deleteState = getDeleteState();

    return [
        {
            label: 'Copy',
            shortcut: 'Ctrl/Cmd+C',
            enabled: selectedNodeIds.length > 0,
            onSelect: copySelectionToClipboard
        },
        {
            label: 'Paste',
            shortcut: 'Ctrl/Cmd+V',
            enabled: !readOnly && !!graphClipboard,
            onSelect: () => pasteClipboard(context.canvasPosition)
        },
        {
            label: 'Delete',
            shortcut: 'Del',
            enabled: !readOnly && deleteState.enabled,
            destructive: true,
            onSelect: deleteSelection
        },
        {
            label: 'Tag Selection',
            enabled: !readOnly && selectedNodeIds.length > 0,
            onSelect: tagSelectedNodes
        },
        {
            label: 'Fit View',
            enabled: true,
            onSelect: () => getNetwork()?.fit({ animation: false })
        }
    ];
}

function bindDismissHandlers() {
    outsideClickHandler = (event) => {
        const menu = document.getElementById('graphContextMenu');
        if (menu && !menu.contains(event.target)) {
            hideContextMenu();
        }
    };

    escapeHandler = (event) => {
        if (event.key === 'Escape') {
            hideContextMenu();
        }
    };

    setTimeout(() => {
        document.addEventListener('mousedown', outsideClickHandler);
    }, 0);
    document.addEventListener('keydown', escapeHandler);
}

export function hideContextMenu() {
    const menu = document.getElementById('graphContextMenu');
    if (menu) {
        menu.style.display = 'none';
        menu.innerHTML = '';
    }

    if (outsideClickHandler) {
        document.removeEventListener('mousedown', outsideClickHandler);
        outsideClickHandler = null;
    }

    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}

export function showContextMenu(x, y, context = {}) {
    hideContextMenu();

    const menu = getMenu();
    const items = buildMenuItems(context);

    items.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-context-menu__item';
        if (item.destructive) {
            button.classList.add('graph-context-menu__item--destructive');
        }

        button.disabled = !item.enabled;
        button.innerHTML = `
            <span class="graph-context-menu__label">${item.label}</span>
            ${item.shortcut ? `<span class="graph-context-menu__shortcut">${item.shortcut}</span>` : ''}
        `;

        button.addEventListener('click', () => {
            if (!item.enabled) return;
            hideContextMenu();
            item.onSelect();
        });

        menu.appendChild(button);
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
        menu.style.left = `${Math.max(12, window.innerWidth - rect.width - 12)}px`;
    }
    if (rect.bottom > window.innerHeight - 12) {
        menu.style.top = `${Math.max(12, window.innerHeight - rect.height - 12)}px`;
    }

    bindDismissHandlers();
}
