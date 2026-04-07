// Shared state for list-view sub-modules
// Breaks circular dependency between sidebar, editor, review, and pdf-preview

export const listState = {
    latexEditor: null,
    pdfCache: {},
};
