// ===== KEYBOARD SHORTCUTS =====
// Global keyboard shortcut bindings for undo/redo and other actions.

import { undo, redo } from '../store/appStore.js';
import { updateGraph } from '../graph/render.js';

/**
 * Initialise all global keydown shortcuts.
 * Call once after the DOM is ready.
 */
export function initShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Skip when focus is inside a text input/textarea/contenteditable
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
            return;
        }

        const isMac = navigator.platform?.startsWith('Mac') ?? false;
        const ctrl = isMac ? e.metaKey : e.ctrlKey;

        if (!ctrl) return;

        // Undo: Ctrl+Z / Cmd+Z
        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            updateGraph();
            return;
        }

        // Redo: Ctrl+Y / Cmd+Shift+Z
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            redo();
            updateGraph();
        }
    });
}
