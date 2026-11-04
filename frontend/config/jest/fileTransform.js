// Turns file/asset imports into their basename for Jest (same behaviour as
// CRA's config/jest/fileTransform.js; the SVG-as-component branch is omitted
// because the app imports no SVGs).
'use strict';

const path = require('path');

module.exports = {
  process(src, filename) {
    return `module.exports = ${JSON.stringify(path.basename(filename))};`;
  },
};
