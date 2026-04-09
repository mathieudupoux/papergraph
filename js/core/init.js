import { getStore, getNetwork } from '../store/appStore.js';
import { showNotification } from '../utils/helpers.js';
import { exportProject, exportToBibtex, exportToPDF, exportToLatex, exportToImage, exportToSVG } from '../data/export.js';
import { importBibtexFile, setupImportZone, toggleManualForm } from '../data/import.js';
import { importProjectFileAsNewProject } from '../data/project-import.js';
import { openArticleModal, closeModal, saveArticle, deleteArticle, deleteArticleById, setPendingArticlePosition } from '../ui/modal.js';
import { toggleCategoryDropdown, updateCategoryFilters, updateActiveFiltersDisplay } from '../ui/filters.js';
import { toggleGrid, closeMultiTagDialog, deleteSelectedNodes } from '../ui/toolbar.js';
import { searchInGraph } from '../graph/search.js';
import { renderListView } from '../ui/list/sidebar.js';
import { hideSelectionBox, applyNodeLabelFormat } from '../graph/selection.js';
import { hideRadialMenu, hideSelectionRadialMenu } from '../ui/radial-menu.js';
import { hideEdgeMenu, startConnectionMode, cancelConnectionMode, deleteConnection } from '../graph/connections.js';
import { hideZoneDeleteButton, deleteZone } from '../graph/zones.js';
import { updateGraph } from '../graph/render.js';
import { fitGraphView } from '../graph/view.js';
import { setupLogoDropdown } from '../ui/logo-dropdown.js';
import { hideContextMenu } from '../ui/context-menu.js';

// ===== INITIALIZATION & EVENT LISTENERS =====
// Application initialization and all event bindings

// Check if we're in read-only mode (gallery project via ?mode=readonly)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('mode') === 'readonly') {
    getStore().setIsReadOnlyMode(true);

    // Load gallery project from sessionStorage
    const galleryData = sessionStorage.getItem('galleryProject');
    if (galleryData) {
        getStore().setGalleryProjectData(JSON.parse(galleryData));
        console.log('📖 Read-only mode active - Gallery project loaded');
    }
}

