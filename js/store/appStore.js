// ===== APPLICATION STORE =====
// Zustand + zundo store — single source of truth for all application state.
// Pure data (articles, connections, positions) is tracked for undo/redo.
// UI state (flags, selections) is stored here but excluded from history.

import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';

// ── Network reference (vis.js Network; not reactive, not in store) ─────
let _network = null;
export const getNetwork = () => _network;
export const setNetwork = (net) => { _network = net; };

function normalizeAppData(appData = {}) {
    const articles = (appData.articles || []).map((article) => ({
        ...article,
        categories: Array.isArray(article.categories) ? article.categories : [],
    }));
    const connections = appData.connections || [];

    return {
        articles,
        connections,
        nextArticleId: appData.nextArticleId || Math.max(0, ...articles.map((a) => parseInt(a.id, 10) || 0)) + 1,
        nextConnectionId: appData.nextConnectionId || Math.max(0, ...connections.map((c) => parseInt(c.id, 10) || 0)) + 1,
    };
}

// ── Store Definition ───────────────────────────────────────────────────
const storeDefinition = (set, get) => ({
    // ── Tracked Data — undo/redo applies to these ─────────────────────
    appData: normalizeAppData(),
    tagZones: [],
    savedNodePositions: {},
    edgeControlPoints: {},
    nextControlPointId: -1,

    // ── Mode Flags ────────────────────────────────────────────────────
    isReadOnlyMode: false,
    isGalleryViewer: false,
    galleryProjectData: null,
    galleryProjectMetadata: null,
    currentProjectId: null,

    // ── User Permissions ──────────────────────────────────────────────
    currentUserRole: null,
    isReadOnly: false,

    // ── UI State ──────────────────────────────────────────────────────
    isEditingEdgeLabel: false,
    currentEditingArticleId: null,
    pendingImportArticle: null,
    currentCategoryFilter: '',
    activeFilters: { category: null },

    connectionMode: {
        active: false,
        fromNodeId: null,
        tempEdge: null,
        tempNode: null,
        toNodeId: null,
        hoveredNodeId: null,
        mouseMoveHandler: null,
        hoverHandler: null,
        blurHandler: null,
    },

    selectedNodeId: null,
    selectedEdgeId: null,
    gridEnabled: false,
    currentPulseInterval: null,

    multiSelection: {
        active: false,
        selectedNodes: [],
        selectionBox: null,
        startX: 0,
        startY: 0,
        menuActive: false,
        wasDragging: false,
        emptyAreaSelection: null,
        selectionBoundsCanvas: null,
        emptyAreaClickHandler: null,
        selectedZonesForDrag: [],
        zonesDragStart: {},
        nodeDragStart: null,
        boxDragging: false,
        boxDragStart: { x: 0, y: 0 },
        originalBoxPosition: { left: 0, top: 0 },
    },

    isDraggingView: false,

    zoneResizing: {
        active: false,
        zoneIndex: -1,
        handle: null,
        startX: 0,
        startY: 0,
        originalZone: null,
    },

    zoneMoving: {
        active: false,
        readyToMove: false,
        zoneIndex: -1,
        startX: 0,
        startY: 0,
        originalZone: null,
        originalNodePositions: {},
        originalNestedZones: {},
    },

    zoneEditing: {
        active: false,
        zoneIndex: -1,
        inputElement: null,
        backgroundElement: null,
    },

    selectedZoneIndex: -1,
    currentEditingElement: null,
    originalContent: '',
    inlineEditingSetup: false,
    currentPreviewArticleId: null,
    touchZoneCreationMode: false,

    // ── appData Actions ───────────────────────────────────────────────

    setAppData: (appData) => set({ appData: normalizeAppData(appData) }),

    setArticles: (articles) => set((s) => ({ appData: { ...s.appData, articles } })),

    /** Adds an article, assigning it the next available ID. Returns the assigned ID. */
    importArticle: (articleData) => {
        let assignedId;
        set((s) => {
            assignedId = s.appData.nextArticleId;
            const article = { ...articleData, id: assignedId };
            return {
                appData: {
                    ...s.appData,
                    articles: [...s.appData.articles, article],
                    nextArticleId: assignedId + 1,
                },
            };
        });
        return assignedId;
    },

    addArticle: (article) => set((s) => ({
        appData: { ...s.appData, articles: [...s.appData.articles, article] },
    })),

    createArticle: (articleFields) => {
        let assignedId;
        set((s) => {
            assignedId = s.appData.nextArticleId;
            const article = { ...articleFields, id: assignedId };
            return {
                appData: {
                    ...s.appData,
                    articles: [...s.appData.articles, article],
                    nextArticleId: assignedId + 1,
                },
            };
        });
        return assignedId;
    },

    updateArticle: (id, updates) => set((s) => ({
        appData: {
            ...s.appData,
            articles: s.appData.articles.map((a) => a.id === id ? { ...a, ...updates } : a),
        },
    })),

    deleteArticle: (id) => set((s) => ({
        appData: { ...s.appData, articles: s.appData.articles.filter((a) => a.id !== id) },
    })),

    addArticleCategory: (id, category) => set((s) => ({
        appData: {
            ...s.appData,
            articles: s.appData.articles.map((a) => {
                if (a.id !== id) return a;
                const cats = a.categories || [];
                return cats.includes(category) ? a : { ...a, categories: [...cats, category] };
            }),
        },
    })),

    removeArticleCategory: (id, category) => set((s) => ({
        appData: {
            ...s.appData,
            articles: s.appData.articles.map((a) => {
                if (a.id !== id) return a;
                return { ...a, categories: (a.categories || []).filter((c) => c !== category) };
            }),
        },
    })),

    renameArticleCategory: (oldTag, newTag) => set((s) => ({
        appData: {
            ...s.appData,
            articles: s.appData.articles.map((a) => ({
                ...a,
                categories: (a.categories || []).map((c) => (c === oldTag ? newTag : c)),
            })),
        },
    })),

    removeArticleCategoryGlobal: (tag) => set((s) => ({
        appData: {
            ...s.appData,
            articles: s.appData.articles.map((a) => ({
                ...a,
                categories: (a.categories || []).filter((c) => c !== tag),
            })),
        },
    })),

    setConnections: (connections) => set((s) => ({ appData: { ...s.appData, connections } })),

    createConnection: (from, to, label = '') => {
        let newConn;
        set((s) => {
            newConn = { id: s.appData.nextConnectionId, from, to, label };
            return {
                appData: {
                    ...s.appData,
                    connections: [...s.appData.connections, newConn],
                    nextConnectionId: s.appData.nextConnectionId + 1,
                },
            };
        });
        return newConn;
    },

    addConnection: (connection) => set((s) => ({
        appData: { ...s.appData, connections: [...s.appData.connections, connection] },
    })),

    updateConnectionLabel: (id, label) => set((s) => ({
        appData: {
            ...s.appData,
            connections: s.appData.connections.map((c) => c.id === id ? { ...c, label } : c),
        },
    })),

    deleteConnection: (id) => set((s) => ({
        appData: {
            ...s.appData,
            connections: s.appData.connections.filter((c) => c.id !== id),
        },
    })),

    setNextArticleId: (id) => set((s) => ({ appData: { ...s.appData, nextArticleId: id } })),
    setNextConnectionId: (id) => set((s) => ({ appData: { ...s.appData, nextConnectionId: id } })),

    // ── tagZones Actions ──────────────────────────────────────────────

    setTagZones: (tagZones) => set({ tagZones }),

    addTagZone: (zone) => set((s) => ({ tagZones: [...s.tagZones, zone] })),

    replaceTagZone: (index, zone) => set((s) => {
        const tagZones = [...s.tagZones];
        tagZones[index] = zone;
        return { tagZones };
    }),

    updateTagZone: (index, updates) => set((s) => ({
        tagZones: s.tagZones.map((z, i) => (i === index ? { ...z, ...updates } : z)),
    })),

    deleteTagZone: (index) => set((s) => ({
        tagZones: s.tagZones.filter((_, i) => i !== index),
    })),

    // ── savedNodePositions Actions ────────────────────────────────────

    setSavedNodePositions: (savedNodePositions) => set({ savedNodePositions }),

    commitTrackedGraphState: ({ articles, tagZones, savedNodePositions }) => set((s) => ({
        appData: articles ? {
            ...s.appData,
            articles: articles.map((article) => ({
                ...article,
                categories: Array.isArray(article.categories) ? article.categories : [],
            })),
        } : s.appData,
        tagZones: tagZones ?? s.tagZones,
        savedNodePositions: savedNodePositions ?? s.savedNodePositions,
    })),

    mergeNodePositions: (positions) => set((s) => ({
        savedNodePositions: { ...s.savedNodePositions, ...positions },
    })),

    // ── edgeControlPoints Actions ─────────────────────────────────────

    setEdgeControlPoints: (edgeControlPoints) => set({ edgeControlPoints }),

    initEdgeControlPoints: (edgeId) => set((s) => ({
        edgeControlPoints: { ...s.edgeControlPoints, [edgeId]: [] },
    })),

    insertControlPoint: (edgeId, cpId, segmentIndex) => set((s) => {
        const existing = s.edgeControlPoints[edgeId] || [];
        let updated;
        if (segmentIndex !== undefined && segmentIndex >= 0 && segmentIndex <= existing.length) {
            updated = [
                ...existing.slice(0, segmentIndex),
                cpId,
                ...existing.slice(segmentIndex),
            ];
        } else {
            updated = [...existing, cpId];
        }
        return { edgeControlPoints: { ...s.edgeControlPoints, [edgeId]: updated } };
    }),

    removeControlPoint: (edgeId, cpId) => set((s) => {
        const existing = s.edgeControlPoints[edgeId] || [];
        const updated = existing.filter((id) => id !== cpId);
        if (updated.length === 0) {
            const { [edgeId]: _removed, ...rest } = s.edgeControlPoints;
            return { edgeControlPoints: rest };
        }
        return { edgeControlPoints: { ...s.edgeControlPoints, [edgeId]: updated } };
    }),

    deleteEdgeControlPoints: (edgeId) => set((s) => {
        const { [edgeId]: _removed, ...rest } = s.edgeControlPoints;
        return { edgeControlPoints: rest };
    }),

    // ── nextControlPointId Actions ────────────────────────────────────

    decrementNextControlPointId: () => set((s) => ({
        nextControlPointId: s.nextControlPointId - 1,
    })),

    setNextControlPointId: (id) => set({ nextControlPointId: id }),

    // ── UI State Actions (not tracked by temporal) ────────────────────

    setIsReadOnlyMode: (isReadOnlyMode) => set({ isReadOnlyMode }),
    setIsGalleryViewer: (isGalleryViewer) => set({ isGalleryViewer }),
    setGalleryProjectData: (galleryProjectData) => set({ galleryProjectData }),
    setGalleryProjectMetadata: (galleryProjectMetadata) => set({ galleryProjectMetadata }),
    setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),
    setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),
    setIsReadOnly: (isReadOnly) => set({ isReadOnly }),

    setGridEnabled: (gridEnabled) => set({ gridEnabled }),
    toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),

    setCategoryFilter: (filter) => set({
        currentCategoryFilter: filter,
        activeFilters: { category: filter || null },
    }),
    setActiveFilters: (activeFilters) => set({ activeFilters }),

    setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
    setSelectedEdgeId: (selectedEdgeId) => set({ selectedEdgeId }),
    setSelectedZoneIndex: (selectedZoneIndex) => set({ selectedZoneIndex }),
    setIsDraggingView: (isDraggingView) => set({ isDraggingView }),
    setIsEditingEdgeLabel: (isEditingEdgeLabel) => set({ isEditingEdgeLabel }),
    setCurrentEditingArticleId: (currentEditingArticleId) => set({ currentEditingArticleId }),
    setPendingImportArticle: (pendingImportArticle) => set({ pendingImportArticle }),
    setCurrentPulseInterval: (currentPulseInterval) => set({ currentPulseInterval }),
    setInlineEditingSetup: (inlineEditingSetup) => set({ inlineEditingSetup }),
    setCurrentPreviewArticleId: (currentPreviewArticleId) => set({ currentPreviewArticleId }),
    setCurrentEditingElement: (currentEditingElement) => set({ currentEditingElement }),
    setOriginalContent: (originalContent) => set({ originalContent }),
    setTouchZoneCreationMode: (touchZoneCreationMode) => set({ touchZoneCreationMode }),

    updateConnectionMode: (updates) => set((s) => ({
        connectionMode: { ...s.connectionMode, ...updates },
    })),
    resetConnectionMode: () => set({
        connectionMode: {
            active: false, fromNodeId: null, tempEdge: null, tempNode: null,
            toNodeId: null, hoveredNodeId: null, mouseMoveHandler: null,
            hoverHandler: null, blurHandler: null,
        },
    }),

    updateMultiSelection: (updates) => set((s) => ({
        multiSelection: { ...s.multiSelection, ...updates },
    })),
    resetMultiSelection: () => set((s) => ({
        multiSelection: {
            ...s.multiSelection,
            selectedNodes: [],
            selectedZonesForDrag: [],
            menuActive: false,
            wasDragging: false,
            emptyAreaSelection: null,
            emptyAreaClickHandler: null,
            zonesDragStart: {},
            nodeDragStart: null,
        },
    })),

    updateZoneMoving: (updates) => set((s) => ({
        zoneMoving: { ...s.zoneMoving, ...updates },
    })),
    resetZoneMoving: () => set({
        zoneMoving: {
            active: false, readyToMove: false, zoneIndex: -1,
            startX: 0, startY: 0, originalZone: null,
            originalNodePositions: {}, originalNestedZones: {},
        },
    }),

    updateZoneResizing: (updates) => set((s) => ({
        zoneResizing: { ...s.zoneResizing, ...updates },
    })),
    resetZoneResizing: () => set({
        zoneResizing: {
            active: false, zoneIndex: -1, handle: null,
            startX: 0, startY: 0, originalZone: null,
        },
    }),

    updateZoneEditing: (updates) => set((s) => ({
        zoneEditing: { ...s.zoneEditing, ...updates },
    })),
    resetZoneEditing: () => set({
        zoneEditing: { active: false, zoneIndex: -1, inputElement: null, backgroundElement: null },
    }),
});

