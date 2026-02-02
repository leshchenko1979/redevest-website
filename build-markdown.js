const fs = require('fs');
const path = require('path');
const matter = require('gray-matter').default || require('gray-matter');
const marked = require('marked');

/**
 * Обрабатывает кастомные блоки в markdown перед конвертацией
 * @param {string} content - Markdown контент
 * @returns {string} Обработанный контент
 */
// Constants for custom block patterns
const BLOCK_PATTERNS = {
  toggle: /\[\[toggle\s*\|\s*(.*?)\]\]\n([\s\S]*?)(?=\n\[\[|\n*$)/g,
  columns: /\[\[columns\]\]([\s\S]*?)\[\[\/columns\]\]/g,
  columnsLegacy: /(\[\[columns\]\]\s*\|\s*\[\[column\]\][\s\S]*?)(?=\n(?:\[\[|#|$))/g,
  callout: /\[\[callout\s*\|\s*(\w+)\]\]\r?\n([\s\S]*?)(?=\r?\n(?:\[\[|##|---|$))/g,
  column: /\[\[column\]\]/g
};

// Constants for HTML templates
const HTML_TEMPLATES = {
  toggle: (title, bodyHtml) => `<details class="notion-toggle">\n<summary>${title}</summary>\n<div>\n${bodyHtml}\n</div>\n</details>\n\n`,
  columns: (columnHtml) => `<div class="notion-columns">${columnHtml}</div>\n\n`,
  column: (contentHtml) => `<div class="notion-column">${contentHtml}</div>`,
  callout: (type, textHtml) => `<div class="notion-callout notion-callout-${type}">\n${textHtml}\n</div>\n\n`
};

/**
 * Cleans content by removing pipe characters from the beginning and end of lines
 * @param {string} content - Content to clean
 * @returns {string} Cleaned content
 */
function cleanPipeContent(content) {
  return content
    .trim()
    .replace(/^\|\s*/gm, '') // Remove leading pipes
    .replace(/\|\s*$/gm, '') // Remove trailing pipes
    .replace(/^\|\s*$/gm, '') // Remove lines that are only pipes
    .trim();
}

/**
 * Processes toggle blocks in markdown content
 * @param {string} content - Markdown content
 * @returns {string} Processed content
 */
function processToggleBlocks(content) {
  return content.replace(BLOCK_PATTERNS.toggle, (match, title, blockContent) => {
    const cleanBody = cleanPipeContent(blockContent);
    const bodyHtml = marked.parse(cleanBody);
    return HTML_TEMPLATES.toggle(title, bodyHtml);
  });
}

/**
 * Processes modern column blocks in markdown content
 * @param {string} content - Markdown content
 * @returns {string} Processed content
 */
function processColumnBlocks(content) {
  return content.replace(BLOCK_PATTERNS.columns, (match, blockContent) => {
    const columns = blockContent.split(BLOCK_PATTERNS.column).slice(1);
    const columnHtml = columns
      .map(col => {
        const cleanContent = cleanPipeContent(col);
        const contentHtml = marked.parse(cleanContent);
        return HTML_TEMPLATES.column(contentHtml);
      })
      .join('');
    return HTML_TEMPLATES.columns(columnHtml);
  });
}

/**
 * Processes legacy column blocks in markdown content
 * @param {string} content - Markdown content
 * @returns {string} Processed content
 */
function processLegacyColumnBlocks(content) {
  return content.replace(BLOCK_PATTERNS.columnsLegacy, (match) => {
    const parts = match.split(BLOCK_PATTERNS.column);
    const columns = parts.slice(1); // Skip part before first [[column]]

    const columnHtml = columns
      .map(col => {
        const cleanContent = cleanPipeContent(col);
        const contentHtml = marked.parse(cleanContent);
        return HTML_TEMPLATES.column(contentHtml);
      })
      .join('');

    return HTML_TEMPLATES.columns(columnHtml);
  });
}

/**
 * Processes callout blocks in markdown content
 * @param {string} content - Markdown content
 * @returns {string} Processed content
 */
function processCalloutBlocks(content) {
  return content.replace(BLOCK_PATTERNS.callout, (match, type, blockContent) => {
    const cleanContent = cleanPipeContent(blockContent);
    const textHtml = marked.parse(cleanContent);
    return HTML_TEMPLATES.callout(type, textHtml);
  });
}

/**
 * Processes custom blocks in markdown content
 * @param {string} content - Markdown content
 * @returns {string} Processed content with custom blocks converted to HTML
 */
function processCustomBlocks(content) {
  let processed = content;

  // Process blocks in order (toggle first to avoid conflicts)
  processed = processToggleBlocks(processed);
  processed = processColumnBlocks(processed);
  processed = processLegacyColumnBlocks(processed);
  processed = processCalloutBlocks(processed);

  return processed;
}

// Constants for responsive image sizes
const RESPONSIVE_SIZES = [
  { width: 800, descriptor: '800w' },
  { width: 1200, descriptor: '1200w' },
  { width: 1600, descriptor: '1600w' }
];

// HTML templates for picture elements
const PICTURE_TEMPLATES = {
  responsive: (pathWithoutExt, alt, loading, classAttr) => `<picture>
  <source srcset="${pathWithoutExt}-800.avif 800w, ${pathWithoutExt}-1200.avif 1200w, ${pathWithoutExt}-1600.avif 1600w" sizes="(max-width: 768px) 800px, (max-width: 1200px) 1200px, 1600px" type="image/avif">
  <source srcset="${pathWithoutExt}-800.webp 800w, ${pathWithoutExt}-1200.webp 1200w, ${pathWithoutExt}-1600.webp 1600w" sizes="(max-width: 768px) 800px, (max-width: 1200px) 1200px, 1600px" type="image/webp">
  <img src="${pathWithoutExt}.jpg" alt="${alt}" loading="${loading}"${classAttr}>
</picture>`,
  standard: (pathWithoutExt, alt, loading, classAttr) => `<picture>
  <source srcset="${pathWithoutExt}.avif" type="image/avif">
  <source srcset="${pathWithoutExt}.webp" type="image/webp">
  <img src="${pathWithoutExt}.jpg" alt="${alt}" loading="${loading}"${classAttr}>
</picture>`
};

/**
 * Extracts attributes from an img tag
 * @param {string} imgTag - The complete img tag
 * @returns {object} Object with extracted attributes
 */
function extractImageAttributes(imgTag) {
  const altMatch = imgTag.match(/alt="([^"]*)"/);
  const loadingMatch = imgTag.match(/loading="([^"]*)"/);
  const classMatch = imgTag.match(/class="([^"]*)"/);

  return {
    alt: altMatch ? altMatch[1] : '',
    loading: loadingMatch ? loadingMatch[1] : 'lazy',
    classAttr: classMatch ? ` class="${classMatch[1]}"` : ''
  };
}

/**
 * Checks if responsive versions of an image exist
 * @param {string} pathWithoutExt - Image path without extension
 * @returns {boolean} True if responsive versions exist
 */
function hasResponsiveVersions(pathWithoutExt) {
  const isDev = process.env.NODE_ENV !== 'production';
  const baseDir = isDev ? 'src' : 'dist';
  // Remove leading ../ from pathWithoutExt to get the relative path from src/dist
  const relativePath = pathWithoutExt.replace(/^(\.\.\/)*/, '');
  const responsiveWebpPath = path.join(__dirname, baseDir, `${relativePath}-800.webp`);

  try {
    return fs.existsSync(responsiveWebpPath);
  } catch (error) {
    return false;
  }
}

/**
 * Creates a picture element for an image with modern format support
 * @param {string} basePath - Base path to the image
 * @param {object} attrs - Image attributes (alt, loading, classAttr)
 * @returns {string} HTML picture element
 */
function createPictureElement(basePath, attrs) {
  const pathWithoutExt = basePath.replace(/\.[^.]+$/, '');
  const hasResponsive = hasResponsiveVersions(pathWithoutExt);

  return hasResponsive
    ? PICTURE_TEMPLATES.responsive(pathWithoutExt, attrs.alt, attrs.loading, attrs.classAttr)
    : PICTURE_TEMPLATES.standard(pathWithoutExt, attrs.alt, attrs.loading, attrs.classAttr);
}

/**
 * Fixes image paths in HTML content and adds modern format support
 * @param {string} html - HTML content
 * @param {string} projectSlug - Project slug
 * @returns {string} HTML with fixed image paths and modern formats
 */
function fixImagePaths(html, projectSlug) {
  return html.replace(/<img([^>]*?)src="([^"]*)"([^>]*?)>/g, (match, beforeSrc, src, afterSrc) => {
    // Only process relative paths that start with images/
    if (src.startsWith('images/') || src.startsWith('./images/')) {
      const basePath = `../projects/${projectSlug}/${src.replace('./', '')}`;
      const attrs = extractImageAttributes(match);
      return createPictureElement(basePath, attrs);
    }
    return match;
  });
}

/**
 * Enhances HTML content with additional styling and features
 * @param {string} html - Raw HTML content
 * @returns {string} Enhanced HTML content
 */
function enhanceHtmlContent(html) {
  let enhanced = html;

  // Add classes to tables and wrap in scrollable containers
  enhanced = enhanced.replace(/<table>/g, '<div class="notion-table-container"><table class="notion-table">');
  enhanced = enhanced.replace(/<\/table>/g, '</table></div>');

  return enhanced;
}

/**
 * Processes a markdown file and returns HTML and metadata
 * @param {string} filePath - Path to the markdown file
 * @param {string} projectSlug - Project slug for image path resolution
 * @returns {Promise<{html: string, metadata: Object}>} Processed content
 */
async function processMarkdownFile(filePath, projectSlug) {
  try {
    // Read and parse file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: metadata, content } = matter(fileContent);

    // Process custom blocks and convert to HTML
    const processedContent = processCustomBlocks(content);
    const rawHtml = marked.parse(processedContent);

    // Enhance HTML with additional features
    const enhancedHtml = enhanceHtmlContent(rawHtml);

    // Fix image paths for modern formats
    const finalHtml = fixImagePaths(enhancedHtml, projectSlug);

    return {
      html: finalHtml,
      metadata: metadata || {}
    };

  } catch (error) {
    console.error(`Error processing markdown file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Represents a project with its metadata
 * @typedef {object} ProjectInfo
 * @property {string} slug - Project slug/identifier
 * @property {string} mdPath - Path to the markdown file
 * @property {string} imagesPath - Path to the images directory
 */

/**
 * Finds all valid projects in the src/projects directory
 * @returns {ProjectInfo[]} Array of project information objects
 */
function findProjects() {
  const projectsDir = path.join(__dirname, 'src', 'projects');
  const projects = [];

  try {
    // Check if projects directory exists
    if (!fs.existsSync(projectsDir)) {
      console.warn('Projects directory not found:', projectsDir);
      return projects;
    }

    const items = fs.readdirSync(projectsDir);

    for (const item of items) {
      try {
        const itemPath = path.join(projectsDir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          const slug = item;
          const mdPath = path.join(itemPath, `${slug}.md`);
          const imagesPath = path.join(itemPath, 'images');

          // Only include projects that have a markdown file
          if (fs.existsSync(mdPath)) {
            projects.push({
              slug,
              mdPath,
              imagesPath
            });
          }
        }
      } catch (error) {
        console.warn(`Error processing project directory ${item}:`, error.message);
        // Continue processing other projects
      }
    }

  } catch (error) {
    console.error('Error scanning projects directory:', error.message);
  }

  return projects;
}

module.exports = {
  processMarkdownFile,
  findProjects,
  processCustomBlocks,
  fixImagePaths
};