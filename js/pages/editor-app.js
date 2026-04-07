// Editor page entry point — single module that imports the full dependency tree
// Vite resolves and bundles all imports automatically

// Core state (must be first)
import '../core/state.js';

// Utilities
import '../utils/helpers.js';
import '../utils/codemirror-latex.js';
import '../utils/load-footer.js';

// Services
import '../services/swiftlatex-compiler.js';

// Data layer
import '../data/persistence.js';
import '../data/bibliography.js';
import '../data/storage.js';
import '../data/bibtex-parser.js';
import '../data/latex-compiler.js';
import '../data/export.js';
import '../data/import.js';

// Graph
import '../graph/zones.js';
import '../graph/connections.js';
import '../graph/search.js';
import '../graph/selection.js';
import '../graph/render.js';
import '../graph/events.js';
import '../graph/init.js';

// UI
import '../ui/modal-manager.js';
import '../ui/filters.js';
import '../ui/modal.js';
import '../ui/preview.js';
import '../ui/radial-menu.js';
import '../ui/toolbar.js';
import '../ui/settings.js';
import '../ui/list/shared.js';
import '../ui/list/sidebar.js';
import '../ui/list/editor.js';
import '../ui/list/review.js';
import '../ui/list/pdf-preview.js';
import '../ui/preferences.js';

// Core initialization
import '../core/init.js';

// Auth & cloud (these were already ES modules)
import './editor-init.js';

// Application startup
import './editor-startup.js';
