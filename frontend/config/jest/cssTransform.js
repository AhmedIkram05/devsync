// Turns style imports into empty objects for Jest (same as CRA's
// config/jest/cssTransform.js).
'use strict';

module.exports = {
  process() {
    return { code: 'module.exports = {};' };
  },
  getCacheKey() {
    return 'cssTransform';
  },
};
