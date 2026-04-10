// Shared logo dropdown setup — used by editor, projects, and gallery pages

/**
 * Sets up logo dropdown toggle, submenu positioning, and outside-click closing.
 * Call after HTML partials are loaded.
 * @param {Object} [options]
 * @param {string} [options.triggerButtonId] - ID of the trigger button (default: 'logoMenuBtn')
 */
export function setupLogoDropdown(options = {}) {
    const triggerBtnId = options.triggerButtonId || 'logoMenuBtn';
    const logoMenuBtn = document.getElementById(triggerBtnId);
    const mainDropdown = document.getElementById('logoDropdown');

    if (!logoMenuBtn || !mainDropdown) return;

    const importSubmenu = document.getElementById('logoImportSubmenu');
    const exportSubmenu = document.getElementById('logoExportSubmenu');
    const nodeLabelSubmenu = document.getElementById('logoNodeLabelSubmenu');
    const allSubmenus = [importSubmenu, exportSubmenu, nodeLabelSubmenu].filter(Boolean);

    // --- Toggle dropdown ---
    logoMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mainDropdown.classList.toggle('active');
        closeAllSubmenus();
    });

    // --- Submenu helpers ---
    function closeAllSubmenus() {
        allSubmenus.forEach(s => s.classList.remove('active'));
    }

    function showSubmenu(submenu, triggerButton) {
        if (!submenu) return;
        closeAllSubmenus();
        const rect = triggerButton.getBoundingClientRect();
        submenu.style.top = `${rect.top}px`;
        submenu.style.left = `${rect.right + 10}px`;
        submenu.classList.add('active');
    }

    // --- Submenu trigger on hover ---
    const submenuMap = {
        logoImportMenu: importSubmenu,
        logoExportMenu: exportSubmenu,
        logoNodeLabelMenu: nodeLabelSubmenu,
    };

    Object.entries(submenuMap).forEach(([btnId, submenu]) => {
        const btn = document.getElementById(btnId);
        if (btn && submenu) {
            btn.addEventListener('mouseenter', function () {
                showSubmenu(submenu, this);
            });
        }
    });

    // Close submenus when hovering non-submenu items
    mainDropdown.querySelectorAll('.logo-dropdown-item:not(.logo-dropdown-item-submenu)').forEach(item => {
        item.addEventListener('mouseenter', closeAllSubmenus);
    });

    // Keep submenu open when hovering over it
    allSubmenus.forEach(submenu => {
        submenu.addEventListener('mouseenter', function () { this.classList.add('active'); });
        submenu.addEventListener('mouseleave', function () { this.classList.remove('active'); });
    });

    // Close submenus when leaving main dropdown (unless hovering a submenu)
    mainDropdown.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (allSubmenus.every(s => !s.matches(':hover'))) {
                closeAllSubmenus();
            }
        }, 100);
    });

    // --- Close on outside click ---
    document.addEventListener('click', (e) => {
        const clickedInDropdown = mainDropdown.contains(e.target) || logoMenuBtn.contains(e.target);
        const clickedInSubmenu = allSubmenus.some(s => s.contains(e.target));
        if (!clickedInDropdown && !clickedInSubmenu) {
            mainDropdown.classList.remove('active');
            closeAllSubmenus();
        }
    });

    return { closeAllSubmenus };
}
