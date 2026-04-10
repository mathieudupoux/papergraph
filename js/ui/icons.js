import { getUrl } from '../utils/base-path.js';

const ICON_SPRITE_URL = getUrl('assets/icons/ui-sprite.svg');

export function iconHref(iconId) {
    return `${ICON_SPRITE_URL}#${iconId}`;
}

export function icon(iconId, options = {}) {
    if (!iconId) return '';

    const { size = 'md', className = '' } = options;
    const classes = ['ui-icon', `ui-icon--${size}`, className].filter(Boolean).join(' ');

    return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="${iconHref(iconId)}"></use></svg>`;
}
