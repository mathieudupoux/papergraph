// Load included HTML files
let _resolveIncludes;
export const includesReady = new Promise(r => { _resolveIncludes = r; });

export async function loadIncludes() {
    try {
        const includeElements = document.querySelectorAll('[data-include]');
        
        for (const element of includeElements) {
            const fileName = element.getAttribute('data-include');
            const filePath = `${fileName}.html`;
            
            try {
                const response = await fetch(filePath);
                if (!response.ok) throw new Error(`${fileName} not found`);
                const html = await response.text();
                element.innerHTML = html;
            } catch (error) {
                console.error(`Error loading ${fileName}:`, error);
            }
        }
    } catch (error) {
        console.error('Error loading includes:', error);
    }
    _resolveIncludes();
}

// Load includes when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadIncludes);
} else {
    loadIncludes();
}
