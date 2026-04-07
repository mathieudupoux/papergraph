import { navigateTo } from '../utils/base-path.js';
import { loadIncludes, includesReady } from '../utils/load-footer.js';
window.navigateTo = navigateTo;

// === Auth Logic ===

        import { supabase, config } from '../auth/config.js';

        let isSignUp = false;

        // Check if user is already logged in
        async function initLanding() {
            // Check for redirect parameters
            const urlParams = new URLSearchParams(window.location.search);
            const redirect = urlParams.get('redirect');
            const token = urlParams.get('token');
            
            // Handle hash fragment (from email confirmation)
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const hashType = hashParams.get('type');
            
            // If we have an access token in hash, this is a redirect from email confirmation
            if (accessToken) {
                // Supabase SDK will handle the session automatically
                // Wait a moment for session to be established
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // User is logged in
                if (redirect === 'share' && token) {
                    // Redirect to shared project
                    window.navigateTo(`editor.html?share=${token}`);
                } else {
                    // Normal redirect to projects
                    window.navigateTo('projects.html');
                }
                return;
            }
            
            // Wait for HTML includes (auth modal) to be loaded
            await includesReady;
            
            // User not logged in
            if (redirect === 'share' && token) {
                // Show auth modal with message about shared project
                openAuthModal();
                showAuthMessage('Please sign in to view this shared project', false);
            }

            // Attach event listeners after DOM is ready
            const getStartedBtn = document.getElementById('getStartedBtn');
            if (getStartedBtn) {
                getStartedBtn.addEventListener('click', openAuthModal);
            }

            // Duplicate logos for seamless infinite scroll
            const track = document.getElementById('logosTrack');
            if (track) {
                const logos = track.innerHTML;
                track.innerHTML = logos + logos;
            }
            
            // Close auth modal on outside click
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.addEventListener('click', function(event) {
                    if (event.target === this) {
                        closeAuthModal();
                    }
                });
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initLanding);
        } else {
            initLanding();
        }

        // Modal functions
        function openAuthModal() {
            document.getElementById('authModal').classList.add('active');
        }

        function closeAuthModal() {
            document.getElementById('authModal').classList.remove('active');
            clearAuthMessage();
        }

        // Make functions available globally for inline handlers
        window.openAuthModal = openAuthModal;
        window.closeAuthModal = closeAuthModal;

        // Toggle between sign in and sign up
        function toggleAuthMode() {
            isSignUp = !isSignUp;
            const title = document.getElementById('authModalTitle');
            const subtitle = document.getElementById('authModalSubtitle');
            const submitBtn = document.getElementById('authSubmitBtn');
            const toggleText = document.getElementById('authToggleText');
            const fullNameField = document.getElementById('authFullName');
            const usernameField = document.getElementById('authUsername');
            
            if (isSignUp) {
                title.textContent = 'Create your account';
                subtitle.textContent = 'Join Papergraph to sync your research';
                submitBtn.textContent = 'Sign up';
                toggleText.textContent = 'Already have an account?';
                fullNameField.style.display = 'block';
                fullNameField.required = true;
                usernameField.style.display = 'block';
                usernameField.required = true;
            } else {
                title.textContent = 'Welcome to Papergraph';
                subtitle.textContent = 'Sign in to sync your projects across devices';
                submitBtn.textContent = 'Sign in';
                toggleText.textContent = "Don't have an account?";
                fullNameField.style.display = 'none';
                fullNameField.required = false;
                usernameField.style.display = 'none';
                usernameField.required = false;
            }
            clearAuthMessage();
        }

        window.toggleAuthMode = toggleAuthMode;

        // Show message
        function showAuthMessage(message, isError = false) {
            const messageDiv = document.getElementById('authMessage');
            messageDiv.className = isError ? 'auth-error' : 'auth-success';
            messageDiv.textContent = message;
        }

        function clearAuthMessage() {
            document.getElementById('authMessage').textContent = '';
            document.getElementById('authMessage').className = '';
        }

        // Email/Password Auth
        async function handleAuthSubmit(event) {
            event.preventDefault();
            clearAuthMessage();

            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;

            try {
                if (isSignUp) {
                    const fullName = document.getElementById('authFullName').value;
                    const username = document.getElementById('authUsername').value;
                    
                    // Check if username is already taken
                    const { data: existingUsers, error: checkError } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('username', username)
                        .maybeSingle();
                    
                    if (existingUsers) {
                        throw new Error('Username already taken. Please choose another.');
                    }

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

                    showAuthMessage('Check your email to confirm your account!', false);
                    
                    // Clear form
                    document.getElementById('authForm').reset();
                } else {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });

                    if (error) throw error;

                    // Check for pending share token redirect
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirect = urlParams.get('redirect');
                    const token = urlParams.get('token');
                    
                    if (redirect === 'share' && token) {
                        // Redirect to shared project
                        window.navigateTo(`editor.html?share=${token}`);
                    } else {
                        // Normal redirect to dashboard
                        window.navigateTo('projects.html');
                    }
                }
            } catch (error) {
                showAuthMessage(error.message, true);
            }
        }

        // Generate unique username
        async function generateUniqueUsername(baseUsername) {
            let username = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (username.length < 3) username = 'user_' + username;
            if (username.length > 20) username = username.substring(0, 20);
            
            let finalUsername = username;
            let suffix = 1;
            
            while (true) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('username', finalUsername)
                    .maybeSingle();
                
                if (!data) break; // Username is available
                
                finalUsername = username + suffix;
                suffix++;
            }
            
            return finalUsername;
        }

        // GitHub OAuth
        async function signInWithGitHub() {
            try {
                // Check for pending share redirect
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect');
                const token = urlParams.get('token');
                
                let redirectTo = window.location.origin + config.basePath + 'projects.html';
                if (redirect === 'share' && token) {
                    redirectTo = window.location.origin + config.basePath + `editor.html?share=${token}`;
                }
                
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'github',
                    options: {
                        redirectTo: redirectTo,
                        scopes: 'user:email'
                    }
                });

                if (error) throw error;
            } catch (error) {
                showAuthMessage(error.message, true);
            }
        }

        // Google OAuth
        async function signInWithGoogle() {
            try {
                // Check for pending share redirect
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect');
                const token = urlParams.get('token');
                
                let redirectTo = window.location.origin + config.basePath + 'projects.html';
                if (redirect === 'share' && token) {
                    redirectTo = window.location.origin + config.basePath + `editor.html?share=${token}`;
                }
                
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectTo
                    }
                });

                if (error) throw error;
            } catch (error) {
                showAuthMessage(error.message, true);
            }
        }

        // Make functions globally available
        window.handleAuthSubmit = handleAuthSubmit;
        window.signInWithGitHub = signInWithGitHub;
        window.signInWithGoogle = signInWithGoogle;
    


    
