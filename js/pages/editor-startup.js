import { getStore, getNetwork, pauseHistory, resumeHistory, clearHistory } from '../store/appStore.js';
import { initShortcuts } from '../core/shortcuts.js';
import { showNotification } from '../utils/helpers.js';
import { load } from '../data/persistence.js';
import { scheduleBibliographyRebuild } from '../data/bibliography.js';
import { initializeEventListeners } from '../core/init.js';
import { updateCategoryFilters } from '../ui/filters.js';
import { initializeGraph } from '../graph/init.js';
import { initCloudStorage } from '../data/cloud-storage.js';
import { includesReady } from '../utils/load-footer.js';
import { getSession } from '../auth/auth.js';
import { config } from '../auth/config.js';

function redirectToLanding() {
    window.location.replace('index.html');
}

function redirectToProjects() {
    window.location.replace('projects.html');
}

async function initApp() {
            // Check if importing from gallery
            const urlParams = new URLSearchParams(window.location.search);
            const importFromGallery = urlParams.get('source') === 'gallery';
            const projectId = urlParams.get('id');
            const shareToken = urlParams.get('share');
            const gallerySlug = urlParams.get('gallery');

            let galleryProject = sessionStorage.getItem('galleryProject');

            // Clear stale gallery session if not in a gallery context
            if (!gallerySlug && !importFromGallery && galleryProject) {
                sessionStorage.removeItem('galleryProject');
                galleryProject = null;
            }

            if (gallerySlug && galleryProject) {
                try {
                    const cached = JSON.parse(galleryProject);
                    if (cached.metadata?.path !== gallerySlug) {
                        sessionStorage.removeItem('galleryProject');
                        galleryProject = null;
                    }
                } catch { galleryProject = null; }
            }

            const isGalleryAccess = Boolean(gallerySlug || galleryProject);
            const hasExplicitProjectContext = Boolean(projectId || shareToken || importFromGallery);
            const session = await getSession();

            // Signed-in users should only reach the editor when opening a real
            // project context. Gallery access stays allowed separately.
            if (!isGalleryAccess && session && !hasExplicitProjectContext) {
                redirectToProjects();
                return;
            }

            // On the hosted app, unauthenticated users should not access the
            // editor directly unless they are viewing a gallery project.
            if (!config.isDevelopment && !isGalleryAccess && !session) {
                redirectToLanding();
                return;
            }

            if (gallerySlug && !galleryProject) {
                try {
                    const [metaResp, dataResp] = await Promise.all([
                        fetch(`projects/${encodeURIComponent(gallerySlug)}/metadata.json`),
                        fetch(`projects/${encodeURIComponent(gallerySlug)}/project.papergraph`)
                    ]);
                    if (!metaResp.ok || !dataResp.ok) throw new Error('Project not found');
                    const metadata = await metaResp.json();
                    const projectData = await dataResp.json();
                    galleryProject = JSON.stringify({
                        data: projectData,
                        metadata: {
                            id: `gallery_${metadata.path || gallerySlug}`,
                            title: metadata.title,
                            description: metadata.description,
                            author: metadata.author,
                            affiliation: metadata.affiliation,
                            path: metadata.path || gallerySlug
                        }
                    });
                    // Cache in sessionStorage for faster reload
                    sessionStorage.setItem('galleryProject', galleryProject);
                } catch (err) {
                    console.error('? Failed to load gallery project from URL:', err);
                    showNotification('Gallery project not found', 'error');
                }
            }

            if (galleryProject) {
                // Set global flags for read-only viewer mode
                getStore().setIsGalleryViewer(true);
                getStore().setIsReadOnlyMode(true);
                
                // Ensure URL reflects the gallery slug for shareability
                const { data: _checkData, metadata: _checkMeta } = JSON.parse(galleryProject);
                const slug = _checkMeta.path;
                if (slug && !urlParams.get('gallery')) {
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('gallery', slug);
                    window.history.replaceState({}, '', newUrl);
                }
                
                // Gallery viewer mode - load from sessionStorage or fetched data
                try {
                    const { data: projectData, metadata } = JSON.parse(galleryProject);
                    
                    console.log('?? Loading gallery project:', metadata.title);
                    pauseHistory();
                    // Load tag zones
                    const zones = projectData.zones || projectData.tagZones || [];
                    getStore().setTagZones(zones);
                    
                    // Load positions (check both 'positions' and 'nodePositions' for compatibility)
                    const positions = projectData.positions || projectData.nodePositions || {};
                    if (Object.keys(positions).length > 0) {
                        getStore().setSavedNodePositions(positions);
                    } else {
                        getStore().setSavedNodePositions({});
                    }
                    
                    // Update getStore().appData properties (don't replace the whole object)
                    getStore().setArticles((projectData.nodes || projectData.articles || []).map(a => ({
                        ...a,
                        categories: Array.isArray(a.categories) ? a.categories : []
                    })));
                    getStore().setConnections(projectData.edges || projectData.connections || []);
                    getStore().setNextArticleId(Math.max(0, ...(projectData.nodes || projectData.articles || []).map(n => n.id || 0)) + 1);
                    getStore().setNextConnectionId(Math.max(0, ...(projectData.edges || projectData.connections || []).map(e => e.id || 0)) + 1);
                    
                    // Store metadata for display
                    getStore().setGalleryProjectMetadata(metadata);
                    getStore().galleryProjectData = { data: projectData, metadata: metadata };
                    getStore().setCurrentProjectId(metadata.id);
                    
                    // Set project title and make it readonly
                    const titleInput = document.getElementById('projectTitle');
                    if (titleInput && metadata.title) {
                        titleInput.value = metadata.title;
                        titleInput.disabled = true;
                        titleInput.style.cursor = 'default';
                        document.title = `${metadata.title} - Papergraph Gallery`;
                    }
                    
                } catch (error) {
                    console.error('? Error loading gallery project:', error);
                    showNotification('Failed to load gallery project', 'error');
                } finally {
                    resumeHistory();
                }
            } else {
                // Try to initialize cloud storage first (if project ID or share token is present)
                let cloudLoaded = false;
                if ((projectId || shareToken) && !importFromGallery) {
                    try {
                        if (true) {
                            cloudLoaded = await initCloudStorage();
                        }
                    } catch (error) {
                        console.error('Cloud storage initialization failed:', error);
                    }
                }
                
                if (importFromGallery) {
                    
                    // Load project from gallery
                    const galleryProjectLocal = localStorage.getItem('gallery_import_project');
                    if (galleryProjectLocal) {
                        try {
                            const projectData = JSON.parse(galleryProjectLocal);
                            pauseHistory();
                            // Import the project data
                            if (projectData.tagZones) {
                                getStore().setTagZones(projectData.tagZones);
                                delete projectData.tagZones;
                            }
                            if (projectData.nodePositions) {
                                getStore().setSavedNodePositions(projectData.nodePositions);
                                delete projectData.nodePositions;
                            }
                            
                            
Object.assign(getStore().appData, projectData);

                            
                            // Clean up
                            localStorage.removeItem('gallery_import_project');
                            
                            showNotification('Gallery project loaded (read-only)', 'success');
                        } catch (err) {
                            console.error('Error loading gallery project:', err);
                            showNotification('Failed to load gallery project', 'error');
                        } finally {
                            resumeHistory();
                        }
                    } else if (session || !config.isDevelopment) {
                        redirectToProjects();
                        return;
                    }
                } else if (!cloudLoaded) {
                    // If a signed-in user tried to open a cloud/shared project but it
                    // couldn't be resolved, do not fall back to cached local data.
                    if (session && hasExplicitProjectContext) {
                        redirectToProjects();
                        return;
                    }

                    // On the hosted app, unauthenticated users also shouldn't
                    // fall back to cached local data for broken project links.
                    if (!config.isDevelopment && hasExplicitProjectContext) {
                        if (session) {
                            redirectToProjects();
                        } else {
                            redirectToLanding();
                        }
                        return;
                    }

                    // Normal load from localStorage (only if not loaded from cloud)
                    load();
                }
            }
            
            // Wait for HTML partials (logo-dropdown, user-dropdown, etc.) to load
            await includesReady;
            
            initializeEventListeners();
            initShortcuts();
            updateCategoryFilters();
            // Clear any history entries created during loading so undo starts clean
            clearHistory();

            // Pre-build bibliography cache after initial load
            scheduleBibliographyRebuild();
            
            // Hide "Add Node" button if in gallery viewer mode
            if (getStore().isGalleryViewer) {
                const addBtn = document.getElementById('addArticleBtn');
                if (addBtn) {
                    addBtn.style.display = 'none';
                }
            }
            
            // Initialize graph-only buttons visibility (default to graph view)
            const graphOnlyElements = document.querySelectorAll('.graph-only');
            graphOnlyElements.forEach(el => {
                el.style.display = 'flex';
                el.classList.add('visible');
            });
            
            // Initialize graph after a short delay to ensure DOM is ready
            setTimeout(() => {
                initializeGraph();
                
                // Restore control point nodes after graph is initialized
                setTimeout(() => {
                    if (typeof restoreControlPointNodes === 'function') {
                        restoreControlPointNodes();
                        
                        // Rebuild edges with control points
                        Object.keys(getStore().edgeControlPoints || {}).forEach(edgeId => {
                            if (typeof rebuildEdgeWithControlPoints === 'function') {
                                rebuildEdgeWithControlPoints(parseInt(edgeId));
                            }
                        });
                    }
                }, 200);
                
                // Note: Node positioning is handled in stabilizationIterationsDone event
                // in graph.js, which checks for savedNodePositions first
            }, 100);
            
            // ===== DASHBOARD BUTTON HANDLER =====
            const dashboardBtn = document.getElementById('logoDashboardBtn');
            if (dashboardBtn) {
                dashboardBtn.addEventListener('click', async () => {
                    // Check if user is logged in
                    try {
                        const config = await import('../auth/config.js');
                        const { data: { session } } = await config.supabase.auth.getSession();
                        
                        if (session) {
                            // Save with preview for dashboard
                            if (!getStore().isReadOnlyMode) {
                                try {
                                    const { saveToCloudWithPreview } = await import('../data/cloud-storage.js');
                                    await saveToCloudWithPreview();
                                } catch (e) {
                                    console.error('Error saving preview:', e);
                                }
                            }
                            
                            window.location.href = 'projects.html';
                        } else {
                            window.location.href = 'index.html';
                        }
                    } catch (error) {
                        console.error('Error checking auth status:', error);
                        window.location.href = 'index.html';
                    }
                });
            }
            
            // ===== PROJECT TITLE HANDLER =====
            const projectTitleInput = document.getElementById('projectTitle');
            console.log('?? PROJECT TITLE DEBUG:', {
                inputElement: projectTitleInput,
                savedTitle: localStorage.getItem('currentProjectTitle'),
                projectId: urlParams.get('id')
            });
            
            // Set initial title from localStorage or default
            if (projectTitleInput && !getStore().isGalleryViewer) {
                // Helper function to resize input based on content
                const resizeInput = (input) => {
                    const span = document.createElement('span');
                    span.style.visibility = 'hidden';
                    span.style.position = 'absolute';
                    span.style.whiteSpace = 'nowrap';
                    span.style.fontFamily = window.getComputedStyle(input).fontFamily;
                    span.style.fontSize = window.getComputedStyle(input).fontSize;
                    span.style.fontWeight = window.getComputedStyle(input).fontWeight;
                    span.textContent = input.value || input.placeholder;
                    document.body.appendChild(span);
                    const width = Math.max(120, Math.min(600, span.offsetWidth + 40)); // +40 for padding
                    document.body.removeChild(span);
                    input.style.width = width + 'px';
                };
                
                const savedTitle = localStorage.getItem('currentProjectTitle');
                if (savedTitle) {
                    console.log('? Setting saved title:', savedTitle);
                    projectTitleInput.value = savedTitle;
                    resizeInput(projectTitleInput);
                } else {
                    console.log('? Setting default title');
                    // Default title for new projects
                    projectTitleInput.value = 'Untitled Project';
                    projectTitleInput.style.width = '140px';
                }
            } else {
                console.error('? projectTitleInput element not found!');
            }
            
            // Save title on blur or Enter key (only for cloud projects)
            if (urlParams.get('id') && projectTitleInput) {
                let saveTimeout = null;
                
                const saveTitle = async () => {
                        const newTitle = projectTitleInput.value.trim();
                        if (!newTitle) {
                            projectTitleInput.value = 'Untitled Project';
                            return;
                        }
                        
                        // Auto-adjust input width
                        resizeInput(projectTitleInput);
                        
                        // Save to localStorage
                        localStorage.setItem('currentProjectTitle', newTitle);
                        
                        // Save to cloud (update project name in database)
                        try {
                            const { renameProject } = await import('../auth/projects.js');
                            const projectId = urlParams.get('id');
                            
                            await renameProject(projectId, newTitle);
                            showNotification('Project title updated', 'success');
                        } catch (error) {
                            console.error('Error updating project title:', error);
                            showNotification('Failed to update title', 'error');
                        }
                    };
                    
                    // Debounced save on input
                    projectTitleInput.addEventListener('input', () => {
                        resizeInput(projectTitleInput);
                        clearTimeout(saveTimeout);
                        saveTimeout = setTimeout(saveTitle, 1000);
                    });
                    
                    // Immediate save on blur
                    projectTitleInput.addEventListener('blur', () => {
                        clearTimeout(saveTimeout);
                        saveTitle();
                    });
                    
                    // Save on Enter key
                    projectTitleInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            projectTitleInput.blur();
                        }
                    });
                    
                    // Deselect (blur) when clicking outside the title input
                    document.addEventListener('click', (e) => {
                        if (projectTitleInput && 
                            projectTitleInput === document.activeElement &&
                            !projectTitleInput.contains(e.target) &&
                            e.target !== projectTitleInput) {
                            projectTitleInput.blur();
                        }
                    });
            }
            

        // Save positions before page unload (refresh, close, etc.)
        window.addEventListener('beforeunload', () => {
            console.log('=== BEFORE UNLOAD - Saving positions ===');
            if (getNetwork()) {
                const positions = getNetwork().getPositions();
                console.log('Positions to save:', Object.keys(positions).length, 'nodes');
                console.log('Sample positions:', Object.entries(positions).slice(0, 3));
                localStorage.setItem('papermap_positions', JSON.stringify(positions));
                console.log('? Positions saved to localStorage');
            } else {
                console.warn('? Network not available, positions not saved');
            }
        });
        
        // New Project Modal Functions
        function closeNewProjectModal() {
            document.getElementById('newProjectModal').style.display = 'none';
        }
        
        function openNewProjectModal() {
            document.getElementById('newProjectModal').style.display = 'block';
            document.getElementById('newProjectName').focus();
        }
        
        async function handleCreateNewProject(event) {
            event.preventDefault();
            
            const projectName = document.getElementById('newProjectName').value.trim();
            if (!projectName) return;
            
            try {
                // Import project functions
                const { createProject } = await import('../auth/projects.js');
                
                // Create new project
                const newProject = await createProject(projectName, {
                    nodes: [],
                    edges: [],
                    zones: [],
                    positions: {}
                });
                
                // Redirect to the new project
                window.location.href = `editor.html?id=${newProject.id}`;
            } catch (error) {
                console.error('Error creating project:', error);
                showNotification('Failed to create project', 'error');
            }
        }
        
        // Make functions global
        window.closeNewProjectModal = closeNewProjectModal;
        window.openNewProjectModal = openNewProjectModal;
        window.handleCreateNewProject = handleCreateNewProject;
        
        // ===== INTERACTIVE TOUR (Driver.js) =====
        function startInteractiveTour() {
            console.log('Starting interactive tour...');
            
            // Load Driver.js
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js';
            script.onload = () => {
                console.log('Driver.js script loaded');
                // Wait a bit for the library to initialize
                setTimeout(() => {
                    console.log('window.driver available:', typeof window.driver);
                    if (typeof window.driver === 'undefined') {
                        console.error('Driver.js not found on window object. Available keys:', Object.keys(window).filter(k => k.includes('driver') || k.includes('Driver')));
                        return;
                    }
                    initializeTour();
                }, 100);
            };
            script.onerror = () => {
                console.error('Failed to load Driver.js');
            };
            document.head.appendChild(script);
        }

        function initializeTour() {
            try {
                const driverObj = window.driver.js.driver({
                    showProgress: true,
                    showButtons: ['next', 'previous', 'close'],
                    steps: [
                        {
                            element: '#addArticleBtn',
                            popover: {
                                title: '?? Add articles',
                                description: 'Click here to add new research articles. You can also drop PDF/BibTeX files directly onto the canvas or paste a DOI link.',
                                side: 'top',
                                align: 'center'
                            }
                        },
                        {
                            popover: {
                                title: '?? Connect nodes',
                                description: '<div style="text-align: left;"><p>To connect articles:</p><ol style="margin: 8px 0 0 20px;"><li>Click a node to select it</li><li>Click the Link icon in the radial menu</li><li>Click another node to create a connection</li></ol><img src="assets/demo-connect-ideas.gif" style="width: 100%; margin-top: 12px; border-radius: 8px; border: 1px solid #ddd;"></div>'
                            }
                        },
                        {
                            popover: {
                                title: '??? Create tag zones',
                                description: '<div style="text-align: left;"><p>Organize your research by creating visual zones:</p><ul style="margin: 8px 0 0 20px;"><li>Click and drag to draw a zone</li><li>Label it to group related articles by topic</li></ul><img src="assets/demo-organize-tags.gif" style="width: 100%; margin-top: 12px; border-radius: 8px; border: 1px solid #ddd;"></div>'
                            }
                        },
                        {
                            element: '.toolbar-view-toggle',
                            popover: {
                                title: '??? Switch views',
                                description: 'Toggle between Graph View for visual mapping and List View for a structured overview of your research.',
                                side: 'top',
                                align: 'center'
                            }
                        },
                        {
                            element: '#logoMenuBtnExtended',
                            popover: {
                                title: '?? Import & export',
                                description: 'Click here to access the menu where you can:<br>? Import projects and BibTeX files<br>? Export your work in multiple formats (JSON, BibTeX, PDF, PNG)',
                                side: 'bottom',
                                align: 'start'
                            }
                        }
                    ],
                    onDestroyStarted: () => {
                        driverObj.destroy();
                        localStorage.setItem('papergraph_hide_tutorial', 'true');
                    }
                });
                
                console.log('Starting driver tour');
                driverObj.drive();
            } catch (error) {
                console.error('Error initializing tour:', error);
            }
        }

        // Make function global
        window.startInteractiveTour = startInteractiveTour;

        // Auto-start tour on first visit
        window.addEventListener('load', () => {
            const isHidden = localStorage.getItem('papergraph_hide_tutorial');
            console.log('Page loaded. Tour hidden:', isHidden, 'Read-only mode:', getStore().isReadOnlyMode);
            
            if (!isHidden && !getStore().isReadOnlyMode) {
                console.log('Auto-starting tour in 1.5 seconds...');
                setTimeout(() => startInteractiveTour(), 1500);
            }
        });
        
        // ===== READ-ONLY MODE SETUP =====
        if (getStore().isReadOnlyMode) {
            console.log('?? Configuring read-only mode...');
            
            // Show read-only bar (contains both label and copy button)
            const readonlyBar = document.getElementById('readonlyIndicator');
            readonlyBar.style.display = 'flex';
            
            // Position readonly bar right next to the logo menu
            const logoBar = document.querySelector('.logo-menu-btn-extended');
            if (logoBar) {
                const positionReadonlyBar = () => {
                    const rect = logoBar.getBoundingClientRect();
                    readonlyBar.style.left = (rect.right + 10) + 'px';
                };
                positionReadonlyBar();
                window.addEventListener('resize', positionReadonlyBar);
            }
            
            // Set project title from gallery data
            if (getStore().galleryProjectData && getStore().galleryProjectData.metadata) {
                const title = getStore().galleryProjectData.metadata.title;
                document.getElementById('projectTitle').value = title;
                document.getElementById('projectTitle').disabled = true;
                document.title = `${title} - Papergraph Gallery`;
            }
            
            // Hide "Import" and "New Project" menu items
            const importMenu = document.getElementById('actionImportMenu');
            const newProjectBtn = document.getElementById('actionNewProject');
            if (importMenu) importMenu.style.display = 'none';
            if (newProjectBtn) newProjectBtn.style.display = 'none';
            
            // Disable node dragging - will be handled in graph.js
            
            // Setup Copy to Dashboard button
            document.getElementById('copyToDashboardBtn').addEventListener('click', async () => {
                try {
                    const { copyProjectToWorkspace } = await import('../data/gallery.js');
                    await copyProjectToWorkspace(
                        getStore().galleryProjectData.data,
                        getStore().galleryProjectData.metadata
                    );
                } catch (error) {
                    console.error('Error copying project:', error);
                    showNotification('Failed to copy project: ' + error.message, 'error');
                }
            });
        }
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
window.toggleAuthorsContent = function toggleAuthorsContent() {
    const content = document.getElementById("authorsContent");
    const btn = document.getElementById("authorsCollapseBtn");
    if (content.style.display === "none") {
        content.style.display = "block";
        btn.textContent = "?";
    } else {
        content.style.display = "none";
        btn.textContent = "?";
    }
};
