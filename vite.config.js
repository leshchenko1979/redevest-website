import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';
import { processMarkdownFile, findProjects } from './build-markdown.js';
import sharp from 'sharp';
import { imageOptimizerPlugin } from './vite-image-optimizer.js';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        scheme: resolve(__dirname, 'src/scheme.html'),
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
    // Plugin for HTML includes and CSS references
    {
      name: 'html-includes',
      transformIndexHtml(html, ctx) {
        // First handle includes
        let processedHtml = html.replace(
          /<!-- @include ([^>]+) -->/g,
          (match, partialPath) => {
            // Handle both relative paths (partials/) and absolute paths (from src/)
            let partialFile;
            if (partialPath.startsWith('partials/')) {
              partialFile = path.join(__dirname, 'src', partialPath);
            } else {
              // Assume it's a partial name, add .html extension
              partialFile = path.join(__dirname, 'src', 'partials', partialPath.endsWith('.html') ? partialPath : partialPath + '.html');
            }

            if (fs.existsSync(partialFile)) {
              return fs.readFileSync(partialFile, 'utf8');
            }
            console.warn(`Warning: Partial "${partialPath}" not found at "${partialFile}"`);
            return match;
          }
        );

        // Handle CSS references - will be updated after build
        return processedHtml;
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

              // Process template includes
              templateContent = templateContent.replace(
                /<!-- @include ([^>]+) -->/g,
                (match, partialPath) => {
                  // Handle both relative paths (partials/) and absolute paths (from src/)
                  let partialFile;
                  if (partialPath.startsWith('partials/')) {
                    partialFile = path.join(__dirname, 'src', partialPath);
                  } else {
                    // Assume it's a partial name, add .html extension
                    partialFile = path.join(__dirname, 'src', 'partials', partialPath.endsWith('.html') ? partialPath : partialPath + '.html');
                  }

                  if (fs.existsSync(partialFile)) {
                    return fs.readFileSync(partialFile, 'utf8');
                  }
                  console.warn(`Warning: Partial "${partialPath}" not found at "${partialFile}"`);
                  return match;
                }
              );

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

            // Process template includes
            templateContent = templateContent.replace(
              /<!-- @include ([^>]+) -->/g,
              (match, partialPath) => {
                // Handle both relative paths (partials/) and absolute paths (from src/)
                let partialFile;
                if (partialPath.startsWith('partials/')) {
                  partialFile = path.join(__dirname, 'src', partialPath);
                } else {
                  // Assume it's a partial name, add .html extension
                  partialFile = path.join(__dirname, 'src', 'partials', partialPath.endsWith('.html') ? partialPath : partialPath + '.html');
                }

                if (fs.existsSync(partialFile)) {
                  return fs.readFileSync(partialFile, 'utf8');
                }
                console.warn(`Warning: Partial "${partialPath}" not found at "${partialFile}"`);
                return match;
              }
            );

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
    // Plugin to update CSS and JS links in project pages after hashing
    {
      name: 'update-project-css-js-links',
      async writeBundle(options, bundle) {
        const projectsDir = path.join(options.dir || path.join(__dirname, 'dist'), 'projects');
        if (!fs.existsSync(projectsDir)) return;

        const projectFiles = fs.readdirSync(projectsDir).filter(file => file.endsWith('.html'));

        for (const projectFile of projectFiles) {
          const filePath = path.join(projectsDir, projectFile);
          let content = fs.readFileSync(filePath, 'utf8');

          // Update CSS links
          const cssFile = Object.keys(bundle).find(key => key.endsWith('.css'));
          if (cssFile) {
            content = content.replace(/href="\.\.\/input\.css"/g, `href="../${cssFile}"`);
            content = content.replace(/href="\/input\.css"/g, `href="/${cssFile}"`);
          }

          // Update JS links
          const jsFile = Object.keys(bundle).find(key => key.includes('common') && key.endsWith('.js'));
          if (jsFile) {
            content = content.replace(/src="\.\.\/common\.js"/g, `src="../${jsFile}"`);
            content = content.replace(/src="\/common\.js"/g, `src="/${jsFile}"`);
          }

          // Update favicon links
          const faviconFiles = Object.keys(bundle).filter(key =>
            (key.includes('favicon') || key.includes('apple-touch-icon')) &&
            (key.endsWith('.png') || key.endsWith('.ico'))
          );

          const mainFavicon = faviconFiles.find(key =>
            key.includes('favicon') &&
            !key.includes('-16x16') &&
            !key.includes('-32x32') &&
            !key.includes('apple-touch-icon')
          );

          if (mainFavicon) {
            content = content.replace(/src="\.\.\/assets\/favicon\.png"/g, `src="../${mainFavicon}"`);
            content = content.replace(/src="\/assets\/favicon\.png"/g, `src="/${mainFavicon}"`);
            content = content.replace(/href="\.\.\/assets\/favicon\.png"/g, `href="../${mainFavicon}"`);
            content = content.replace(/href="\/assets\/favicon\.png"/g, `href="/${mainFavicon}"`);
          }

          const favicon16 = faviconFiles.find(key => key.includes('favicon-16x16'));
          if (favicon16) {
            content = content.replace(/href="\.\.\/assets\/favicon-16x16\.png"/g, `href="../${favicon16}"`);
            content = content.replace(/href="\/assets\/favicon-16x16\.png"/g, `href="/${favicon16}"`);
          }

          const favicon32 = faviconFiles.find(key => key.includes('favicon-32x32'));
          if (favicon32) {
            content = content.replace(/href="\.\.\/assets\/favicon-32x32\.png"/g, `href="../${favicon32}"`);
            content = content.replace(/href="\/assets\/favicon-32x32\.png"/g, `href="/${favicon32}"`);
          }

          const appleTouch = faviconFiles.find(key => key.includes('apple-touch-icon'));
          if (appleTouch) {
            content = content.replace(/href="\.\.\/assets\/apple-touch-icon\.png"/g, `href="../${appleTouch}"`);
            content = content.replace(/href="\/assets\/apple-touch-icon\.png"/g, `href="/${appleTouch}"`);
          }

          fs.writeFileSync(filePath, content);
        }
      }
    },
    // Plugin to update JS links in main index.html after hashing
    {
      name: 'update-main-js-links',
      async writeBundle(options, bundle) {
        const indexPath = path.join(options.dir || path.join(__dirname, 'dist'), 'index.html');
        if (!fs.existsSync(indexPath)) return;

        let content = fs.readFileSync(indexPath, 'utf8');

        // Update common.js reference
        const jsFile = Object.keys(bundle).find(key => key.includes('common') && key.endsWith('.js'));
        if (jsFile) {
          content = content.replace(/src="common\.js"/g, `src="${jsFile}"`);
          content = content.replace(/src="\/common\.js"/g, `src="/${jsFile}"`);
        }

        // Update favicon references
        const faviconFiles = Object.keys(bundle).filter(key =>
          (key.includes('favicon') || key.includes('apple-touch-icon')) &&
          (key.endsWith('.png') || key.endsWith('.ico'))
        );

        // Update preload link - find the main favicon (not size-specific ones)
        const mainFavicon = faviconFiles.find(key =>
          key.includes('favicon') &&
          !key.includes('-16x16') &&
          !key.includes('-32x32') &&
          !key.includes('apple-touch-icon')
        );
        if (mainFavicon) {
          content = content.replace(/href="assets\/favicon\.png"/g, `href="${mainFavicon}"`);
          content = content.replace(/href="\/assets\/favicon\.png"/g, `href="/${mainFavicon}"`);
        }

        // Update icon links
        const favicon16 = faviconFiles.find(key => key.includes('favicon-16x16'));
        if (favicon16) {
          content = content.replace(/href="assets\/favicon-16x16\.png"/g, `href="${favicon16}"`);
          content = content.replace(/href="\/assets\/favicon-16x16\.png"/g, `href="/${favicon16}"`);
        }

        const favicon32 = faviconFiles.find(key => key.includes('favicon-32x32'));
        if (favicon32) {
          content = content.replace(/href="assets\/favicon-32x32\.png"/g, `href="${favicon32}"`);
          content = content.replace(/href="\/assets\/favicon-32x32\.png"/g, `href="/${favicon32}"`);
        }

        const appleTouch = faviconFiles.find(key => key.includes('apple-touch-icon'));
        if (appleTouch) {
          content = content.replace(/href="assets\/apple-touch-icon\.png"/g, `href="${appleTouch}"`);
          content = content.replace(/href="\/assets\/apple-touch-icon\.png"/g, `href="/${appleTouch}"`);
        }

        // Update img src references for favicons in header
        if (mainFavicon) {
          content = content.replace(/src="assets\/favicon\.png"/g, `src="${mainFavicon}"`);
          content = content.replace(/src="\/assets\/favicon\.png"/g, `src="/${mainFavicon}"`);
        }

        fs.writeFileSync(indexPath, content);
      }
    }
  ]
});