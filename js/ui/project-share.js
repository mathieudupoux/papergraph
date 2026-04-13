import { getProjectShareSettings, updateProjectShareSettings } from '../auth/projects.js';
import { getUrl } from '../utils/base-path.js';
import { showNotification } from '../utils/helpers.js';
import { appStore, getStore } from '../store/appStore.js';
import { openModal, closeModal, registerModal } from './modal-manager.js';

const MODAL_ID = 'shareProjectModal';

let isInitialized = false;
let elements = null;
let shareState = null;
const COPY_BUTTON_DEFAULT_LABEL = 'Copy Link';
const COPY_BUTTON_SUCCESS_LABEL = 'Copied';

function resolveElements() {
    return {
        trigger: document.getElementById('projectShareBtn'),
        modal: document.getElementById(MODAL_ID),
        close: document.getElementById('closeShareProjectModal'),
        toggle: document.getElementById('shareEnabledToggle'),
        status: document.getElementById('shareStatusText'),
        section: document.querySelector('.share-settings-section--single'),
        actions: document.getElementById('shareSettingsActions'),
        input: document.getElementById('shareLinkInput'),
        copy: document.getElementById('copyShareLinkBtn'),
        regenerate: document.getElementById('regenerateShareLinkBtn')
    };
}

function getShareableProjectId() {
    return getStore().currentProjectId;
}

function canManageProjectShare() {
    const role = getStore().currentUserRole;
    return Boolean(getShareableProjectId())
        && !getStore().isReadOnlyMode
        && !getStore().isGalleryViewer
        && (role === null || role === 'owner');
}

function buildShareUrl(token) {
    if (!token) return '';
    return new URL(
        getUrl(`editor.html?share=${encodeURIComponent(token)}`),
        window.location.origin
    ).href;
}

function resetCopyState() {
    if (!elements?.copy) return;
    elements.copy.classList.remove('copied');
    elements.copy.textContent = COPY_BUTTON_DEFAULT_LABEL;
}

function setControlsBusy(isBusy) {
    if (!elements) return;

    if (elements.toggle) {
        elements.toggle.disabled = isBusy;
    }

    if (elements.copy) {
        elements.copy.disabled = isBusy || !shareState?.is_public || !shareState?.share_token;
    }

    if (elements.regenerate) {
        elements.regenerate.disabled = isBusy || !shareState?.is_public;
    }
}

function setActionsVisible(isVisible) {
    if (!elements?.actions) return;
    elements.actions.classList.toggle('is-hidden', !isVisible);
    elements.actions.setAttribute('aria-hidden', String(!isVisible));
    elements.section?.classList.toggle('share-settings-section--expanded', isVisible);
}

function renderShareState(settings) {
    shareState = settings;

    if (!elements) return;

    const shareUrl = buildShareUrl(settings?.share_token);
    const isEnabled = Boolean(settings?.is_public);

    elements.toggle.checked = isEnabled;
    elements.input.value = isEnabled ? shareUrl : '';
    elements.input.placeholder = isEnabled
        ? 'Read-only link ready'
        : 'Enable sharing to generate a link';
    elements.copy.disabled = !isEnabled || !shareUrl;
    elements.regenerate.disabled = !isEnabled;
    elements.status.textContent = isEnabled
        ? 'Anyone with the link can view.'
        : 'Link disabled.';
    setActionsVisible(isEnabled);

    resetCopyState();
}

function setLoadingState(message = 'Loading share settings...') {
    if (!elements) return;
    elements.status.textContent = message;
    elements.input.value = '';
    elements.input.placeholder = 'Please wait...';
    elements.copy.disabled = true;
    elements.regenerate.disabled = true;
    elements.toggle.disabled = true;
    setActionsVisible(false);
}

async function copyShareLink() {
    if (!shareState?.is_public || !shareState?.share_token) {
        return;
    }

    const shareUrl = buildShareUrl(shareState.share_token);

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
        } else {
            elements.input.focus();
            elements.input.select();
            document.execCommand('copy');
        }

        elements.copy.classList.add('copied');
        elements.copy.textContent = COPY_BUTTON_SUCCESS_LABEL;
        showNotification('Share link copied', 'success');
        window.setTimeout(resetCopyState, 1400);
    } catch (error) {
        console.error('Copy share link error:', error);
        showNotification('Failed to copy the share link', 'error');
    }
}

async function refreshShareSettings() {
    const projectId = getShareableProjectId();
    if (!projectId) {
        throw new Error('No project selected');
    }

    const settings = await getProjectShareSettings(projectId);
    renderShareState(settings);
    return settings;
}

async function updateShareSettings({ enabled, regenerate = false }) {
    const projectId = getShareableProjectId();
    if (!projectId) {
        showNotification('Open a saved cloud project to share it', 'info');
        return;
    }

    setControlsBusy(true);

    try {
        const settings = await updateProjectShareSettings(projectId, { enabled, regenerate });
        renderShareState(settings);

        if (regenerate) {
            showNotification('Share link regenerated', 'success');
        } else if (enabled) {
            showNotification('Share link enabled', 'success');
        } else {
            showNotification('Share link disabled', 'info');
        }
    } catch (error) {
        console.error('Update share settings error:', error);
        showNotification(error.message || 'Failed to update share settings', 'error');
        try {
            await refreshShareSettings();
        } catch (refreshError) {
            console.error('Refresh share settings error:', refreshError);
            setLoadingState('Could not refresh share settings.');
        }
    } finally {
        setControlsBusy(false);
    }
}

async function openShareProjectModal() {
    if (!canManageProjectShare()) {
        showNotification('Open a saved editable project to manage sharing', 'info');
        return;
    }

    openModal(MODAL_ID);
    setLoadingState();

    try {
        await refreshShareSettings();
    } catch (error) {
        console.error('Open share modal error:', error);
        showNotification(error.message || 'Failed to load share settings', 'error');
        setLoadingState(error.message || 'Failed to load share settings.');
    } finally {
        setControlsBusy(false);
    }
}

export function refreshProjectShareButton() {
    if (!elements?.trigger) return;
    elements.trigger.style.display = canManageProjectShare() ? 'flex' : 'none';

    if (!canManageProjectShare()) {
        closeModal(MODAL_ID);
    }
}

export async function initProjectShare() {
    if (isInitialized) {
        refreshProjectShareButton();
        return;
    }

    elements = resolveElements();

    if (!elements.trigger || !elements.modal) {
        return;
    }

    isInitialized = true;

    registerModal(MODAL_ID, {
        onClose() {
            resetCopyState();
        }
    });

    elements.trigger.addEventListener('click', openShareProjectModal);
    elements.close?.addEventListener('click', () => closeModal(MODAL_ID));
    elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal) {
            closeModal(MODAL_ID);
        }
    });

    elements.toggle?.addEventListener('change', async () => {
        await updateShareSettings({
            enabled: elements.toggle.checked,
            regenerate: false
        });
    });

    elements.copy?.addEventListener('click', copyShareLink);
    elements.regenerate?.addEventListener('click', async () => {
        await updateShareSettings({
            enabled: true,
            regenerate: true
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal(MODAL_ID);
        }
    });

    appStore.subscribe((state, prevState) => {
        if (
            state.currentProjectId !== prevState.currentProjectId ||
            state.isReadOnlyMode !== prevState.isReadOnlyMode ||
            state.isGalleryViewer !== prevState.isGalleryViewer
        ) {
            refreshProjectShareButton();
        }
    });

    refreshProjectShareButton();
}