export function initializeEventListeners() {
    // View toggle switch
    const viewToggle = document.getElementById('viewToggle');
    viewToggle.addEventListener('change', (e) => {
        const tagModal = document.getElementById('multiTagModal');
        if (tagModal) {
            closeMultiTagDialog();
        }
        switchView(e.target.checked ? 'list' : 'graph');
    });
    
    // Logo dropdown — shared setup (toggle, submenus, outside-click)
    // Editor uses logoMenuBtnExtended as the trigger (in the logo-menu-btn-extended bar)
    const { closeAllSubmenus = () => {} } = setupLogoDropdown({ triggerButtonId: 'logoMenuBtnExtended' }) || {};
    
    const mainDropdown = document.getElementById('logoDropdown');
    
    // Reveal editor-only items (hidden by .editor-only-item class in the shared partial)
    document.querySelectorAll('.editor-only-item').forEach(el => {
        el.classList.remove('editor-only-item');
    });
    // Hide New Project button in editor context
    const newProjectBtn = document.getElementById('logoNewProjectBtn');
    if (newProjectBtn) newProjectBtn.style.display = 'none';
    
    // Node label format selection
    const nodeLabelOptions = document.querySelectorAll('.node-label-option');
    const nodeLabelSubmenu = document.getElementById('logoNodeLabelSubmenu');
    nodeLabelOptions.forEach(option => {
        option.addEventListener('click', function() {
            const format = this.dataset.format;
            nodeLabelOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            applyNodeLabelFormat(format);
            // Close dropdown and submenu
            if (mainDropdown) mainDropdown.classList.remove('active');
            if (nodeLabelSubmenu) nodeLabelSubmenu.classList.remove('active');
        });
    });
    
    // Apply saved node label format on load and mark selected
    const savedFormat = localStorage.getItem('nodeLabelFormat') || 'bibtexId';
    applyNodeLabelFormat(savedFormat);
    const savedOption = document.querySelector(`[data-format="${savedFormat}"]`);
    if (savedOption) {
        nodeLabelOptions.forEach(opt => opt.classList.remove('selected'));
        savedOption.classList.add('selected');
    }
    
    // Editor user dropdown is now handled by initUserDropdown() in editor-init.js
    
    // Dark Theme Toggle (in user dropdown)
    const editorThemeToggle = document.getElementById('editorThemeToggle');
    const themeToggleText = document.getElementById('themeToggleText');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    // Apply saved theme on load
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggleText) themeToggleText.textContent = 'Light Mode';
    }
    
    if (editorThemeToggle) {
        editorThemeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            if (themeToggleText) {
                themeToggleText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
            }
        });
    }
    
    // Dropdown menu actions
    // Note: actionNewProject button removed from dropdown menu
    
    const actionImportBtn = document.getElementById('logoImportProjectBtn');
    if (actionImportBtn) {
        actionImportBtn.addEventListener('click', () => {
            document.getElementById('fileInput').click();
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
        });
    }
    
    const actionImportBibtexBtn = document.getElementById('logoImportBibtexBtn');
    if (actionImportBibtexBtn) {
        actionImportBibtexBtn.addEventListener('click', () => {
            document.getElementById('bibtexFileInput').click();
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
        });
    }
    
    document.getElementById('logoExportProjectBtn').addEventListener('click', () => {
        exportProject();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    document.getElementById('logoExportBibtexBtn').addEventListener('click', () => {
        exportToBibtex();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    document.getElementById('logoExportPdfBtn').addEventListener('click', () => {
        exportToPDF();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    document.getElementById('logoExportLatexBtn').addEventListener('click', () => {
        exportToLatex();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    document.getElementById('logoExportImageBtn').addEventListener('click', () => {
        exportToImage();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    document.getElementById('logoExportSVGBtn').addEventListener('click', () => {
        exportToSVG();
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    // Help menu actions
    // Help button - also close dropdown on click (onclick handles navigation)
    const helpBtn = document.getElementById('logoHelpBtn');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
        });
    }
    
    // Gallery menu actions
    document.getElementById('logoGalleryBtn').addEventListener('click', () => {
        window.location.href = 'gallery.html';
        mainDropdown.classList.remove('active');
        closeAllSubmenus();
    });
    
    const actionSubmitToGalleryBtn = document.getElementById('logoSubmitBtn');
    if (actionSubmitToGalleryBtn) {
        actionSubmitToGalleryBtn.addEventListener('click', async () => {
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
            
            // Check if user is logged in
            try {
                const { supabase } = await import('../auth/config.js');
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    if (confirm('You need to be signed in to submit to the gallery. Go to sign in page?')) {
                        window.location.href = 'index.html#auth';
                    }
                    return;
                }
                
                // Import and call the submit function
                const { openSubmitToGalleryModal } = await import('../data/github-submit.js');
                await openSubmitToGalleryModal();
            } catch (error) {
                console.error('Error opening submit modal:', error);
                alert('Failed to open submit modal. Please try again.');
            }
        });
    }
    
    // Report Bug button - also close dropdown on click (onclick handles navigation)
    const reportBugBtn = document.getElementById('logoReportBugBtn');
    if (reportBugBtn) {
        reportBugBtn.addEventListener('click', () => {
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
        });
    }
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const newProject = await importProjectFileAsNewProject(file);
                showNotification('Project imported successfully!', 'success');
                window.location.href = `editor.html?id=${newProject.id}`;
            } catch (error) {
                console.error('Import error:', error);
                alert('Failed to import project: ' + error.message);
            } finally {
                e.target.value = '';
            }
        });
    }
    
    const bibtexFileInput = document.getElementById('bibtexFileInput');
    if (bibtexFileInput) {
        bibtexFileInput.addEventListener('change', importBibtexFile);
    }
    
    // Toolbar actions
    document.getElementById('addArticleBtn').addEventListener('click', () => {
        setPendingArticlePosition(null);
        openArticleModal();
    });
    document.getElementById('categoryFilterBtn').addEventListener('click', toggleCategoryDropdown);

    // Expose globally for use in import/export
    window.fitGraphView = fitGraphView;
    
    document.getElementById('fitGraphBtn').addEventListener('click', () => fitGraphView());
    
    document.getElementById('toggleGridBtn').addEventListener('click', toggleGrid);
    
    // Load grid state from localStorage
    const savedGridState = localStorage.getItem('gridEnabled');
    if (savedGridState === 'true') {
        getStore().setGridEnabled(true);
        const btn = document.getElementById('toggleGridBtn');
        btn.classList.add('active');
    }
    
    // Search toggle
    document.getElementById('searchToggleBtn').addEventListener('click', () => {
        const searchBtn = document.getElementById('searchToggleBtn');
        const searchBox = document.querySelector('.toolbar-search');
        
        searchBtn.classList.add('hidden');
        searchBox.classList.remove('collapsed');
        
        setTimeout(() => {
            document.getElementById('searchBoxToolbar').focus();
        }, 100);
    });
    
    document.getElementById('searchCloseBtn').addEventListener('click', () => {
        const searchBtn = document.getElementById('searchToggleBtn');
        const searchBox = document.querySelector('.toolbar-search');
        const searchInput = document.getElementById('searchBoxToolbar');
        const resultCount = document.getElementById('searchResultCount');
        
        searchBox.classList.add('collapsed');
        setTimeout(() => {
            searchBtn.classList.remove('hidden');
        }, 400);
        
        searchInput.value = '';
        if (resultCount) resultCount.textContent = '';
        
        // Reset search in both views
        const graphView = document.getElementById('graphView');
        const listView = document.getElementById('listView');
        
        if (graphView.classList.contains('active')) {
            searchInGraph('');
        } else if (listView.classList.contains('active')) {
            renderListView('');
        }
    });
    
    // Search input
    document.getElementById('searchBoxToolbar').addEventListener('input', (e) => {
        const searchTerm = e.target.value;
        const graphView = document.getElementById('graphView');
        const listView = document.getElementById('listView');
        
        if (graphView.classList.contains('active')) {
            searchInGraph(searchTerm);
        } else if (listView.classList.contains('active')) {
            renderListView(searchTerm);
        }
    });
    
    // Search input - Escape key to close
    document.getElementById('searchBoxToolbar').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('searchCloseBtn').click();
        }
    });
    
    // Category filter
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        getStore().setCategoryFilter(e.target.value);
        
        const graphView = document.getElementById('graphView');
        if (graphView.classList.contains('active')) {
            updateGraph();
        } else {
            renderListView(document.getElementById('searchBoxToolbar').value);
        }
        document.getElementById('categoryDropdown').classList.remove('active');
        
        updateActiveFiltersDisplay();
    });
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key - hide selection box and menus
        if (e.key === 'Escape') {
            hideSelectionBox();
            hideRadialMenu();
            hideEdgeMenu();
            hideSelectionRadialMenu();
            hideZoneDeleteButton();
            hideContextMenu();
            return;
        }
        
        // Delete/Backspace key
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            
            e.preventDefault();
            
            if (getStore().multiSelection.selectedNodes.length > 1) {
                deleteSelectedNodes();
            } else if (getStore().selectedNodeId !== null) {
                if (confirm('Delete this article?')) {
                    deleteArticleById(getStore().selectedNodeId);
                    getStore().setSelectedNodeId(null);
                    hideRadialMenu();
                }
            } else if (getStore().selectedEdgeId !== null) {
                if (confirm('Delete this connection?')) {
                    deleteConnection(getStore().selectedEdgeId);
                    hideEdgeMenu();
                }
            } else if (getStore().selectedZoneIndex !== -1) {
                if (confirm('Delete this zone/tag?')) {
                    deleteZone(getStore().selectedZoneIndex);
                }
            }
        }
    });
    
    // Radial menu actions
    document.querySelector('.radial-connect').addEventListener('click', () => {
        if (getStore().selectedNodeId) {
            startConnectionMode(getStore().selectedNodeId);
            hideRadialMenu();
        }
    });
    
    document.querySelector('.radial-delete').addEventListener('click', () => {
        if (getStore().selectedNodeId) {
            deleteArticleById(getStore().selectedNodeId);
            hideRadialMenu();
        }
    });
    
    // Connection mode
    document.getElementById('cancelConnectionMode').addEventListener('click', cancelConnectionMode);
    
    // Modal
    document.getElementById('articleForm').addEventListener('submit', (e) => {
        saveArticle(e);
    });
    document.getElementById('deleteArticleBtn').addEventListener('click', () => {
        deleteArticle();
    });
    
    // Import functionality
    setupImportZone();
    
    // Manual form toggle
    document.getElementById('toggleManualBtn').addEventListener('click', toggleManualForm);
    
    // Close modals
    document.querySelectorAll('.close').forEach(el => {
        el.addEventListener('click', () => {
            closeModal();
        });
    });
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });
    
    // Close radial menu when clicking on canvas
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.radial-menu') && !e.target.closest('.edge-menu') && !e.target.closest('.vis-network')) {
            hideRadialMenu();
            hideEdgeMenu();
        }
    });
    
    // Edge menu actions are now handled directly in showEdgeMenu() via onclick
}

export function switchView(view) {
    const graphView = document.getElementById('graphView');
    const listView = document.getElementById('listView');
    const viewToggle = document.getElementById('viewToggle');
    const graphOnlyElements = document.querySelectorAll('.graph-only');
    
    // Hide selection box when switching views
    hideSelectionBox();
    
    // Clear search input when switching views
    const searchInput = document.getElementById('searchBoxToolbar');
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        if (graphView.classList.contains('active')) {
            searchInGraph('');
        }
    }
    
    if (view === 'graph') {
        graphView.classList.add('active');
        listView.classList.remove('active');
        viewToggle.checked = false;
        
        // Show graph-only elements with animation
        graphOnlyElements.forEach(el => {
            el.style.display = 'flex';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.classList.add('visible');
                });
            });
        });
        
        if (getNetwork()) {
            getNetwork().fit();
        }
    } else {
        graphView.classList.remove('active');
        listView.classList.add('active');
        viewToggle.checked = true;
        
        // Hide graph-only elements with animation
        graphOnlyElements.forEach(el => {
            el.classList.remove('visible');
            setTimeout(() => {
                el.style.display = 'none';
            }, 400);
        });
        
        renderListView();
    }
}
