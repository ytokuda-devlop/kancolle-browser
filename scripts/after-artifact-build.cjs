const path = require('node:path');
const fs = require('node:fs/promises');
const verifyArtifact = require('./verify-artifact-licenses.cjs');

module.exports = async event => {
  // Update metadata/blockmaps are not application containers.
  if (!event.file || !['.zip', '.dmg', '.exe'].includes(path.extname(event.file).toLowerCase())) return;
  const report = await verifyArtifact(event.packager.projectDir, path.resolve(event.file));
  await fs.writeFile(event.file + '.licenses.json', JSON.stringify({
    checkedAt: new Date().toISOString(), ...report,
    scope: 'License file inclusion and byte equality only; not corresponding-source clearance.',
  }, null, 2) + '\n');
  console.log(`Verified licenses in final artifact: ${path.basename(event.file)}`);
};
