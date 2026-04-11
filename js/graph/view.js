import { getStore, getNetwork } from '../store/appStore.js';
import { isPhoneViewport } from '../ui/touch-zone-mode.js';

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
    const phoneViewport = isPhoneViewport();
    const paddingX = phoneViewport ? 0 : Math.max(width * paddingRatio, 80);
    const paddingY = phoneViewport ? 0 : Math.max(height * paddingRatio, 80);
    const containerRect = network.canvas.frame.canvas.getBoundingClientRect();
    const canvasWidth = Math.max(containerRect.width, 1);
    const availableHeightPx = Math.max(containerRect.height, 1);
    const targetScale = Math.max(
        minScale,
        Math.min(
            canvasWidth / (width + paddingX * 2),
            availableHeightPx / (height + paddingY * 2)
        ) * (phoneViewport ? 1 : finalScaleRatio)
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
