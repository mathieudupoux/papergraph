import { getStore } from '../store/appStore.js';

function getIndicator() {
    return document.getElementById('touchZoneModeIndicator');
}

function ensureIndicatorBinding() {
    const indicator = getIndicator();
    if (!indicator || indicator.dataset.bound === 'true') return;

    const cancelButton = document.getElementById('cancelTouchZoneMode');
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            disableTouchZoneCreationMode();
        });
    }

    indicator.dataset.bound = 'true';
}

export function isTouchScreen() {
    if (typeof window === 'undefined') return false;

    return Boolean(
        window.matchMedia?.('(pointer: coarse)').matches
        || navigator.maxTouchPoints > 0
        || 'ontouchstart' in window
    );
}

export function isPhoneViewport() {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 800;
}

export function getMobileBottomDeadzonePx() {
    if (!isPhoneViewport()) return 0;
    return Math.max(Math.round(window.innerHeight * 0.5), 280);
}

export function syncTouchZoneModeIndicator() {
    ensureIndicatorBinding();

    const indicator = getIndicator();
    if (!indicator) return;

    indicator.classList.toggle('active', Boolean(getStore().touchZoneCreationMode));
}

export function enableTouchZoneCreationMode() {
    getStore().setTouchZoneCreationMode(true);
    syncTouchZoneModeIndicator();
}

export function disableTouchZoneCreationMode() {
    getStore().setTouchZoneCreationMode(false);
    syncTouchZoneModeIndicator();
}
