// ===== KEYBOARD SHORTCUTS =====
// Global keyboard shortcut bindings for undo/redo and other actions.

import { undo, redo, getStore, appStore } from '../store/appStore.js';
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
    network.redraw();
}

function isMacPlatform() {
    return navigator.platform?.startsWith('Mac') ?? false;
}

export function canUndo() {
    return (appStore.temporal?.getState().pastStates?.length ?? 0) > 0;
}

export function canRedo() {
    return (appStore.temporal?.getState().futureStates?.length ?? 0) > 0;
}

export function getUndoShortcutLabel() {
    return isMacPlatform() ? 'Cmd+Z' : 'Ctrl+Z';
}

export function getRedoShortcutLabel() {
    return isMacPlatform() ? 'Cmd+Shift+Z' : 'Ctrl+Y';
}

export function performUndo() {
    if (!canUndo()) return false;
    console.log('[shortcuts] undo triggered');
    undo();
    applyUndoRedo();
    return true;
}

export function performRedo() {
    if (!canRedo()) return false;
    console.log('[shortcuts] redo triggered');
    redo();
    applyUndoRedo();
    return true;
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

        const isMac = isMacPlatform();
        const ctrl = isMac ? e.metaKey : e.ctrlKey;

        if (!ctrl) return;

        // Undo: Ctrl+Z / Cmd+Z
        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            performUndo();
            return;
        }

        // Redo: Ctrl+Y / Cmd+Y / Cmd+Shift+Z
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            performRedo();
        }
    });
}
