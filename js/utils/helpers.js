// ===== UTILITY FUNCTIONS =====
// General helper functions used throughout the application

// Generate consistent color from string (for tag colors)
export function generateColorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const h = hash % 360;
    const s = 65 + (hash % 20); // 65-85%
    const l = 65 + (hash % 15); // 65-80%
    
    // Convert HSL to RGB
    const hslToRgb = (h, s, l) => {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [255 * f(0), 255 * f(8), 255 * f(4)];
    };
    
    const [r, g, b] = hslToRgb(h, s, l);
    return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

// Darken a hex color by a percentage
export function darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1);
}

const DEFAULT_NODE_COLOR = {
    border: '#4a90e2',
    background: '#e3f2fd',
};

const DEFAULT_NODE_FONT = {
    color: '#333333',
};

export function getDefaultNodeAppearance() {
    return {
        color: { ...DEFAULT_NODE_COLOR },
        font: { ...DEFAULT_NODE_FONT },
    };
}

export function getSmallestZone(zones = []) {
    if (!Array.isArray(zones) || zones.length === 0) return null;

    return [...zones].sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
}

export function getArticleZones(article, tagZones = []) {
    const categories = Array.isArray(article?.categories) ? article.categories : [];
    return tagZones.filter((zone) => categories.includes(zone.tag));
}

export function getNodeAppearanceForZones(zones = []) {
    const smallestZone = getSmallestZone(zones);
    if (!smallestZone) {
        return getDefaultNodeAppearance();
    }

    return {
        color: {
            background: smallestZone.color,
            border: darkenColor(smallestZone.color, 20),
        },
        font: {
            color: getContrastColor(smallestZone.color),
        },
    };
}

export function stripTrailingNumberSuffix(name = '') {
    return (name || '').trim().replace(/\s+\(\d+\)$/, '').trim();
}

function escapeRegExp(value = '') {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseNumberedName(name = '') {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
        return { baseName: '', suffix: null, isNumbered: false };
    }

    const match = trimmedName.match(/^(.*)\s+\((\d+)\)$/);
    if (!match) {
        return {
            baseName: trimmedName,
            suffix: null,
            isNumbered: false,
        };
    }

    return {
        baseName: match[1].trim(),
        suffix: Number.parseInt(match[2], 10),
        isNumbered: true,
    };
}

export function getUniqueName(baseName, existingNames = [], excludedName = null) {
    const trimmedBaseName = (baseName || '').trim();
    if (!trimmedBaseName) return '';

    const canonicalBaseName = stripTrailingNumberSuffix(trimmedBaseName);
    if (!canonicalBaseName) return '';

    const excluded = excludedName ? excludedName.trim().toLowerCase() : null;
    const normalizedCanonicalBaseName = canonicalBaseName.toLowerCase();
    const relevantExistingNames = existingNames
        .map((name) => (name || '').trim())
        .filter(Boolean)
        .filter((name) => name.toLowerCase() !== excluded);

    const exactBaseExists = relevantExistingNames.some(
        (name) => name.toLowerCase() === normalizedCanonicalBaseName
    );

    if (!exactBaseExists) {
        return canonicalBaseName;
    }

    const numberedNamePattern = new RegExp(`^${escapeRegExp(canonicalBaseName)}\\s+\\((\\d+)\\)$`, 'i');
    let highestSuffix = 0;

    relevantExistingNames.forEach((name) => {
        const match = name.match(numberedNamePattern);
        if (!match) return;
        highestSuffix = Math.max(highestSuffix, Number.parseInt(match[1], 10) || 0);
    });

    let counter = Math.max(1, highestSuffix + 1);
    let candidate = `${canonicalBaseName} (${counter})`;
    const normalizedExisting = new Set(relevantExistingNames.map((name) => name.toLowerCase()));
    while (normalizedExisting.has(candidate.toLowerCase())) {
        counter += 1;
        candidate = `${canonicalBaseName} (${counter})`;
    }

    return candidate;
}

// Highlight search terms in text
export function highlightSearchTerm(text, searchTerm) {
    if (!searchTerm || !text) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Contrast color from hex background (luminance-based)
export function getContrastColor(hexColor) {
    if (!hexColor) return '#333333';
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#ffffff';
}

// Show notification message
export function showNotification(message, type = 'info') {
    // Notifications disabled
    return;
}
