// ===== EXPORT / IMPORT FUNCTIONS =====
// Project export, import, and PDF generation

// Helper function to generate filename with project title and author
function getExportFilename(extension = 'papergraph') {
    let projectTitle = 'papergraph';
    let authorName = '';
    
    // Check if we're in gallery viewer mode with metadata
    if (window.galleryProjectMetadata) {
        projectTitle = window.galleryProjectMetadata.title || projectTitle;
        authorName = window.galleryProjectMetadata.author || '';
    } else {
        // Normal editor mode - get title from input or localStorage
        const titleInput = document.getElementById('projectTitleInput') || document.getElementById('projectTitle');
        if (titleInput && titleInput.value.trim()) {
            projectTitle = titleInput.value.trim();
        } else {
            const storedTitle = localStorage.getItem('currentProjectTitle');
            if (storedTitle) {
                projectTitle = storedTitle;
            }
        }
    }
    
    // Clean filename (remove invalid characters)
    const cleanTitle = projectTitle.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
    const cleanAuthor = authorName ? authorName.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() : '';
    
    // Build filename: author_projecttitle.extension or projecttitle.extension
    const filename = cleanAuthor ? `${cleanAuthor}_${cleanTitle}.${extension}` : `${cleanTitle}.${extension}`;
    
    return filename;
}

function newProject() {
    if (confirm('Créer un nouveau projet vide ? Les données non exportées seront perdues.')) {
        appData = {
            articles: [],
            connections: [],
            nextArticleId: 1,
            nextConnectionId: 1
        };
        tagZones = [];
        currentCategoryFilter = '';
        selectedNodeId = null;
        selectedEdgeIndex = -1;
        
        // Clear edge control points
        edgeControlPoints = {};
        window.edgeControlPoints = {};
        nextControlPointId = -1;
        window.nextControlPointId = -1;
        
        // Remove all control point nodes (negative IDs) from the network
        if (network) {
            const allNodes = network.body.data.nodes.get();
            const controlPointNodes = allNodes.filter(node => node.id < 0);
            if (controlPointNodes.length > 0) {
                network.body.data.nodes.remove(controlPointNodes.map(n => n.id));
                console.log('🗑️ Removed', controlPointNodes.length, 'control point nodes');
            }
            
            // Remove all segment edges (IDs containing _seg_)
            const allEdges = network.body.data.edges.get();
            const segmentEdges = allEdges.filter(edge => edge.id.toString().includes('_seg_'));
            if (segmentEdges.length > 0) {
                network.body.data.edges.remove(segmentEdges.map(e => e.id));
                console.log('🗑️ Removed', segmentEdges.length, 'segment edges');
            }
        }
        
        // Clear ALL localStorage data including positions and control points
        localStorage.removeItem('papermap_data');
        localStorage.removeItem('papermap_zones');
        localStorage.removeItem('papermap_positions');
        localStorage.removeItem('papermap_edge_control_points');
        localStorage.removeItem('papermap_next_control_point_id');
        window.savedNodePositions = {};
        
        saveToLocalStorage();
        updateCategoryFilters();
        renderListView();
        updateGraph();
        closeArticlePreview();
        
        showNotification('Nouveau projet créé!', 'success');
    }
}

