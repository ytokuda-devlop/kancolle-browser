// Read the actual shipped ASAR, never the development node_modules tree.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

const [archive, output] = process.argv.slice(2);
if (!archive || !output) throw new Error('Usage: node inventory-asar-packages.cjs app.asar output.json');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json')));
const packages = [], nativeEntries = [], rendererBundles = [];
let files = 0;
for (const entry of asar.listPackage(archive)) {
  const name = entry.replace(/^\//, '');
  const stat = asar.statFile(archive, name);
  if (stat.files || stat.link) continue;
  files++;
  const bytes = asar.extractFile(archive, name);
  const magic = bytes.subarray(0, 4).toString('hex');
  if (bytes.subarray(0, 2).toString() === 'MZ' ||
      ['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca', '7f454c46'].includes(magic) ||
      bytes.subarray(0, 8).toString() === '!<arch>\n' || /\.(node|dll|dylib|so|exe|a|lib)$/i.test(name)) {
    nativeEntries.push({ path: name, size: bytes.length, sha256: hash(bytes) });
  }
  if (name.endsWith('/package.json') && name.startsWith('node_modules/')) {
    const pkg = JSON.parse(bytes);
    const locked = lock.packages[name.slice(0, -'/package.json'.length)];
    if (!locked || locked.version !== pkg.version) throw new Error(`Lockfile mismatch: ${name}`);
    packages.push({ path: name, name: pkg.name, version: pkg.version, license: pkg.license,
      packageJsonSha256: hash(bytes), lockfileVersionMatches: true,
      dependencies: pkg.dependencies || {} });
  }
  if (/^dist\/assets\/.*\.js$/.test(name)) {
    rendererBundles.push({ path: name, size: bytes.length, sha256: hash(bytes) });
  }
}
packages.sort((a, b) => a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ archiveName: path.basename(archive),
  asarSha256: hash(fs.readFileSync(archive)), filesScanned: files, packages, nativeEntries,
  rendererBundles, scope: 'Packages physically in ASAR; bundled JavaScript dependencies may overlap these packages' }, null, 2) + '\n');
console.log(`${packages.length} npm packages, ${nativeEntries.length} native ASAR entries, ${files} files scanned`);
