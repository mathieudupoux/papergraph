// ===== MODAL MANAGER =====
// Unified open/close/register for all modals.
// Replaces ad-hoc .style.display and .classList.toggle calls.

const _registry = {};   // id → { onOpen, onClose }

/**
 * Open a modal by element ID.
 * Adds the `.active` class (CSS handles the rest via `.modal.active { display:flex }`).
 * Calls the registered `onOpen(data)` callback if one exists.
 */
export function openModal(id, data) {
    const el = document.getElementById(id);
    if (!el) return;
    // Normalise — remove any inline display override so CSS class wins
    el.style.removeProperty('display');
    el.classList.add('active');
    if (_registry[id]?.onOpen) _registry[id].onOpen(data);
}

/**
 * Close a modal by element ID.
 * Removes `.active`; calls `onClose` callback if registered.
 */
export function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty('display');
    el.classList.remove('active');
    if (_registry[id]?.onClose) _registry[id].onClose();
}

/**
 * Register lifecycle hooks for a modal.
 *   register('preferencesModal', {
 *     onOpen(data)  { loadPreferencesData(); },
 *     onClose()     { /* cleanup *\/ }
 *   });
 */
export function registerModal(id, { onOpen, onClose } = {}) {
    _registry[id] = { onOpen: onOpen || null, onClose: onClose || null };
}

/**
 * Close every currently-open `.modal.active` element.
 */
export function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(el => {
        closeModal(el.id);
    });
}

// Convenience object matching the TODO spec
export const modal = { open: openModal, close: closeModal, register: registerModal };
