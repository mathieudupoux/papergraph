import { getStore, getNetwork } from '../store/appStore.js';

export function fitGraphView(options = {}) {
    const network = getNetwork();
    if (!network) return;

    const {
        animation = false,
        minScale = 0.15,
        paddingRatio = 0.2,
        finalScaleRatio = 0.85
    } = options;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasContent = false;

    const positions = network.getPositions();
    Object.values(positions).forEach((pos) => {
        if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x);
        maxY = Math.max(maxY, pos.y);
        hasContent = true;
    });

    getStore().tagZones.forEach((zone) => {
        if (!zone) return;
        minX = Math.min(minX, zone.x);
        minY = Math.min(minY, zone.y);
        maxX = Math.max(maxX, zone.x + zone.width);
        maxY = Math.max(maxY, zone.y + zone.height);
        hasContent = true;
    });

    if (!hasContent) {
        network.fit({ animation });
        return;
    }

    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const paddingX = Math.max(width * paddingRatio, 80);
    const paddingY = Math.max(height * paddingRatio, 80);
    const canvasWidth = network.canvas.frame.canvas.width;
    const canvasHeight = network.canvas.frame.canvas.height;
    const targetScale = Math.max(
        minScale,
        Math.min(
            canvasWidth / (width + paddingX * 2),
            canvasHeight / (height + paddingY * 2)
        ) * finalScaleRatio
    );

    network.moveTo({
        position: {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        },
        scale: targetScale,
        animation
    });
}
