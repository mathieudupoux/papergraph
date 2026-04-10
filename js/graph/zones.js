import { getStore, getNetwork, pauseHistory, resumeHistory, isHistoryPaused } from '../store/appStore.js';
import {
    getArticleZones,
    getNodeAppearanceForZones,
    getUniqueName,
    parseNumberedName,
    stripTrailingNumberSuffix,
    showNotification,
} from '../utils/helpers.js';
import { save } from '../data/persistence.js';
import { updateCategoryFilters } from '../ui/filters.js';
import { icon } from '../ui/icons.js';
import { getGraphInteractionOptions } from './interaction.js';

// ===== TAG ZONES =====
// Zone visualization, interaction, and management

const ZONE_TITLE_PADDING = 10;
const ZONE_MENU_OFFSET_Y = 44;
const ZONE_MENU_GAP = 8;
const ZONE_MENU_BUTTON_SIZE = 40;

function getContainingZonesForNode(nodePos) {
    return getStore().tagZones.filter((zone) => isNodeInZone(nodePos, zone));
}

function updateNodeAppearance(nodeId, zones) {
    if (!getNetwork()) return;
    const { color, font } = getNodeAppearanceForZones(zones);
    getNetwork().body.data.nodes.update({
        id: nodeId,
        color,
        font,
    });
}

function cloneTagZones(tagZones) {
    return tagZones.map((zone) => ({ ...zone }));
}

