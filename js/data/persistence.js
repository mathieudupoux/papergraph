// ===== PERSISTENCE LAYER =====
// Unified save/load abstraction for project data.
// All modules call save() instead of touching localStorage directly.

import { getStore, getNetwork } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';

const _onSaveCallbacks = [];

/**
 * Save current project state to localStorage and (if enabled) to the cloud.
 * Notifies all onSave subscribers after writing.
 */
export function save(silent = false) {
    try {
        // Gallery projects are read-only
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('source') === 'gallery') {
            if (!silent) {
                showNotification('Gallery projects are read-only. Use Export to save your own copy.', 'info');
            }
            return;
        }

        // Persist vis.js positions
        if (getNetwork()) {
            const positions = getNetwork().getPositions();
            localStorage.setItem('papermap_positions', JSON.stringify(positions));
            getStore().setSavedNodePositions(positions);
        }

        // Persist project data
        localStorage.setItem('papermap_data', JSON.stringify(getStore().appData));
        localStorage.setItem('papermap_zones', JSON.stringify(getStore().tagZones));
        localStorage.setItem('papermap_edge_control_points', JSON.stringify(getStore().edgeControlPoints));
        localStorage.setItem('papermap_next_control_point_id', getStore().nextControlPointId.toString());

        // Cloud sync (async, non-blocking)
        _syncToCloud();

        // Notify subscribers (e.g. bibliography cache rebuild)
        for (const cb of _onSaveCallbacks) {
            try { cb(); } catch (e) { console.warn('onSave callback error:', e); }
        }
    } catch (e) {
        showNotification('Erreur lors de la sauvegarde: ' + e.message, 'error');
    }
}

/**
 * Load project data from localStorage into state.
 * Handles gallery read-only mode and backward-compatible formats.
 */
export function load() {
    try {
        // Gallery read-only projects are loaded from session state, not localStorage
        if (getStore().isReadOnlyMode && getStore().galleryProjectData) {
            _loadGalleryProject();
            return;
        }

        const saved = localStorage.getItem('papermap_data');
        if (saved) {
            getStore().setAppData(JSON.parse(saved));

            if (!getStore().appData.projectReview) {
                getStore().setProjectReview("");
            }
            if (!getStore().appData.projectReviewMeta) {
                getStore().updateProjectReviewMeta({ title: 'Project Review', authors: '' });
            }
        }

        // Tag zones
        const savedZones = localStorage.getItem('papermap_zones');
        if (savedZones) {
            getStore().setTagZones(JSON.parse(savedZones));
        } else {
            // Lazy import to avoid circular dep — zone init needs network
            import('./storage.js').then(m => m.initializeZonesFromTags());
        }

        // Edge control points
        const savedControlPoints = localStorage.getItem('papermap_edge_control_points');
        if (savedControlPoints) {
            getStore().setEdgeControlPoints(JSON.parse(savedControlPoints));
        } else {
            getStore().setEdgeControlPoints({});
        }

        const savedNextId = localStorage.getItem('papermap_next_control_point_id');
        if (savedNextId) {
            getStore().setNextControlPointId(parseInt(savedNextId));
        } else {
            getStore().setNextControlPointId(-1);
        }

        // Node positions
        const savedPositions = localStorage.getItem('papermap_positions');
        if (savedPositions) {
            getStore().setSavedNodePositions(JSON.parse(savedPositions));
        } else {
            getStore().setSavedNodePositions({});
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        showNotification('Erreur lors du chargement: ' + e.message, 'error');
    }
}

/**
 * Register a callback that fires after every save().
 * Returns an unsubscribe function.
 */
export function onSave(cb) {
    _onSaveCallbacks.push(cb);
    return () => {
        const idx = _onSaveCallbacks.indexOf(cb);
        if (idx >= 0) _onSaveCallbacks.splice(idx, 1);
    };
}

// Convenience object matching the TODO spec
export const storage = { save, load, onSave };

// ── private helpers ─────────────────────────────────────────────

async function _syncToCloud() {
    try {
        const { isCloudStorageEnabled, saveToCloud } = await import('./cloud-storage.js');
        if (isCloudStorageEnabled()) {
            saveToCloud(true);
        }
    } catch (e) {
        console.warn('Cloud save skipped:', e.message);
    }
}

function _loadGalleryProject() {
    const galleryData = getStore().galleryProjectData.data;

    if (galleryData.nodes && galleryData.edges) {
        // Cloud format (nodes/edges)
        getStore().setAppData({
            articles: (galleryData.nodes || []).map(a => ({ ...a, categories: Array.isArray(a.categories) ? a.categories : [] })),
            connections: galleryData.edges || [],
            projectReview: galleryData.projectReview || '',
            projectReviewMeta: galleryData.projectReviewMeta || {
                title: 'Project Review',
                authorsData: [{ name: '', affiliationNumbers: [] }],
                affiliationsData: [{ text: '' }],
                abstract: ''
            },
            nextArticleId: Math.max(0, ...(galleryData.nodes || []).map(n => n.id || 0)) + 1,
            nextConnectionId: Math.max(0, ...(galleryData.edges || []).map(e => e.id || 0)) + 1,
        });
        getStore().setTagZones(galleryData.zones || []);
        getStore().setSavedNodePositions(galleryData.positions || {});
    } else if (galleryData.articles && galleryData.connections) {
        // Editor format (articles/connections)
        getStore().setAppData({
            articles: (galleryData.articles || []).map(a => ({ ...a, categories: Array.isArray(a.categories) ? a.categories : [] })),
            connections: galleryData.connections || [],
            projectReview: galleryData.projectReview || '',
            projectReviewMeta: galleryData.projectReviewMeta || {
                title: 'Project Review',
                authorsData: [{ name: '', affiliationNumbers: [] }],
                affiliationsData: [{ text: '' }],
                abstract: ''
            },
            nextArticleId: galleryData.nextArticleId || Math.max(0, ...(galleryData.articles || []).map(n => n.id || 0)) + 1,
            nextConnectionId: galleryData.nextConnectionId || Math.max(0, ...(galleryData.connections || []).map(e => e.id || 0)) + 1,
        });
        getStore().setTagZones(galleryData.tagZones || galleryData.zones || []);
        getStore().setSavedNodePositions(galleryData.nodePositions || galleryData.positions || {});
    }

    // Initialize control points
    getStore().setEdgeControlPoints({});
    getStore().setNextControlPointId(-1);
}
