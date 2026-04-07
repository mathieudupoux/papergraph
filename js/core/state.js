// ===== APPLICATION STATE =====
// Central state management — single source of truth for all shared state.
// Every module imports { state } and accesses state.appData, state.network, etc.

// ── Exported State Object ───────────────────────────────────────────────

export const state = {
    // ── Data State ──────────────────────────────────────────────────────
    appData: {
        articles: [],
        connections: [],
        projectReview: "",
        projectReviewMeta: {
            title: "Project Review",
            authors: ""
        },
        nextArticleId: 1,
        nextConnectionId: 1
    },
    tagZones: [],
    savedNodePositions: {},
    edgeControlPoints: {},  // { edgeId: [controlPointNodeId, ...] }
    nextControlPointId: -1, // Negative IDs for control points

    // ── Mode Flags ──────────────────────────────────────────────────────
    isReadOnlyMode: false,
    isGalleryViewer: false,
    galleryProjectData: null,
    galleryProjectMetadata: null,
    currentProjectId: null,

    // ── Runtime References ──────────────────────────────────────────────
    network: null,

    // ── User Permissions ────────────────────────────────────────────────
    currentUserRole: null,
    isReadOnly: false,

    // ── UI State ────────────────────────────────────────────────────────
    isEditingEdgeLabel: false,
    currentEditingArticleId: null,
    pendingImportArticle: null,
    currentCategoryFilter: '',
    activeFilters: { category: null },

    connectionMode: {
        active: false,
        fromNodeId: null,
        tempEdge: null
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
        emptyAreaClickHandler: null,
        selectedZonesForDrag: [],
        zonesDragStart: {},
        nodeDragStart: null,
        boxDragging: false,
        boxDragStart: { x: 0, y: 0 },
        originalBoxPosition: { left: 0, top: 0 }
    },

    isDraggingView: false,

    zoneResizing: {
        active: false,
        zoneIndex: -1,
        handle: null,
        startX: 0,
        startY: 0,
        originalZone: null
    },

    zoneMoving: {
        active: false,
        readyToMove: false,
        zoneIndex: -1,
        startX: 0,
        startY: 0,
        originalZone: null,
        originalNodePositions: {},
        originalNestedZones: {}
    },

    zoneEditing: {
        active: false,
        zoneIndex: -1,
        inputElement: null,
        backgroundElement: null
    },

    selectedZoneIndex: -1,

    currentEditingElement: null,
    originalContent: '',
    inlineEditingSetup: false,
    currentPreviewArticleId: null,

    noteViewMode: 'article',
    activeNoteId: null,
};

// ── Bridge for legacy code ──────────────────────────────────────────────
// Keeps window.state pointing to the same canonical object.
window.state = state;
