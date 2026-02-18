import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';
import { processMarkdownFile, findProjects } from './build-markdown.js';
import sharp from 'sharp';
import { imageOptimizerPlugin } from './vite-image-optimizer.js';

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const SITE_BASE = 'https://www.redevest.ru';

function getReportInputs() {
  const reportsDir = path.join(__dirname, 'src', 'reports');
  if (!fs.existsSync(reportsDir)) return {};
  const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.html'));
  return Object.fromEntries(
    files.map((f) => [path.basename(f, '.html'), path.join(reportsDir, f)])
  );
}

function replaceIncludes(html) {
  return html.replace(/<!-- @include ([^>]+) -->/g, (match, partialPath) => {
    const partialFile = partialPath.startsWith('partials/')
      ? path.join(srcDir, partialPath)
      : path.join(srcDir, 'partials', partialPath.endsWith('.html') ? partialPath : partialPath + '.html');
    if (fs.existsSync(partialFile)) {
      return fs.readFileSync(partialFile, 'utf8');
    }
    console.warn(`Warning: Partial "${partialPath}" not found at "${partialFile}"`);
    return match;
  });
}

function getBundleAssets(bundle) {
  return {
    cssFile: Object.keys(bundle).find((k) => k.endsWith('.css')),
    jsFile: Object.keys(bundle).find((k) => k.includes('common') && k.endsWith('.js')),
    faviconFiles: Object.keys(bundle).filter(
      (k) => (k.includes('favicon') || k.includes('apple-touch-icon')) && (k.endsWith('.png') || k.endsWith('.ico'))
    )
  };
}