function sameCategories(a = [], b = []) {
    return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function getZoneTag(zone) {
    return (zone?.tag || '').trim();
}

function getAutoNumberedZoneBaseName(tag) {
    const { baseName, isNumbered } = parseNumberedName(tag);
    return isNumbered ? baseName : null;
}

function getStaleAutoNumberedZoneTags(
    tagZones = getStore().tagZones,
    articles = getStore().appData.articles,
    positions = null
) {
    const resolvedPositions = positions || (getNetwork()
        ? getNetwork().getPositions(articles.map((article) => article.id))
        : null);

    if (!resolvedPositions) {
        return new Set();
    }

    const zoneTags = new Set(tagZones.map((zone) => getZoneTag(zone)).filter(Boolean));
    const staleTags = new Set();

    tagZones.forEach((zone) => {
        const tag = getZoneTag(zone);
        const baseName = getAutoNumberedZoneBaseName(tag);
        if (!tag || !baseName || !zoneTags.has(baseName)) {
            return;
        }

        const taggedArticles = articles.filter((article) => (article.categories || []).includes(tag));
        const hasAnyNodeInside = articles.some((article) => {
            const pos = resolvedPositions[article.id];
            return pos && isNodeInZone(pos, zone);
        });

        if (taggedArticles.length === 0 && !hasAnyNodeInside) {
            staleTags.add(tag);
            return;
        }

        if (taggedArticles.length === 0) {
            return;
        }

        const hasTaggedNodeInside = taggedArticles.some((article) => {
            const pos = resolvedPositions[article.id];
            return pos && isNodeInZone(pos, zone);
        });

        if (!hasTaggedNodeInside) {
            staleTags.add(tag);
        }
    });

    return staleTags;
}

function pruneEmptyAutoNumberedZonesForBaseName(baseName, excludedTags = []) {
    const normalizedBaseName = stripTrailingNumberSuffix(baseName).toLowerCase();
    if (!normalizedBaseName) return [];

    const excluded = new Set(excludedTags.map((tag) => (tag || '').trim().toLowerCase()).filter(Boolean));
    const articles = getStore().appData.articles;
    const removableTags = getStore().tagZones
        .map((zone) => getZoneTag(zone))
        .filter(Boolean)
        .filter((tag) => !excluded.has(tag.toLowerCase()))
        .filter((tag) => getAutoNumberedZoneBaseName(tag)?.toLowerCase() === normalizedBaseName)
        .filter((tag) => !articles.some((article) => (article.categories || []).includes(tag)));

    if (removableTags.length === 0) {
        return [];
    }

    getStore().setTagZones(
        getStore().tagZones.filter((zone) => !removableTags.includes(getZoneTag(zone)))
    );

    return removableTags;
}

function sanitizeAutoNumberedStateForBaseName(
    baseName,
    {
        excludedTags = [],
        tagZones = getStore().tagZones,
        articles = getStore().appData.articles,
        positions = null,
    } = {}
) {
    const normalizedBaseName = stripTrailingNumberSuffix(baseName).toLowerCase();
    if (!normalizedBaseName) {
        return {
            tagZones: cloneTagZones(tagZones),
            articles: articles.map((article) => ({
                ...article,
                categories: Array.isArray(article.categories) ? [...article.categories] : [],
            })),
            removedTags: [],
        };
    }

    const excluded = new Set(excludedTags.map((tag) => (tag || '').trim().toLowerCase()).filter(Boolean));
    const resolvedPositions = positions || (getNetwork()
        ? getNetwork().getPositions(articles.map((article) => article.id))
        : {});

    const nextZones = cloneTagZones(tagZones);
    const nextArticles = articles.map((article) => ({
        ...article,
        categories: Array.isArray(article.categories) ? [...article.categories] : [],
    }));

    const allZoneTags = new Set(nextZones.map((zone) => getZoneTag(zone)).filter(Boolean));
    const removableTags = new Set();

    nextZones.forEach((zone) => {
        const tag = getZoneTag(zone);
        const numberedBaseName = getAutoNumberedZoneBaseName(tag);

        if (!tag || !numberedBaseName || excluded.has(tag.toLowerCase())) {
            return;
        }

        if (numberedBaseName.toLowerCase() !== normalizedBaseName || !allZoneTags.has(numberedBaseName)) {
            return;
        }

        const taggedArticles = nextArticles.filter((article) => article.categories.includes(tag));
        const hasAnyNodeInside = nextArticles.some((article) => {
            const pos = resolvedPositions[article.id];
            return pos && isNodeInZone(pos, zone);
        });
        const hasTaggedNodeInside = taggedArticles.some((article) => {
            const pos = resolvedPositions[article.id];
            return pos && isNodeInZone(pos, zone);
        });

        if (!hasAnyNodeInside || !hasTaggedNodeInside) {
            removableTags.add(tag);
        }
    });

    nextArticles.forEach((article) => {
        article.categories = article.categories.filter((tag) => {
            const numberedBaseName = getAutoNumberedZoneBaseName(tag);
            if (!numberedBaseName || excluded.has(tag.toLowerCase())) {
                return true;
            }

            if (numberedBaseName.toLowerCase() !== normalizedBaseName) {
                return true;
            }

            return allZoneTags.has(tag) && !removableTags.has(tag);
        });
    });

    return {
        tagZones: nextZones.filter((zone) => !removableTags.has(getZoneTag(zone))),
        articles: nextArticles,
        removedTags: Array.from(removableTags),
    };
}

export function getZoneNamesForConflicts(
    excludedTag = null,
    {
        tagZones = getStore().tagZones,
        articles = getStore().appData.articles,
        positions = null,
    } = {}
) {
    const staleTags = getStaleAutoNumberedZoneTags(tagZones, articles, positions);
    const excluded = excludedTag ? excludedTag.trim().toLowerCase() : null;

    return [
        ...new Set(
            tagZones
                .map((zone) => getZoneTag(zone))
                .filter(Boolean)
                .filter((tag) => !staleTags.has(tag))
                .filter((tag) => tag.toLowerCase() !== excluded)
        ),
    ];
}

export function pruneStaleAutoNumberedZones({ saveChanges = false, refreshFilters = true } = {}) {
    const staleTags = getStaleAutoNumberedZoneTags();
    if (staleTags.size === 0) {
        return [];
    }

    pauseHistory();
    try {
        const nextZones = getStore().tagZones.filter((zone) => !staleTags.has(getZoneTag(zone)));
        getStore().setTagZones(nextZones);
        staleTags.forEach((tag) => {
            getStore().removeArticleCategoryGlobal(tag);
        });
        checkNodeZoneMembership({
            persistToStore: true,
            saveChanges: false,
            refreshFilters,
        });
        if (saveChanges) {
            save(true);
        }
    } finally {
        resumeHistory();
    }

    return Array.from(staleTags);
}

export function deriveArticlesForZoneMembership(
    positions,
    tagZones = getStore().tagZones,
    articles = getStore().appData.articles
) {
    const zoneTags = new Set(tagZones.map((zone) => zone.tag));

    return articles.map((article) => {
        const currentCategories = Array.isArray(article.categories) ? article.categories : [];
        const nodePos = positions?.[article.id];

        if (!nodePos) {
            return currentCategories === article.categories
                ? article
                : { ...article, categories: [...currentCategories] };
        }

        const containingTags = new Set(
            tagZones
                .filter((zone) => isNodeInZone(nodePos, zone))
                .map((zone) => zone.tag)
        );

        const nextCategories = currentCategories.filter(
            (category) => !zoneTags.has(category) || containingTags.has(category)
        );

        containingTags.forEach((tag) => {
            if (!nextCategories.includes(tag)) {
                nextCategories.push(tag);
            }
        });

        return sameCategories(currentCategories, nextCategories)
            ? article
            : { ...article, categories: nextCategories };
    });
}

export function drawTagZones(ctx) {
    if (!getStore().tagZones || getStore().tagZones.length === 0) return;
    
    // Track title positions to prevent overlaps
    const titleBounds = [];
    
    // Sort zones by size (largest first) so smaller zones are drawn on top
    const sortedZones = [...getStore().tagZones].sort((a, b) => {
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaB - areaA; // Descending order (largest first)
    });
    
    sortedZones.forEach((zone, sortedIndex) => {
        // Find the original index of this zone in getStore().tagZones array
        const originalIndex = getStore().tagZones.findIndex(z => z === zone);
        const isSelected = originalIndex === getStore().selectedZoneIndex;
        
        // Convert color to rgba with low opacity
        const color = zone.color;
        const r = parseInt(color.substr(1, 2), 16);
        const g = parseInt(color.substr(3, 2), 16);
        const b = parseInt(color.substr(5, 2), 16);
        
        // Draw semi-transparent background
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        
        // Draw border (inset by half the lineWidth to prevent overflow)
        ctx.strokeStyle = isSelected ? 'rgba(74, 144, 226, 0.8)' : `rgba(${r}, ${g}, ${b}, 0.3)`;
        ctx.lineWidth = isSelected ? 2.5 : 3;
        ctx.setLineDash([10, 5]);
        // Inset the stroke by 1.5px (half of lineWidth) to keep it within bounds
        const halfStroke = ctx.lineWidth / 2;
        ctx.strokeRect(
            zone.x + halfStroke, 
            zone.y + halfStroke, 
            zone.width - ctx.lineWidth, 
            zone.height - ctx.lineWidth
        );
        ctx.setLineDash([]);
        
        // Draw tag name at top-left corner
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Background for text
        const textMetrics = ctx.measureText(zone.tag);
        const textWidth = textMetrics.width;
        const textHeight = 30;
        const textPadding = 10;
        
        // Calculate initial title position
        let titleX = zone.x + ZONE_TITLE_PADDING;
        let titleY = zone.y + ZONE_TITLE_PADDING;
        
        // Check for overlap with existing titles and adjust
        let adjusted = false;
        const maxWidth = zone.width - 20; // Maximum width for title
        
        for (const bound of titleBounds) {
            const currentBound = {
                x: titleX,
                y: titleY,
                width: textWidth + textPadding * 2,
                height: textHeight + textPadding
            };
            
            // Check if overlapping
            if (!(currentBound.x + currentBound.width < bound.x ||
                  currentBound.x > bound.x + bound.width ||
                  currentBound.y + currentBound.height < bound.y ||
                  currentBound.y > bound.y + bound.height)) {
                // Overlapping - shift down
                titleY = bound.y + bound.height + 5;
                adjusted = true;
            }
        }
        
        // Make sure title stays within zone
        if (titleY + textHeight + textPadding > zone.y + zone.height - 10) {
            titleY = zone.y + zone.height - textHeight - textPadding - 10;
        }
        
        // Truncate text if too wide
        let displayText = zone.tag;
        if (textWidth + textPadding * 2 > maxWidth) {
            // Truncate text
            const ellipsis = '...';
            let truncated = zone.tag;
            while (ctx.measureText(truncated + ellipsis).width + textPadding * 2 > maxWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
            }
            displayText = truncated + ellipsis;
        }
        
        const finalTextMetrics = ctx.measureText(displayText);
        const finalTextWidth = finalTextMetrics.width;
        
        // Only draw background and text if NOT editing this zone (use original index)
        if (!getStore().zoneEditing.active || getStore().zoneEditing.zoneIndex !== originalIndex) {
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
            ctx.fillRect(
                titleX, 
                titleY, 
                finalTextWidth + textPadding * 2, 
                textHeight + textPadding
            );
            
            // Text
            ctx.fillStyle = color;
            ctx.fillText(displayText, titleX + textPadding, titleY + textPadding);
            
            // Store this title's bounds
            titleBounds.push({
                x: titleX,
                y: titleY,
                width: finalTextWidth + textPadding * 2,
                height: textHeight + textPadding
            });
        }

        if (isSelected) {
            updateZoneRadialMenuPosition(originalIndex, { titleX, titleY });

            const handleSize = 10;
            const halfHandle = handleSize / 2;
            const corners = [
                { x: zone.x, y: zone.y },
                { x: zone.x + zone.width, y: zone.y },
                { x: zone.x, y: zone.y + zone.height },
                { x: zone.x + zone.width, y: zone.y + zone.height }
            ];

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 1.5;
            corners.forEach(({ x, y }) => {
                ctx.beginPath();
                ctx.rect(x - halfHandle, y - halfHandle, handleSize, handleSize);
                ctx.fill();
                ctx.stroke();
            });
        }
    });
}

// Helper function to find all zones that are inside a parent zone
export function findNestedZones(parentZoneIndex) {
    const parentZone = getStore().tagZones[parentZoneIndex];
    const nestedZones = {};
    
    getStore().tagZones.forEach((zone, idx) => {
        // Skip the parent itself
        if (idx === parentZoneIndex) return;
        
        // Check if this zone is completely inside the parent zone
        const isInside = 
            zone.x >= parentZone.x &&
            zone.y >= parentZone.y &&
            zone.x + zone.width <= parentZone.x + parentZone.width &&
            zone.y + zone.height <= parentZone.y + parentZone.height;
        
        if (isInside) {
            nestedZones[idx] = { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
            console.log(`🔍 Found nested zone ${idx} (${zone.tag}) inside zone ${parentZoneIndex} (${parentZone.tag})`);
        }
    });
    
    return nestedZones;
}

export function showZoneDeleteButton(zoneIndex) {
    showZoneRadialMenu(zoneIndex);
}

export function updateZoneRadialMenuPosition(zoneIndex, layout = null) {
    const menu = document.getElementById('zoneRadialMenu');
    if (!menu || parseInt(menu.dataset.zoneIndex, 10) !== zoneIndex) {
        return;
    }

    const zone = getStore().tagZones[zoneIndex];
    if (!zone) {
        hideZoneDeleteButton();
        return;
    }

    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const titleX = layout?.titleX ?? (zone.x + ZONE_TITLE_PADDING);
    const titleY = layout?.titleY ?? (zone.y + ZONE_TITLE_PADDING);
    const titleDomPos = getNetwork().canvasToDOM({ x: titleX, y: titleY });

    menu.style.left = `${rect.left + titleDomPos.x}px`;
    menu.style.top = `${rect.top + titleDomPos.y - ZONE_MENU_OFFSET_Y}px`;
}

export function showZoneRadialMenu(zoneIndex) {
    const zone = getStore().tagZones[zoneIndex];
    if (!zone) return;

    const existingMenu = document.getElementById('zoneRadialMenu');
    if (existingMenu && parseInt(existingMenu.dataset.zoneIndex, 10) === zoneIndex) {
        updateZoneRadialMenuPosition(zoneIndex);
        return;
    }
    
    // Remove existing menu if any
    hideZoneDeleteButton();
    
    // Create menu container
    const menuContainer = document.createElement('div');
    menuContainer.id = 'zoneRadialMenu';
    menuContainer.className = 'zone-radial-menu';
    menuContainer.style.position = 'fixed';
    menuContainer.style.display = 'flex';
    menuContainer.style.alignItems = 'center';
    menuContainer.style.gap = `${ZONE_MENU_GAP}px`;
    menuContainer.style.pointerEvents = 'none';
    menuContainer.style.zIndex = '10000';
    menuContainer.dataset.zoneIndex = String(zoneIndex);
    document.body.appendChild(menuContainer);
    
    const buttons = [
        {
            id: 'zone-edit-btn',
            icon: icon('edit'),
            action: () => {
                hideZoneDeleteButton();
                startEditZoneTitle(null, zoneIndex);
            },
            hoverColor: '#4a90e2',
            title: 'Edit tag'
        },
        {
            id: 'zone-color-btn',
            icon: icon('eyedropper'),
            action: () => openZoneColorDialog(zoneIndex),
            hoverColor: '#9b59b6',
            title: 'Changer la couleur'
        },
        {
            id: 'zone-delete-btn',
            icon: icon('delete'),
            action: () => {
                if (getStore().selectedZoneIndex !== -1) {
                    deleteZone(getStore().selectedZoneIndex);
                    hideZoneDeleteButton();
                }
            },
            hoverColor: '#e74c3c',
            title: 'Delete zone'
        }
    ];
    
    buttons.forEach((btnConfig, index) => {
        const btn = document.createElement('button');
        btn.id = btnConfig.id;
        btn.className = 'zone-radial-btn';
        btn.title = btnConfig.title;
        btn.innerHTML = btnConfig.icon;
        btn.style.position = 'relative';
        btn.style.width = `${ZONE_MENU_BUTTON_SIZE}px`;
        btn.style.height = `${ZONE_MENU_BUTTON_SIZE}px`;
        btn.style.borderRadius = '50%';
        btn.style.border = 'none';
        btn.style.background = 'rgba(255, 255, 255, 0.96)';
        btn.style.boxShadow = '0 8px 22px rgba(15, 23, 42, 0.18)';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.transition = 'transform 0.2s, box-shadow 0.2s, background 0.2s, color 0.2s';
        btn.style.pointerEvents = 'all';
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(-4px) scale(0.94)';
        
        // Store hover color as data attribute
        btn.dataset.hoverColor = btnConfig.hoverColor;
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = btnConfig.hoverColor;
            btn.style.color = 'white';
            // No scale transform on hover for zone buttons
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '';
            btn.style.color = '';
        });
        
        btn.addEventListener('click', () => {
            btnConfig.action();
        });
        
        menuContainer.appendChild(btn);
        
        setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.transform = 'translateY(0) scale(1)';
        }, index * 50);
    });

    updateZoneRadialMenuPosition(zoneIndex);
}

