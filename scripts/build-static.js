const fs = require('fs');
const path = require('path');
const { createSeedData } = require('../src/storage/seed-data');
const { TAXONOMY, LABELS } = require('../src/domain/taxonomy');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

async function copyDirectory(source, destination) {
  await fs.promises.mkdir(destination, { recursive: true });
  const entries = await fs.promises.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(from, to);
    else await fs.promises.copyFile(from, to);
  }
}

function browserState() {
  const seed = createSeedData();
  return {
    schemaVersion: 1,
    revision: 0,
    family: seed.family,
    recipes: seed.recipes,
    teas: seed.teas,
    tongueRecords: seed['tongue-records'],
    recommendationHistory: seed['recommendation-history'],
  };
}

async function build() {
  await fs.promises.mkdir(docsDir, { recursive: true });
  await fs.promises.rm(path.join(docsDir, 'index.html'), { force: true });
  await fs.promises.rm(path.join(docsDir, 'assets'), { recursive: true, force: true });
  await fs.promises.rm(path.join(docsDir, '.nojekyll'), { force: true });

  await copyDirectory(path.join(publicDir, 'assets'), path.join(docsDir, 'assets'));
  const html = await fs.promises.readFile(path.join(publicDir, 'index.html'), 'utf8');
  const marker = '  <script type="module" src="./assets/app.js"></script>';
  if (!html.includes(marker)) throw new Error('Static build could not find the application script marker');
  const staticHtml = html.replace(marker, `  <script>window.__MINGYUAN_STATIC__ = true;</script>\n${marker}`);
  await fs.promises.writeFile(path.join(docsDir, 'index.html'), staticHtml, 'utf8');

  const dataDir = path.join(docsDir, 'assets', 'data');
  await fs.promises.mkdir(dataDir, { recursive: true });
  const bootstrap = { state: browserState(), taxonomy: TAXONOMY, labels: LABELS };
  await fs.promises.writeFile(path.join(dataDir, 'seed-data.json'), `${JSON.stringify(bootstrap, null, 2)}\n`, 'utf8');
  await fs.promises.writeFile(path.join(docsDir, '.nojekyll'), '', 'utf8');
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
