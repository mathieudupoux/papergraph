// ===== GRAPH INITIALIZATION =====
// Network creation, options, and graph setup

import { state } from '../core/state.js';
import { getGraphData } from './render.js';
import { setupCanvasEvents, setupNetworkEvents } from './events.js';

export function initializeGraph() {
    const container = document.getElementById('graphContainer');
    const graphData = getGraphData();
    
    const isReadOnly = state.isReadOnlyMode || state.isGalleryViewer;
    console.log(`📊 Initializing graph - Gallery viewer: ${state.isGalleryViewer}, Read-only mode: ${isReadOnly}`);
    
    const options = {
        nodes: {
            shape: 'box',
            margin: 10,
            borderWidth: 3,
            borderWidthSelected: 3,
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
                        values.shadowColor = hovering ? 'rgba(74, 144, 226, 0.5)' : 'rgba(53, 122, 189, 0.7)';
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
            chosen: false
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
            multiselect: !isReadOnly,
            selectable: true,
            dragNodes: !isReadOnly
        }
    };
    
    console.log('Initializing graph with container:', container);
    console.log('Data:', graphData);
    
    state.network = new vis.Network(container, graphData, options);
    
    // Force disable node dragging in gallery viewer mode
    if (state.isGalleryViewer) {
        state.network.setOptions({
            interaction: {
                dragNodes: false,
                dragView: false,
                selectable: true
            },
            manipulation: {
                enabled: false
            }
        });
        
        const allNodes = state.network.body.data.nodes.get();
        allNodes.forEach(node => {
            state.network.body.data.nodes.update({
                id: node.id,
                fixed: { x: true, y: true }
            });
        });
    }
    
    // Set up all event handlers (defined in events.js)
    setupCanvasEvents();
    setupNetworkEvents();
    
    console.log('Graph initialized successfully');
}
