/**
 * Cloud Storage Module
 * Handles synchronization between localStorage and Supabase
 */

import { loadProject, loadSharedProject, updateProject, autoSaveProject } from '../auth/projects.js';
import { getCurrentUser } from '../auth/auth.js';
import { getStore, getNetwork, pauseHistory, resumeHistory } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';

// Current project ID (from URL parameter)
let currentProjectId = null;
let isCloudEnabled = false;

function getMergedPersistedPositions() {
    const network = getNetwork();
    if (!network) {
        return { ...(getStore().savedNodePositions || {}) };
    }

    return {
        ...(getStore().savedNodePositions || {}),
        ...network.getPositions(),
    };
}

function clearCachedProjectState() {
    localStorage.removeItem('papermap_data');
    localStorage.removeItem('papermap_positions');
    localStorage.removeItem('papermap_zones');
    localStorage.removeItem('papermap_edge_control_points');
    localStorage.removeItem('papermap_next_control_point_id');
}

function applyProjectScopedLocalCache(projectId) {
    if (!projectId) return;

    const projectKey = `papermap_project_${projectId}`;

    try {
        const cachedPositions = localStorage.getItem(`${projectKey}_positions`);
        if (cachedPositions) {
            getStore().setSavedNodePositions(JSON.parse(cachedPositions));
        }

        const cachedControlPoints = localStorage.getItem(`${projectKey}_edge_control_points`);
        if (cachedControlPoints) {
            getStore().setEdgeControlPoints(JSON.parse(cachedControlPoints));
        }

        const cachedNextControlPointId = localStorage.getItem(`${projectKey}_next_control_point_id`);
        if (cachedNextControlPointId !== null) {
            const parsedId = Number.parseInt(cachedNextControlPointId, 10);
            getStore().setNextControlPointId(Number.isFinite(parsedId) ? parsedId : -1);
        }
    } catch (error) {
        console.warn('Failed to apply project-scoped local cache:', error);
    }
}

function resetStoreState() {
    pauseHistory();
    try {
        getStore().setArticles([]);
        getStore().setConnections([]);
        getStore().setNextArticleId(1);
        getStore().setNextConnectionId(1);
        getStore().setTagZones([]);
        getStore().setSavedNodePositions({});
        getStore().setEdgeControlPoints({});
        getStore().setNextControlPointId(-1);
        getStore().setCurrentProjectId(null);
        getStore().setGalleryProjectData(null);
        getStore().setGalleryProjectMetadata(null);
        getStore().setCurrentUserRole(null);
        getStore().setIsReadOnly(false);
        getStore().setIsReadOnlyMode(false);
        getStore().setIsGalleryViewer(false);
    } finally {
        resumeHistory();
    }
}

function loadProjectDataIntoStore(projectData) {
    getStore().setArticles((projectData.nodes || []).map((article) => ({
        ...article,
        categories: Array.isArray(article.categories) ? article.categories : []
    })));
    getStore().setConnections(projectData.edges || []);

    if (getStore().appData.articles.length > 0) {
        const maxId = Math.max(...getStore().appData.articles.map((article) => parseInt(article.id, 10) || 0));
        getStore().setNextArticleId(maxId + 1);
    } else {
        getStore().setNextArticleId(1);
    }

    if (getStore().appData.connections.length > 0) {
        const maxId = Math.max(...getStore().appData.connections.map((connection) => parseInt(connection.id, 10) || 0));
        getStore().setNextConnectionId(maxId + 1);
    } else {
        getStore().setNextConnectionId(1);
    }

    const zones = projectData.zones || projectData.tagZones || [];
    getStore().setTagZones(zones);

    const positions = projectData.positions || projectData.nodePositions || {};
    getStore().setSavedNodePositions(positions);

    const edgeControlPoints = projectData.edgeControlPoints || {};
    getStore().setEdgeControlPoints(edgeControlPoints);

    const nextControlPointId = Number.isFinite(projectData.nextControlPointId)
        ? projectData.nextControlPointId
        : Number.parseInt(projectData.nextControlPointId, 10);
    getStore().setNextControlPointId(Number.isFinite(nextControlPointId) ? nextControlPointId : -1);

    return { zones, positions, edgeControlPoints };
}

/**
 * Initialize cloud storage
 * Checks URL parameters and loads project if ID or share token is present
 */
