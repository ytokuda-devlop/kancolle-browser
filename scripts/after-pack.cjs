const path = require('node:path');
const normalizeMacNames = require('./normalize-mac-names.cjs');
const verifyLicenses = require('./verify-packaged-licenses.cjs');

module.exports = async context => {
  await normalizeMacNames(context);
  const isMac = ['darwin', 'mas'].includes(context.electronPlatformName);
  const resourcesDir = isMac
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  await verifyLicenses(context.packager.projectDir, resourcesDir);
};
