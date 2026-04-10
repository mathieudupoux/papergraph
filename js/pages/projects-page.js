import { navigateTo } from '../utils/base-path.js';
import { loadIncludes, includesReady } from '../utils/load-footer.js';
import '../ui/preferences.js';
import { initUserDropdown } from '../ui/user-dropdown.js';
import { openModal, closeModal } from '../ui/modal-manager.js';
import { setupLogoDropdown } from '../ui/logo-dropdown.js';
import { icon } from '../ui/icons.js';
import { importProjectFileAsNewProject } from '../data/project-import.js';
window.navigateTo = navigateTo;

import { supabase } from '../auth/config.js';
import { 
    loadProjects, 
    createProject, 
    deleteProject,
    renameProject 
} from '../auth/projects.js';

let currentUser = null;
let projects = [];
let projectToDelete = null;

// Check authentication on page load
async function initProjects() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        // Not logged in, redirect to landing page
        window.location.href = 'index.html';
        return;
    }

    currentUser = session.user;
    
    // Wait for HTML includes to be loaded
    await includesReady;
    
    // Ensure user has a username (for OAuth users)
    await ensureUserHasUsername();
    
    // Setup user dropdown
    await initUserDropdown();
    
    // Setup logo dropdown (shared)
    setupLogoDropdown({ triggerButtonId: 'logoMenuBtnPage' });
    
    // Wire up navigation buttons
    const dashboardBtn = document.getElementById('logoDashboardBtn');
    if (dashboardBtn) dashboardBtn.addEventListener('click', () => window.navigateTo('projects.html'));
    const galleryBtn = document.getElementById('logoGalleryBtn');
    if (galleryBtn) galleryBtn.addEventListener('click', () => window.navigateTo('gallery.html'));
    const submitBtn = document.getElementById('logoSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', () => openSubmitToGalleryModal());
    // Show import menu on projects page (remove editor-only-item class)
    const importMenu = document.getElementById('logoImportMenu');
    if (importMenu) importMenu.classList.remove('editor-only-item');

    // Show dropdown icons on projects page
    document.querySelectorAll('.projects-only-icon').forEach(el => el.classList.remove('projects-only-icon'));

    // Load projects
    await refreshProjects();
    
    // Check if we should auto-open new project modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('new') === 'true') {
        // Clear the URL parameter
        window.history.replaceState({}, document.title, window.location.pathname);
        // Open new project modal
        setTimeout(() => window.createNewProject(), 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjects);
} else {
    initProjects();
}

// Refresh projects list
async function refreshProjects() {
    try {
        projects = await loadProjects();
        renderProjects();
    } catch (error) {
        console.error('Error loading projects:', error);
        alert('Failed to load projects: ' + error.message);
    }
}

// Utility: Escape HTML to prevent XSS and attribute breaking
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Utility: Format date to readable string
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    // For older dates, show formatted date
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Render projects
function renderProjects() {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const projectsGrid = document.getElementById('projectsGrid');

    loadingState.style.display = 'none';

    if (projects.length === 0) {
        emptyState.style.display = 'block';
        projectsGrid.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        projectsGrid.style.display = 'block';
        
        // Render all projects
        let html = '<div class="pg-projects-section"><div class="pg-projects-grid">';
        html += projects.map(project => renderProjectCard(project)).join('');
        html += '</div></div>';
        
        projectsGrid.innerHTML = html;
    }
}

