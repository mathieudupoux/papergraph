import { getStore, getNetwork } from '../store/appStore.js';
import { getDefaultEdgeFont, isDarkThemeActive } from '../utils/helpers.js';

const EDGE_LABEL_WRAP_AT = 18;
const EDGE_LABEL_FONT_SIZE = 12;
const EDGE_LABEL_FONT_FAMILY = 'Arial, sans-serif';
const EDGE_LABEL_LINE_HEIGHT = 1.25;
const EDGE_LABEL_PADDING_X = 10;
const EDGE_LABEL_PADDING_Y = 6;
const EDGE_LABEL_MIN_WIDTH = 72;
const EDGE_LABEL_MIN_HEIGHT = 28;
const EDGE_LABEL_HANDLE_SIZE = 10;
const EDGE_LABEL_MOVE_THRESHOLD = 5;
const lockedEdgeLabelCenters = new Map();

function getMeasurementContext(providedCtx = null) {
    if (providedCtx) return providedCtx;
    return getNetwork()?.canvas?.frame?.canvas?.getContext?.('2d') || null;
}

function applyEdgeLabelFont(ctx, fontSize = EDGE_LABEL_FONT_SIZE) {
    ctx.font = `${fontSize}px ${EDGE_LABEL_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
}

function measureLineWidth(ctx, line) {
    if (!ctx) {
        return Math.max(1, String(line || '').length) * EDGE_LABEL_FONT_SIZE * 0.62;
    }

    applyEdgeLabelFont(ctx);
    return ctx.measureText(line).width;
}

function splitTokenToWidth(token, maxWidth, ctx) {
    if (!token) return [''];

    const parts = [];
    let current = '';

    for (const char of token) {
        const next = current + char;
        if (!current || measureLineWidth(ctx, next) <= maxWidth) {
            current = next;
            continue;
        }

        parts.push(current);
        current = char;
    }

    if (current) parts.push(current);
    return parts;
}

function wrapParagraphToWidth(paragraph, maxWidth, ctx) {
    const normalized = String(paragraph ?? '').replace(/\t/g, '    ');
    if (normalized.trim().length === 0) return [''];

    const tokens = normalized.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [''];

    const lines = [];
    let currentLine = '';

    tokens.forEach((token) => {
        const tokenParts = splitTokenToWidth(token, maxWidth, ctx);

        tokenParts.forEach((part) => {
            if (!currentLine) {
                currentLine = part;
                return;
            }

            const candidate = `${currentLine} ${part}`;
            if (measureLineWidth(ctx, candidate) <= maxWidth) {
                currentLine = candidate;
                return;
            }

            lines.push(currentLine);
            currentLine = part;
        });
    });

    if (currentLine) lines.push(currentLine);
    return lines;
}

function getPathPointAtDistance(points, targetDistance) {
    if (!Array.isArray(points) || points.length === 0) {
        return { x: 0, y: 0 };
    }

    if (points.length === 1) {
        return { x: points[0].x, y: points[0].y };
    }

    let traversed = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        const from = points[i];
        const to = points[i + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const segmentLength = Math.hypot(dx, dy);

        if (segmentLength === 0) {
            continue;
        }

        if (traversed + segmentLength >= targetDistance) {
            const ratio = (targetDistance - traversed) / segmentLength;
            return {
                x: from.x + (dx * ratio),
                y: from.y + (dy * ratio),
            };
        }

        traversed += segmentLength;
    }

    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
}

function getConnectionPathPoints(connection, positions = null, edgeControlPoints = getStore().edgeControlPoints) {
    if (!connection) return [];

    const pathNodeIds = [
        connection.from,
        ...(edgeControlPoints?.[connection.id] || []),
        connection.to,
    ];

    const resolvedPositions = positions || {
        ...(getStore().savedNodePositions || {}),
        ...(getNetwork()?.getPositions(pathNodeIds) || {}),
    };
    return pathNodeIds
        .map((nodeId) => resolvedPositions[nodeId])
        .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getSharedLabelPositions(connections, edgeControlPoints = getStore().edgeControlPoints) {
    const network = getNetwork();
    if (!Array.isArray(connections) || connections.length === 0) {
        return {};
    }

    const nodeIds = new Set();
    connections.forEach((connection) => {
        if (!connection) return;
        nodeIds.add(connection.from);
        nodeIds.add(connection.to);
        (edgeControlPoints?.[connection.id] || []).forEach((controlPointId) => {
            nodeIds.add(controlPointId);
        });
    });

    return {
        ...(getStore().savedNodePositions || {}),
        ...(network?.getPositions(Array.from(nodeIds)) || {}),
    };
}

function getConnectionLabelAnchor(connection, positions = null, edgeControlPoints = getStore().edgeControlPoints) {
    const pathPoints = getConnectionPathPoints(connection, positions, edgeControlPoints);
    if (pathPoints.length === 0) {
        return { x: 0, y: 0 };
    }

    let totalLength = 0;
    for (let i = 0; i < pathPoints.length - 1; i += 1) {
        totalLength += Math.hypot(
            pathPoints[i + 1].x - pathPoints[i].x,
            pathPoints[i + 1].y - pathPoints[i].y
        );
    }

    return getPathPointAtDistance(pathPoints, totalLength / 2);
}

export function getDisplayedEdgeLabel(label, maxCharsPerLine = EDGE_LABEL_WRAP_AT) {
    if (!label) return '';

    return String(label)
        .split('\n')
        .map((paragraph) => {
            const trimmed = paragraph.trim();
            if (trimmed.length <= maxCharsPerLine) return trimmed;

            const parts = [];
            for (let i = 0; i < trimmed.length; i += maxCharsPerLine) {
                parts.push(trimmed.slice(i, i + maxCharsPerLine));
            }
            return parts.join('\n');
        })
        .join('\n');
}

export function getEdgeLabelLines(label) {
    return String(label || '').split('\n').filter((line, index, lines) => line.length > 0 || lines.length === 1);
}

export function getEdgeLabelSegmentIndex(chain, positions) {
    if (!Array.isArray(chain) || chain.length < 2) return 0;

    const segmentLengths = [];
    let totalLength = 0;

    for (let i = 0; i < chain.length - 1; i += 1) {
        const fromPos = positions[chain[i]];
        const toPos = positions[chain[i + 1]];

        if (!fromPos || !toPos) {
            segmentLengths.push(0);
            continue;
        }

        const distance = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
        segmentLengths.push(distance);
        totalLength += distance;
    }

    if (totalLength === 0) {
        return Math.max(0, Math.floor((chain.length - 2) / 2));
    }

    const midpoint = totalLength / 2;
    let traversed = 0;

    for (let i = 0; i < segmentLengths.length; i += 1) {
        traversed += segmentLengths[i];
        if (traversed >= midpoint) return i;
    }

    return segmentLengths.length - 1;
}

export function normalizeEdgeId(edgeId) {
    if (typeof edgeId === 'string' && edgeId.includes('_seg_')) {
        return parseInt(edgeId.split('_seg_')[0], 10);
    }

    return typeof edgeId === 'string' ? parseInt(edgeId, 10) : edgeId;
}

export function getEdgeLabelMoveThreshold() {
    return EDGE_LABEL_MOVE_THRESHOLD;
}

export function isEdgeLabelAtDefaultLocation(connection, epsilon = 0.5) {
    const offsetX = connection?.labelLayout?.offsetX;
    const offsetY = connection?.labelLayout?.offsetY;

    return (!Number.isFinite(offsetX) || Math.abs(offsetX) <= epsilon)
        && (!Number.isFinite(offsetY) || Math.abs(offsetY) <= epsilon);
}

export function setLockedEdgeLabelCenter(edgeId, center) {
    if (!Number.isFinite(edgeId) || !center) return;
    lockedEdgeLabelCenters.set(edgeId, {
        centerX: center.centerX,
        centerY: center.centerY,
    });
}

export function clearLockedEdgeLabelCenters(edgeIds = null) {
    if (!Array.isArray(edgeIds)) {
        lockedEdgeLabelCenters.clear();
        return;
    }

    edgeIds.forEach((edgeId) => {
        lockedEdgeLabelCenters.delete(edgeId);
    });
}

export function getEdgeLabelTextStyle() {
    return {
        fontSize: EDGE_LABEL_FONT_SIZE,
        fontFamily: EDGE_LABEL_FONT_FAMILY,
        lineHeight: EDGE_LABEL_LINE_HEIGHT,
        paddingX: EDGE_LABEL_PADDING_X,
        paddingY: EDGE_LABEL_PADDING_Y,
        minWidth: EDGE_LABEL_MIN_WIDTH,
        minHeight: EDGE_LABEL_MIN_HEIGHT,
        defaultWrapAt: EDGE_LABEL_WRAP_AT,
    };
}

export function getWrappedEdgeLabelLines(label, {
    width = null,
    ctx = null,
} = {}) {
    if (!label) return [''];

    const measurementCtx = getMeasurementContext(ctx);
    const usableWidth = Number.isFinite(width)
        ? Math.max(12, width - (EDGE_LABEL_PADDING_X * 2))
        : Math.max(12, EDGE_LABEL_WRAP_AT * EDGE_LABEL_FONT_SIZE * 0.62);

    const lines = String(label)
        .split('\n')
        .flatMap((paragraph) => wrapParagraphToWidth(paragraph, usableWidth, measurementCtx));

    return getEdgeLabelLines(lines.join('\n'));
}

export function getEdgeLabelGeometry(connection, {
    ctx = null,
    positions = null,
    edgeControlPoints = getStore().edgeControlPoints,
    allowEmptyLabel = false,
} = {}) {
    if (!connection || (!connection.label && !allowEmptyLabel)) return null;

    const measurementCtx = getMeasurementContext(ctx);
    const anchor = getConnectionLabelAnchor(connection, positions, edgeControlPoints);
    const storedLayout = connection.labelLayout || {};
    const rawLabel = connection.label || '';

    const initialLines = getWrappedEdgeLabelLines(rawLabel, { ctx: measurementCtx });
    const initialTextWidth = Math.max(...initialLines.map((line) => measureLineWidth(measurementCtx, line)), 0);
    const defaultWidth = Math.max(
        EDGE_LABEL_MIN_WIDTH,
        Math.ceil(initialTextWidth + (EDGE_LABEL_PADDING_X * 2))
    );

    const width = Math.max(storedLayout.width || defaultWidth, EDGE_LABEL_MIN_WIDTH);
    const lines = getWrappedEdgeLabelLines(rawLabel, { width, ctx: measurementCtx });
    const contentHeight = lines.length * EDGE_LABEL_FONT_SIZE * EDGE_LABEL_LINE_HEIGHT;
    const height = Math.max(
        storedLayout.height || Math.ceil(contentHeight + (EDGE_LABEL_PADDING_Y * 2)),
        EDGE_LABEL_MIN_HEIGHT,
        Math.ceil(contentHeight + (EDGE_LABEL_PADDING_Y * 2))
    );

    const lockedCenter = lockedEdgeLabelCenters.get(connection.id);
    const centerX = lockedCenter?.centerX ?? (anchor.x + (storedLayout.offsetX || 0));
    const centerY = lockedCenter?.centerY ?? (anchor.y + (storedLayout.offsetY || 0));

    return {
        edgeId: connection.id,
        storedLayout: connection.labelLayout ? { ...connection.labelLayout } : null,
        anchorX: anchor.x,
        anchorY: anchor.y,
        centerX,
        centerY,
        width,
        height,
        fontSize: EDGE_LABEL_FONT_SIZE,
        lineHeight: EDGE_LABEL_FONT_SIZE * EDGE_LABEL_LINE_HEIGHT,
        paddingX: EDGE_LABEL_PADDING_X,
        paddingY: EDGE_LABEL_PADDING_Y,
        lines,
        label: rawLabel,
    };
}

export function getEdgeLabelBounds(geometry) {
    if (!geometry) return null;

    return {
        left: geometry.centerX - (geometry.width / 2),
        right: geometry.centerX + (geometry.width / 2),
        top: geometry.centerY - (geometry.height / 2),
        bottom: geometry.centerY + (geometry.height / 2),
    };
}

export function getEdgeLabelLayoutFromGeometry(geometry) {
    if (!geometry) return null;

    return {
        offsetX: geometry.centerX - geometry.anchorX,
        offsetY: geometry.centerY - geometry.anchorY,
        width: geometry.width,
        height: geometry.height,
    };
}

export function getEdgeLabelHandlePositions(geometry) {
    const bounds = getEdgeLabelBounds(geometry);
    if (!bounds) return {};

    const midX = (bounds.left + bounds.right) / 2;
    const midY = (bounds.top + bounds.bottom) / 2;

    return {
        nw: { x: bounds.left, y: bounds.top },
        n: { x: midX, y: bounds.top },
        ne: { x: bounds.right, y: bounds.top },
        e: { x: bounds.right, y: midY },
        sw: { x: bounds.left, y: bounds.bottom },
        s: { x: midX, y: bounds.bottom },
        se: { x: bounds.right, y: bounds.bottom },
        w: { x: bounds.left, y: midY },
    };
}

export function getEdgeLabelResizeHandleAtPosition(event, {
    ctx = null,
    edgeId = getStore().selectedEdgeLabelId,
} = {}) {
    if (edgeId === null || edgeId === undefined) {
        return { edgeId: null, handle: null };
    }

    if (getStore().isEditingEdgeLabel && getStore().currentEditingEdgeLabelId === edgeId) {
        return { edgeId: null, handle: null };
    }

    const connection = getStore().appData.connections.find((item) => item.id === edgeId);
    if (!connection?.label) {
        return { edgeId: null, handle: null };
    }

    const canvas = getNetwork()?.canvas?.frame?.canvas;
    if (!canvas) {
        return { edgeId: null, handle: null };
    }

    const rect = canvas.getBoundingClientRect();
    const mousePos = getNetwork().DOMtoCanvas({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    });

    const geometry = getEdgeLabelGeometry(connection, { ctx });
    const scale = getNetwork().getScale();
    const tolerance = (EDGE_LABEL_HANDLE_SIZE + 8) / Math.max(scale, 0.15);
    const handles = getEdgeLabelHandlePositions(geometry);

    for (const [handle, position] of Object.entries(handles)) {
        if (Math.abs(mousePos.x - position.x) <= tolerance && Math.abs(mousePos.y - position.y) <= tolerance) {
            return { edgeId, handle, geometry };
        }
    }

    return { edgeId: null, handle: null };
}

export function getEdgeLabelAtPosition(event, { ctx = null } = {}) {
    const canvas = getNetwork()?.canvas?.frame?.canvas;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const mousePos = getNetwork().DOMtoCanvas({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    });

    const measurementCtx = getMeasurementContext(ctx);
    const connections = getStore().appData.connections.filter((connection) => connection.label);
    const positions = getSharedLabelPositions(connections);

    for (let i = connections.length - 1; i >= 0; i -= 1) {
        const geometry = getEdgeLabelGeometry(connections[i], {
            ctx: measurementCtx,
            positions,
        });
        const bounds = getEdgeLabelBounds(geometry);
        if (!bounds) continue;

        if (
            mousePos.x >= bounds.left &&
            mousePos.x <= bounds.right &&
            mousePos.y >= bounds.top &&
            mousePos.y <= bounds.bottom
        ) {
            return { edgeId: connections[i].id, geometry };
        }
    }

    return null;
}

function drawSelectionOutline(ctx, geometry, { showHandles = true } = {}) {
    const bounds = getEdgeLabelBounds(geometry);
    if (!bounds) return;

    const scale = Math.max(getNetwork()?.getScale?.() || 1, 0.15);
    const strokeWidth = 2 / scale;
    const handleSize = EDGE_LABEL_HANDLE_SIZE / scale;
    const handles = getEdgeLabelHandlePositions(geometry);
    const inset = strokeWidth / 2;

    ctx.save();
    ctx.fillStyle = isDarkThemeActive() ? 'rgba(74, 144, 226, 0.14)' : 'rgba(49, 95, 212, 0.08)';
    ctx.strokeStyle = 'rgba(74, 144, 226, 0.8)';
    ctx.lineWidth = strokeWidth;
    ctx.fillRect(
        bounds.left + inset,
        bounds.top + inset,
        Math.max(0, geometry.width - strokeWidth),
        Math.max(0, geometry.height - strokeWidth)
    );
    ctx.setLineDash([10 / scale, 5 / scale]);
    ctx.strokeRect(
        bounds.left + inset,
        bounds.top + inset,
        Math.max(0, geometry.width - strokeWidth),
        Math.max(0, geometry.height - strokeWidth)
    );
    ctx.setLineDash([]);

    if (!showHandles) {
        ctx.restore();
        return;
    }

    Object.values(handles).forEach((handle) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        ctx.rect(
            handle.x - (handleSize / 2),
            handle.y - (handleSize / 2),
            handleSize,
            handleSize
        );
        ctx.fill();
        ctx.stroke();
    });
    ctx.restore();
}

export function drawEdgeLabels(ctx) {
    const editingEdgeLabelId = getStore().isEditingEdgeLabel
        ? getStore().currentEditingEdgeLabelId
        : null;
    const connections = getStore().appData.connections.filter((connection) => (
        connection.label || connection.id === editingEdgeLabelId
    ));
    if (connections.length === 0) return;

    const edgeFont = getDefaultEdgeFont();
    const positions = getSharedLabelPositions(connections);

    ctx.save();
    applyEdgeLabelFont(ctx);
    ctx.fillStyle = edgeFont.color;

    connections.forEach((connection) => {
        const isEditingThisLabel = editingEdgeLabelId === connection.id;
        const geometry = getEdgeLabelGeometry(connection, {
            ctx,
            positions,
        });
        if (!geometry) return;

        if (getStore().selectedEdgeLabelId === connection.id && !(isEditingThisLabel && !connection.label)) {
            drawSelectionOutline(ctx, geometry, { showHandles: !isEditingThisLabel });
        }

        if (isEditingThisLabel) {
            return;
        }

        const startY = geometry.centerY - (((geometry.lines.length - 1) * geometry.lineHeight) / 2);

        geometry.lines.forEach((line, index) => {
            ctx.fillText(line, geometry.centerX, startY + (index * geometry.lineHeight));
        });
    });

    ctx.restore();
}
