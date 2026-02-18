/**
 * Test helpers for markdown processing functions
 */

function processCustomBlocks(content) {
  let processed = content;

  // Обработка toggle блоков (сначала, чтобы не конфликтовать с другими блоками)
  processed = processed.replace(/\[\[toggle\s*\|\s*(.*?)\]\]\n([\s\S]*?)(?=\n\[\[|\n*$)/g, (match, title, content) => {
    // Сохраняем содержимое как есть, убирая только префиксы |
    const body = content.replace(/^\|\s*/gm, '').trim();
    return `<details class="content-toggle">\n<summary>${title}</summary>\n<div>\n${body}\n</div>\n</details>`;
  });

  // Обработка колонок новый синтаксис
  processed = processed.replace(/\[\[columns\]\]([\s\S]*?)\[\[\/columns\]\]/g, (match, content) => {
    const columns = content.split(/\[\[column\]\]/).slice(1);
    const columnHtml = columns.map(col => {
      const cleanContent = col.trim().replace(/^\|\s*/gm, '').replace(/^\|\s*/gm, '').replace(/\|\s*$/gm, '').replace(/^\|\s*$/gm, '').trim();
      return `<div class="content-column">${cleanContent}</div>`;
    }).join('');
    return `<div class="content-columns">${columnHtml}</div>`;
  });

  // Обработка колонок старый синтаксис
  processed = processed.replace(/(\[\[columns\]\]\s*\|\s*\[\[column\]\][\s\S]*?)(?=\n\[\[|$)/g, (match) => {
    const parts = match.split(/\[\[column\]\]/);
    const columns = parts.slice(1);

    const columnHtml = columns.map(col => {
      const cleanContent = col.trim().replace(/^\|\s*/gm, '').replace(/^\|\s*/gm, '').replace(/\|\s*$/gm, '').replace(/^\|\s*$/gm, '').trim();
      return `<div class="content-column">${cleanContent}</div>`;
    }).join('');

    return `<div class="content-columns">${columnHtml}</div>`;
  });

  // Обработка callout блоков
  processed = processed.replace(/\[\[callout\s*\|\s*(\w+)\]\]\n\|\s*(.*)/g, (match, type, text) => {
    return `<div class="content-callout content-callout-${type}">\n${text}\n</div>`;
  });

  return processed;
}

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