// Global variables to store modal event handlers
let zoneColorDialogEscapeHandler = null;
let zoneColorDialogClickOutsideHandler = null;

export function openZoneColorDialog(zoneIndex) {
    // Close any existing modal first
    closeZoneColorDialog();
    
    const zone = getStore().tagZones[zoneIndex];
    
    const defaultColors = [
        '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71',
        '#1abc9c', '#3498db', '#9b59b6'
    ];
    
    const modal = document.createElement('div');
    modal.id = 'zoneColorModal';
    modal.className = 'zone-color-modal';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.borderRadius = '12px';
    modal.style.padding = '24px';
    modal.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    modal.style.zIndex = '10002';
    modal.style.minWidth = '340px';
    
    const isDarkTheme = document.body.classList.contains('dark-theme');
    const borderColor = isDarkTheme ? '#e8eaf0' : '#2c3e50';
    
    const colorPaletteHTML = defaultColors.map(color => 
        `<div class="color-option" data-color="${color}" 
              style="width: 28px; height: 28px; background: ${color}; border-radius: 6px; cursor: pointer; 
                     border: ${zone.color === color ? `2px solid ${borderColor}` : '2px solid transparent'}; 
                     transform: ${zone.color === color ? 'scale(1.1)' : 'scale(1)'}; 
                     transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
         </div>`
    ).join('');
    
    modal.innerHTML = `
        <div style="margin-bottom: 15px;">
            <label class="zone-color-label" style="display: block; margin-bottom: 8px; font-size: 0.9rem; font-weight: 600;">Tag color:</label>
            <div id="zoneColorPalette" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px;">
                ${colorPaletteHTML}
                <div class="color-option color-picker-option" id="zoneCustomColorOption"
                     style="width: 28px; height: 28px; background: ${zone.color}; border-radius: 6px; cursor: pointer; 
                            border: 2px solid transparent; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; display: flex; align-items: center; justify-content: center; color: white;">
                    ${icon('eyedropper', { size: 'sm' })}
                </div>
            </div>
            <div id="zoneCustomColorPicker" class="zone-custom-picker" style="display: none; margin-top: 12px; padding: 12px; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="color" id="zoneColorPickerInput" value="${zone.color}" style="width: 48px; height: 48px; border-radius: 4px; cursor: pointer;">
                    <input type="text" id="zoneColorHex" class="zone-color-hex-input" value="${zone.color}" style="flex: 1; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.9rem;">
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="cancelZoneColor" class="zone-color-btn zone-color-btn-cancel" style="flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem;">
                Cancel
            </button>
            <button id="applyZoneColor" class="zone-color-btn zone-color-btn-apply" style="flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem;">
                Apply
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    let selectedColor = zone.color;
    
    const colorOptions = document.querySelectorAll('#zoneColorPalette .color-option:not(#zoneCustomColorOption)');
    const customColorOption = document.getElementById('zoneCustomColorOption');
    const customColorPickerDiv = document.getElementById('zoneCustomColorPicker');
    const colorPickerInput = document.getElementById('zoneColorPickerInput');
    const colorHex = document.getElementById('zoneColorHex');
    
    if (colorPickerInput && colorHex) {
        colorPickerInput.addEventListener('input', (e) => {
            selectedColor = e.target.value;
            colorHex.value = selectedColor;
            customColorOption.style.background = selectedColor;
        });
        
        colorHex.addEventListener('input', (e) => {
            const hex = e.target.value;
            if (/^#[0-9A-F]{6}$/i.test(hex)) {
                selectedColor = hex;
                colorPickerInput.value = hex;
                customColorOption.style.background = hex;
            }
        });
    }
    
    colorOptions.forEach((option) => {
        option.addEventListener('click', () => {
            customColorPickerDiv.style.display = 'none';
            document.querySelectorAll('#zoneColorPalette .color-option').forEach(opt => {
                opt.style.border = '2px solid transparent';
                opt.style.transform = 'scale(1)';
            });
            option.style.border = `2px solid ${borderColor}`;
            option.style.transform = 'scale(1.1)';
            selectedColor = option.getAttribute('data-color');
        });
        
        option.addEventListener('mouseenter', () => {
            if (option.style.border !== `2px solid ${borderColor}`) {
                option.style.transform = 'scale(1.05)';
            }
        });
        option.addEventListener('mouseleave', () => {
            if (option.style.border !== '2px solid #2c3e50') {
                option.style.transform = 'scale(1)';
            }
        });
    });
    
    customColorOption.addEventListener('click', () => {
        const isVisible = customColorPickerDiv.style.display !== 'none';
        customColorPickerDiv.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            document.querySelectorAll('#zoneColorPalette .color-option:not(#zoneCustomColorOption)').forEach(opt => {
                opt.style.border = '2px solid transparent';
                opt.style.transform = 'scale(1)';
            });
            customColorOption.style.border = `2px solid ${borderColor}`;
            customColorOption.style.transform = 'scale(1.1)';
            selectedColor = colorPickerInput.value;
            setTimeout(() => colorPickerInput.click(), 100);
        }
    });
    
    document.getElementById('applyZoneColor').addEventListener('click', () => {
        applyZoneColor(zoneIndex, selectedColor);
    });
    document.getElementById('cancelZoneColor').addEventListener('click', closeZoneColorDialog);
    
    // Escape key handler
    zoneColorDialogEscapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeZoneColorDialog();
        }
    };
    document.addEventListener('keydown', zoneColorDialogEscapeHandler);
    
    // Click outside to close
    zoneColorDialogClickOutsideHandler = (e) => {
        const modal = document.getElementById('zoneColorModal');
        if (modal && !modal.contains(e.target)) {
            closeZoneColorDialog();
        }
    };
    // Add click listener after a short delay to avoid immediate closing
    setTimeout(() => {
        document.addEventListener('click', zoneColorDialogClickOutsideHandler);
    }, 200);
}

export function closeZoneColorDialog() {
    const modal = document.getElementById('zoneColorModal');
    if (modal) {
        modal.remove();
    }
    
    // Clean up event listeners
    if (zoneColorDialogEscapeHandler) {
        document.removeEventListener('keydown', zoneColorDialogEscapeHandler);
        zoneColorDialogEscapeHandler = null;
    }
    if (zoneColorDialogClickOutsideHandler) {
        document.removeEventListener('click', zoneColorDialogClickOutsideHandler);
        zoneColorDialogClickOutsideHandler = null;
    }
}

export function applyZoneColor(zoneIndex, newColor) {
    if (zoneIndex < 0 || zoneIndex >= getStore().tagZones.length) return;
    
    getStore().updateTagZone(zoneIndex, { color: newColor });
    const zone = getStore().tagZones[zoneIndex];
    
    save();
    
    if (getNetwork()) {
        const nodesToUpdate = [];
        
        getStore().appData.articles.forEach(article => {
            if (article.categories && article.categories.includes(zone.tag)) {
                const { color, font } = getNodeAppearanceForZones(getArticleZones(article, getStore().tagZones));
                nodesToUpdate.push({ id: article.id, color, font });
            }
        });
        
        if (nodesToUpdate.length > 0) {
            getNetwork().body.data.nodes.update(nodesToUpdate);
        }
        
        // Also redraw to update zones
        getNetwork().redraw();
    }
    
    closeZoneColorDialog();
    hideZoneDeleteButton(); // Close the radial menu
    showNotification(`Couleur de "${zone.tag}" mise à jour`, 'success');
}

export function hideZoneDeleteButton() {
    const menu = document.getElementById('zoneRadialMenu');
    if (menu) {
        menu.remove();
    }
    
    // Also hide any old delete button if it exists
    const deleteBtn = document.getElementById('zoneDeleteBtn');
    if (deleteBtn) {
        deleteBtn.classList.remove('active');
    }
}

export function isNodeInZone(nodePos, zone) {
    return nodePos.x >= zone.x && 
           nodePos.x <= zone.x + zone.width &&
           nodePos.y >= zone.y && 
           nodePos.y <= zone.y + zone.height;
}

export function updateZoneSizes() {
    // Automatic zone resizing disabled - zones maintain manual size
    // User can manually resize zones using drag handles
    return;
    
    /* DISABLED - Automatic resizing
    getStore().tagZones.forEach(zone => {
        // Find all nodes with this tag
        const nodesWithTag = getStore().appData.articles.filter(a => a.categories.includes(zone.tag));
        
        if (nodesWithTag.length === 0) return;
        
        // Calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodesWithTag.forEach(article => {
            const pos = getNetwork().getPositions([article.id])[article.id];
            if (pos) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x);
                maxY = Math.max(maxY, pos.y);
            }
        });
        
        // Add padding
        const padding = 100;
        zone.x = minX - padding;
        zone.y = minY - padding;
        zone.width = maxX - minX + padding * 2;
        zone.height = maxY - minY + padding * 2;
    });
    
    getNetwork().redraw();
    */
}

export function checkNodeZoneMembership(options = {}) {
    const {
        positions = null,
        tagZones = getStore().tagZones,
        articles = getStore().appData.articles,
        persistToStore = true,
        saveChanges = !isHistoryPaused(),
        refreshFilters = true,
    } = options;

    console.log('🎨 checkNodeZoneMembership called');
    let updatedCount = 0;

    if (!getNetwork()) {
        return { articles, changed: false };
    }

    const resolvedPositions = positions || getNetwork().getPositions(articles.map((article) => article.id));
    const updatedArticles = deriveArticlesForZoneMembership(resolvedPositions, tagZones, articles);
    const changed = updatedArticles.some((article, index) => article !== articles[index]);

    updatedArticles.forEach((article) => {
        const pos = resolvedPositions[article.id];
        if (!pos) {
            return;
        }

        const containingZones = tagZones.filter((zone) => isNodeInZone(pos, zone));
        updateNodeAppearance(article.id, containingZones);
        if (containingZones.length > 0) updatedCount++;
    });
    
    console.log(`✅ checkNodeZoneMembership completed - updated ${updatedCount} nodes with zone colors`);
    
    // Skip save() when called during a drag/load (history paused): the drag handler
    // calls setSavedNodePositions() after resumeHistory(), and save() would overwrite
    // savedNodePositions with post-drag values while still paused, causing the
    // before/after equality check to pass and the drag snapshot to be lost.
    if (persistToStore && changed) {
        getStore().setArticles(updatedArticles);
    }

    if (saveChanges && !isHistoryPaused()) {
        save();
    }
    if (refreshFilters) {
        updateCategoryFilters();
    }

    return { articles: updatedArticles, changed, positions: resolvedPositions };
}

export function getZoneResizeHandle(event) {
    // Don't allow zone resizing in gallery viewer mode
    if (getStore().isGalleryViewer || getStore().selectedZoneIndex === -1) {
        return { zone: null, zoneIndex: -1, handle: null };
    }
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    // Detection zone: offset to the left and up from the visual border
    const handleMargin = 10; // Margin on each side of the border (total detection zone = 20)
    const offsetX = -5; // Shift detection zone to the left
    const offsetY = -5; // Shift detection zone up
    
    for (let i = 0; i < getStore().tagZones.length; i++) {
        if (i !== getStore().selectedZoneIndex) continue;
        const zone = getStore().tagZones[i];
        
        // Visual borders with offset adjustment
        const borderLeft = zone.x + offsetX;
        const borderRight = zone.x + zone.width + offsetX;
        const borderTop = zone.y + offsetY;
        const borderBottom = zone.y + zone.height + offsetY;
        
        // Check if mouse is within detection zone (handleMargin on each side of border)
        const nearLeft = mousePos.x >= borderLeft - handleMargin && mousePos.x <= borderLeft + handleMargin;
        const nearRight = mousePos.x >= borderRight - handleMargin && mousePos.x <= borderRight + handleMargin;
        const nearTop = mousePos.y >= borderTop - handleMargin && mousePos.y <= borderTop + handleMargin;
        const nearBottom = mousePos.y >= borderBottom - handleMargin && mousePos.y <= borderBottom + handleMargin;
        
        // For edges, we need to be within the zone's bounds (extended by margin)
        const inHorizontalRange = mousePos.y >= borderTop - handleMargin && mousePos.y <= borderBottom + handleMargin;
        const inVerticalRange = mousePos.x >= borderLeft - handleMargin && mousePos.x <= borderRight + handleMargin;
        
        // Check corners first
        if (nearLeft && nearTop && inHorizontalRange && inVerticalRange) {
            return { zoneIndex: i, handle: 'nw', zone: zone };
        }
        if (nearRight && nearTop && inHorizontalRange && inVerticalRange) {
            return { zoneIndex: i, handle: 'ne', zone: zone };
        }
        if (nearLeft && nearBottom && inHorizontalRange && inVerticalRange) {
            return { zoneIndex: i, handle: 'sw', zone: zone };
        }
        if (nearRight && nearBottom && inHorizontalRange && inVerticalRange) {
            return { zoneIndex: i, handle: 'se', zone: zone };
        }
        
        // Check edges
        if (nearLeft && inHorizontalRange && !nearTop && !nearBottom) {
            return { zoneIndex: i, handle: 'w', zone: zone };
        }
        if (nearRight && inHorizontalRange && !nearTop && !nearBottom) {
            return { zoneIndex: i, handle: 'e', zone: zone };
        }
        if (nearTop && inVerticalRange && !nearLeft && !nearRight) {
            return { zoneIndex: i, handle: 'n', zone: zone };
        }
        if (nearBottom && inVerticalRange && !nearLeft && !nearRight) {
            return { zoneIndex: i, handle: 's', zone: zone };
        }
    }
    
    return { zoneIndex: -1, handle: null, zone: null };
}

export function updateZoneCursor(event) {
    const canvas = getNetwork().canvas.frame.canvas;
    const resizeHandle = getZoneResizeHandle(event);
    
    if (resizeHandle.zoneIndex !== -1) {
        const cursorMap = {
            'nw': "nw-resize",
            'ne': "ne-resize",
            'sw': "sw-resize",
            'se': "se-resize",
            'n': "n-resize",
            's': "s-resize",
            'w': "w-resize",
            'e': "e-resize"
        };
        canvas.style.cursor = cursorMap[resizeHandle.handle] || "default";
    } else {
        canvas.style.cursor = "default";
    }
}

export function getZoneAtPosition(event) {
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    const handleSize = 20 / getNetwork().getScale();
    
    // Find ALL zones that contain this point
    const matchingZones = [];
    
    for (let i = 0; i < getStore().tagZones.length; i++) {
        const zone = getStore().tagZones[i];
        
        if (mousePos.x >= zone.x && mousePos.x <= zone.x + zone.width &&
            mousePos.y >= zone.y && mousePos.y <= zone.y + zone.height) {
            
            // But NOT on title area
            const titleX = zone.x + 10;
            const titleY = zone.y + 10;
            const titleWidth = 200;
            const titleHeight = 50;
            
            if (mousePos.x >= titleX && mousePos.x <= titleX + titleWidth &&
                mousePos.y >= titleY && mousePos.y <= titleY + titleHeight) {
                continue;
            }
            
            // And NOT on resize handles
            const nearLeft = Math.abs(mousePos.x - zone.x) < handleSize;
            const nearRight = Math.abs(mousePos.x - (zone.x + zone.width)) < handleSize;
            const nearTop = Math.abs(mousePos.y - zone.y) < handleSize;
            const nearBottom = Math.abs(mousePos.y - (zone.y + zone.height)) < handleSize;
            
            if (nearLeft || nearRight || nearTop || nearBottom) {
                continue;
            }
            
            matchingZones.push({ zoneIndex: i, zone: zone, area: zone.width * zone.height });
        }
    }
    
    // Return the smallest zone (highest priority)
    if (matchingZones.length > 0) {
        matchingZones.sort((a, b) => a.area - b.area); // Smallest first
        return { zoneIndex: matchingZones[0].zoneIndex, zone: matchingZones[0].zone };
    }
    
    return { zoneIndex: -1, zone: null };
}

export function getZoneTitleClick(event) {
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    // Find ALL zones whose title contains this point
    const matchingZones = [];
    
    for (let i = 0; i < getStore().tagZones.length; i++) {
        const zone = getStore().tagZones[i];
        
        const titleX = zone.x + 10;
        const titleY = zone.y + 10;
        const titleWidth = zone.tag.length * 15 + 20;
        const titleHeight = 50;
        
        if (mousePos.x >= titleX && mousePos.x <= titleX + titleWidth &&
            mousePos.y >= titleY && mousePos.y <= titleY + titleHeight) {
            matchingZones.push({ zoneIndex: i, zone: zone, area: zone.width * zone.height });
        }
    }
    
    // Return the smallest zone (highest priority)
    if (matchingZones.length > 0) {
        matchingZones.sort((a, b) => a.area - b.area); // Smallest first
        return { zoneIndex: matchingZones[0].zoneIndex, zone: matchingZones[0].zone };
    }
    
    return { zoneIndex: -1, zone: null };
}

export function startZoneMove(event, zoneIndex) {
    pauseHistory();
    getStore().updateZoneMoving({ active: true });
    getStore().updateZoneMoving({ zoneIndex: zoneIndex });
    getStore().updateZoneMoving({ originalZone: { ...getStore().tagZones[zoneIndex] } });
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    getStore().updateZoneMoving({ startX: mousePos.x });
    getStore().updateZoneMoving({ startY: mousePos.y });
    
    // Store original positions of nodes in this zone
    const zone = getStore().tagZones[zoneIndex];
    const origNodePositions = {};
    getStore().appData.articles.forEach(article => {
        if ((article.categories || []).includes(zone.tag)) {
            const pos = getNetwork().getPositions([article.id])[article.id];
            if (pos) origNodePositions[article.id] = { x: pos.x, y: pos.y };
        }
    });
    getStore().updateZoneMoving({ originalNodePositions: origNodePositions });
    
    // Store original positions of nested zones (zones completely inside this zone)
    getStore().updateZoneMoving({ originalNestedZones: {} });
    const tolerance = 5; // Small tolerance for floating point errors
    
    getStore().tagZones.forEach((otherZone, idx) => {
        if (idx !== zoneIndex) {
            // Check if otherZone is completely inside the moving zone (with tolerance)
            const isInside = otherZone.x >= (zone.x - tolerance) &&
                           otherZone.y >= (zone.y - tolerance) &&
                           (otherZone.x + otherZone.width) <= (zone.x + zone.width + tolerance) &&
                           (otherZone.y + otherZone.height) <= (zone.y + zone.height + tolerance);
            
            if (isInside) {
                getStore().zoneMoving.originalNestedZones[idx] = {
                    x: otherZone.x,
                    y: otherZone.y
                };
            }
        }
    });
    
    console.log(`📦 Moving zone "${zone.tag}" with ${Object.keys(getStore().zoneMoving.originalNestedZones).length} nested zones`);
    
    // Disable getNetwork() interactions
    getNetwork().setOptions({
        interaction: getGraphInteractionOptions({
            dragNodes: false,
            dragView: false,
            zoomView: false
        })
    });
}

export function updateZoneMove(event) {
    if (!getStore().zoneMoving.active) return;
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    const dx = mousePos.x - getStore().zoneMoving.startX;
    const dy = mousePos.y - getStore().zoneMoving.startY;
    
    const orig = getStore().zoneMoving.originalZone;
    const movingZoneIndex = getStore().zoneMoving.zoneIndex;

    getStore().updateTagZone(movingZoneIndex, {
        x: orig.x + dx,
        y: orig.y + dy,
    });
    
    // Move nodes with this tag
    if (getStore().zoneMoving.originalNodePositions) {
        Object.keys(getStore().zoneMoving.originalNodePositions).forEach(nodeId => {
            const origPos = getStore().zoneMoving.originalNodePositions[nodeId];
            const newX = origPos.x + dx;
            const newY = origPos.y + dy;
            getNetwork().moveNode(nodeId, newX, newY);
        });
    }
    
    // Move nested zones
    if (getStore().zoneMoving.originalNestedZones) {
        const nestedCount = Object.keys(getStore().zoneMoving.originalNestedZones).length;
        if (nestedCount > 0) {
            console.log(`📦 Moving ${nestedCount} nested zones...`);
        }
        Object.keys(getStore().zoneMoving.originalNestedZones).forEach(zoneIdx => {
            const idx = parseInt(zoneIdx);
            const origZone = getStore().zoneMoving.originalNestedZones[zoneIdx];
            getStore().updateTagZone(idx, {
                x: origZone.x + dx,
                y: origZone.y + dy,
            });
            console.log(`📦 Moved nested zone ${idx} (${getStore().tagZones[idx].tag}) by dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);
        });
    }
    
    getNetwork().redraw();
}