// Render individual project card
function renderProjectCard(project) {
    const stats = getProjectStats(project);
    const preview = generateProjectPreview(project);
    const safeName = escapeHtml(project.name);
    
    return `
    <div class="pg-project-card" onclick="openProject('${project.id}')">
        <div class="pg-project-preview">
            ${preview}
        </div>
        <div class="pg-project-info">
            <div class="pg-project-header">
                <h3 class="pg-project-title" 
                    id="title-${project.id}"
                    contenteditable="false" 
                    data-project-id="${project.id}"
                    data-original-name="${safeName}"
                    onclick="event.stopPropagation();"
                    onblur="finishEditingTitle(this, '${safeName}')"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();} if(event.key==='Escape'){this.textContent='${safeName}';this.blur();}"
                >${safeName}</h3>
                        <div class="pg-project-menu">
                            <button class="pg-project-menu-btn" onclick="event.stopPropagation(); toggleProjectMenu('${project.id}')" data-menu-id="${project.id}">
                                ${icon('more-vertical')}
                            </button>
                            <div class="pg-project-menu-dropdown" id="menu-${project.id}" style="display: none;">
                                <button onclick="event.stopPropagation(); openProject('${project.id}')">
                                    ${icon('open', { size: 'sm' })}
                                    Open
                                </button>
                                <button onclick="event.stopPropagation(); startRenameFromMenu('${project.id}')">
                                    ${icon('edit', { size: 'sm' })}
                                    Rename
                                </button>
                                <button class="danger" onclick="event.stopPropagation(); deleteProjectPrompt('${project.id}')">
                                    ${icon('delete', { size: 'sm' })}
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="pg-project-stats">
                        <div class="pg-stat">
                            ${icon('node', { size: 'sm' })}
                            <span>${stats.nodes} nodes</span>
                        </div>
                        <div class="pg-stat">
                            ${icon('edge', { size: 'sm' })}
                            <span>${stats.edges} connections</span>
                        </div>
                    </div>
                    <div class="pg-project-meta">
                        Updated ${formatDate(project.updated_at || project.created_at)}
                    </div>
                </div>
            </div>
    `;
}

// Get project statistics
function getProjectStats(project) {
    // If stats are provided by the RPC function, use them
    if (project.node_count !== undefined && project.edge_count !== undefined) {
        return {
            nodes: project.node_count,
            edges: project.edge_count
        };
    }
    
    // Otherwise calculate from data (fallback)
    const data = project.data || {};
    return {
        nodes: (data.nodes || []).length,
        edges: (data.edges || []).length
    };
}

