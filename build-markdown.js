const fs = require('fs');
const path = require('path');
const matter = require('gray-matter').default || require('gray-matter');

// Cache for marked module
let markedInstance = null;

/**
 * Lazy load marked module
 * @returns {Promise<marked>}
 */
async function getMarked() {
  if (!markedInstance) {
    markedInstance = await import('marked');
  }
  return markedInstance;
}

/**
 * Обрабатывает кастомные блоки в markdown перед конвертацией
 * @param {string} content - Markdown контент
 * @returns {Promise<string>} Обработанный контент
 */
async function processCustomBlocks(content) {
  const marked = await getMarked();
  let processed = content;

  // Обработка toggle блоков (сначала, чтобы не конфликтовать с другими блоками)
  processed = processed.replace(/\[\[toggle\s*\|\s*(.*?)\]\]\n([\s\S]*?)(?=\n\[\[|\n*$)/g, (match, title, content) => {
    // Сохраняем содержимое как есть, убирая только префиксы |
    const body = content.replace(/^\|\s*/gm, '').trim();
    // Парсим markdown внутри блока
    const bodyHtml = marked.parse(body);
    return `<details class="notion-toggle">\n<summary>${title}</summary>\n<div>\n${bodyHtml}\n</div>\n</details>\n\n`;
  });

  // Обработка колонок - простой подход
  // Ищем блоки колонок и заменяем их содержимое
  processed = processed.replace(/\[\[columns\]\]([\s\S]*?)\[\[\/columns\]\]/g, (match, content) => {
    // Разделяем содержимое по разделителям колонок
    const columns = content.split(/\[\[column\]\]/).slice(1);
    const columnHtml = columns.map(col => {
      // Очищаем от всех | в начале и конце каждой строки
      const cleanContent = col.trim().replace(/^\|\s*/gm, '').replace(/^\|\s*/gm, '').replace(/\|\s*$/gm, '').replace(/^\|\s*$/gm, '').trim();
      const cleanContentHtml = marked.parse(cleanContent);
      return `<div class="notion-column">${cleanContentHtml}</div>`;
    }).join('');
    return `<div class="notion-columns">${columnHtml}</div>\n\n`;
  });

  // Обработка колонок старого синтаксиса: [[columns]] | [[column]] | | content | [[column]] | | content
  processed = processed.replace(/(\[\[columns\]\]\s*\|\s*\[\[column\]\][\s\S]*?)(?=\n(?:\[\[|#|$))/g, (match) => {
    // Разделяем по [[column]] маркерам
    const parts = match.split(/\[\[column\]\]/);
    const columns = parts.slice(1); // Пропускаем часть до первого [[column]]

    const columnHtml = columns.map(col => {
      // Очищаем содержимое от | в начале и конце строк
      const cleanContent = col.trim().replace(/^\|\s*/gm, '').replace(/^\|\s*/gm, '').replace(/\|\s*$/gm, '').replace(/^\|\s*$/gm, '').trim();
      const cleanContentHtml = marked.parse(cleanContent);
      return `<div class="notion-column">${cleanContentHtml}</div>`;
    }).join('');

    return `<div class="notion-columns">${columnHtml}</div>\n\n`;
  });

  // Обработка callout блоков
  processed = processed.replace(/\[\[callout\s*\|\s*(\w+)\]\]\n([\s\S]*?)(?=\n(?:\[\[|##|---|!|\n*$))/g, (match, type, content) => {
    // Очищаем содержимое от | в начале строк
    const cleanContent = content.replace(/^\|\s*/gm, '').trim();
    const textHtml = marked.parse(cleanContent);
    return `<div class="notion-callout notion-callout-${type}">\n${textHtml}\n</div>\n\n`;
  });

  return processed;
}

/**
 * Функция для преобразования путей изображений в HTML
 * @param {string} html - HTML контент
 * @param {string} projectSlug - Slug проекта
 * @returns {string} HTML с исправленными путями
 */
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

/**
 * Обрабатывает .md файл и возвращает HTML и метаданные
 * @param {string} filePath - Путь к .md файлу
 * @param {string} projectSlug - Slug проекта
 * @returns {Promise<{html: string, metadata: Object}>}
 */
async function processMarkdownFile(filePath, projectSlug) {
  try {
    // Читаем файл
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Парсим frontmatter
    const { data: metadata, content } = matter(fileContent);

    // Обрабатываем кастомные блоки перед markdown
    let processedContent = await processCustomBlocks(content);

    // Конвертируем markdown в HTML с помощью marked
    const marked = await getMarked();
    let html = marked.parse(processedContent);

    // Добавляем классы к таблицам
    html = html.replace(/<table>/g, '<table class="notion-table">');

    // Исправляем пути изображений
    const fixedHtml = fixImagePaths(html, projectSlug);

    return {
      html: fixedHtml,
      metadata: metadata
    };

  } catch (error) {
    console.error(`Error processing markdown file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Находит все проекты в папке src/projects/
 * @returns {Array<{slug: string, mdPath: string, imagesPath: string}>}
 */
function findProjects() {
  const projectsDir = path.join(__dirname, 'src', 'projects');
  const projects = [];

  if (!fs.existsSync(projectsDir)) {
    return projects;
  }

  const items = fs.readdirSync(projectsDir);

  for (const item of items) {
    const itemPath = path.join(projectsDir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const slug = item;
      const mdPath = path.join(itemPath, `${slug}.md`);
      const imagesPath = path.join(itemPath, 'images');

      // Проверяем, существует ли .md файл
      if (fs.existsSync(mdPath)) {
        projects.push({
          slug,
          mdPath,
          imagesPath
        });
      }
    }
  }

  return projects;
}

module.exports = {
  processMarkdownFile,
  findProjects,
  processCustomBlocks,
  fixImagePaths
};