export function endZoneMove() {
    const movedZoneIdx = getStore().zoneMoving.zoneIndex;
    const originalZone = getStore().zoneMoving.originalZone;
    const originalNestedZones = getStore().zoneMoving.originalNestedZones || {};
    const finalTagZones = cloneTagZones(getStore().tagZones);
    const revertedTagZones = cloneTagZones(getStore().tagZones);

    if (movedZoneIdx >= 0 && originalZone) {
        revertedTagZones[movedZoneIdx] = { ...revertedTagZones[movedZoneIdx], x: originalZone.x, y: originalZone.y };
    }

    Object.entries(originalNestedZones).forEach(([zoneIdx, position]) => {
        const idx = parseInt(zoneIdx, 10);
        if (revertedTagZones[idx]) {
            revertedTagZones[idx] = { ...revertedTagZones[idx], x: position.x, y: position.y };
        }
    });

    const finalPositions = getNetwork().getPositions(getStore().appData.articles.map((article) => article.id));
    const { articles: finalArticles } = checkNodeZoneMembership({
        positions: finalPositions,
        tagZones: finalTagZones,
        persistToStore: false,
        saveChanges: false,
        refreshFilters: false,
    });

    getStore().setTagZones(revertedTagZones);
    resumeHistory();
    getStore().commitTrackedGraphState({
        articles: finalArticles,
        tagZones: finalTagZones,
        savedNodePositions: finalPositions,
    });
    getStore().updateZoneMoving({ active: false });
    getStore().updateZoneMoving({ readyToMove: false });
    getStore().updateZoneMoving({ zoneIndex: -1 });
    getStore().updateZoneMoving({ originalZone: null });
    getStore().updateZoneMoving({ originalNodePositions: {} });
    getStore().updateZoneMoving({ originalNestedZones: {} });
    
    // Re-enable getNetwork() interactions
    getNetwork().setOptions({
        interaction: getGraphInteractionOptions({
            dragNodes: true,
            hover: true
        })
    });
    
    updateCategoryFilters();
    save(true);
    getNetwork().redraw();
}