function applyHashedLinks(content, assets, prefix) {
  const { cssFile, jsFile, faviconFiles } = assets;
  const mainFavicon = faviconFiles?.find((k) => k.includes('favicon') && !k.includes('-16x16') && !k.includes('-32x32') && !k.includes('apple-touch-icon'));
  const favicon16 = faviconFiles?.find((k) => k.includes('favicon-16x16'));
  const favicon32 = faviconFiles?.find((k) => k.includes('favicon-32x32'));
  const appleTouch = faviconFiles?.find((k) => k.includes('apple-touch-icon'));

  if (cssFile) {
    content = content.replace(/href="\.\.\/input\.css"/g, `href="${prefix}${cssFile}"`);
    content = content.replace(/href="input\.css"/g, `href="${prefix}${cssFile}"`);
    content = content.replace(/href="\/input\.css"/g, `href="/${cssFile}"`);
  }
  if (jsFile) {
    content = content.replace(/src="\.\.\/common\.js"/g, `src="${prefix}${jsFile}"`);
    content = content.replace(/src="common\.js"/g, `src="${prefix}${jsFile}"`);
    content = content.replace(/src="\/common\.js"/g, `src="/${jsFile}"`);
  }
  if (mainFavicon) {
    content = content.replace(/src="\.\.\/assets\/favicon\.png"/g, `src="${prefix}${mainFavicon}"`);
    content = content.replace(/src="assets\/favicon\.png"/g, `src="${prefix}${mainFavicon}"`);
    content = content.replace(/href="\.\.\/assets\/favicon\.png"/g, `href="${prefix}${mainFavicon}"`);
    content = content.replace(/href="assets\/favicon\.png"/g, `href="${prefix}${mainFavicon}"`);
    content = content.replace(/href="\/assets\/favicon\.png"/g, `href="/${mainFavicon}"`);
  }
  if (favicon16) {
    content = content.replace(/href="\.\.\/assets\/favicon-16x16\.png"/g, `href="${prefix}${favicon16}"`);
    content = content.replace(/href="assets\/favicon-16x16\.png"/g, `href="${prefix}${favicon16}"`);
    content = content.replace(/href="\/assets\/favicon-16x16\.png"/g, `href="/${favicon16}"`);
  }
  if (favicon32) {
    content = content.replace(/href="\.\.\/assets\/favicon-32x32\.png"/g, `href="${prefix}${favicon32}"`);
    content = content.replace(/href="assets\/favicon-32x32\.png"/g, `href="${prefix}${favicon32}"`);
    content = content.replace(/href="\/assets\/favicon-32x32\.png"/g, `href="/${favicon32}"`);
  }
  if (appleTouch) {
    content = content.replace(/href="\.\.\/assets\/apple-touch-icon\.png"/g, `href="${prefix}${appleTouch}"`);
    content = content.replace(/href="assets\/apple-touch-icon\.png"/g, `href="${prefix}${appleTouch}"`);
    content = content.replace(/href="\/assets\/apple-touch-icon\.png"/g, `href="/${appleTouch}"`);
  }
  return content;
}

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        scheme: resolve(__dirname, 'src/scheme.html'),
        ...getReportInputs(),
        common: resolve(__dirname, 'src/common.js')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    imageOptimizerPlugin(),
    {
      name: 'html-includes',
      transformIndexHtml(html) {
        return replaceIncludes(html);
      }
    },
    // Plugin for Markdown projects
    {
      name: 'markdown-projects',
      async buildStart() {
        console.log('Processing Markdown projects...');
        const projects = findProjects();

        for (const project of projects) {
          this.addWatchFile(project.mdPath);
          if (fs.existsSync(project.imagesPath)) {
            this.addWatchFile(project.imagesPath);
          }
        }

        // Watch template dependencies
        this.addWatchFile(path.join(__dirname, 'src', 'templates', 'project.html'));
        this.addWatchFile(path.join(__dirname, 'src', 'input.css'));
        this.addWatchFile(path.join(__dirname, 'src', 'common.js'));
        this.addWatchFile(path.join(__dirname, 'src', 'assets', 'favicon.png'));

        // Watch reports folder
        const reportsDir = path.join(__dirname, 'src', 'reports');
        if (fs.existsSync(reportsDir)) {
          fs.readdirSync(reportsDir).filter((f) => f.endsWith('.html')).forEach((f) => {
            this.addWatchFile(path.join(reportsDir, f));
          });
        }

        // Watch all partials
        const partialsDir = path.join(__dirname, 'src', 'partials');
        if (fs.existsSync(partialsDir)) {
          const partials = fs.readdirSync(partialsDir, { recursive: true });
          for (const partial of partials) {
            const partialPath = path.join(partialsDir, partial);
            if (fs.statSync(partialPath).isFile() && partial.endsWith('.html')) {
              this.addWatchFile(partialPath);
            }
          }
        }
      },
      configureServer(server) {
        // Watch markdown files and images in dev mode
        const projects = findProjects();
        for (const project of projects) {
          server.watcher.add(project.mdPath);
          if (fs.existsSync(project.imagesPath)) {
            server.watcher.add(project.imagesPath);
          }
        }

        // Handle markdown file changes in dev mode
        server.watcher.on('change', async (filePath) => {
          if (filePath.endsWith('.md') && filePath.includes('/projects/')) {
            console.log(`Markdown file changed: ${filePath}`);
            // Force reload of the page by invalidating the module
            const slug = path.basename(path.dirname(filePath));
            // Clear any cached processing for this project
            console.log(`Project ${slug} updated, page will reload on next request`);
          }
        });

        // Handle project pages in dev mode
        server.middlewares.use('/projects', async (req, res, next) => {
          const slug = req.url.replace('/', '').replace('.html', '');
          const projects = findProjects();
          const project = projects.find(p => p.slug === slug);

          if (project) {
            try {
              const { html, metadata } = await processMarkdownFile(project.mdPath, project.slug);

              // Read project template
              const templatePath = path.join(__dirname, 'src', 'templates', 'project.html');
              let templateContent = fs.readFileSync(templatePath, 'utf8');

              templateContent = replaceIncludes(templateContent);

              // Replace content
              templateContent = templateContent.replace(/{{title}}/g, metadata.title || project.slug);
              templateContent = templateContent.replace('{{content}}', html);
              templateContent = templateContent.replace(/{{slug}}/g, project.slug);
              templateContent = templateContent.replace(/{{bot_link}}/g, metadata.bot_link || '');
              templateContent = templateContent.replace(/{{date}}/g, metadata.date || '');

              // Fix paths for project pages (dev mode)
              templateContent = templateContent.replace(
                /src="assets\//g,
                'src="/assets/'
              );
              templateContent = templateContent.replace(
                /src="common\.js/g,
                'src="/common.js'
              );

              // Add cache control meta tags
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

              res.setHeader('Content-Type', 'text/html');
              res.end(templateContent);
              return;
            } catch (error) {
              console.error(`Error processing project ${project.slug}:`, error.message);
              res.statusCode = 500;
              res.end('Internal Server Error');
              return;
            }
          }

          next();
        });

        // Handle project images in dev mode
        server.middlewares.use('/assets/projects', (req, res, next) => {
          const urlParts = req.url.split('/');
          if (urlParts.length >= 4 && urlParts[2] === 'images') {
            const projectSlug = urlParts[1];
            const imageName = decodeURIComponent(urlParts[3]); // Decode URL-encoded filenames

            // First try to serve optimized images from src/assets/projects/
            let imagePath = path.join(__dirname, 'src', 'assets', 'projects', projectSlug, 'images', imageName);

            // Fall back to original images in src/projects/
            if (!fs.existsSync(imagePath)) {
              imagePath = path.join(__dirname, 'src', 'projects', projectSlug, 'images', imageName);
            }

            if (fs.existsSync(imagePath)) {
              const ext = path.extname(imageName).toLowerCase();
              const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                ext === '.png' ? 'image/png' :
                  ext === '.gif' ? 'image/gif' :
                    ext === '.webp' ? 'image/webp' :
                      ext === '.avif' ? 'image/avif' : 'application/octet-stream';

              res.setHeader('Content-Type', contentType);
              fs.createReadStream(imagePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
      async generateBundle() {
        // Process and generate project pages for build
        const projects = findProjects();

        for (const project of projects) {
          try {
            const { html, metadata } = await processMarkdownFile(project.mdPath, project.slug);

            // Read project template
            const templatePath = path.join(__dirname, 'src', 'templates', 'project.html');
            let templateContent = fs.readFileSync(templatePath, 'utf8');

            templateContent = replaceIncludes(templateContent);

            // Replace content
            templateContent = templateContent.replace(/{{title}}/g, metadata.title || project.slug);
            templateContent = templateContent.replace('{{content}}', html);
            templateContent = templateContent.replace(/{{slug}}/g, project.slug);
            templateContent = templateContent.replace(/{{bot_link}}/g, metadata.bot_link || '');
            templateContent = templateContent.replace(/{{date}}/g, metadata.date || '');

            // Fix paths for project pages
            templateContent = templateContent.replace(
              /href="index\.html/g,
              'href="../index.html'
            );
            templateContent = templateContent.replace(
              /href="scheme\.html/g,
              'href="../scheme.html'
            );
            templateContent = templateContent.replace(
              /src="assets\//g,
              'src="../assets/'
            );
            templateContent = templateContent.replace(
              /src="common\.js/g,
              'src="../common.js'
            );

            // Add cache control meta tags
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

            // Emit project page
            this.emitFile({
              type: 'asset',
              fileName: `projects/${project.slug}.html`,
              source: templateContent
            });

          } catch (error) {
            console.error(`Error processing project ${project.slug}:`, error.message);
          }
        }
      }
    },
    // Plugin for favicon generation
    {
      name: 'favicon-generator',
      async generateBundle() {
        const sourceFavicon = path.join(__dirname, 'src', 'assets', 'favicon.png');

        if (fs.existsSync(sourceFavicon)) {
          try {
            // Generate different favicon sizes
            const sizes = [
              { size: 16, name: 'favicon-16x16.png' },
              { size: 32, name: 'favicon-32x32.png' },
              { size: 180, name: 'apple-touch-icon.png' }
            ];

            for (const { size, name } of sizes) {
              const buffer = await sharp(sourceFavicon)
                .resize(size, size)
                .png()
                .toBuffer();

              this.emitFile({
                type: 'asset',
                fileName: `assets/${name}`,
                source: buffer
              });
            }

            console.log('Favicons generated successfully');
          } catch (error) {
            console.log('Error generating favicons:', error.message);
          }
        }
      }
    },
    {
      name: 'update-hashed-links',
      async writeBundle(options, bundle) {
        const dir = options.dir || distDir;
        const assets = getBundleAssets(bundle);

        // Project pages (dist/projects/*.html) use ../ prefix
        const projectsDir = path.join(dir, 'projects');
        if (fs.existsSync(projectsDir)) {
          for (const f of fs.readdirSync(projectsDir).filter((file) => file.endsWith('.html'))) {
            const filePath = path.join(projectsDir, f);
            let content = fs.readFileSync(filePath, 'utf8');
            fs.writeFileSync(filePath, applyHashedLinks(content, assets, '../'));
          }
        }

        // Report pages (dist/reports/*.html) use / prefix
        const reportsDir = path.join(dir, 'reports');
        if (fs.existsSync(reportsDir)) {
          for (const f of fs.readdirSync(reportsDir).filter((file) => file.endsWith('.html'))) {
            const filePath = path.join(reportsDir, f);
            let content = fs.readFileSync(filePath, 'utf8');
            fs.writeFileSync(filePath, applyHashedLinks(content, assets, '/'));
          }
        }

        // Root HTML files (index, scheme) use same-dir prefix
        for (const name of ['index.html', 'scheme.html']) {
          const filePath = path.join(dir, name);
          if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            fs.writeFileSync(filePath, applyHashedLinks(content, assets, ''));
          }
        }
      }
    },
    {
      name: 'sitemap-robots',
      async generateBundle() {
        const urls = [`${SITE_BASE}/`, `${SITE_BASE}/scheme.html`];

        const projects = findProjects();
        for (const p of projects) {
          urls.push(`${SITE_BASE}/projects/${p.slug}.html`);
        }

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>${loc.endsWith('/') ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

        const robots = `User-agent: *
Allow: /
Disallow: /reports/

Sitemap: ${SITE_BASE}/sitemap.xml
`;

        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      }
    }
  ]
});