# ![Papergraph Logo](assets/logo-papergraph.svg) Papergraph

Map your research. Connect ideas.

Papergraph is a visual research workspace for building literature maps from academic papers. It helps you collect references, connect related articles, organize topics spatially, and keep project data in a format that is easy to save, export, and share.

Live app: https://papergraph.net

## What Papergraph does

Papergraph is built around a graph editor where each paper becomes a node in your research map. From there, you can connect papers, group them by topic, annotate them, and maintain a project as your reading evolves.

Core capabilities in the current workspace:

- Visual graph editing for papers and their relationships
- Labeled connections between articles
- Tag-based organization with colored zones on the canvas
- Search and category filtering
- Article preview and inline metadata editing
- Public gallery browsing and gallery submission flow

## Main features

### Graph-based research mapping

- Add papers as nodes in a visual graph
- Draw directional links between papers to represent relationships
- Reposition nodes freely and keep their saved layout
- Use tag zones to group related papers on the canvas
- Work in a focused graph workspace with search, filters, and fit-to-view tools

### Paper metadata and note-taking

- Store title, authors, year, venue, DOI, URL, PDF link, abstract, notes, and categories
- Edit article details manually when needed
- Open DOI, web links, and PDFs directly from the preview panel
- Keep BibTeX identifiers and bibliography-friendly metadata in each project

### Import workflows

- Import from DOI
- Import from arXiv ID or URL
- Paste one or multiple BibTeX entries
- Import `.bib` and `.bibtex` files
- Drop a PDF to create an entry and attempt metadata enrichment
- Import an existing `.papergraph` project file

### Export and project portability

- Export a full project as `.papergraph`
- Export bibliography data as `.bib`
- Export the current graph as `.png`
- Export the graph as `.svg`

### Projects, gallery, and cloud features

- Create and manage projects from a signed-in dashboard
- Save projects locally by default
- Use optional Supabase-backed cloud projects when authentication is enabled
- Browse community projects in the gallery
- Open gallery projects in read-only mode and copy them into your workspace
- Submit projects to the gallery through the included GitHub/Supabase flow

## Local installation

### Prerequisites

- Node.js
- npm

### Install dependencies

```bash
npm install
```

### Build the app

```bash
npm run build
```

### Run locally during development

```bash
npm run dev
```

### Preview the production build locally

```bash
npm run preview
```

Papergraph is a Vite-based frontend project. The production build is generated with `npm run build`, and `npm run preview` is the simplest way to inspect that build locally.

## Optional backend setup

The app can be used as a local frontend project without Supabase, but authenticated projects, cloud saves, sharing infrastructure, and gallery submission depend on the Supabase setup included in this repository.

Relevant files:

- `supabase_clean_setup.sql`
- `supabase/functions/README.md`
- `supabase/functions/submit-to-gallery/`

## Project structure

Key directories in this workspace:

- `js/` for application logic
- `css/` for styles
- `assets/` for icons, logos, and demo media
- `projects/` for gallery project data
- `supabase/` for backend setup and edge functions

## Backlog

### Near term

- Shareable projects and collaboration features
- Increase the number of API providers used for article search
- Zotero import

### Long term

- Web extension to add an article directly to a specific project

## License

MIT. See [LICENSE](/home/e095403/HOME/papergraph_project/papergraph-dist/LICENSE).
