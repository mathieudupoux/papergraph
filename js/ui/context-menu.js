import { getStore, getNetwork } from '../store/appStore.js';
import { deleteConnection } from '../graph/connections.js';
import { deleteZone } from '../graph/zones.js';
import { deleteArticleById, openArticleModal, setPendingArticlePosition } from './modal.js';
import { openMultiTagDialog, deleteSelectedNodes } from './toolbar.js';
import { applyNodeLabelFormat } from '../graph/selection.js';
import { fitGraphView } from '../graph/view.js';
import { icon } from './icons.js';
import { enableTouchZoneCreationMode, isTouchScreen } from './touch-zone-mode.js';

let outsideClickHandler = null;
let escapeHandler = null;
let nodeLabelSubmenuHideTimeout = null;
let nodeLabelTriggerButton = null;

const NODE_LABEL_OPTIONS = [
    { format: 'bibtexId', label: 'BibTeX ID' },
    { format: 'title', label: 'Title' },
    { format: 'citation', label: 'Citation (Author, Year)' },
    { format: 'author', label: 'First Author' }
];

function getMenu() {
    let menu = document.getElementById('graphContextMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'graphContextMenu';
        menu.className = 'logo-dropdown graph-context-menu';
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
    }

    return menu;
}

function getSubmenu() {
    let submenu = document.getElementById('graphContextNodeLabelSubmenu');
    if (!submenu) {
        submenu = document.createElement('div');
        submenu.id = 'graphContextNodeLabelSubmenu';
        submenu.className = 'dropdown-submenu graph-context-submenu';
        document.body.appendChild(submenu);
    }

    return submenu;
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

function deleteSelection() {
    const selectedNodeIds = getSelectedNodeIds();

    if (selectedNodeIds.length > 1) {
        deleteSelectedNodes();
        return;
    }

    if (selectedNodeIds.length === 1 && getStore().selectedEdgeId === null && getStore().selectedZoneIndex === -1) {
        deleteArticleById(selectedNodeIds[0]);
        return;
    }

    if (getStore().selectedEdgeId !== null) {
        deleteConnection(getStore().selectedEdgeId);
        return;
    }

    if (getStore().selectedZoneIndex !== -1) {
        deleteZone(getStore().selectedZoneIndex);
    }
}

function tagSelectedNodes() {
    const selectedNodeIds = getSelectedNodeIds();
    if (selectedNodeIds.length === 0) return;

    getStore().updateMultiSelection({ selectedNodes: selectedNodeIds });
    openMultiTagDialog();
}

function buildNodeLabelSubmenu() {
    const submenu = getSubmenu();
    const currentFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';

    submenu.innerHTML = '';
    NODE_LABEL_OPTIONS.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'logo-dropdown-item node-label-option';
        button.dataset.format = option.format;
        if (option.format === currentFormat) {
            button.classList.add('selected');
        }

        button.innerHTML = `
            <span class="graph-context-menu__icon-slot" aria-hidden="true"></span>
            <span class="graph-context-menu__label">${option.label}</span>
        `;
        button.addEventListener('click', () => {
            applyNodeLabelFormat(option.format);
            hideContextMenu();
        });

        submenu.appendChild(button);
    });

    return submenu;
}

function cancelNodeLabelSubmenuHide() {
    if (nodeLabelSubmenuHideTimeout !== null) {
        clearTimeout(nodeLabelSubmenuHideTimeout);
        nodeLabelSubmenuHideTimeout = null;
    }
}

function scheduleNodeLabelSubmenuHide() {
    cancelNodeLabelSubmenuHide();
    nodeLabelSubmenuHideTimeout = window.setTimeout(() => {
        const submenu = document.getElementById('graphContextNodeLabelSubmenu');
        if (submenu && submenu.matches(':hover')) return;
        if (nodeLabelTriggerButton && nodeLabelTriggerButton.matches(':hover')) return;
        hideNodeLabelSubmenu();
    }, 140);
}

function showNodeLabelSubmenu(triggerButton) {
    cancelNodeLabelSubmenuHide();
    nodeLabelTriggerButton = triggerButton;
    const submenu = buildNodeLabelSubmenu();
    const rect = triggerButton.getBoundingClientRect();
    const gap = 10;
    const viewportPadding = 12;

    submenu.classList.remove('active');
    submenu.classList.add('graph-context-submenu--measuring');
    submenu.style.top = '0px';
    submenu.style.left = '0px';

    const submenuRect = submenu.getBoundingClientRect();
    const openOnRight = rect.right + gap + submenuRect.width <= window.innerWidth - viewportPadding;
    submenu.style.left = openOnRight
        ? `${rect.right + gap}px`
        : `${Math.max(viewportPadding, rect.left - submenuRect.width - gap)}px`;
    submenu.style.top = `${rect.top}px`;
    if (submenuRect.bottom > window.innerHeight - 12) {
        submenu.style.top = `${Math.max(12, window.innerHeight - submenuRect.height - 12)}px`;
    }
    submenu.classList.remove('graph-context-submenu--measuring');
    requestAnimationFrame(() => submenu.classList.add('active'));
}

