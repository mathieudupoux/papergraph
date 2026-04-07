/**
 * Cloud Storage Module
 * Handles synchronization between localStorage and Supabase
 */

import { loadProject, updateProject, autoSaveProject } from '../auth/projects.js';
import { getCurrentUser } from '../auth/auth.js';
import { state } from '../core/state.js';
import { showNotification } from '../utils/helpers.js';

// Current project ID (from URL parameter)
let currentProjectId = null;
let isCloudEnabled = false;

/**
 * Initialize cloud storage
 * Checks URL parameters and loads project if ID or share token is present
 */
export async function initCloudStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    currentProjectId = urlParams.get('id');
    
    // Check if user is authenticated
    const user = await getCurrentUser();
    isCloudEnabled = user !== null;
    
    // Handle normal project ID (requires authentication)
    if (currentProjectId && isCloudEnabled) {
        console.log('Cloud storage enabled for project:', currentProjectId);
        
        // Clear any existing localStorage data from previous sessions
        // This prevents mixing data between projects
        localStorage.removeItem('papermap_data');
        localStorage.removeItem('papermap_positions');
        localStorage.removeItem('papermap_zones');
        localStorage.removeItem('papermap_edge_control_points');
        localStorage.removeItem('papermap_next_control_point_id');
        
        // Clear global variables
        state.appData.articles = [];
        state.appData.connections = [];
        state.appData.nextArticleId = 1;
        state.appData.nextConnectionId = 1;
        state.tagZones.length = 0;
        state.savedNodePositions = {};
        
        // Try to load project from cloud
        try {
            await loadProjectFromCloud();
            return true;
        } catch (error) {
            console.error('Failed to load project from cloud:', error);
            showNotification('Failed to load project. Using local data.', 'error');
            return false;
        }
    } else if (currentProjectId && !isCloudEnabled) {
        console.warn('Project ID in URL but user not authenticated');
        showNotification('Sign in to access cloud projects', 'info');
        return false;
    }
    
    return false;
}

/**
 * Load project data from Supabase
 */
async function loadProjectFromCloud() {
    if (!currentProjectId) {
        throw new Error('No project ID specified');
    }
    
    const project = await loadProject(currentProjectId);
    
    if (!project) {
        throw new Error('Project not found');
    }
    
    // Update page title
    document.title = `${project.name} - Papergraph`;
    
    // Store project name for title input
    localStorage.setItem('currentProjectTitle', project.name);
    
    // Load project data into app state
    if (project.data) {
        // Load nodes and edges
        state.appData.articles = (project.data.nodes || []).map(a => ({
            ...a,
            categories: Array.isArray(a.categories) ? a.categories : []
        }));
        state.appData.connections = project.data.edges || [];
        
        // Load project review data
        state.appData.projectReview = project.data.projectReview || "";
        state.appData.projectReviewMeta = project.data.projectReviewMeta || { title: "Project Review", authors: "" };
        
        // Update next IDs based on existing data
        if (state.appData.articles.length > 0) {
            const maxId = Math.max(...state.appData.articles.map(a => parseInt(a.id) || 0));
            state.appData.nextArticleId = maxId + 1;
        } else {
            state.appData.nextArticleId = 1;
        }
        
        if (state.appData.connections.length > 0) {
            const maxId = Math.max(...state.appData.connections.map(c => parseInt(c.id) || 0));
            state.appData.nextConnectionId = maxId + 1;
        } else {
            state.appData.nextConnectionId = 1;
        }
        
        // For cloud projects, use project-specific localStorage keys
        const projectKey = `papermap_project_${currentProjectId}`;
        localStorage.setItem(`${projectKey}_data`, JSON.stringify(state.appData));
        
        // Load tag zones if available
        const zones = project.data.zones || project.data.tagZones || [];
        if (zones.length > 0) {
            state.tagZones.length = 0;
            state.tagZones.push(...zones);
            localStorage.setItem(`${projectKey}_zones`, JSON.stringify(zones));
            console.log('🏷️ Loaded', zones.length, 'tag zones from cloud');
        }
        
        // Load positions if available
        const positions = project.data.positions || project.data.nodePositions || {};
        if (Object.keys(positions).length > 0) {
            localStorage.setItem(`${projectKey}_positions`, JSON.stringify(positions));
            state.savedNodePositions = positions;
            console.log('📍 Loaded', Object.keys(positions).length, 'node positions from cloud');
        } else {
            state.savedNodePositions = {};
        }
        
        console.log('✓ Project loaded from cloud:', project.name, 
                   `(${state.appData.articles.length} nodes, ${state.appData.connections.length} edges)`);
        showNotification(`Loaded: ${project.name}`, 'success');
    }
    
    return project;
}

/**
 * Generate preview image for project (direct PNG export from canvas)
 */
