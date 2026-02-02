import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';
import { processMarkdownFile, findProjects } from './build-markdown.js';
import sharp from 'sharp';

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
                  const partialFile = path.join(__dirname, 'src', partialPath);
                  if (fs.existsSync(partialFile)) {
                    return fs.readFileSync(partialFile, 'utf8');
                  }
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

            const imagePath = path.join(__dirname, 'src', 'projects', projectSlug, 'images', imageName);
            if (fs.existsSync(imagePath)) {
              const ext = path.extname(imageName).toLowerCase();
              const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                                ext === '.png' ? 'image/png' :
                                ext === '.gif' ? 'image/gif' : 'application/octet-stream';

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

            // Copy project images
            if (fs.existsSync(project.imagesPath)) {
              const images = fs.readdirSync(project.imagesPath);
              for (const image of images) {
                const imagePath = path.join(project.imagesPath, image);
                const imageContent = fs.readFileSync(imagePath);
                this.emitFile({
                  type: 'asset',
                  fileName: `assets/projects/${project.slug}/images/${image}`,
                  source: imageContent
                });
              }
            }

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
          }

          // Update JS links
          const jsFile = Object.keys(bundle).find(key => key.includes('common') && key.endsWith('.js'));
          if (jsFile) {
            content = content.replace(/src="\.\.\/common\.js"/g, `src="../${jsFile}"`);
          }

          fs.writeFileSync(filePath, content);
        }
      }
    }
  ]
});