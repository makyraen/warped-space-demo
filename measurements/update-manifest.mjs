import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = {};
const record = rel => { files[rel.replaceAll('\\', '/')] = sha(path.join(root, rel)); };
function walk(rel) {
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (['node_modules', '__pycache__', '.git'].includes(entry.name)) continue;
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(child);
    else record(child);
  }
}
for (const rel of ['index.html', 'main.js', 'serve.mjs', 'README.md', 'CHANGES.md', 'paper/manuscript.md', 'paper/README.md', '.github/workflows/deploy.yml', '.github/demo-README.md']) record(rel);
for (const rel of ['physics', 'measurements', 'figure', 'evaluation']) walk(rel);
writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  scope: 'Repository snapshot of the manuscript, application, numerical data, and evaluation plan; no participant results are included.',
  physicsSha256: sha(path.join(root, 'physics/geodesic.mjs')),
  files,
}, null, 2) + '\n');
console.log(`Recorded SHA-256 for ${Object.keys(files).length} files.`);