export function startEditZoneTitle(event, zoneIndex) {
    if (getStore().zoneEditing.active) return;

    hideZoneDeleteButton();
    
    const zone = getStore().tagZones[zoneIndex];
    const canvas = getNetwork().canvas.frame.canvas;
    
    getStore().updateZoneEditing({ active: true });
    getStore().updateZoneEditing({ zoneIndex: zoneIndex });
    
    // Disable interactions during editing
    getNetwork().setOptions({
        interaction: getGraphInteractionOptions({
            dragNodes: false,
            dragView: false,
            zoomView: false,
            hover: false
        })
    });
    
    // Get zone color
    const color = zone.color;
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);
    
    // Get canvas context to measure text
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 24px Arial';
    const textMetrics = ctx.measureText(zone.tag);
    const textWidth = textMetrics.width;
    
    // Get zone title position in DOM
    const rect = canvas.getBoundingClientRect();
    const textPadding = 10;
    const titleCanvasPos = { x: zone.x + 10 + textPadding, y: zone.y + 10 + textPadding };
    const titlePos = getNetwork().canvasToDOM(titleCanvasPos);
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = zone.tag;
    input.style.position = 'absolute';
    input.style.left = (rect.left + titlePos.x) + 'px';
    input.style.top = (rect.top + titlePos.y) + 'px';
    input.style.width = Math.max(textWidth + 20, 150) + 'px';
    input.style.fontSize = '24px';
    input.style.fontWeight = 'bold';
    input.style.fontFamily = 'Arial';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.border = 'none';
    input.style.borderRadius = '0';
    input.style.zIndex = '10001';
    input.style.color = color;
    input.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
    input.style.outline = 'none';
    input.style.boxSizing = 'border-box';
    input.style.lineHeight = '1';
    
    document.body.appendChild(input);
    getStore().updateZoneEditing({ inputElement: input });
    getStore().updateZoneEditing({ backgroundElement: null });
    
    getNetwork().redraw();
    
    input.focus();
    input.select();
    
    // Auto-resize input
    const autoResize = () => {
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 24px Arial';
        const newWidth = Math.max(ctx.measureText(input.value).width + 20, 150);
        input.style.width = newWidth + 'px';
    };
    
    input.addEventListener('input', autoResize);
    
    let editFinalized = false;

    // Save on blur or enter
    const saveEdit = () => {
        if (editFinalized || !getStore().zoneEditing.active) return;
        editFinalized = true;
        
        const newTag = input.value.trim();
        const oldTag = zone.tag;
        
        if (newTag && newTag !== '' && newTag !== oldTag) {
            const positions = getNetwork()
                ? getNetwork().getPositions(getStore().appData.articles.map((article) => article.id))
                : {};

            const sanitizedState = sanitizeAutoNumberedStateForBaseName(newTag, {
                excludedTags: [oldTag],
                positions,
            });

            const existingNames = getZoneNamesForConflicts(oldTag, {
                tagZones: sanitizedState.tagZones,
                articles: sanitizedState.articles,
                positions,
            });
            const uniqueTag = getUniqueName(newTag, existingNames);
            const targetZoneIndex = sanitizedState.tagZones.findIndex(
                (tagZone) => getZoneTag(tagZone).toLowerCase() === oldTag.toLowerCase()
            );

            if (targetZoneIndex === -1) {
                throw new Error(`Unable to find zone "${oldTag}" during rename`);
            }

            const renamedZones = sanitizedState.tagZones.map((tagZone, idx) => (
                idx === targetZoneIndex ? { ...tagZone, tag: uniqueTag } : tagZone
            ));

            const renamedArticles = sanitizedState.articles.map((article) => ({
                ...article,
                categories: (() => {
                    const currentCategories = article.categories || [];
                    const nextCategories = currentCategories.filter((tag) => tag !== oldTag);
                    if (currentCategories.includes(oldTag) && !nextCategories.includes(uniqueTag)) {
                        nextCategories.push(uniqueTag);
                    }
                    return nextCategories;
                })(),
            }));

            const normalizedArticles = deriveArticlesForZoneMembership(
                positions,
                renamedZones,
                renamedArticles
            );

            getStore().commitTrackedGraphState({
                articles: normalizedArticles,
                tagZones: renamedZones,
                savedNodePositions: positions,
            });

            updateCategoryFilters();
            save();

            if (uniqueTag !== newTag) {
                showNotification(`Zone "${newTag}" existe déjà, renommée en "${uniqueTag}"`, 'info');
            } else {
                showNotification(`Zone renommée en "${uniqueTag}"`, 'success');
            }
        }
        
        if (input.isConnected) {
            input.remove();
        }
        getStore().updateZoneEditing({ active: false });
        getStore().updateZoneEditing({ zoneIndex: -1 });
        getStore().updateZoneEditing({ inputElement: null });
        getStore().updateZoneEditing({ backgroundElement: null });
        
        document.removeEventListener('pointerdown', handleClickOutside, true);
        
        // Re-enable interactions
        getNetwork().setOptions({
            interaction: getGraphInteractionOptions({
                dragNodes: true,
                hover: true,
                hoverConnectedEdges: true,
                selectConnectedEdges: true,
                multiselect: true,
                selectable: true
            })
        });
        
        getNetwork().redraw();
    };
    
    const handleClickOutside = (e) => {
        if (e.target !== input) {
            saveEdit();
        }
    };
    
    setTimeout(() => {
        document.addEventListener('pointerdown', handleClickOutside, true);
    }, 100);
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            if (editFinalized) return;
            editFinalized = true;
            if (input.isConnected) {
                input.remove();
            }
            getStore().updateZoneEditing({ active: false });
            getStore().updateZoneEditing({ zoneIndex: -1 });
            getStore().updateZoneEditing({ inputElement: null });
            getStore().updateZoneEditing({ backgroundElement: null });
            
            document.removeEventListener('pointerdown', handleClickOutside, true);
            
            getNetwork().setOptions({
                interaction: getGraphInteractionOptions({
                    dragNodes: true,
                    hover: true,
                    hoverConnectedEdges: true,
                    selectConnectedEdges: true,
                    multiselect: true,
                    selectable: true
                })
            });
            
            getNetwork().redraw();
        }
    });
}

