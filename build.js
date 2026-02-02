const { execSync } = require('child_process');
const fs = require('fs-extra');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const { processMarkdownFile, findProjects } = require('./build-markdown');

// Clean up old hashed CSS files
console.log('Cleaning up old CSS files...');
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  files.forEach(file => {
    if (file.startsWith('output.') && file.endsWith('.css') && file !== 'output.css') {
      fs.removeSync(path.join(distDir, file));
    }
  });
}

// Ensure dist directory exists
fs.ensureDirSync(distDir);

// Read HTML templates and update CSS references
const srcDir = path.join(__dirname, 'src');
const partialsDir = path.join(srcDir, 'partials');
const htmlFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.html'));

// Read partials recursively
const partials = {};

function readPartialsRecursively(dir, basePath = '') {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      readPartialsRecursively(fullPath, basePath ? `${basePath}/${item}` : item);
    } else if (item.endsWith('.html')) {
      const partialName = basePath ? `${basePath}-${path.parse(item).name}` : path.parse(item).name;
      partials[partialName] = fs.readFileSync(fullPath, 'utf8');
    }
  });
}

readPartialsRecursively(partialsDir);

htmlFiles.forEach(file => {
  let htmlContent = fs.readFileSync(path.join(srcDir, file), 'utf8');

  // Process HTML inclusions
  htmlContent = htmlContent.replace(
    /<!-- @include ([^>]+) -->/g,
    (match, partialPath) => {
      const partialName = partialPath.replace(/\//g, '-').replace(/\.html$/, '');
      if (partials[partialName]) {
        return partials[partialName];
      } else {
        console.warn(`Warning: Partial "${partialName}" not found for path "${partialPath}"`);
        return match;
      }
    }
  );

  // Replace CSS link with placeholder (will be updated after CSS build)
  htmlContent = htmlContent.replace(
    /href="output\.css"/g,
    `href="output.PLACEHOLDER.css"`
  );

  // Add cache control meta tags for HTML
  const cacheControlMeta = `
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
`;

  // Insert cache control meta tags after the charset meta tag if not already present
  if (!htmlContent.includes('http-equiv="Cache-Control"')) {
    htmlContent = htmlContent.replace(
      /(<meta charset="UTF-8">)/,
      `$1${cacheControlMeta}`
    );
  }

  // Write updated HTML to dist
  fs.writeFileSync(path.join(distDir, file), htmlContent);
  console.log(`Processed ${file}`);
});

// Copy assets to dist
console.log('Copying assets...');
const srcAssetsDir = path.join(__dirname, 'src/assets');
const distAssetsDir = path.join(__dirname, 'dist/assets');

if (fs.existsSync(srcAssetsDir)) {
  fs.copySync(srcAssetsDir, distAssetsDir);
}

// Process projects
console.log('Processing projects...');
const projectsDir = path.join(distDir, 'projects');
const projectsAssetsDir = path.join(distAssetsDir, 'projects');

// Create directories
fs.ensureDirSync(projectsDir);
fs.ensureDirSync(projectsAssetsDir);

// Find and process all projects
const projects = findProjects();

(async () => {
  for (const project of projects) {
    console.log(`Processing project: ${project.slug}`);

    try {
      // Process markdown file
      const { html, metadata } = await processMarkdownFile(project.mdPath, project.slug);

      // Read project template
      const templatePath = path.join(srcDir, 'templates', 'project.html');
      if (!fs.existsSync(templatePath)) {
        console.warn(`Template not found: ${templatePath}. Skipping project ${project.slug}`);
        continue;
      }

      let templateContent = fs.readFileSync(templatePath, 'utf8');

      // Process template inclusions (header, footer)
      templateContent = templateContent.replace(
        /<!-- @include ([^>]+) -->/g,
        (match, partialPath) => {
          const partialName = partialPath.replace(/\//g, '-').replace(/\.html$/, '');
          if (partials[partialName]) {
            return partials[partialName];
          } else {
            console.warn(`Warning: Partial "${partialName}" not found for path "${partialPath}" in project ${project.slug}`);
            return match;
          }
        }
      );

      // Replace placeholders with content and metadata
      templateContent = templateContent.replace(/{{title}}/g, metadata.title || project.slug);
      templateContent = templateContent.replace('{{content}}', html);
      templateContent = templateContent.replace(/{{slug}}/g, project.slug);
      templateContent = templateContent.replace(/{{bot_link}}/g, metadata.bot_link || '');
      templateContent = templateContent.replace(/{{date}}/g, metadata.date || '');

      // Replace CSS link with hashed version
      templateContent = templateContent.replace(
        /href="output\.css"/g,
        `href="../${hashedCssFilename}"`
      );

      // Fix navigation links for project pages (add ../ prefix)
      templateContent = templateContent.replace(
        /href="index\.html/g,
        'href="../index.html'
      );
      templateContent = templateContent.replace(
        /href="scheme\.html/g,
        'href="../scheme.html'
      );

      // Fix asset paths for project pages (add ../ prefix)
      templateContent = templateContent.replace(
        /src="assets\//g,
        'src="../assets/'
      );
      templateContent = templateContent.replace(
        /src="common\.js/g,
        'src="../common.js'
      );

      // Add cache control meta tags for project pages
      const cacheControlMeta = `
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
`;
      if (!templateContent.includes('http-equiv="Cache-Control"')) {
        templateContent = templateContent.replace(
          /(<meta charset="UTF-8">)/,
          `$1${cacheControlMeta}`
        );
      }

      // Save processed HTML
      const outputPath = path.join(projectsDir, `${project.slug}.html`);
      fs.writeFileSync(outputPath, templateContent);
      console.log(`Generated: projects/${project.slug}.html`);

      // Copy images if they exist
      if (fs.existsSync(project.imagesPath)) {
        const destImagesPath = path.join(projectsAssetsDir, project.slug, 'images');
        fs.ensureDirSync(destImagesPath);
        fs.copySync(project.imagesPath, destImagesPath);
        console.log(`Copied images for project: ${project.slug}`);
      }

    } catch (error) {
      console.error(`Error processing project ${project.slug}:`, error.message);
    }
  }
})();

// Copy JavaScript files to dist
console.log('Copying JavaScript files...');
const jsFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.js'));
jsFiles.forEach(jsFile => {
  fs.copySync(path.join(srcDir, jsFile), path.join(distDir, jsFile));
  console.log(`Copied ${jsFile}`);
});

// Generate favicons from the main logo
console.log('Generating favicons...');
const sourceFavicon = path.join(srcAssetsDir, 'favicon.png');
const distFaviconDir = distAssetsDir;

if (fs.existsSync(sourceFavicon)) {
  (async () => {
    try {
      // Create 16x16 favicon
      await sharp(sourceFavicon)
        .resize(16, 16)
        .png()
        .toFile(path.join(distFaviconDir, 'favicon-16x16.png'));

      // Create 32x32 favicon
      await sharp(sourceFavicon)
        .resize(32, 32)
        .png()
        .toFile(path.join(distFaviconDir, 'favicon-32x32.png'));

      // Create Apple touch icon (180x180)
      await sharp(sourceFavicon)
        .resize(180, 180)
        .png()
        .toFile(path.join(distFaviconDir, 'apple-touch-icon.png'));

      console.log('Favicons generated successfully');
    } catch (error) {
      console.log('Error generating favicons:', error.message);
    }
  })();
}

// Create _headers file for GitHub Pages cache control
const headersContent = `/*
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache
  Expires: 0

*.css
  Cache-Control: public, max-age=31536000, immutable

*.js
  Cache-Control: public, max-age=31536000, immutable

*.png
  Cache-Control: public, max-age=31536000, immutable

*.jpg
  Cache-Control: public, max-age=31536000, immutable

*.svg
  Cache-Control: public, max-age=31536000, immutable
`;

fs.writeFileSync('dist/_headers', headersContent);

// Build CSS with Tailwind after HTML generation (so it can scan the generated HTML)
console.log('Building CSS...');
execSync('npx tailwindcss -i src/input.css -o dist/temp.css --content "src/**/*.{html,js}" "dist/**/*.html" --minify', { stdio: 'inherit' });

// Read the built CSS file
const cssContent = fs.readFileSync('dist/temp.css');
const cssHash = crypto.createHash('md5').update(cssContent).digest('hex').substring(0, 8);
const hashedCssFilename = `output.${cssHash}.css`;

// Rename CSS file with hash
fs.renameSync('dist/temp.css', `dist/${hashedCssFilename}`);

// Update CSS references in generated HTML files
console.log('Updating CSS references in HTML files...');
const generatedHtmlFiles = fs.readdirSync(distDir).filter(file => file.endsWith('.html'));
generatedHtmlFiles.forEach(file => {
  const filePath = path.join(distDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/href="output\.PLACEHOLDER\.css"/g, `href="${hashedCssFilename}"`);
  fs.writeFileSync(filePath, content);
});

// Copy CNAME file for GitHub Pages custom domain
if (fs.existsSync('CNAME')) {
  fs.copySync('CNAME', 'dist/CNAME');
}

console.log(`Built successfully! CSS hash: ${cssHash}`);
console.log(`CSS file: ${hashedCssFilename}`);