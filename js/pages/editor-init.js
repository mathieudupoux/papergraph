import { supabase } from '../auth/config.js';
import { getStore, getNetwork } from '../store/appStore.js';
import { initCloudStorage, isCloudStorageEnabled } from '../data/cloud-storage.js';
import { showNotification } from '../utils/helpers.js';
import { initUserDropdown } from '../ui/user-dropdown.js';
import { includesReady } from '../utils/load-footer.js';
import { closeModal } from '../ui/modal-manager.js';
import { 
    canEdit, 
    isReadOnly, 
    executeIfCanEdit, 
    showReadOnlyNotification,
    getUserRole,
    isOwner,
    isEditorOrOwner
} from '../utils/permissions.js';

// Make supabase client globally available for non-module scripts
window.supabaseClient = supabase;

// Make cloud storage functions globally available
window.initCloudStorage = initCloudStorage;
window.isCloudStorageEnabled = isCloudStorageEnabled;

// Make permission functions globally available
window.canEdit = canEdit;
window.isReadOnly = isReadOnly;
window.executeIfCanEdit = executeIfCanEdit;
window.showReadOnlyNotification = showReadOnlyNotification;
window.getUserRole = getUserRole;
window.isOwner = isOwner;
window.isEditorOrOwner = isEditorOrOwner;
window.showNotification = showNotification;

// Initialize user dropdown on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    await includesReady;
    await initUserDropdown();
});

// Preferences modal handled by js/ui/preferences.js (loadPreferencesData removed)

// Submit to Gallery Modal Handlers
window.closeSubmitGalleryModal = function() {
    closeModal('submitGalleryModal');
    const form = document.getElementById('submitGalleryForm');
    if (form) form.reset();
    window.removeThumbnail();
};

window.removeThumbnail = function() {
    const thumbnailInput = document.getElementById('thumbnailInput');
    const thumbnailPreview = document.getElementById('thumbnailPreview');
    const thumbnailPlaceholder = document.getElementById('thumbnailPlaceholder');
    
    if (thumbnailInput) thumbnailInput.value = '';
    if (thumbnailPreview) thumbnailPreview.style.display = 'none';
    if (thumbnailPlaceholder) thumbnailPlaceholder.style.display = 'block';
};

// Thumbnail upload handler
document.addEventListener('DOMContentLoaded', () => {
    const thumbnailInput = document.getElementById('thumbnailInput');
    if (thumbnailInput) {
        thumbnailInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const thumbnailImg = document.getElementById('thumbnailImg');
                const thumbnailPreview = document.getElementById('thumbnailPreview');
                const thumbnailPlaceholder = document.getElementById('thumbnailPlaceholder');
                
                if (thumbnailImg) thumbnailImg.src = event.target.result;
                if (thumbnailPreview) thumbnailPreview.style.display = 'block';
                if (thumbnailPlaceholder) thumbnailPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }

    const submitDescription = document.getElementById('submitDescription');
    if (submitDescription) {
        submitDescription.addEventListener('input', function() {
            const descCharCount = document.getElementById('descCharCount');
            if (descCharCount) {
                descCharCount.textContent = this.value.length;
            }
        });
    }
});

// Form submit
window.handleSubmitToGallery = async function(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitGalleryButton');
    if (!submitBtn) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
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
        
        alert('✅ Your project has been submitted for review!\n\nA merge request has been created on GitHub.');
        window.closeSubmitGalleryModal();
        
    } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to submit project: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Project';
    }
};

