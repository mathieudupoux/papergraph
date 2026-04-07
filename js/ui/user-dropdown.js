// ===== USER DROPDOWN =====
// Unified user avatar/dropdown setup for all pages.
// Each page calls initUserDropdown() with its element-ID prefix and redirect URL.

import { supabase } from '../auth/config.js';

let _closeHandler = null;

/**
 * Initialise the user avatar button, dropdown info and sign-out action.
 *
 * @param {object}  opts
 * @param {string}  [opts.prefix='']          – ID prefix, e.g. 'editor' → looks for 'editorUserAvatarBtn'
 * @param {string}  [opts.signOutRedirect]     – URL to navigate to after sign-out (default: 'index.html')
 * @param {boolean} [opts.signOutReload=false] – if true, reload the page instead of redirecting
 * @returns {Promise<object|null>}  The authenticated user, or null.
 */
export async function initUserDropdown({
    prefix = '',
    signOutRedirect = 'index.html',
    signOutReload = false
} = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const user = session.user;

    // ── Resolve DOM elements ────────────────────────────────────────
    const p = prefix;                               // shorthand
    const avatarBtn      = document.getElementById(`${p}UserAvatarBtn`)      || document.getElementById(`${p}userAvatarBtn`);
    const avatarImg      = document.getElementById(`${p}UserAvatar`)         || document.getElementById(`${p}userAvatar`);
    const dropdown       = document.getElementById(`${p}UserDropdown`)       || document.getElementById(`${p}userDropdown`);
    const dropdownAvatar = document.getElementById(`${p}UserAvatarDropdown`) || document.getElementById(`${p}userAvatarDropdown`);
    const nameEl         = document.getElementById(`${p}UserNameDropdown`)   || document.getElementById(`${p}userNameDropdown`);
    const usernameEl     = document.getElementById(`${p}UserUsernameDropdown`) || document.getElementById(`${p}userUsernameDropdown`);
    const signOutBtn     = document.getElementById(`${p}SignOut`)            || document.getElementById(`${p}signOut`)
                         || document.getElementById(`${p}UserSignOut`)       || document.getElementById(`${p}userSignOut`);

    if (!avatarBtn || !dropdown) return user;       // nothing to wire up

    // ── Populate user info ──────────────────────────────────────────
    const avatarUrl   = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const username    = user.user_metadata?.username;
    const displayName = user.user_metadata?.full_name
                     || user.user_metadata?.name
                     || user.email.split('@')[0];

    if (avatarUrl && avatarImg)      avatarImg.src = avatarUrl;
    if (avatarUrl && dropdownAvatar) dropdownAvatar.src = avatarUrl;
    if (nameEl)                      nameEl.textContent = displayName;

    if (usernameEl) {
        if (username) {
            usernameEl.textContent = `@${username}`;
            usernameEl.style.display = 'block';
        } else {
            usernameEl.style.display = 'none';
        }
    }

    avatarBtn.style.display = 'flex';

    // ── Toggle / close (clone to remove any stale listeners) ────────
    const freshBtn = avatarBtn.cloneNode(true);
    avatarBtn.parentNode.replaceChild(freshBtn, avatarBtn);

    freshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    if (_closeHandler) document.removeEventListener('click', _closeHandler);
    _closeHandler = (e) => {
        if (!freshBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    };
    document.addEventListener('click', _closeHandler);

    // ── Sign-out ────────────────────────────────────────────────────
    if (signOutBtn) {
        const freshSignOut = signOutBtn.cloneNode(true);
        signOutBtn.parentNode.replaceChild(freshSignOut, signOutBtn);

        freshSignOut.addEventListener('click', async () => {
            await supabase.auth.signOut();
            if (signOutReload) {
                window.location.reload();
            } else {
                window.location.href = signOutRedirect;
            }
        });
    }

    return user;
}
