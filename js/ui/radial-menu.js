// ===== RADIAL MENU =====
// Context menu for nodes and multi-selection

import { state } from '../core/state.js';
import { showArticlePreview } from './preview.js';
import { openMultiTagDialog, deleteSelectedNodes, applyEmptyAreaZoneFromDialog } from './toolbar.js';

export function openRadialMenuForNode(nodeId) {
    state.selectedNodeId = nodeId;
    state.selectedEdgeId = null;
    
    // Show article preview
    showArticlePreview(nodeId);
    
    // Get node position in canvas coordinates, then convert to DOM
    const nodePosition = state.network.getPositions([nodeId])[nodeId];
    const canvasPosition = state.network.canvasToDOM(nodePosition);
    
    // Get container offset to calculate screen position
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    
    const screenX = rect.left + canvasPosition.x;
    const screenY = rect.top + canvasPosition.y;
    
    // Get node dimensions to position menu around it
    const node = state.network.body.nodes[nodeId];
    const nodeWidth = node.shape.width || 100;
    const nodeHeight = node.shape.height || 50;
    
    showRadialMenu(screenX, screenY, nodeId, nodeWidth, nodeHeight);
    
    // Keep drag enabled but disable panning and zoom when menu is open
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

export function showRadialMenu(x, y, nodeId, nodeWidth = 100, nodeHeight = 50) {
    // Don't show radial menu in read-only mode or gallery viewer mode
    if (state.isReadOnlyMode || state.isGalleryViewer) {
        return;
    }
    
    const menu = document.getElementById('radialMenu');
    
    // Clear any previous pulse animation and reset previous node
    if (state.currentPulseInterval) {
        clearInterval(state.currentPulseInterval);
        state.currentPulseInterval = null;
    }
    
    // Reset the previously selected node if any
    if (state.selectedNodeId !== null && state.selectedNodeId !== nodeId && state.network && state.network.body.nodes[state.selectedNodeId]) {
        const prevNode = state.network.body.nodes[state.selectedNodeId];
        if (prevNode && prevNode.options) {
            prevNode.options.shadow = false;
            prevNode.options.borderWidth = 3;
        }
    }
    
    // Position buttons AROUND the box
    const padding = 15;
    
    const connectBtn = document.querySelector('.radial-connect');
    const deleteBtn = document.querySelector('.radial-delete');
    
    // Right center (connect)
    connectBtn.style.left = (x + nodeWidth/2 + padding) + 'px';
    connectBtn.style.top = (y - 22) + 'px';
    
    // Left center (delete)
    deleteBtn.style.left = (x - nodeWidth/2 - padding - 44) + 'px';
    deleteBtn.style.top = (y - 22) + 'px';
    
    // Force reflow to restart animation
    menu.classList.remove('active');
    void menu.offsetWidth;
    menu.classList.add('active');
    
    // Apply pulse effect to selected node
    if (state.network && nodeId !== null) {
        const node = state.network.body.nodes[nodeId];
        if (node) {
            let intensity = 0.2;
            let growing = true;
            
            state.currentPulseInterval = setInterval(() => {
                if (!document.getElementById('radialMenu').classList.contains('active')) {
                    clearInterval(state.currentPulseInterval);
                    state.currentPulseInterval = null;
                    return;
                }
                
                if (growing) {
                    intensity += 0.05;
                    if (intensity >= 0.7) growing = false;
                } else {
                    intensity -= 0.05;
                    if (intensity <= 0.2) growing = true;
                }
                
                if (node.options) {
                    node.options.shadow = {
                        enabled: true,
                        color: `rgba(74, 144, 226, ${intensity})`,
                        size: 15 + intensity * 15,
                        x: 0,
                        y: 0
                    };
                    
                    node.options.borderWidth = 3 + intensity * 2;
                }
                
                state.network.redraw();
            }, 80);
        }
    }
}

export function updateRadialMenuPosition(x, y, nodeWidth, nodeHeight) {
    const padding = 15;
    
    const connectBtn = document.querySelector('.radial-connect');
    const deleteBtn = document.querySelector('.radial-delete');
    
    // Right center (connect)
    connectBtn.style.left = (x + nodeWidth/2 + padding) + 'px';
    connectBtn.style.top = (y - 22) + 'px';
    
    // Left center (delete)
    deleteBtn.style.left = (x - nodeWidth/2 - padding - 44) + 'px';
    deleteBtn.style.top = (y - 22) + 'px';
}

export function updateRadialMenuIfActive() {
    if (!document.getElementById('radialMenu').classList.contains('active') || !state.selectedNodeId) {
        return;
    }
    
    const nodePosition = state.network.getPositions([state.selectedNodeId])[state.selectedNodeId];
    if (!nodePosition) return;
    
    const canvasPosition = state.network.canvasToDOM(nodePosition);
    
    const container = document.getElementById('graphContainer');
    const rect = container.getBoundingClientRect();
    
    const screenX = rect.left + canvasPosition.x;
    const screenY = rect.top + canvasPosition.y;
    
    const node = state.network.body.nodes[state.selectedNodeId];
    if (!node) return;
    
    const nodeWidth = node.shape.width || 100;
    const nodeHeight = node.shape.height || 50;
    
    updateRadialMenuPosition(screenX, screenY, nodeWidth, nodeHeight);
}

export function hideRadialMenu() {
    const menu = document.getElementById('radialMenu');
    menu.classList.remove('active');
    
    // Clear pulse interval
    if (state.currentPulseInterval) {
        clearInterval(state.currentPulseInterval);
        state.currentPulseInterval = null;
    }
    
    // Reset selected node
    if (state.selectedNodeId !== null && state.network && state.network.body.nodes[state.selectedNodeId]) {
        const node = state.network.body.nodes[state.selectedNodeId];
        if (node && node.options) {
            node.options.shadow = false;
            node.options.borderWidth = 3;
        }
        state.network.redraw();
    }
    
    state.selectedNodeId = null;
    
    // Re-enable interactions
    if (state.network) {
        state.network.setOptions({ 
            interaction: { 
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                tooltipDelay: 200
            } 
        });
    }
}

export function showSelectionRadialMenu(x, y) {
    // Don't show selection radial menu in gallery viewer mode
    if (state.isGalleryViewer) {
        return;
    }
    
    state.multiSelection.menuActive = true;
    
    const menuContainer = document.createElement('div');
    menuContainer.id = 'selectionRadialMenu';
    menuContainer.style.position = 'fixed';
    menuContainer.style.pointerEvents = 'none';
    menuContainer.style.zIndex = '10000';
    document.body.appendChild(menuContainer);
    
    const buttons = [
        {
            id: 'selection-tag-btn',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>`,
            action: openMultiTagDialog,
            hoverColor: '#27ae60',
            offsetX: -50,
            offsetY: 0
        },
        {
            id: 'selection-delete-btn',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>`,
            action: deleteSelectedNodes,
            hoverColor: '#e74c3c',
            offsetX: 50,
            offsetY: 0
        }
    ];
    
    buttons.forEach((btnConfig, index) => {
        const btn = document.createElement('button');
        btn.id = btnConfig.id;
        btn.className = 'selection-radial-btn';
        btn.innerHTML = btnConfig.icon;
        btn.style.position = 'fixed';
        btn.style.width = '44px';
        btn.style.height = '44px';
        btn.style.borderRadius = '50%';
        btn.style.border = 'none';
        btn.style.background = 'white';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.color = '#333';
        btn.style.transition = 'transform 0.2s, box-shadow 0.2s, background 0.2s, color 0.2s';
        btn.style.pointerEvents = 'all';
        btn.style.left = (x + btnConfig.offsetX) + 'px';
        btn.style.top = (y + btnConfig.offsetY) + 'px';
        btn.style.opacity = '0';
        btn.style.transform = 'scale(0)';
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = btnConfig.hoverColor;
            btn.style.color = 'white';
            btn.style.transform = 'scale(1.15)';
            btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
        });
        
        btn.addEventListener('click', () => {
            btnConfig.action();
        });
        
        menuContainer.appendChild(btn);
        
        setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
        }, index * 50);
    });
    
    // Keyboard handler
    const keyHandler = (e) => {
        if (state.multiSelection.menuActive && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            deleteSelectedNodes();
            document.removeEventListener('keydown', keyHandler);
        } else if (e.key === 'Escape') {
            hideSelectionRadialMenu();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
    
    menuContainer.dataset.keyHandler = 'active';
}

export function hideSelectionRadialMenu() {
    const menu = document.getElementById('selectionRadialMenu');
    if (menu) {
        menu.remove();
    }
    state.multiSelection.menuActive = false;
}

export function showEmptyAreaMenu(x, y) {
    // Don't show empty area menu in gallery viewer mode
    if (state.isGalleryViewer) {
        return;
    }
    
    // Remove existing menu if any
    hideEmptyAreaMenu();
    
    const menuContainer = document.createElement('div');
    menuContainer.id = 'emptyAreaMenu';
    menuContainer.style.position = 'fixed';
    menuContainer.style.pointerEvents = 'none';
    menuContainer.style.zIndex = '10000';
    document.body.appendChild(menuContainer);
    
    const btn = document.createElement('button');
    btn.id = 'empty-area-zone-btn';
    btn.className = 'empty-area-btn';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>`;
    btn.style.position = 'fixed';
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.borderRadius = '50%';
    btn.style.border = 'none';
    btn.style.background = 'white';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.color = '#333';
    btn.style.transition = 'transform 0.2s, box-shadow 0.2s, background 0.2s, color 0.2s';
    btn.style.pointerEvents = 'all';
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.opacity = '0';
    btn.style.transform = 'scale(0)';
    
    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#27ae60';
        btn.style.color = 'white';
        btn.style.transform = 'scale(1.15)';
        btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
    });
    
    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'white';
        btn.style.color = '#333';
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    });
    
    btn.addEventListener('click', () => {
        // Remove click outside handler when opening dialog
        if (state.multiSelection.emptyAreaClickHandler) {
            document.removeEventListener('click', state.multiSelection.emptyAreaClickHandler);
            state.multiSelection.emptyAreaClickHandler = null;
        }
        openMultiTagDialog(true); // true = isEmptyAreaMode
    });
    
    menuContainer.appendChild(btn);
    
    setTimeout(() => {
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1)';
    }, 50);
    
    // Click outside handler
    const clickHandler = (e) => {
        const menu = document.getElementById('emptyAreaMenu');
        const modal = document.getElementById('multiTagModal');
        // Don't close if clicking inside the menu or if modal is open
        if ((menu && !menu.contains(e.target)) && !modal) {
            hideEmptyAreaMenu();
            if (state.multiSelection.selectionBox) {
                state.multiSelection.selectionBox.style.display = 'none';
            }
            state.multiSelection.emptyAreaSelection = null;
            document.removeEventListener('click', clickHandler);
            state.multiSelection.emptyAreaClickHandler = null;
        }
    };
    // Store reference to the handler
    state.multiSelection.emptyAreaClickHandler = clickHandler;
    
    // Add listener after a short delay to avoid immediate triggering
    setTimeout(() => {
        document.addEventListener('click', clickHandler);
    }, 100);
    
    // Escape key handler
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            hideEmptyAreaMenu();
            if (state.multiSelection.selectionBox) {
                state.multiSelection.selectionBox.style.display = 'none';
            }
            state.multiSelection.emptyAreaSelection = null;
            document.removeEventListener('keydown', keyHandler);
            if (state.multiSelection.emptyAreaClickHandler) {
                document.removeEventListener('click', state.multiSelection.emptyAreaClickHandler);
                state.multiSelection.emptyAreaClickHandler = null;
            }
        }
    };
    document.addEventListener('keydown', keyHandler);
}

export function hideEmptyAreaMenu() {
    const menu = document.getElementById('emptyAreaMenu');
    if (menu) {
        menu.remove();
    }
    
    // Clean up click outside handler
    if (state.multiSelection.emptyAreaClickHandler) {
        document.removeEventListener('click', state.multiSelection.emptyAreaClickHandler);
        state.multiSelection.emptyAreaClickHandler = null;
    }
    
    // DON'T clear the empty area selection here - it needs to persist for zone creation
    // It will be cleared after the zone is created or when the selection is cancelled
    
    // DON'T hide selection box here - keep it visible until zone is created
}

export function openEmptyAreaZoneDialog() {
    if (!state.multiSelection.emptyAreaSelection) return;
    
    hideEmptyAreaMenu();
    
    // Use the same dialog as multi-tag dialog but for empty area
    openMultiTagDialog(true); // Pass true to indicate empty area mode
}

export function closeEmptyAreaZoneDialog() {
    closeMultiTagDialog();
}

export function applyEmptyAreaZone(zoneColor) {
    // This function is now handled by applyEmptyAreaZoneFromDialog in toolbar.js
    applyEmptyAreaZoneFromDialog(zoneColor);
}