function hideNodeLabelSubmenu() {
    cancelNodeLabelSubmenuHide();
    nodeLabelTriggerButton = null;
    const submenu = document.getElementById('graphContextNodeLabelSubmenu');
    if (submenu) {
        submenu.classList.remove('active');
        submenu.classList.remove('graph-context-submenu--measuring');
        submenu.innerHTML = '';
    }
}

function buildMenuItems(context = {}) {
    const readOnly = getStore().isReadOnlyMode || getStore().isGalleryViewer;
    const selectedNodeIds = getSelectedNodeIds();
    const hasDeleteTarget = selectedNodeIds.length > 0 || getStore().selectedEdgeId !== null || getStore().selectedZoneIndex !== -1;
    const touchScreen = isTouchScreen();

    return [
        {
            label: 'Add Node',
            enabled: !readOnly,
            iconId: 'add',
            onSelect: () => {
                setPendingArticlePosition(context.canvasPosition || getNetwork()?.getViewPosition() || { x: 0, y: 0 });
                openArticleModal();
            }
        },
        {
            label: 'Node Labels',
            enabled: true,
            submenu: true
        },
        {
            divider: true
        },
        {
            label: touchScreen ? 'Zone Selection' : 'Tag Selection',
            enabled: touchScreen ? !readOnly : (!readOnly && selectedNodeIds.length > 0),
            onSelect: touchScreen ? enableTouchZoneCreationMode : tagSelectedNodes
        },
        {
            label: 'Delete',
            enabled: !readOnly && hasDeleteTarget,
            onSelect: deleteSelection
        },
        {
            divider: true
        },
        {
            label: 'Fit View',
            enabled: true,
            iconId: 'fit-view',
            onSelect: () => fitGraphView()
        }
    ];
}

function bindDismissHandlers() {
    outsideClickHandler = (event) => {
        const menu = document.getElementById('graphContextMenu');
        const submenu = document.getElementById('graphContextNodeLabelSubmenu');
        const clickedInMenu = menu && menu.contains(event.target);
        const clickedInSubmenu = submenu && submenu.contains(event.target);

        if (!clickedInMenu && !clickedInSubmenu) {
            hideContextMenu();
        }
    };

    escapeHandler = (event) => {
        if (event.key === 'Escape') {
            hideContextMenu();
        }
    };

    setTimeout(() => {
        document.addEventListener('pointerdown', outsideClickHandler);
    }, 0);
    document.addEventListener('keydown', escapeHandler);
}

export function hideContextMenu() {
    const menu = document.getElementById('graphContextMenu');
    if (menu) {
        menu.classList.remove('active');
        menu.innerHTML = '';
    }

    hideNodeLabelSubmenu();

    if (outsideClickHandler) {
        document.removeEventListener('pointerdown', outsideClickHandler);
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
    menu.innerHTML = '';

    items.forEach((item) => {
        if (item.divider) {
            const divider = document.createElement('div');
            divider.className = 'logo-dropdown-divider';
            menu.appendChild(divider);
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `logo-dropdown-item${item.submenu ? ' logo-dropdown-item-submenu' : ''}`;
        button.disabled = !item.enabled;
        button.innerHTML = `
            <span class="graph-context-menu__icon-slot" aria-hidden="true">${item.iconId ? icon(item.iconId) : ''}</span>
            <span class="graph-context-menu__label">${item.label}</span>
            ${item.submenu ? `<span class="graph-context-menu__submenu-caret" aria-hidden="true">›</span>` : ''}
        `;

        if (item.submenu) {
            button.addEventListener('mouseenter', () => showNodeLabelSubmenu(button));
            button.addEventListener('mouseleave', scheduleNodeLabelSubmenuHide);
        } else {
            button.addEventListener('mouseenter', hideNodeLabelSubmenu);
            button.addEventListener('click', () => {
                if (!item.enabled) return;
                hideContextMenu();
                item.onSelect();
            });
        }

        menu.appendChild(button);
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
        menu.style.left = `${Math.max(12, window.innerWidth - rect.width - 12)}px`;
    }
    if (rect.bottom > window.innerHeight - 12) {
        menu.style.top = `${Math.max(12, window.innerHeight - rect.height - 12)}px`;
    }

    menu.onmouseleave = scheduleNodeLabelSubmenuHide;
    menu.onmouseenter = cancelNodeLabelSubmenuHide;

    const submenu = getSubmenu();
    submenu.onmouseenter = () => {
        cancelNodeLabelSubmenuHide();
        submenu.classList.add('active');
    };
    submenu.onmouseleave = scheduleNodeLabelSubmenuHide;

    bindDismissHandlers();
}