export function deleteZone(zoneIndex) {
    const zone = getStore().tagZones[zoneIndex];
    const tagToRemove = zone.tag;
    
    // Remove tag from all articles
    getStore().removeArticleCategoryGlobal(tagToRemove);
    
    // Remove zone
    getStore().deleteTagZone(zoneIndex);
    getStore().setSelectedZoneIndex(-1);
    
    // Recalculate all node colors using the same logic as position updates
    // This ensures colors match the actual zone membership
    checkNodeZoneMembership();
    
    const canvas = getNetwork().canvas.frame.canvas;
    if (canvas) {
        canvas.style.cursor = "default";
    }

    showNotification(`Zone "${tagToRemove}" deleted`, 'success');
}

export function startZoneResize(event, zoneIndex, handle) {
    pauseHistory();
    getStore().updateZoneResizing({ active: true });
    getStore().updateZoneResizing({ zoneIndex: zoneIndex });
    getStore().updateZoneResizing({ handle: handle });
    getStore().updateZoneResizing({ originalZone: { ...getStore().tagZones[zoneIndex] } });
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    getStore().updateZoneResizing({ startX: mousePos.x });
    getStore().updateZoneResizing({ startY: mousePos.y });
    
    // Disable getNetwork() interactions
    getNetwork().setOptions({
        interaction: getGraphInteractionOptions({
            dragNodes: false,
            dragView: false,
            zoomView: false
        })
    });
}