// ── Temporal (Undo/Redo) Middleware ────────────────────────────────────
// Only snapshots pure data fields; UI state changes do not create undo entries.
export const appStore = createStore(
    temporal(storeDefinition, {
        limit: 50,
        partialize: (s) => ({
            appData: s.appData,
            tagZones: s.tagZones,
            savedNodePositions: s.savedNodePositions,
            edgeControlPoints: s.edgeControlPoints,
            nextControlPointId: s.nextControlPointId,
        }),
        // Only record a snapshot when the tracked data actually changed.
        // Without this, every set() call (including UI-only state) creates an entry.
        equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    })
);

// ── Convenience accessors ──────────────────────────────────────────────
export const getStore = appStore.getState.bind(appStore);

// Verify temporal middleware attached correctly
if (!appStore.temporal) {
    console.error('[appStore] zundo temporal middleware did not attach — undo/redo will not work');
} else {
    console.log('[appStore] temporal middleware ready, undo/redo available');
}

// ── Reference-counted pause/resume ────────────────────────────────────
// A counter instead of a boolean prevents nested callers (e.g. save() called
// during a drag) from accidentally resuming history before the outer caller
// (dragEnd) finishes.
let _pauseDepth = 0;

/** Call undo() to revert the last tracked data change. */
export const undo = () => appStore.temporal?.getState().undo();

/** Call redo() to re-apply a change that was undone. */
export const redo = () => appStore.temporal?.getState().redo();

/** Pause undo history recording. Nested-safe — pauses on first call only. */
export const pauseHistory = () => {
    _pauseDepth++;
    if (_pauseDepth === 1) appStore.temporal?.getState().pause();
};

/** Resume undo history recording. Nested-safe — resumes only when all callers have released. */
export const resumeHistory = () => {
    if (_pauseDepth > 0) _pauseDepth--;
    if (_pauseDepth === 0) appStore.temporal?.getState().resume();
};

/** Returns true if history recording is currently paused (i.e. inside a drag or load block). */
export const isHistoryPaused = () => _pauseDepth > 0;

/** Clear all undo/redo history (called after initial load so load steps aren't undoable). */
export const clearHistory = () => {
    _pauseDepth = 0;
    appStore.temporal?.getState().resume();
    appStore.temporal?.getState().clear();
};
