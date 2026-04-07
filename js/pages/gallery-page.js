
        import { supabase } from '../auth/config.js';
        import { loadGalleryProjects, openGalleryProject } from '../data/gallery.js';
        import { loadIncludes, includesReady } from '../utils/load-footer.js';
        import '../ui/preferences.js';
        import { initUserDropdown } from '../ui/user-dropdown.js';
        import { setupLogoDropdown } from '../ui/logo-dropdown.js';
        
        let currentUser = null;
        let isSignUp = false;

        // Initialize on page load
        async function initGallery() {
            console.log('?? Gallery page loading...');
            
            // Wait for HTML includes to be loaded
            await includesReady;
            
            // Set gallery-specific auth subtitle
            const authSubtitle = document.getElementById('authModalSubtitle');
            if (authSubtitle) authSubtitle.textContent = 'Sign in to access the gallery features';
            
            // Check if user is logged in
            try {
                currentUser = await initUserDropdown({ signOutReload: true });
                
                if (currentUser) {
                    document.getElementById('submitToGalleryBtn').style.display = 'flex';
                    document.getElementById('signInBtn').style.display = 'none';
                    console.log('? User logged in:', currentUser.email);
                } else {
                    document.getElementById('signInBtn').style.display = 'block';
                    document.getElementById('submitToGalleryBtn').style.display = 'none';
                    console.log('?? No user logged in');
                }
            } catch (error) {
                console.error('? Auth check error:', error);
                document.getElementById('signInBtn').style.display = 'block';
            }

            // Setup logo dropdown (shared) AFTER checking auth
            setupLogoDropdown({ triggerButtonId: 'logoMenuBtnPage' });
            
            // Wire up gallery-specific navigation
            const dashboardBtn = document.getElementById('logoDashboardBtn');
            if (dashboardBtn) {
                dashboardBtn.addEventListener('click', () => {
                    window.location.href = currentUser ? 'projects.html' : 'index.html';
                });
            }
            const newProjectBtn = document.getElementById('logoNewProjectBtn');
            if (newProjectBtn) newProjectBtn.style.display = currentUser ? '' : 'none';
            const galleryBtn = document.getElementById('logoGalleryBtn');
            if (galleryBtn) galleryBtn.addEventListener('click', () => window.location.href = 'gallery.html');
            const submitBtn = document.getElementById('logoSubmitBtn');
            if (submitBtn) submitBtn.addEventListener('click', () => handleSubmitClick());

            // Load gallery projects
            await loadGalleryProjects();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGallery);
        } else {
            initGallery();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        window.openSubmitToGalleryModal = async function() {
            // Check if user is logged in
            if (!currentUser) {
                console.log('?? User not logged in, opening login modal');
                openAuthModal();
                return;
            }
            
            const modal = document.getElementById('submitGalleryModal');
            modal.style.display = 'block';
            
            // Load user's projects
            try {
                const { loadProjects } = await import('../auth/projects.js');
                const projects = await loadProjects();
                
                const select = document.getElementById('submitProjectSelect');
                select.innerHTML = '<option value="">Choose a project...</option>';
                
                projects.forEach(project => {
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    select.appendChild(option);
                });
                
                // Pre-fill author info
                const fullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '';
                document.getElementById('submitAuthor').value = fullName;
            } catch (error) {
                console.error('Error loading projects:', error);
                alert('Failed to load your projects. Please try again.');
                closeSubmitGalleryModal();
            }
        };

        window.closeSubmitGalleryModal = function() {
            document.getElementById('submitGalleryModal').style.display = 'none';
            document.getElementById('submitGalleryForm').reset();
            removeThumbnail();
        };

        window.removeThumbnail = function() {
            document.getElementById('thumbnailInput').value = '';
            document.getElementById('thumbnailPreview').style.display = 'none';
            document.getElementById('thumbnailPlaceholder').style.display = 'block';
        };

        // Thumbnail upload handler
        document.getElementById('thumbnailInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('thumbnailImg').src = event.target.result;
                document.getElementById('thumbnailPreview').style.display = 'block';
                document.getElementById('thumbnailPlaceholder').style.display = 'none';
            };
            reader.readAsDataURL(file);
        });

        // Character count
        document.getElementById('submitDescription').addEventListener('input', function() {
            document.getElementById('descCharCount').textContent = this.value.length;
        });

        // Form submit
        window.handleSubmitToGallery = async function(e) {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitGalleryButton');
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
                
                alert('? Your project has been submitted for review!\n\nA merge request has been created on GitHub.');
                closeSubmitGalleryModal();
                
            } catch (error) {
                console.error('Submission error:', error);
                alert('Failed to submit project: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Project';
            }
        };

        // Sign out handled by initUserDropdown()
        
        window.createNewProject = function() {
            // Redirect to projects page with new project modal
            window.location.href = 'projects.html?new=true';
        };

        // Handle submit button click - check auth first
        window.handleSubmitClick = function() {
            if (!currentUser) {
                console.log('?? User not logged in, opening login modal');
                openAuthModal();
            } else {
                openSubmitToGalleryModal();
            }
        };

        window.openAuthModal = function() {
            document.getElementById('authModal').classList.add('active');
        };

        window.closeAuthModal = function() {
            document.getElementById('authModal').classList.remove('active');
            document.getElementById('authMessage').innerHTML = '';
        };

        window.toggleAuthMode = function() {
            isSignUp = !isSignUp;
            const title = document.getElementById('authModalTitle');
            const subtitle = document.getElementById('authModalSubtitle');
            const submitBtn = document.getElementById('authSubmitBtn');
            const toggleText = document.getElementById('authToggleText');
            const fullNameInput = document.getElementById('authFullName');
            const usernameInput = document.getElementById('authUsername');
            
            if (isSignUp) {
                title.textContent = 'Create your account';
                subtitle.textContent = 'Join Papergraph to save and sync your projects';
                submitBtn.textContent = 'Sign up';
                toggleText.textContent = 'Already have an account?';
                toggleText.nextElementSibling.textContent = 'Sign in';
                fullNameInput.style.display = 'block';
                usernameInput.style.display = 'block';
                fullNameInput.required = true;
                usernameInput.required = true;
            } else {
                title.textContent = 'Welcome to Papergraph';
                subtitle.textContent = 'Sign in to access the gallery features';
                submitBtn.textContent = 'Sign in';
                toggleText.textContent = "Don't have an account?";
                toggleText.nextElementSibling.textContent = 'Sign up';
                fullNameInput.style.display = 'none';
                usernameInput.style.display = 'none';
                fullNameInput.required = false;
                usernameInput.required = false;
            }
        };

        window.handleAuthSubmit = async function(event) {
            event.preventDefault();
            
            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;
            const messageDiv = document.getElementById('authMessage');
            const submitBtn = document.getElementById('authSubmitBtn');
            
            submitBtn.disabled = true;
            submitBtn.textContent = isSignUp ? 'Creating account...' : 'Signing in...';
            
            try {
                if (isSignUp) {
                    const fullName = document.getElementById('authFullName').value;
                    const username = document.getElementById('authUsername').value;
                    
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                full_name: fullName,
                                username: username
                            }
                        }
                    });
                    
                    if (error) throw error;
                    
                    messageDiv.innerHTML = '<div class="auth-message success">? Account created! Check your email to verify.</div>';
                    setTimeout(() => {
                        toggleAuthMode();
                        document.getElementById('authForm').reset();
                    }, 2000);
                } else {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });
                    
                    if (error) throw error;
                    
                    messageDiv.innerHTML = '<div class="auth-message success">? Signed in successfully!</div>';
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            } catch (error) {
                console.error('Auth error:', error);
                messageDiv.innerHTML = `<div class="auth-message error">? ${error.message}</div>`;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = isSignUp ? 'Sign up' : 'Sign in';
            }
        };

        window.signInWithGitHub = async function() {
            try {
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'github',
                    options: {
                        redirectTo: window.location.href
                    }
                });
                
                if (error) throw error;
            } catch (error) {
                console.error('GitHub sign in error:', error);
                document.getElementById('authMessage').innerHTML = `<div class="auth-message error">? ${error.message}</div>`;
            }
        };

        window.signInWithGoogle = async function() {
            try {
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.href
                    }
                });
                
                if (error) throw error;
            } catch (error) {
                console.error('Google sign in error:', error);
                document.getElementById('authMessage').innerHTML = `<div class="auth-message error">? ${error.message}</div>`;
            }
        };

        // Preferences modal now handled globally in js/ui/preferences.js
    
