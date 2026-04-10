function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    const trimmed = url.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) {
        return trimmed;
    }
    return '#';
}

function applyInlineMarkdown(text) {
    let html = escapeHtml(text);

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const safeUrl = sanitizeUrl(url);
        return `<a href="${safeUrl}" target="_blank" rel="noopener">${label}</a>`;
    });
    html = html.replace(/\{([A-Za-z0-9:_./-]+)\}/g, (_, bibtexId) =>
        `<span class="markdown-citation" data-bibtex-id="${bibtexId}">{${bibtexId}}</span>`
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

    return html;
}

function flushParagraph(paragraphLines, blocks) {
    if (paragraphLines.length === 0) return;
    blocks.push(`<p>${paragraphLines.map(applyInlineMarkdown).join('<br>')}</p>`);
    paragraphLines.length = 0;
}

function flushList(listType, listItems, blocks) {
    if (!listType || listItems.length === 0) return;
    const items = listItems.map((item) => `<li>${applyInlineMarkdown(item)}</li>`).join('');
    blocks.push(`<${listType}>${items}</${listType}>`);
    listItems.length = 0;
}

export function renderMarkdown(markdown = '') {
    const source = markdown.trim();
    if (!source) {
        return '';
    }

    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    const paragraphLines = [];
    const listItems = [];
    let listType = null;
    let inCodeBlock = false;
    let codeLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            flushParagraph(paragraphLines, blocks);
            flushList(listType, listItems, blocks);
            listType = null;

            if (inCodeBlock) {
                blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (!trimmed) {
            flushParagraph(paragraphLines, blocks);
            flushList(listType, listItems, blocks);
            listType = null;
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph(paragraphLines, blocks);
            flushList(listType, listItems, blocks);
            listType = null;
            const level = headingMatch[1].length;
            blocks.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
        if (blockquoteMatch) {
            flushParagraph(paragraphLines, blocks);
            flushList(listType, listItems, blocks);
            listType = null;
            blocks.push(`<blockquote>${applyInlineMarkdown(blockquoteMatch[1])}</blockquote>`);
            continue;
        }

        const unorderedMatch = trimmed.match(/^[-*+•]\s+(.*)$/);
        if (unorderedMatch) {
            flushParagraph(paragraphLines, blocks);
            if (listType && listType !== 'ul') {
                flushList(listType, listItems, blocks);
            }
            listType = 'ul';
            listItems.push(unorderedMatch[1]);
            continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
        if (orderedMatch) {
            flushParagraph(paragraphLines, blocks);
            if (listType && listType !== 'ol') {
                flushList(listType, listItems, blocks);
            }
            listType = 'ol';
            listItems.push(orderedMatch[1]);
            continue;
        }

        if (listType) {
            flushList(listType, listItems, blocks);
            listType = null;
        }

        paragraphLines.push(line);
    }

    if (inCodeBlock) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    flushParagraph(paragraphLines, blocks);
    flushList(listType, listItems, blocks);

    return blocks.join('');
}
