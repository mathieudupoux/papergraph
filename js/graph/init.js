// ===== GRAPH INITIALIZATION =====
// Network creation, options, and graph setup

import { getStore, getNetwork, setNetwork } from '../store/appStore.js';
import { getGraphData } from './render.js';
import { setupCanvasEvents, setupNetworkEvents } from './events.js';

function toRgba(color, alpha) {
    if (!color) return `rgba(74, 144, 226, ${alpha})`;

    if (typeof color === 'string' && color.startsWith('#')) {
        const hex = color.slice(1);
        const normalized = hex.length === 3
            ? hex.split('').map((char) => char + char).join('')
            : hex;
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const rgbMatch = typeof color === 'string' ? color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i) : null;
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }

    return `rgba(74, 144, 226, ${alpha})`;
}

function getLiveNodeBaseColor(nodeId, fallbackColor) {
    const liveNodeColor = nodeId !== undefined ? getNetwork()?.body?.data?.nodes?.get(nodeId)?.color : null;
    const sourceColor = liveNodeColor || fallbackColor;

    if (!sourceColor) return '#4a90e2';
    if (typeof sourceColor === 'string') return sourceColor;

    const background = sourceColor.background || sourceColor.highlight?.background || sourceColor.hover?.background;
    const border = sourceColor.border;

    // Keep the default vivid blue hover glow for untagged nodes.
    if (background === '#e3f2fd' || border === '#4a90e2') {
        return '#4a90e2';
    }

    return background || border || '#4a90e2';
}

export function initializeGraph() {
    const container = document.getElementById('graphContainer');
    const graphData = getGraphData();
    
    const isReadOnly = getStore().isReadOnlyMode || getStore().isGalleryViewer;
    const options = {
        nodes: {
            shape: 'box',
            margin: 10,
            borderWidth: 3,
            borderWidthSelected: 4,
            shapeProperties: {
                borderRadius: 20
            },
            widthConstraint: {
                minimum: 80,
                maximum: 200
            },
            font: {
                size: 14,
                color: '#333333',
                bold: {
                    color: '#333333',
                    size: 14,
                    face: 'arial',
                    vadjust: 0,
                    mod: ''
                }
            },
            color: {
                border: '#4a90e2',
                background: '#e3f2fd',
                highlight: {
                    border: '#357abd',
                    background: '#90caf9'
                }
            },
            chosen: {
                node: function(values, id, selected, hovering) {
                    if (hovering || selected) {
                        const hoverBaseColor = getLiveNodeBaseColor(id, values.color);
                        values.borderWidth = selected ? 4 : 3.5;
                        values.shadow = true;
                        values.shadowColor = hovering ? toRgba(hoverBaseColor, 0.5) : toRgba(hoverBaseColor, 0.7);
                        values.shadowSize = hovering ? 15 : 20;
                        values.shadowX = 0;
                        values.shadowY = 0;
                    }
                },
                label: false
            }
        },
        edges: {
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 1
                }
            },
            color: {
                color: '#848484',
                highlight: '#4a90e2',
                hover: '#848484'
            },
            font: {
                size: 12,
                align: 'middle'
            },
            smooth: {
                enabled: true,
                type: 'continuous',
                roundness: 0.15
            },
            hoverWidth: 0,
            selectionWidth: 2,
            chosen: {
                edge: function(values, id, selected, hovering) {
                    if (selected) {
                        values.width = 3;
                        values.color = '#4a90e2';
                        values.shadow = true;
                        values.shadowColor = 'rgba(53, 122, 189, 0.45)';
                        values.shadowSize = 14;
                        values.shadowX = 0;
                        values.shadowY = 0;
                    }
                },
                label: false
            }
        },
        physics: {
            enabled: false
        },
        interaction: {
            hover: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: true,
            tooltipDelay: 200,
            dragView: false,
            zoomView: false,
            multiselect: !isReadOnly,
            selectable: true,
            dragNodes: !isReadOnly
        }
    };
    
    setNetwork(new vis.Network(container, graphData, options));
    
    // Force disable node dragging in gallery viewer mode
    if (getStore().isGalleryViewer) {
        getNetwork().setOptions({
            interaction: {
                dragNodes: false,
                dragView: false,
                selectable: true
            },
            manipulation: {
                enabled: false
            }
        });
        
        const allNodes = getNetwork().body.data.nodes.get();
        allNodes.forEach(node => {
            getNetwork().body.data.nodes.update({
                id: node.id,
                fixed: { x: true, y: true }
            });
        });
    }
    
    // Set up all event handlers (defined in events.js)
    setupCanvasEvents();
    setupNetworkEvents();
    
}