export function updateZoneResize(event) {
    if (!getStore().zoneResizing.active) return;
    
    const canvas = getNetwork().canvas.frame.canvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const mousePos = getNetwork().DOMtoCanvas({ x: mouseX, y: mouseY });
    
    const dx = mousePos.x - getStore().zoneResizing.startX;
    const dy = mousePos.y - getStore().zoneResizing.startY;
    
    const orig = getStore().zoneResizing.originalZone;
    const zoneIndex = getStore().zoneResizing.zoneIndex;
    const nextZone = { ...getStore().tagZones[zoneIndex] };
    
    switch (getStore().zoneResizing.handle) {
        case 'nw':
            nextZone.x = orig.x + dx;
            nextZone.y = orig.y + dy;
            nextZone.width = orig.width - dx;
            nextZone.height = orig.height - dy;
            break;
        case 'ne':
            nextZone.y = orig.y + dy;
            nextZone.width = orig.width + dx;
            nextZone.height = orig.height - dy;
            break;
        case 'sw':
            nextZone.x = orig.x + dx;
            nextZone.width = orig.width - dx;
            nextZone.height = orig.height + dy;
            break;
        case 'se':
            nextZone.width = orig.width + dx;
            nextZone.height = orig.height + dy;
            break;
        case 'n':
            nextZone.y = orig.y + dy;
            nextZone.height = orig.height - dy;
            break;
        case 's':
            nextZone.height = orig.height + dy;
            break;
        case 'e':
            nextZone.width = orig.width + dx;
            break;
        case 'w':
            nextZone.x = orig.x + dx;
            nextZone.width = orig.width - dx;
            break;
    }
    
    // Enforce minimum size
    const minSize = 150;
    if (nextZone.width < minSize) {
        nextZone.width = minSize;
        nextZone.x = orig.x;
    }
    if (nextZone.height < minSize) {
        nextZone.height = minSize;
        nextZone.y = orig.y;
    }

    getStore().replaceTagZone(zoneIndex, nextZone);
    
    getNetwork().redraw();
}

