// ===== KEYBOARD SHORTCUTS =====
// Global keyboard shortcut bindings for undo/redo and other actions.

import { undo, redo, getStore } from '../store/appStore.js';
import { updateGraph } from '../graph/render.js';
import { getNetwork } from '../store/appStore.js';

/**
 * After undo/redo, restore vis.js node positions from the store snapshot
 * and refresh the graph display.
 */
function applyUndoRedo() {
    updateGraph();
    const network = getNetwork();
    if (!network) return;
    const positions = getStore().savedNodePositions;
    if (positions && Object.keys(positions).length > 0) {
        Object.entries(positions).forEach(([id, pos]) => {
            const nodeId = parseInt(id);
            if (network.body.nodes[nodeId]) {
                network.moveNode(nodeId, pos.x, pos.y);
            }
        });
        network.redraw();
    }
}

/**
 * Initialise all global keydown shortcuts.
 * Call once after the DOM is ready.
 */
export function initShortcuts() {
    console.log('[shortcuts] initShortcuts registered');
    document.addEventListener('keydown', (e) => {
        // Skip when focus is inside a text input/textarea/contenteditable
        const tag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = tag === 'textarea' || document.activeElement?.isContentEditable;
        // Allow input only when it's NOT a vis.js hidden input (they have no id/name and are inside .vis-network)
        const isRealInput = tag === 'input' && !document.activeElement?.closest('.vis-network');
        if (isTyping || isRealInput) return;

        const isMac = navigator.platform?.startsWith('Mac') ?? false;
        const ctrl = isMac ? e.metaKey : e.ctrlKey;

        if (!ctrl) return;

        // Undo: Ctrl+Z / Cmd+Z
        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            console.log('[shortcuts] undo triggered');
            undo();
            applyUndoRedo();
            return;
        }

        // Redo: Ctrl+Y / Cmd+Shift+Z
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            console.log('[shortcuts] redo triggered');
            redo();
            applyUndoRedo();
        }
    });
}
