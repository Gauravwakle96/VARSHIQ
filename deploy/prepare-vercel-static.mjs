// Publish compiled frontend assets and notices; never copy backend/private files.
import { access, cp, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('frontend/dist/', root);
const destination = new URL('public/', root);
await access(new URL('index.html', source));
await cp(fileURLToPath(source), fileURLToPath(destination), { recursive: true });
for (const [name, target] of [
  ['THIRD_PARTY_NOTICES.md', 'third-party-notices.txt'],
  ['DATASET_LICENCES.md', 'dataset-licences.txt'],
]) {
  await copyFile(new URL(name, root), new URL(target, destination));
}
console.log('Compiled frontend and attribution notices prepared for the CDN.');