export async function initCloudStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    currentProjectId = urlParams.get('id');
    const shareToken = urlParams.get('share');
    
    // Check if user is authenticated
    const user = await getCurrentUser();
    isCloudEnabled = user !== null;

    if (shareToken) {
        clearCachedProjectState();
        resetStoreState();

        try {
            await loadSharedProjectFromCloud(shareToken);
            return true;
        } catch (error) {
            console.error('Failed to load shared project from cloud:', error);
            showNotification('This shared link is unavailable or has been disabled.', 'error');
            return false;
        }
    }
    
    // Handle normal project ID (requires authentication)
    if (currentProjectId && isCloudEnabled) {
        console.log('Cloud storage enabled for project:', currentProjectId);
        clearCachedProjectState();
        resetStoreState();
        
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
    getStore().setCurrentProjectId(project.id);
    getStore().setCurrentUserRole('owner');
    getStore().setIsReadOnly(false);
    getStore().setIsReadOnlyMode(false);
    getStore().setIsGalleryViewer(false);
    
    // Store project name for title input
    localStorage.setItem('currentProjectTitle', project.name);
    
    // Load project data into app state
    if (project.data) {
        pauseHistory();
        try {
        const { zones, positions, edgeControlPoints } = loadProjectDataIntoStore(project.data);
        applyProjectScopedLocalCache(currentProjectId);
        
        // For cloud projects, use project-specific localStorage keys
        const projectKey = `papermap_project_${currentProjectId}`;
        localStorage.setItem(`${projectKey}_data`, JSON.stringify(getStore().appData));
        
        // Load tag zones if available
        if (zones.length > 0) {
            localStorage.setItem(`${projectKey}_zones`, JSON.stringify(zones));
            console.log('🏷️ Loaded', zones.length, 'tag zones from cloud');
        }
        
        // Load positions if available
        const effectivePositions = getStore().savedNodePositions || {};
        if (Object.keys(effectivePositions).length > 0) {
            localStorage.setItem(`${projectKey}_positions`, JSON.stringify(effectivePositions));
            console.log('📍 Loaded', Object.keys(effectivePositions).length, 'node positions from cloud/local cache');
        }

        const effectiveEdgeControlPoints = getStore().edgeControlPoints || {};
        if (Object.keys(effectiveEdgeControlPoints).length > 0) {
            localStorage.setItem('papermap_edge_control_points', JSON.stringify(effectiveEdgeControlPoints));
            localStorage.setItem(`${projectKey}_edge_control_points`, JSON.stringify(effectiveEdgeControlPoints));
        }

        localStorage.setItem(`${projectKey}_next_control_point_id`, String(getStore().nextControlPointId));

        console.log('✓ Project loaded from cloud:', project.name, 
                   `(${getStore().appData.articles.length} nodes, ${getStore().appData.connections.length} edges)`);
        showNotification(`Loaded: ${project.name}`, 'success');
        } finally {
            resumeHistory();
        }
    }
    
    return project;
}

async function loadSharedProjectFromCloud(shareToken) {
    const project = await loadSharedProject(shareToken);

    if (!project) {
        throw new Error('Shared project not found');
    }

    currentProjectId = project.id;

    document.title = `${project.name} - Papergraph Shared`;

    pauseHistory();
    try {
        loadProjectDataIntoStore(project.data || {});
        applyProjectScopedLocalCache(project.id);
        getStore().setCurrentProjectId(project.id);
        getStore().setCurrentUserRole('viewer');
        getStore().setIsReadOnly(true);
        getStore().setIsReadOnlyMode(true);
        getStore().setIsGalleryViewer(true);

        const metadata = {
            id: project.id,
            title: project.name,
            shareToken,
            viewerType: 'share'
        };

        getStore().setGalleryProjectMetadata(metadata);
        getStore().setGalleryProjectData({
            data: project.data || {},
            metadata
        });
    } finally {
        resumeHistory();
    }

    console.log('✓ Shared project loaded from cloud:', project.name);
    showNotification(`Opened shared project: ${project.name}`, 'success');

    return project;
}

/**
 * Generate preview image for project (direct PNG export from canvas)
 */
async function generatePreviewImage() {
    const network = getNetwork();
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
        const network = getNetwork();
        if (network) {
            positions = getMergedPersistedPositions();
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
            nodes: getStore().appData?.articles || [],
            edges: getStore().appData?.connections || [],
            zones: getStore().tagZones || [],
            positions: positions,
            edgeControlPoints: getStore().edgeControlPoints || {},
            nextControlPointId: getStore().nextControlPointId,
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
        const network = getNetwork();
        if (network) {
            positions = getMergedPersistedPositions();
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
            nodes: getStore().appData?.articles || [],
            edges: getStore().appData?.connections || [],
            zones: getStore().tagZones || [],
            positions: positions,
            edgeControlPoints: getStore().edgeControlPoints || {},
            nextControlPointId: getStore().nextControlPointId,
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
        const network = getNetwork();
        if (network) {
            positions = getMergedPersistedPositions();
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
            nodes: getStore().appData?.articles || [],
            edges: getStore().appData?.connections || [],
            zones: getStore().tagZones || [],
            positions: positions,
            edgeControlPoints: getStore().edgeControlPoints || {},
            nextControlPointId: getStore().nextControlPointId,
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
