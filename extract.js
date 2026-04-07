const fs = require('fs');
const html = fs.readFileSync('editor.html', 'utf8');
const mjMatch = html.match(/<script>\s*window\.MathJax\s*=\s*{[\s\S]*?}<\/script>/);
console.log(mjMatch ? 'found' : 'not found');