export function endZoneResize() {
    const resizingIdx = getStore().zoneResizing.zoneIndex;
    const originalZone = getStore().zoneResizing.originalZone;
    const finalTagZones = cloneTagZones(getStore().tagZones);
    const revertedTagZones = cloneTagZones(getStore().tagZones);

    if (resizingIdx >= 0 && originalZone) {
        revertedTagZones[resizingIdx] = { ...revertedTagZones[resizingIdx], ...originalZone };
    }

    const currentPositions = getNetwork().getPositions(getStore().appData.articles.map((article) => article.id));
    const { articles: finalArticles } = checkNodeZoneMembership({
        positions: currentPositions,
        tagZones: finalTagZones,
        persistToStore: false,
        saveChanges: false,
        refreshFilters: false,
    });

    getStore().setTagZones(revertedTagZones);
    resumeHistory();
    getStore().commitTrackedGraphState({
        articles: finalArticles,
        tagZones: finalTagZones,
    });
    getStore().updateZoneResizing({ active: false });
    getStore().updateZoneResizing({ zoneIndex: -1 });
    getStore().updateZoneResizing({ handle: null });
    getStore().updateZoneResizing({ originalZone: null });
    
    // Re-enable getNetwork() interactions
    getNetwork().setOptions({
        interaction: getGraphInteractionOptions({
            dragNodes: true,
            hover: true
        })
    });
    
    updateCategoryFilters();
    save(true);
    getNetwork().redraw();
}
