// ===== BIBLIOGRAPHY =====
// Centralised bibliography generation, caching, and LaTeX/BibTeX escaping.
// Replaces scattered code previously in sidebar.js, pdf-preview.js, and export.js.

import { getStore, getNetwork } from '../store/appStore.js';
import { articleToBibTeX } from './bibtex-parser.js';
import { onSave } from './persistence.js';

// ── Cache state ─────────────────────────────────────────────────

let _cachedBibContent = null;
let _bibRebuildTimer = null;

// ── Public API ──────────────────────────────────────────────────

/**
 * Get BibTeX content for all articles.
 * Uses a pre-built cache when available; rebuilds synchronously otherwise.
 */
export function getBibliography() {
    if (_cachedBibContent !== null) return _cachedBibContent;

    let bib = '';
    if (getStore().appData.articles && getStore().appData.articles.length > 0) {
        getStore().appData.articles.forEach(article => {
            if (article.bibtexId) {
                bib += articleToBibTeX(article) + '\n';
            }
        });
    }

    _cachedBibContent = bib;
    return bib;
}

/**
 * Schedule a debounced background rebuild of the bibliography cache.
 * Called automatically via the onSave subscriber; can also be invoked manually
 * (e.g. after initial load).
 */
export function scheduleBibliographyRebuild() {
    clearTimeout(_bibRebuildTimer);
    _bibRebuildTimer = setTimeout(() => {
        if (!getStore().appData || !getStore().appData.articles) return;
        _cachedBibContent = null;
        _cachedBibContent = getBibliography();
    }, 300);
}

/**
 * Forcefully invalidate the cache (next call to getBibliography rebuilds).
 */
export function invalidateBibliographyCache() {
    _cachedBibContent = null;
}

// ── Escaping helpers ────────────────────────────────────────────

/**
 * Escape special BibTeX field characters.
 */
export function escapeBibTeX(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/%/g, '\\%')
        .replace(/(?<!\\)&/g, '\\&')
        .replace(/(?<!\\)_/g, '\\_');
}

/**
 * Escape special LaTeX characters in plain text.
 */
export function escapeLatex(text) {
    if (!text) return '';
    return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/</g, '\\textless{}')
        .replace(/>/g, '\\textgreater{}');
}

/**
 * Simple fallback bibliography builder used when articleToBibTeX is
 * unavailable (should not happen in normal flow).
 */
export function generateBibliographySimple(articles) {
    if (!articles || articles.length === 0) return '';

    let bib = '% Generated Bibliography\n\n';
    articles.forEach(article => {
        if (!article.bibtexId) return;
        const key = article.bibtexId;
        bib += `@article{${key},\n`;
        if (article.authors) {
            const authorsFormatted = article.authors.split(',').map(a => a.trim()).join(' and ');
            bib += `  author = {${escapeBibTeX(authorsFormatted)}},\n`;
        }
        if (article.title) bib += `  title = {${escapeBibTeX(article.title)}},\n`;
        if (article.journal) bib += `  journal = {${escapeBibTeX(article.journal)}},\n`;
        if (article.year) bib += `  year = {${article.year}},\n`;
        if (article.volume) bib += `  volume = {${article.volume}},\n`;
        if (article.number) bib += `  number = {${article.number}},\n`;
        if (article.pages) bib += `  pages = {${article.pages}},\n`;
        if (article.doi) bib += `  doi = {${article.doi}},\n`;
        bib += `}\n\n`;
    });
    return bib;
}

// ── Auto-register as persistence subscriber ─────────────────────

onSave(scheduleBibliographyRebuild);

// Legacy bridge — keep window globals until remaining inline scripts are gone
window.scheduleBibliographyRebuild = scheduleBibliographyRebuild;
window.cachedBibContent = null;
// Sync window.cachedBibContent with the internal cache for legacy readers
Object.defineProperty(window, 'cachedBibContent', {
    get() { return _cachedBibContent; },
    set(v) { _cachedBibContent = v; },
    configurable: true,
});