async function generatePreviewImage() {
    const network = state.network;
    console.log('🔍 generatePreviewImage called:', {
        networkExists: !!network
    });
    
    if (!network) {
        console.warn('❌ No network available for preview generation');
        return null;
    }
    
    try {
        // Use the same routine as exportToImage - direct canvas export
        const canvas = network.canvas.frame.canvas;
        
        console.log('✓ Canvas found, dimensions:', canvas.width, 'x', canvas.height);
        
        // Create smaller canvas for preview (max 600px width)
        const maxWidth = 600;
        const scale = Math.min(1, maxWidth / canvas.width);
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = canvas.width * scale;
        previewCanvas.height = canvas.height * scale;
        const previewCtx = previewCanvas.getContext('2d');
        
        console.log('✓ Preview canvas created:', previewCanvas.width, 'x', previewCanvas.height);
        
        // Draw with high quality
        previewCtx.imageSmoothingEnabled = true;
        previewCtx.imageSmoothingQuality = 'high';
        previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        
        // Convert to PNG with compression
        const preview = previewCanvas.toDataURL('image/png', 0.7);
        
        console.log('📸 Generated preview from canvas, size:', Math.round(preview.length / 1024), 'KB');
        return preview;
        
    } catch (e) {
        console.warn('Could not generate preview image:', e);
        return null;
    }
}

/**
 * Save current state to cloud (without preview image - for auto-save)
 */
export async function saveToCloud(silent = false) {
    if (!isCloudEnabled || !currentProjectId) {
        return false;
    }
    
    try {
        // Get current positions from network or localStorage
        let positions = {};
        const network = state.network;
        if (network) {
            positions = network.getPositions();
        } else {
            // Fallback to project-specific localStorage if network not available
            const projectKey = `papermap_project_${currentProjectId}`;
            const savedPositions = localStorage.getItem(`${projectKey}_positions`);
            if (savedPositions) {
                positions = JSON.parse(savedPositions);
            }
        }
        
        // Gather current state (no preview image during auto-save to avoid flash)
        const projectData = {
            nodes: state.appData?.articles || [],
            edges: state.appData?.connections || [],
            zones: state.tagZones || [],
            positions: positions,
            projectReview: state.appData?.projectReview || "",
            projectReviewMeta: state.appData?.projectReviewMeta || { title: "Project Review", authors: "" }
        };
        
        // Save to cloud with auto-save (throttled)
        autoSaveProject(currentProjectId, projectData);
        
        if (!silent) {
            console.log('✓ Project queued for cloud save with', Object.keys(positions).length, 'positions');
        }
        
        return true;
    } catch (error) {
        console.error('Error saving to cloud:', error);
        if (!silent) {
            showNotification('Cloud save failed. Data saved locally.', 'warning');
        }
        return false;
    }
}

/**
 * Save with preview image (for closing/returning to dashboard)
 */
export async function saveToCloudWithPreview(silent = false) {
    if (!isCloudEnabled || !currentProjectId) {
        return false;
    }
    
    try {
        // Get current positions
        let positions = {};
        const network = state.network;
        if (network) {
            positions = network.getPositions();
        } else {
            const projectKey = `papermap_project_${currentProjectId}`;
            const savedPositions = localStorage.getItem(`${projectKey}_positions`);
            if (savedPositions) {
                positions = JSON.parse(savedPositions);
            }
        }
        
        // Generate preview image
        const previewImage = await generatePreviewImage();
        
        // Gather current state with preview
        const projectData = {
            nodes: state.appData?.articles || [],
            edges: state.appData?.connections || [],
            zones: state.tagZones || [],
            positions: positions,
            projectReview: state.appData?.projectReview || "",
            projectReviewMeta: state.appData?.projectReviewMeta || { title: "Project Review", authors: "" },
            previewImage: previewImage
        };
        
        // Force immediate save (no throttling)
        await updateProject(currentProjectId, projectData);
        
        if (!silent) {
            console.log('✓ Project saved to cloud with preview');
        }
        
        return true;
    } catch (error) {
        console.error('Error saving to cloud with preview:', error);
        if (!silent) {
            showNotification('Cloud save failed', 'error');
        }
        return false;
    }
}

/**
 * Enhanced save function that saves to both local and cloud
 */
export function saveToStorage(silent = false) {
    // Delegate to unified persistence layer (handles both local + cloud)
    import('./persistence.js').then(m => m.save(silent));
}

/**
 * Force immediate cloud save (for critical operations, no preview image)
 */
export async function forceSaveToCloud() {
    if (!isCloudEnabled || !currentProjectId) {
        return false;
    }
    
    try {
        // Get current positions
        let positions = {};
        const network = state.network;
        if (network) {
            positions = network.getPositions();
        } else {
            // Fallback to project-specific localStorage if network not available
            const projectKey = `papermap_project_${currentProjectId}`;
            const savedPositions = localStorage.getItem(`${projectKey}_positions`);
            if (savedPositions) {
                positions = JSON.parse(savedPositions);
            }
        }
        
        // No preview image generation during force save (to avoid flash)
        const projectData = {
            nodes: state.appData?.articles || [],
            edges: state.appData?.connections || [],
            zones: state.tagZones || [],
            positions: positions,
            projectReview: state.appData?.projectReview || "",
            projectReviewMeta: state.appData?.projectReviewMeta || { title: "Project Review", authors: "" }
        };
        
        await updateProject(currentProjectId, projectData);
        console.log('✓ Project force-saved to cloud with', Object.keys(positions).length, 'positions');
        return true;
    } catch (error) {
        console.error('Error force-saving to cloud:', error);
        return false;
    }
}

/**
 * Check if cloud storage is enabled
 */
export function isCloudStorageEnabled() {
    return isCloudEnabled && currentProjectId !== null;
}

/**
 * Get current project ID
 */
export function getCurrentProjectId() {
    return currentProjectId;
}