function exportProject() {
    // Include tagZones and node positions in the export
    const exportData = {
        ...appData,
        tagZones: tagZones,
        nodePositions: window.savedNodePositions || {}
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = getExportFilename('papergraph');
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification('Projet exporté!', 'success');
}

function exportToImage() {
    if (!network) {
        showNotification('Le graphe n\'est pas encore initialisé', 'error');
        return;
    }
    
    const canvas = network.canvas.frame.canvas;
    const url = canvas.toDataURL('image/png');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = getExportFilename('png');
    a.click();
    
    showNotification('Image exportée en PNG!', 'success');
}

function exportToSVG() {
    if (!network) {
        showNotification('Le graphe n\'est pas encore initialisé', 'error');
        return;
    }
    
    try {
        const canvas = network.canvas.frame.canvas;
        
        // Use the actual canvas dimensions (what's visible)
        const width = canvas.width;
        const height = canvas.height;
        
        // Get all positions in canvas coordinates
        const positions = network.getPositions();
        const scale = network.getScale();
        const viewPosition = network.getViewPosition();
        
        let svgElements = [];
        
        // Get nodes data first (needed for edge arrow positioning)
        const nodes = network.body.data.nodes.get();
        
        // Draw zones first (background)
        if (tagZones && tagZones.length > 0) {
            const sortedZones = [...tagZones].sort((a, b) => {
                const areaA = a.width * a.height;
                const areaB = b.width * b.height;
                return areaB - areaA;
            });
            
            sortedZones.forEach(zone => {
                const topLeft = network.canvasToDOM({ x: zone.x, y: zone.y });
                const bottomRight = network.canvasToDOM({ x: zone.x + zone.width, y: zone.y + zone.height });
                
                const x = topLeft.x;
                const y = topLeft.y;
                const w = bottomRight.x - topLeft.x;
                const h = bottomRight.y - topLeft.y;
                
                const color = zone.color;
                const r = parseInt(color.substr(1, 2), 16);
                const g = parseInt(color.substr(3, 2), 16);
                const b = parseInt(color.substr(5, 2), 16);
                
                // Zone background (with scaled stroke)
                const zoneStrokeWidth = 3 * scale;
                const zoneDashArray = `${10 * scale},${5 * scale}`;
                svgElements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" 
                    fill="rgba(${r},${g},${b},0.1)" 
                    stroke="rgba(${r},${g},${b},0.3)" 
                    stroke-width="${zoneStrokeWidth}" 
                    stroke-dasharray="${zoneDashArray}"/>`);
                
                // Zone title with background (only if tag is not empty)
                if (zone.tag && zone.tag.trim() !== '') {
                    const titleCanvasX = zone.x + 10;
                    const titleCanvasY = zone.y + 10;
                    const titlePos = network.canvasToDOM({ x: titleCanvasX, y: titleCanvasY });
                    const titleX = titlePos.x;
                    const titleY = titlePos.y;
                    const textPadding = 10 * scale;
                    const textPaddingRight = 5 * scale; // Less padding on the right
                    
                    // Font size scaled by zoom level
                    const fontSize = 24 * scale;
                    
                    // Measure text width accurately using canvas
                    const ctx = network.canvas.frame.canvas.getContext('2d');
                    ctx.save();
                    ctx.font = `bold ${fontSize}px Arial`;
                    const textWidth = ctx.measureText(zone.tag).width;
                    ctx.restore();
                    
                    const textHeight = fontSize * 1.2;
                    
                    // Title background rectangle
                    svgElements.push(`<rect x="${titleX}" y="${titleY}" 
                        width="${textWidth + textPadding + textPaddingRight}" 
                        height="${textHeight + textPadding}" 
                        fill="rgba(${r},${g},${b},0.2)"/>`);
                    
                    // Title text (centered vertically in the background)
                    const textY = titleY + textPadding + fontSize * 0.8;
                    svgElements.push(`<text x="${titleX + textPadding}" y="${textY}" 
                        font-family="Arial" font-size="${fontSize}" font-weight="bold" 
                        fill="${color}">${escapeXml(zone.tag)}</text>`);
                }
            });
        }
        
        // Draw edges
        const edges = network.body.data.edges.get();
        edges.forEach(edge => {
            const fromPos = positions[edge.from];
            const toPos = positions[edge.to];
            
            if (fromPos && toPos) {
                const from = network.canvasToDOM(fromPos);
                const to = network.canvasToDOM(toPos);
                
                let x1 = from.x;
                let y1 = from.y;
                let x2 = to.x;
                let y2 = to.y;
                
                // Save original positions for label placement
                const origX1 = x1;
                const origY1 = y1;
                const origX2 = x2;
                const origY2 = y2;
                
                // Get edge style properties
                const color = edge.color?.color || '#848484';
                const width = (edge.width || 1) * scale;
                
                // Variable to track the last point before reaching the target (for arrow angle)
                let arrowFromX = x1;
                let arrowFromY = y1;
                
                // Check if edge has control points (smooth curve)
                const edgeId = `${edge.from}_${edge.to}`;
                const controlPointIds = window.edgeControlPoints?.[edgeId];
                
                if (controlPointIds && controlPointIds.length > 0) {
                    // Draw smooth curve using quadratic/cubic bezier
                    const controlPoints = controlPointIds.map(cpId => {
                        const cpPos = positions[cpId];
                        if (cpPos) {
                            const cpDom = network.canvasToDOM(cpPos);
                            return { x: cpDom.x, y: cpDom.y };
                        }
                        return null;
                    }).filter(cp => cp !== null);
                    
                    if (controlPoints.length > 0) {
                        let pathData = `M ${x1} ${y1}`;
                        
                        if (controlPoints.length === 1) {
                            // Quadratic bezier with one control point
                            pathData += ` Q ${controlPoints[0].x} ${controlPoints[0].y}, ${x2} ${y2}`;
                            // For arrow: tangent is from control point to end point
                            arrowFromX = controlPoints[0].x;
                            arrowFromY = controlPoints[0].y;
                        } else {
                            // Cubic bezier or smooth curve through multiple points
                            controlPoints.forEach((cp, i) => {
                                if (i === 0) {
                                    pathData += ` L ${cp.x} ${cp.y}`;
                                } else {
                                    pathData += ` L ${cp.x} ${cp.y}`;
                                }
                            });
                            pathData += ` L ${x2} ${y2}`;
                            // For arrow: use last control point
                            const lastCP = controlPoints[controlPoints.length - 1];
                            arrowFromX = lastCP.x;
                            arrowFromY = lastCP.y;
                        }
                        
                        svgElements.push(`<path d="${pathData}" 
                            stroke="${color}" stroke-width="${width}" 
                            fill="none"/>`);
                    } else {
                        // No valid control points, draw straight line with smooth curve
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const dx = x2 - x1;
                        const dy = y2 - y1;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        // Add slight curve (continuous roundness: 0.15)
                        const offset = dist * 0.15;
                        const perpX = -dy / dist * offset;
                        const perpY = dx / dist * offset;
                        const cx = midX + perpX;
                        const cy = midY + perpY;
                        
                        svgElements.push(`<path d="M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}" 
                            stroke="${color}" stroke-width="${width}" 
                            fill="none"/>`);
                        
                        // For arrow: tangent is from control point to end point
                        arrowFromX = cx;
                        arrowFromY = cy;
                    }
                } else {
                    // Draw smooth curved line (continuous roundness: 0.15)
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    // Add slight curve
                    const offset = dist * 0.15;
                    const perpX = -dy / dist * offset;
                    const perpY = dx / dist * offset;
                    const cx = midX + perpX;
                    const cy = midY + perpY;
                    
                    svgElements.push(`<path d="M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}" 
                        stroke="${color}" stroke-width="${width}" 
                        fill="none"/>`);
                    
                    // For arrow: tangent is from control point to end point
                    arrowFromX = cx;
                    arrowFromY = cy;
                }
                
                // Draw arrow only if target is not a control point (subnode)
                if (edge.to >= 0) {
                    const visToNode = network.body.nodes[edge.to];
                    if (!visToNode || !visToNode.shape) {
                        return;
                    }
                    
                    // Step 1: Calculate the tangent at the end of the quadratic Bezier curve
                    // For a quadratic Bezier Q(t) = (1-t)²P0 + 2(1-t)t P1 + t²P2
                    // The derivative at t=1 is: Q'(1) = 2(P2 - P1)
                    // So the tangent direction is from the control point to the end point
                    const dx = x2 - arrowFromX;
                    const dy = y2 - arrowFromY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance === 0) return; // Avoid division by zero
                    
                    // Normalized direction vector (tangent to the curve at endpoint)
                    const dirX = dx / distance;
                    const dirY = dy / distance;
                    
                    // Step 2: Get node dimensions in canvas space and convert to DOM space
                    const nodeCanvasW = visToNode.shape.width || 100;
                    const nodeCanvasH = visToNode.shape.height || 40;
                    
                    // Transform node dimensions to DOM space using scale
                    // The scale factor is already embedded in the network transformation
                    // We need to convert a size difference in canvas to DOM
                    const topLeft = network.canvasToDOM({ x: toPos.x - nodeCanvasW/2, y: toPos.y - nodeCanvasH/2 });
                    const bottomRight = network.canvasToDOM({ x: toPos.x + nodeCanvasW/2, y: toPos.y + nodeCanvasH/2 });
                    const nodeW = bottomRight.x - topLeft.x;
                    const nodeH = bottomRight.y - topLeft.y;
                    
                    // Step 3: Calculate intersection with node border (rectangle)
                    // Using parametric approach: find where ray hits the rectangle
                    const halfW = nodeW / 2;
                    const halfH = nodeH / 2;
                    
                    // Calculate distance from node center to border along the direction vector
                    let borderDist;
                    if (Math.abs(dirX) > 0.001) {
                        const tX = halfW / Math.abs(dirX);
                        const tY = Math.abs(dirY) > 0.001 ? halfH / Math.abs(dirY) : Infinity;
                        borderDist = Math.min(tX, tY);
                    } else {
                        borderDist = halfH / Math.abs(dirY);
                    }
                    
                    // Step 4: Position arrow tip at the node border
                    const tipX = x2 - dirX * borderDist;
                    const tipY = y2 - dirY * borderDist;
                    
                    // Step 5: Calculate arrow angle
                    const angle = Math.atan2(dirY, dirX);
                    
                    // Step 6: Draw arrow wings
                    const arrowSize = 10 * scale;
                    const arrowAngle = Math.PI / 6; // 30 degrees
                    
                    const wing1X = tipX - arrowSize * Math.cos(angle - arrowAngle);
                    const wing1Y = tipY - arrowSize * Math.sin(angle - arrowAngle);
                    const wing2X = tipX - arrowSize * Math.cos(angle + arrowAngle);
                    const wing2Y = tipY - arrowSize * Math.sin(angle + arrowAngle);
                    
                    svgElements.push(`<path d="M ${tipX} ${tipY} L ${wing1X} ${wing1Y} L ${wing2X} ${wing2Y} Z" fill="${color}"/>`);
                }
                
                // Draw edge label if present
                if (edge.label) {
                    // Use original positions for label placement on the curve
                    const midX = (origX1 + origX2) / 2;
                    const midY = (origY1 + origY2) / 2;
                    
                    // Get label font properties (scaled by zoom)
                    const labelFontSize = (edge.font?.size || 11) * scale;
                    const labelFontColor = edge.font?.color || '#666666';
                    const labelFontFace = (edge.font?.face || 'Arial, sans-serif').replace(/["']/g, '');
                    
                    // White background for label readability
                    const labelWidth = String(edge.label).length * labelFontSize * 0.6;
                    const labelHeight = labelFontSize + 4;
                    
                    svgElements.push(`<rect x="${midX - labelWidth/2}" y="${midY - labelHeight/2}" 
                        width="${labelWidth}" height="${labelHeight}" 
                        fill="white" fill-opacity="0.8"/>`);
                    
                    svgElements.push(`<text x="${midX}" y="${midY}" 
                        font-family="${labelFontFace}" font-size="${labelFontSize}" 
                        fill="${labelFontColor}" text-anchor="middle" 
                        dominant-baseline="middle">${escapeXml(edge.label)}</text>`);
                }
            }
        });
        
        // Draw nodes (already retrieved at the beginning)
        nodes.forEach(node => {
            const pos = positions[node.id];
            if (!pos) return;
            
            const domPos = network.canvasToDOM(pos);
            const x = domPos.x;
            const y = domPos.y;
            
            // Skip control points (negative IDs)
            if (node.id < 0) {
                // Draw small control point (scaled appropriately)
                const cpRadius = 3 * scale;
                svgElements.push(`<circle cx="${x}" cy="${y}" r="${cpRadius}" 
                    fill="#848484" stroke="none"/>`);
                return;
            }
            
            // Get the actual rendered node from vis-network
            const visNode = network.body.nodes[node.id];
            if (!visNode) return;
            
            // Get node visual properties
            const color = node.color?.background || '#e3f2fd';
            const borderColor = node.color?.border || '#4a90e2';
            const borderWidth = (node.borderWidth || 3) * scale;
            
            // Get font properties (scaled by zoom)
            const fontSize = (node.font?.size || 14) * scale;
            const fontColor = node.font?.color || '#333333';
            const fontFace = (node.font?.face || 'Arial').replace(/["']/g, '');
            
            // Get actual size from vis-network's rendering (scaled by zoom)
            const shape = visNode.shape;
            let nodeWidth = (shape.width || 100) * scale;
            let nodeHeight = (shape.height || 40) * scale;
            
            // Draw node as rounded rectangle (box shape)
            const nodeX = x - nodeWidth / 2;
            const nodeY = y - nodeHeight / 2;
            const borderRadius = 20 * scale;
            
            svgElements.push(`<rect x="${nodeX}" y="${nodeY}" 
                width="${nodeWidth}" height="${nodeHeight}" 
                rx="${borderRadius}" ry="${borderRadius}"
                fill="${color}" 
                stroke="${borderColor}" 
                stroke-width="${borderWidth}"/>`);
            
            // Draw node label if present
            const label = node.label || '';
            if (label) {
                const lines = String(label).split('\n');
                const lineHeight = fontSize * 1.2;
                const startY = y - ((lines.length - 1) * lineHeight) / 2;
                
                lines.forEach((line, i) => {
                    svgElements.push(`<text x="${x}" y="${startY + i * lineHeight}" 
                        font-family="${fontFace}" font-size="${fontSize}" 
                        fill="${fontColor}" text-anchor="middle" 
                        dominant-baseline="middle">${escapeXml(line)}</text>`);
                });
            }
        });
        
        // Create SVG content
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${width}" height="${height}" 
     viewBox="0 0 ${width} ${height}">
  <title>PaperGraph Export</title>
  <rect width="100%" height="100%" fill="white"/>
  ${svgElements.join('\n  ')}
</svg>`;
        
        // Get project title
        
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = getExportFilename('svg');
        a.click();
        
        URL.revokeObjectURL(url);
        showNotification('Vector image exported to SVG!', 'success');
    } catch (error) {
        console.error('Error exporting SVG:', error);
        showNotification('Error exporting SVG: ' + error.message, 'error');
    }
}

// Helper function to escape XML special characters
function escapeXml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generate SVG content without downloading (for preview generation)
 * Returns the SVG string - uses the full export SVG logic
 */
function generateSVGContent() {
    // Use window.network to ensure access from anywhere
    const networkInstance = typeof network !== 'undefined' ? network : window.network;
    
    if (!networkInstance) {
        console.warn('generateSVGContent: No network instance available');
        return null;
    }
    
    try {
        const canvas = networkInstance.canvas.frame.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const positions = networkInstance.getPositions();
        const scale = networkInstance.getScale();
        
        let svgElements = [];
        const nodes = networkInstance.body.data.nodes.get();
        const edges = networkInstance.body.data.edges.get();
        
        // Draw zones first (background)
        if (window.tagZones && window.tagZones.length > 0) {
            const sortedZones = [...window.tagZones].sort((a, b) => {
                const areaA = a.width * a.height;
                const areaB = b.width * b.height;
                return areaB - areaA;
            });
            
            sortedZones.forEach(zone => {
                const topLeft = networkInstance.canvasToDOM({ x: zone.x, y: zone.y });
                const bottomRight = networkInstance.canvasToDOM({ x: zone.x + zone.width, y: zone.y + zone.height });
                
                const x = topLeft.x;
                const y = topLeft.y;
                const w = bottomRight.x - topLeft.x;
                const h = bottomRight.y - topLeft.y;
                
                const color = zone.color;
                const r = parseInt(color.substr(1, 2), 16);
                const g = parseInt(color.substr(3, 2), 16);
                const b = parseInt(color.substr(5, 2), 16);
                
                const zoneStrokeWidth = 3 * scale;
                const zoneDashArray = `${10 * scale},${5 * scale}`;
                svgElements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" 
                    fill="rgba(${r},${g},${b},0.1)" 
                    stroke="rgba(${r},${g},${b},0.3)" 
                    stroke-width="${zoneStrokeWidth}" 
                    stroke-dasharray="${zoneDashArray}"/>`);
                
                if (zone.tag && zone.tag.trim() !== '') {
                    const titleCanvasX = zone.x + 10;
                    const titleCanvasY = zone.y + 10;
                    const titlePos = networkInstance.canvasToDOM({ x: titleCanvasX, y: titleCanvasY });
                    const titleX = titlePos.x;
                    const titleY = titlePos.y;
                    const textPadding = 10 * scale;
                    const textPaddingRight = 5 * scale;
                    const fontSize = 24 * scale;
                    
                    const ctx = networkInstance.canvas.frame.canvas.getContext('2d');
                    ctx.save();
                    ctx.font = `bold ${fontSize}px Arial`;
                    const textWidth = ctx.measureText(zone.tag).width;
                    ctx.restore();
                    
                    const textHeight = fontSize * 1.2;
                    
                    svgElements.push(`<rect x="${titleX}" y="${titleY}" 
                        width="${textWidth + textPadding + textPaddingRight}" 
                        height="${textHeight + textPadding}" 
                        fill="rgba(${r},${g},${b},0.2)"/>`);
                    
                    const textY = titleY + textPadding + fontSize * 0.8;
                    svgElements.push(`<text x="${titleX + textPadding}" y="${textY}" 
                        font-family="Arial" font-size="${fontSize}" font-weight="bold" 
                        fill="${color}">${escapeXml(zone.tag)}</text>`);
                }
            });
        }
        
        // Draw edges with curves like full export
        edges.forEach(edge => {
            const fromPos = positions[edge.from];
            const toPos = positions[edge.to];
            
            if (!fromPos || !toPos) return;
            
            let x1 = networkInstance.canvasToDOM(fromPos).x;
            let y1 = networkInstance.canvasToDOM(fromPos).y;
            let x2 = networkInstance.canvasToDOM(toPos).x;
            let y2 = networkInstance.canvasToDOM(toPos).y;
            
            const color = edge.color?.color || '#848484';
            const width = (edge.width || 1) * scale;
            
            // Draw smooth curved line (continuous roundness: 0.15)
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Add slight curve
            const offset = dist * 0.15;
            const perpX = -dy / dist * offset;
            const perpY = dx / dist * offset;
            const cx = midX + perpX;
            const cy = midY + perpY;
            
            svgElements.push(`<path d="M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}" 
                stroke="${color}" stroke-width="${width}" 
                fill="none"/>`);
        });
        
        // Draw nodes
        nodes.forEach(nodeData => {
            const pos = positions[nodeData.id];
            if (!pos) return;
            
            const domPos = networkInstance.canvasToDOM(pos);
            const visNode = networkInstance.body.nodes[nodeData.id];
            if (!visNode || !visNode.shape) return;
            
            const nodeCanvasW = visNode.shape.width || 100;
            const nodeCanvasH = visNode.shape.height || 40;
            
            const topLeft = networkInstance.canvasToDOM({ x: pos.x - nodeCanvasW/2, y: pos.y - nodeCanvasH/2 });
            const bottomRight = networkInstance.canvasToDOM({ x: pos.x + nodeCanvasW/2, y: pos.y + nodeCanvasH/2 });
            const nodeW = bottomRight.x - topLeft.x;
            const nodeH = bottomRight.y - topLeft.y;
            
            const x = domPos.x - nodeW / 2;
            const y = domPos.y - nodeH / 2;
            
            const bgColor = nodeData.color || '#4a90e2';
            const textColor = getContrastColorForSVG(bgColor);
            const fontSize = 14 * scale;
            
            svgElements.push(`<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" 
                fill="${bgColor}" rx="${10 * scale}" stroke="#ffffff" stroke-width="${2 * scale}"/>`);
            
            const label = nodeData.label || 'Node';
            const textY = domPos.y + fontSize * 0.35;
            svgElements.push(`<text x="${domPos.x}" y="${textY}" 
                font-family="Arial" font-size="${fontSize}" 
                fill="${textColor}" text-anchor="middle">${escapeXml(label)}</text>`);
        });
        
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${width}" height="${height}" 
     viewBox="0 0 ${width} ${height}">
  <title>PaperGraph Preview</title>
  <rect width="100%" height="100%" fill="white"/>
  ${svgElements.join('\n  ')}
</svg>`;
        
        return svgContent;
    } catch (error) {
        console.error('Error generating SVG content:', error);
        return null;
    }
}

// Helper function for SVG text color contrast
function getContrastColorForSVG(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#2c3e50' : '#ffffff';
}

// Make generateSVGContent available globally for cloud-storage module
window.generateSVGContent = generateSVGContent;

function importProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            if (!imported.articles || !imported.connections) {
                throw new Error('Invalid file format');
            }
            
            if (confirm('This will replace the current project. Continue?')) {
                // Extract tagZones if present
                if (imported.tagZones) {
                    tagZones = imported.tagZones;
                    delete imported.tagZones;  // Remove from appData
                } else {
                    // If no zones in file, they will be created from tags
                    tagZones = [];
                }
                
                // Extract node positions if present
                if (imported.nodePositions) {
                    window.savedNodePositions = imported.nodePositions;
                    delete imported.nodePositions;  // Remove from appData
                } else {
                    window.savedNodePositions = {};
                }
                
                appData = imported;
                
                // Ensure new fields exist for backward compatibility
                if (!appData.projectReview) {
                    appData.projectReview = "";
                }
                if (!appData.reviewMetadata) {
                    appData.reviewMetadata = {
                        title: '',
                        author: '',
                        date: ''
                    };
                }
                
                updateGraph();
                renderListView();
                updateCategoryFilters();
                
                // Initialize zones if none were imported
                if (tagZones.length === 0) {
                    initializeZonesFromTags();
                }
                
                saveToLocalStorage();
                
                // Recenter the graph view to show all imported content
                setTimeout(() => {
                    if (typeof window.fitGraphView === 'function') {
                        window.fitGraphView();
                    }
                }, 300); // Small delay to ensure graph is fully rendered
                
                showNotification('Project imported!', 'success');
                
                // Close onboarding if it's open
                if (typeof window.closeOnboarding === 'function') {
                    window.closeOnboarding();
                }
            }
        } catch (err) {
            showNotification('Error importing: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
}


// ===== BIBTEX EXPORT =====

function exportToBibtex() {
    if (appData.articles.length === 0) {
        showNotification('Aucun article à exporter', 'warning');
        return;
    }
    
    let bibtexContent = '';
    
    appData.articles.forEach(article => {
        bibtexContent += articleToBibTeX(article) + '\n';
    });
    
    const blob = new Blob([bibtexContent], { type: 'text/plain;charset=utf-8' });
    
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = getExportFilename('bib');
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification(`${appData.articles.length} article(s) exporté(s) en BibTeX!`, 'success');
}


// ===== PDF EXPORT VIA LATEX =====
/**
 * PDF Export via LaTeX Compilation
 * 
 * This module provides functionality to export the entire project as a PDF document.
 * It generates a complete LaTeX document including:
 * - Project review/overview (main document text)
 * - All article summaries with abstracts and notes
 * - Full bibliography in LaTeX format
 * - "Generated by PaperGraph" footer
 * 
 * The LaTeX document is compiled online using the YtoTech LaTeX API (https://latex.ytotech.com/)
 * Users can customize the document style (preamble, packages, formatting) via the style editor.
 * 
 * Features:
 * - Preserves LaTeX math equations ($...$ and $$...$$)
 * - Handles citation links (\cite{key})
 * - Escapes special LaTeX characters in regular text
 * - Customizable document style saved to localStorage
 */

/**
 * Get custom LaTeX style from localStorage (or use default)
 */
function getLatexStyle() {
    const savedStyle = localStorage.getItem('papergraph_latex_style');
    if (savedStyle) {
        return savedStyle;
    }
    
    // Default LaTeX style - Academic format
    return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{titlesec}
\\usepackage{parskip}

% Custom ORCID iD badge command (green colored iD text)
\\newcommand{\\orcidlink}[1]{%
  \\href{https://orcid.org/#1}{%
    \\textcolor[HTML]{A6CE39}{\\textsuperscript{\\scriptsize\\textbf{[iD]}}}%
  }%
}

% Typography
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.8em}
\\linespread{1.1}

% Main headings (Overview, Article titles) - unnumbered, chapter-like
\\titleformat{name=\\section,numberless}
  {\\normalfont\\LARGE\\bfseries}{}{0em}{}
  [\\vspace{0.5ex}\\titlerule]
\\titlespacing*{\\section}{0pt}{2em}{1em}

% Regular sections (numbered, for content within review/articles)
\\titleformat{\\section}
  {\\normalfont\\Large\\bfseries}{\\thesection}{1em}{}
\\titlespacing*{\\section}{0pt}{1.5em}{0.8em}

% Subsections
\\titleformat{\\subsection}
  {\\normalfont\\large\\bfseries}{\\thesubsection}{1em}{}
\\titlespacing*{\\subsection}{0pt}{1.2em}{0.6em}

% Subsubsections
\\titleformat{\\subsubsection}
  {\\normalfont\\normalsize\\bfseries}{\\thesubsubsection}{1em}{}
\\titlespacing*{\\subsubsection}{0pt}{1em}{0.4em}

% Multi-author support
\\makeatletter
\\renewcommand{\\@maketitle}{%
  \\newpage
  \\null
  \\vskip 2em%
  \\begin{center}%
  \\let \\footnote \\thanks
    {\\LARGE \\@title \\par}%
    \\vskip 1.5em%
    {\\large
      \\lineskip .5em%
      \\begin{tabular}[t]{c}%
        \\@author
      \\end{tabular}\\par}%
    \\vskip 1em%
    {\\large \\@date}%
  \\end{center}%
  \\par
  \\vskip 1.5em}
\\makeatother

% Hyperlinks
\\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,
    urlcolor=cyan,
    citecolor=blue,
    pdfborder={0 0 0}
}`;
}

/**
 * Save custom LaTeX style to localStorage
 */
function saveLatexStyle(styleContent) {
    localStorage.setItem('papergraph_latex_style', styleContent);
    showNotification('LaTeX style saved!', 'success');
}

/**
 * Reset LaTeX style to default
 */
function resetLatexStyle() {
    localStorage.removeItem('papergraph_latex_style');
    showNotification('LaTeX style reset to default!', 'success');
}

/**
 * Escape special LaTeX characters
 */
function escapeLatex(text) {
    if (!text) return '';
    return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/</g, '\\textless{}')
        .replace(/>/g, '\\textgreater{}');
}

/**
 * Sanitize citation keys - remove or replace characters that are problematic in BibTeX keys
 * BibTeX keys should only contain alphanumeric characters, hyphens, and underscores
 */
function sanitizeCitationKey(key) {
    if (!key) return 'ref';
    // Replace problematic characters with underscores
    return String(key)
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
        .substring(0, 50); // Limit length
}

/**
 * Generate complete LaTeX document
 */
function generateLatexDocument() {
    const style = getLatexStyle();
    
    // Get project metadata
    const projectTitle = (appData.projectReviewMeta?.title) || 'Research Project Review';
    const authorsData = appData.projectReviewMeta?.authorsData || [];
    const affiliationsData = appData.projectReviewMeta?.affiliationsData || [];
    const projectAbstract = (appData.projectReviewMeta?.abstract) || '';
    const projectContent = appData.projectReview || '';
    
    // Start LaTeX document
    let latex = style + '\n\n';
    
    latex += `\\title{${escapeLatex(projectTitle)}}\n`;
    
    // Handle authors with superscript affiliation numbers and ORCID
    latex += '\\author{';
    if (authorsData && authorsData.length > 0) {
        authorsData.forEach((author, idx) => {
            if (author.name && author.name.trim()) {
                latex += escapeLatex(author.name);

                // Add affiliation superscripts (no comma between numbers, just consecutive)
                const affilNums = author.affiliationNumbers || [];
                if (affilNums && affilNums.length > 0) {
                    affilNums.forEach(num => {
                        latex += `\\textsuperscript{${num}}`;
                    });
                }

                // Add ORCID logo and link if provided
                if (author.orcid && author.orcid.trim()) {
                    // ORCID logo using custom command (green circular badge with iD)
                    latex += `\\,\\orcidlink{${escapeLatex(author.orcid)}}`;
                }

                // Add separator between authors - use comma for multi-author
                if (idx < authorsData.length - 1) {
                    latex += ', ';
                }
            }
        });
    }
    latex += '}\n';
    
    // Output affiliations below authors as separate block using \\date{} or custom command
    if (affiliationsData && affiliationsData.length > 0) {
        latex += '\n';
        latex += '\\date{';
        latex += '\\vspace{0.5em}\\\\\n';  // Positive spacing to push affiliations down
        latex += '{\\small\\itshape\n';  // Smaller font and italic for affiliations
        latex += '\\begin{tabular}{@{}c@{}}\n';
        affiliationsData.forEach((affil, idx) => {
            if (affil.text && affil.text.trim()) {
                latex += `\\textsuperscript{${idx + 1}}${escapeLatex(affil.text)}`;
                if (idx < affiliationsData.length - 1) {
                    latex += ' \\\\\n';
                }
            }
        });
        latex += '\n\\end{tabular}}';  // Close small font
        latex += '\\\\[1.5em]\n';  // More spacing before date
        latex += '\\today}\n';
    } else {
        latex += `\\date{\\today}\n`;
    }
    
    latex += '\n\n';

    latex += `\\begin{document}\n\n`;
    latex += `\\maketitle\n\n`;
    
    // Add abstract if provided
    if (projectAbstract) {
        latex += `\\begin{abstract}\n`;
        latex += processLatexContent(projectAbstract) + '\n';
        latex += `\\end{abstract}\n\n`;
    }
    
    // Add main document content
    if (projectContent) {
        latex += `\\section*{Overview}\n\n`;
        const processedContent = processLatexContent(projectContent);
        latex += processedContent + '\n\n';
    }
    
    // Add article abstracts section
    if (appData.articles && appData.articles.length > 0) {
        appData.articles.forEach((article, index) => {
            // Each article is a chapter-like section (no numbering in title)
            latex += `\\section*{${escapeLatex(article.title || 'Untitled')}}`;
            if (article.bibtexId && article.bibtexId.trim()) {
                const citationKey = sanitizeCitationKey(article.bibtexId);
                latex += ` \\cite{${citationKey}}`;
            }
            latex += `\n\n`;
            
            if (article.authors) {
                latex += `\\textbf{Authors:} ${escapeLatex(article.authors)}\\\\\n`;
            }
            if (article.year) {
                latex += `\\textbf{Year:} ${escapeLatex(article.year)}\\\\\n`;
            }
            if (article.journal) {
                latex += `\\textbf{Journal:} ${escapeLatex(article.journal)}\\\\\n`;
            }
            latex += '\n';
            
            if (article.abstract) {
                latex += `\\textbf{Abstract:}\n\n`;
                latex += processLatexContent(article.abstract) + '\n\n';
            }
            
            if (article.text) {
                latex += `\\textbf{Notes:}\n\n`;
                // Reset section counter for independent article numbering
                latex += `\\setcounter{section}{0}\n`;
                latex += `\\setcounter{subsection}{0}\n`;
                latex += `\\setcounter{subsubsection}{0}\n\n`;
                // Article content keeps its sectioning as-is
                const articleText = processLatexContent(article.text);
                latex += articleText + '\n\n';
            }
        });
    }
    
    // Add bibliography section
    // Only include articles that have a bibtexId to avoid empty bibliography entries
    const articlesWithBibtex = appData.articles ? appData.articles.filter(a => a.bibtexId && a.bibtexId.trim()) : [];

    if (articlesWithBibtex.length > 0) {
        // Add references heading
        latex += '\\section*{References}\n\n';
        latex += '\\begin{thebibliography}{99}\n\n';

        articlesWithBibtex.forEach((article, index) => {
            // Use the article's bibtexId as the citation key (sanitized)
            const citationKey = sanitizeCitationKey(article.bibtexId);
            latex += `\\bibitem{${citationKey}}\n`;

            // Format: Authors. Title. Journal, Volume(Number), Pages. Year.
            if (article.authors) {
                latex += escapeLatex(article.authors) + '. ';
            }
            if (article.title) {
                latex += `\\textit{${escapeLatex(article.title)}}. `;
            }
            if (article.journal) {
                latex += escapeLatex(article.journal);
                if (article.volume) {
                    latex += ` \\textbf{${escapeLatex(article.volume)}}`;
                }
                if (article.number) {
                    latex += `(${escapeLatex(article.number)})`;
                }
                if (article.pages) {
                    latex += `, ${escapeLatex(article.pages)}`;
                }
                latex += '. ';
            }
            if (article.year) {
                latex += `(${escapeLatex(article.year)}).`;
            }
            latex += '\n\n';
        });

        latex += '\\end{thebibliography}\n\n';
    }
    
    // Add footer
    latex += `\\vfill\n`;
    latex += `\\begin{center}\n`;
    latex += `\\small\\textit{Generated by Papergraph --- \\url{https://papergraph.net}}\n`;
    latex += `\\end{center}\n\n`;
    
    latex += `\\end{document}\n`;
    
    return latex;
}

/**
 * Generate BibTeX file content from articles
 */
function generateBibtexContent() {
    let bibtexContent = '';
    
    if (appData.articles && appData.articles.length > 0) {
        appData.articles.forEach(article => {
            if (article.bibtexId) {
                bibtexContent += articleToBibTeX(article) + '\n';
            }
        });
    }
    
    return bibtexContent;
}

/**
 * Process content to preserve LaTeX commands and math
 * Users can write LaTeX directly in their content (sections, formatting, citations, etc.)
 */
function processLatexContent(text) {
    if (!text) return '';
    
    // Process citations: \cite{key1,key2}, \citep{key}, \citet{key}
    // These should be preserved as-is for LaTeX compilation
    let processedText = text;
    
    // Ensure citations are properly formatted for LaTeX
    // Replace any malformed citations
    processedText = processedText.replace(/\\cite\s*\{([^}]+)\}/g, (match, keys) => {
        // Clean up the keys (remove extra spaces)
        const cleanKeys = keys.split(',').map(k => k.trim()).join(',');
        return `\\cite{${cleanKeys}}`;
    });
    
    processedText = processedText.replace(/\\citep\s*\{([^}]+)\}/g, (match, keys) => {
        const cleanKeys = keys.split(',').map(k => k.trim()).join(',');
        return `\\cite{${cleanKeys}}`; // citep becomes cite in basic LaTeX
    });
    
    processedText = processedText.replace(/\\citet\s*\{([^}]+)\}/g, (match, keys) => {
        const cleanKeys = keys.split(',').map(k => k.trim()).join(',');
        return `\\cite{${cleanKeys}}`; // citet becomes cite in basic LaTeX
    });
    
    return processedText;
}

/**
 * Export project to PDF using online LaTeX compiler
 */
async function exportToPDF() {
    try {
        showNotification('Generating LaTeX document...', 'info');

        const latexContent = generateLatexDocument();

        // Debug: log LaTeX document structure
        console.log('=== LaTeX Compilation Debug ===');
        console.log('Document length:', latexContent.length, 'characters');
        console.log('First 500 chars:', latexContent.substring(0, 500));

        // Extract and log all citations
        const citations = latexContent.match(/\\cite\{([^}]+)\}/g);
        console.log('Citations found:', citations ? citations.length : 0, citations || 'none');

        // Extract and log all bibliography items
        const biblioSection = latexContent.match(/\\begin{thebibliography}[\s\S]*?\\end{thebibliography}/);
        if (biblioSection) {
            const bibItems = biblioSection[0].match(/\\bibitem\{([^}]+)\}/g);
            console.log('Bibliography items:', bibItems ? bibItems.length : 0, bibItems || 'none');
            console.log('Bibliography section (first 500 chars):', biblioSection[0].substring(0, 500));
        } else {
            console.log('No bibliography section found');
        }
        console.log('==============================');

        // Show notification
        showNotification('Compiling to PDF... This may take a few seconds.', 'info');

        // Use texlive.net API for LaTeX compilation
        const response = await fetch('https://texlive.net/cgi-bin/latexcgi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                filecontents: latexContent,
                filename: 'main.tex',
                engine: 'pdflatex',
                return: 'pdf'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LaTeX compilation failed: ${response.status} - ${errorText}`);
        }

        // Get PDF blob
        const pdfBlob = await response.blob();

        // Download PDF
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getExportFilename('pdf');
        a.click();
        URL.revokeObjectURL(url);

        showNotification('PDF exported successfully!', 'success');
    } catch (error) {
        console.error('PDF export error:', error);
        showNotification('Error exporting to PDF: ' + error.message, 'error');
    }
}

/**
 * Download LaTeX source (without compiling)
 */
function exportToLatex() {
    try {
        const latexContent = generateLatexDocument();
        
        const blob = new Blob([latexContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = getExportFilename('tex');
        a.click();
        
        URL.revokeObjectURL(url);
        showNotification('LaTeX source exported!', 'success');
    } catch (error) {
        console.error('LaTeX export error:', error);
        showNotification('Error exporting LaTeX: ' + error.message, 'error');
    }
}

/**
 * Show LaTeX style editor modal
 */
function showLatexStyleEditor() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2>LaTeX Document Style</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p>Customize the LaTeX preamble and document class. This affects the PDF export.</p>
                <textarea id="latexStyleEditor" style="width: 100%; height: 400px; font-family: monospace; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${getLatexStyle()}</textarea>
                <div style="margin-top: 10px; color: #666; font-size: 0.9em;">
                    <strong>Tip:</strong> You can use any LaTeX packages. Math delimiters ($ and $$) in your content will be preserved.
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="resetLatexStyle(); document.getElementById('latexStyleEditor').value = getLatexStyle();">Reset to Default</button>
                <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn-primary" onclick="saveLatexStyle(document.getElementById('latexStyleEditor').value); this.closest('.modal').remove();">Save Style</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Make functions globally available
window.exportToPDF = exportToPDF;
window.exportToLatex = exportToLatex;
window.showLatexStyleEditor = showLatexStyleEditor;
window.saveLatexStyle = saveLatexStyle;
window.resetLatexStyle = resetLatexStyle;
window.getLatexStyle = getLatexStyle;
