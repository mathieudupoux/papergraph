import { createProject } from '../auth/projects.js';

export function normalizeImportedProjectData(imported) {
    if (!imported || typeof imported !== 'object') {
        throw new Error('Invalid file format');
    }

    if (imported.articles && imported.connections) {
        return {
            nodes: imported.articles || [],
            edges: imported.connections || [],
            zones: imported.tagZones || [],
            positions: imported.nodePositions || {},
            projectReview: imported.projectReview || '',
            projectReviewMeta: imported.projectReviewMeta || null
        };
    }

    if (imported.data && imported.data.nodes && imported.data.edges) {
        return {
            ...imported.data,
            zones: imported.data.zones || imported.data.tagZones || [],
            positions: imported.data.positions || imported.data.nodePositions || {},
            projectReview: imported.data.projectReview || '',
            projectReviewMeta: imported.data.projectReviewMeta || null
        };
    }

    if (imported.nodes && imported.edges) {
        return {
            ...imported,
            zones: imported.zones || imported.tagZones || [],
            positions: imported.positions || imported.nodePositions || {},
            projectReview: imported.projectReview || '',
            projectReviewMeta: imported.projectReviewMeta || null
        };
    }

    throw new Error('Invalid file format - missing nodes/edges or articles/connections');
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

export async function importProjectFileAsNewProject(file) {
    if (!file) {
        throw new Error('No file selected');
    }

    const rawText = await readFileAsText(file);
    const imported = JSON.parse(rawText);
    const projectData = normalizeImportedProjectData(imported);
    const projectName = file.name.replace(/\.(papergraph|json)$/i, '');

    return createProject(projectName, projectData);
}
