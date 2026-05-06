/**
 * Test helpers for markdown processing functions
 */

const { processCustomBlocks } = require('../build-markdown');

function fixImagePaths(html, projectSlug) {
  return html.replace(/src="([^"]*)"/g, (match, src) => {
    // Если путь относительный (начинается с images/ или ./images/)
    if (src.startsWith('images/') || src.startsWith('./images/')) {
      // Преобразуем в путь относительно dist/projects/
      const newSrc = `../assets/projects/${projectSlug}/${src.replace('./', '')}`;
      return `src="${newSrc}"`;
    }
    return match;
  });
}

module.exports = {
  processCustomBlocks,
  fixImagePaths
};