// Generate project preview (uses stored PNG or fallback SVG)
function generateProjectPreview(project) {
    const data = project.data || {};
    const nodes = data.nodes || [];
    
    // Check if project has a stored preview image
    if (data.previewImage) {
        return `<img src="${data.previewImage}" alt="Project preview" class="pg-preview-img" />`;
    }
    
    if (nodes.length === 0) {
        return '<div class="pg-preview-empty">No nodes yet</div>';
    }
    
    // Fallback: Create a simple SVG preview
    const edges = data.edges || [];
    let svg = '<svg viewBox="0 0 200 150" class="pg-preview-svg">';
    
    // Draw edges first (so they appear behind nodes)
    edges.slice(0, 10).forEach((edge, i) => {
        const angle = (i / Math.max(edges.length, 1)) * Math.PI * 2;
        const x1 = 100 + Math.cos(angle) * 40;
        const y1 = 75 + Math.sin(angle) * 30;
        const x2 = 100 + Math.cos(angle + 1) * 40;
        const y2 = 75 + Math.sin(angle + 1) * 30;
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ddd" stroke-width="1.5"/>`;
    });
    
    // Draw nodes
    nodes.slice(0, 15).forEach((node, i) => {
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
        const radius = 35 + (i % 3) * 15;
        const x = 100 + Math.cos(angle) * radius;
        const y = 75 + Math.sin(angle) * radius;
        const color = node.tags && node.tags.length > 0 ? '#4a90e2' : '#999';
        svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`;
    });
    
    svg += '</svg>';
    return svg;
}

// Toggle project menu
window.toggleProjectMenu = function(projectId) {
    const menu = document.getElementById(`menu-${projectId}`);
    const allMenus = document.querySelectorAll('.pg-project-menu-dropdown');
    
    // Close all other menus
    allMenus.forEach(m => {
        if (m.id !== `menu-${projectId}`) {
            m.style.display = 'none';
        }
    });
    
    // Toggle current menu
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.pg-project-menu')) {
        document.querySelectorAll('.pg-project-menu-dropdown').forEach(m => {
            m.style.display = 'none';
        });
    }
});

// Open project
window.openProject = function(projectId) {
    window.location.href = `editor.html?id=${projectId}`;
};

// Create new project
window.createNewProject = function() {
    openModal('newProjectModal');
};

window.closeNewProjectModal = function() {
    closeModal('newProjectModal');
    document.getElementById('newProjectForm').reset();
};

window.handleCreateNewProject = async function(event) {
    event.preventDefault();
    
    const name = document.getElementById('newProjectName').value.trim();
    
    if (!name) return;

    try {
        const newProject = await createProject(name);
        window.closeNewProjectModal();
        // Redirect to editor instead of refreshing list
        window.location.href = `editor.html?id=${newProject.id}`;
    } catch (error) {
        console.error('Error creating project:', error);
        alert('Failed to create project: ' + error.message);
    }
};

// Start rename from menu
window.startRenameFromMenu = function(projectId) {
    // Close the menu
    const menu = document.getElementById(`menu-${projectId}`);
    if (menu) menu.style.display = 'none';
    
    // Get the title element
    const titleElement = document.getElementById(`title-${projectId}`);
    if (titleElement) {
        titleElement.contentEditable = 'true';
        titleElement.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(titleElement);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
};

window.finishEditingTitle = async function(element, originalName) {
    element.contentEditable = 'false';
    const newName = element.textContent.trim();
    
    if (!newName || newName === originalName) {
        element.textContent = originalName;
        return;
    }
    
    const projectId = element.dataset.projectId;
    
    try {
        await renameProject(projectId, newName);
        // Update the data attribute with new name
        element.dataset.originalName = newName;
    } catch (error) {
        console.error('Error renaming project:', error);
        alert('Failed to rename project: ' + error.message);
        element.textContent = originalName;
    }
};

// Delete project
window.deleteProjectPrompt = function(projectId) {
    projectToDelete = projectId;
    openModal('deleteModal');
};

window.closeDeleteModal = function() {
    closeModal('deleteModal');
    projectToDelete = null;
};

window.confirmDelete = async function() {
    if (!projectToDelete) return;

    try {
        await deleteProject(projectToDelete);
        window.closeDeleteModal();
        await refreshProjects();
    } catch (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete project: ' + error.message);
    }
};

// Generate unique username from email or name
async function generateUniqueUsername(baseUsername) {
    let username = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (username.length < 3) username = 'user_' + username;
    if (username.length > 20) username = username.substring(0, 20);
    
    let finalUsername = username;
    let suffix = 1;
    
    while (true) {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('username', finalUsername)
            .maybeSingle();
        
        if (!data) break; // Username is available
        
        finalUsername = username + suffix;
        suffix++;
        
        if (suffix > 100) break; // Safety limit
    }
    
    return finalUsername;
}

// Ensure user has a username (create if missing)
async function ensureUserHasUsername() {
    if (!currentUser) return;
    
    // Check if user already has username in metadata
    if (currentUser.user_metadata?.username) return;
    
    // Get username from OAuth provider or generate from email
    let username = null;
    
    if (currentUser.user_metadata?.user_name) {
        // GitHub provides user_name
        username = currentUser.user_metadata.user_name;
    } else if (currentUser.user_metadata?.preferred_username) {
        // Some OAuth providers use preferred_username
        username = currentUser.user_metadata.preferred_username;
    } else if (currentUser.user_metadata?.name) {
        // Google provides name
        username = currentUser.user_metadata.name.replace(/\s+/g, '_');
    } else {
        // Generate from email
        username = currentUser.email.split('@')[0];
    }
    
    // Generate unique username
    const uniqueUsername = await generateUniqueUsername(username);
    
    // Update user metadata
    const { error } = await supabase.auth.updateUser({
        data: { username: uniqueUsername }
    });
    
    if (error) {
        console.error('Error setting username:', error);
    } else {
        // Update local currentUser object
        currentUser.user_metadata.username = uniqueUsername;
        
        // Store in user_profiles table
        await supabase
            .from('user_profiles')
            .upsert({
                id: currentUser.id,
                username: uniqueUsername,
                email: currentUser.email,
                updated_at: new Date().toISOString()
            });
    }
}

// Import project - create new project from JSON file
window.importProject = function() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.papergraph,.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
                const newProject = await importProjectFileAsNewProject(file);

                // Refresh projects list to show updated stats
                await refreshProjects();
                
                // Show success and navigate
                if (typeof showNotification === 'function') {
                    showNotification('Project imported successfully!', 'success');
                }
                
                // Short delay to ensure UI updates before navigation
                setTimeout(() => {
                    window.location.href = `editor.html?id=${newProject.id}`;
                }, 500);
                
            } catch (error) {
                console.error('Import error:', error);
                alert('Failed to import project: ' + error.message);
            } finally {
                e.target.value = '';
            }
    };
    input.click();
};

// Import BibTeX file
window.importBibtex = function() {
    alert('BibTeX import feature coming soon! For now, you can import BibTeX files from within the editor.');
};

// Submit to Gallery Modal - using the new form ID since this file looks to have an updated form ID
window.openSubmitToGalleryModal = async function() {
    // Check if user is logged in
    if (!currentUser) {
        console.log('User not logged in, cannot submit to gallery');
        alert('Please sign in to submit a project to the gallery.');
        return;
    }
    
    const modal = document.getElementById('submitGalleryModal');
    if(modal) openModal('submitGalleryModal');
    
    // Load user's projects
    try {
        // Removed the dynamic import that was causing a duplicate declaration error
        const userProjects = await loadProjects();
        
        const select = document.getElementById('submitProjectSelect');
        if(select) {
            select.innerHTML = '<option value="">Choose a project...</option>';
            userProjects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
        }
        
        // Pre-fill author info
        const fullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '';
        const authorEl = document.getElementById('submitAuthor');
        if(authorEl) authorEl.value = fullName;
    } catch (error) {
        console.error('Error loading projects:', error);
        alert('Failed to load your projects. Please try again.');
        if(window.closeSubmitGalleryModal) window.closeSubmitGalleryModal();
    }
};

window.closeSubmitGalleryModal = function() {
    closeModal('submitGalleryModal');
    const form = document.getElementById('submitGalleryForm');
    if(form) form.reset();
    if(window.removeThumbnail) window.removeThumbnail();
};

window.removeThumbnail = function() {
    const thumbInput = document.getElementById('thumbnailInput');
    if(thumbInput) thumbInput.value = '';
    const imgPreview = document.getElementById('thumbnailPreview');
    if(imgPreview) imgPreview.style.display = 'none';
    const placeholder = document.getElementById('thumbnailPlaceholder');
    if(placeholder) placeholder.style.display = 'block';
};

// Form submit
window.handleSubmitToGallery = async function(e) {
    if(e) e.preventDefault();
    
    const submitBtn = document.getElementById('submitGalleryButton');
    if(submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }
    
    try {
        const { submitToGallery } = await import('../data/github-submit.js');
        
        const projectId = document.getElementById('submitProjectSelect').value;
        const title = document.getElementById('submitTitle').value;
        const description = document.getElementById('submitDescription').value;
        const author = document.getElementById('submitAuthor').value;
        const affiliation = document.getElementById('submitAffiliation').value;
        const thumbnailFile = document.getElementById('thumbnailInput').files[0];
        
        await submitToGallery({
            projectId,
            title,
            description,
            author,
            affiliation,
            thumbnail: thumbnailFile
        });
        
        alert('Your project has been submitted for review!\n\nA merge request has been created on GitHub.');
        if(window.closeSubmitGalleryModal) window.closeSubmitGalleryModal();
        
    } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to submit project: ' + error.message);
    } finally {
        if(submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Project';
        }
    }
};

// Sign out handled by initUserDropdown()
