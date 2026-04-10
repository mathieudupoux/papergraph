export function prefersTouchInput() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }

    const hasTouchPoints = (navigator.maxTouchPoints || 0) > 0;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches
        || window.matchMedia?.('(any-pointer: coarse)')?.matches;

    return Boolean(hasTouchPoints || coarsePointer);
}

export function getGraphInteractionOptions(overrides = {}) {
    const touch = prefersTouchInput();

    return {
        hover: true,
        hoverConnectedEdges: true,
        selectConnectedEdges: true,
        tooltipDelay: 200,
        dragView: touch,
        zoomView: touch,
        multiselect: true,
        selectable: true,
        dragNodes: true,
        ...overrides,
    };
}

export function applyTouchSurfaceBehavior(element) {
    if (!element || !prefersTouchInput()) return;

    element.style.touchAction = 'none';
    element.style.overscrollBehavior = 'none';
}
