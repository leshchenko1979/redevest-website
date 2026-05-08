import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { processMarkdownFile, findProjects } from './build-markdown.js';
import sharp from 'sharp';
import { imageOptimizerPlugin } from './vite-image-optimizer.js';
import { renderProjectPageHtml, renderLegalPageHtml } from './vite-build-pages.js';

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const SITE_BASE = 'https://rede-vest.ru';
/** Referenced only from emitted project HTML, not imported — must be copied into dist/assets */
const MONO_LOGO_SVGS = ['telegram-logo-mono.svg', 'max-logo-mono.svg'];

const LEGAL_PAGES = [
  { slug: 'events', md: 'legal/events.md' },
  { slug: 'privacy', md: 'legal/privacy.md' },
  { slug: 'community-rules', md: 'legal/community-rules.md' }
];

function buildLegalCtaBlocks(metadata) {
  const link = metadata.cta_link;
  const empty = { cta_hero: '', cta_footer: '' };
  if (!link || !metadata.cta_button) return empty;
  const cta_hero = `
                    <div class="flex justify-center">
                        <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-lg btn-primary">
                            ${metadata.cta_button}
                        </a>
                    </div>`;
  const cta_footer = `
                    <div class="mt-16 text-center">
                        <div class="bg-surface p-8 rounded-sm border border-gray-100">
                            <h3 class="text-2xl font-serif font-bold text-primary mb-4">${metadata.cta_heading || ''}</h3>
                            <p class="text-gray-600 mb-6">${metadata.cta_text || ''}</p>
                            <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-lg btn-primary">
                                ${metadata.cta_button}
                            </a>
                        </div>
                    </div>`;
  return { cta_hero, cta_footer };
}

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

function getBundleAssets(bundle, onError) {
  const entries = Object.entries(bundle);
  const chunks = entries
    .map(([fileName, output]) => ({ fileName, output }))
    .filter(({ output }) => output.type === 'chunk');
  const assets = entries
    .map(([fileName, output]) => ({ fileName, output }))
    .filter(({ output }) => output.type === 'asset');

  const commonByName = chunks.find(({ output }) => output.name === 'common');
  const commonChunk = commonByName || chunks.find(({ output }) => {
    if (!output.isEntry || !output.facadeModuleId) return false;
    const normalized = path.normalize(output.facadeModuleId);
    return normalized.endsWith(`${path.sep}common.js`) || normalized.endsWith(`${path.sep}src${path.sep}common.js`);
  });

  if (!commonChunk) {
    const candidates = chunks.map(({ fileName, output }) => `${fileName} (name=${output.name || 'n/a'})`).join(', ');
    onError(`Could not determine common JS chunk. Candidates: ${candidates || 'none'}`);
  }

  const cssCandidates = assets.filter(({ fileName }) => fileName.endsWith('.css')).map(({ fileName }) => fileName);
  if (cssCandidates.length === 0) {
    onError('Could not determine CSS asset: no .css files emitted.');
  }
  if (cssCandidates.length > 1) {
    onError(`Could not determine CSS asset: multiple .css files emitted: ${cssCandidates.join(', ')}`);
  }

  return {
    cssFile: cssCandidates[0],
    jsFile: commonChunk.fileName,
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
        main: path.resolve(__dirname, 'src/index.html'),
        scheme: path.resolve(__dirname, 'src/scheme.html'),
        ...getReportInputs(),
        common: path.resolve(__dirname, 'src/common.js')
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
        this.addWatchFile(path.join(__dirname, 'src', 'templates', 'legal.html'));
        for (const lp of LEGAL_PAGES) {
          this.addWatchFile(path.join(__dirname, 'src', lp.md));
        }
        this.addWatchFile(path.join(__dirname, 'src', 'input.css'));
        this.addWatchFile(path.join(__dirname, 'src', 'common.js'));
        this.addWatchFile(path.join(__dirname, 'src', 'assets', 'favicon.png'));
        for (const name of MONO_LOGO_SVGS) {
          const logoPath = path.join(__dirname, 'src', 'assets', name);
          if (fs.existsSync(logoPath)) {
            this.addWatchFile(logoPath);
          }
        }

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
        const srcProjectsDir = path.join(__dirname, 'src', 'projects');
        const srcLegalDir = path.join(__dirname, 'src', 'legal');
        const templatesDir = path.join(__dirname, 'src', 'templates');

        // Watch whole trees so new projects/legal pages are picked up without restart
        if (fs.existsSync(srcProjectsDir)) server.watcher.add(srcProjectsDir);
        if (fs.existsSync(srcLegalDir)) server.watcher.add(srcLegalDir);

        // Watch markdown files and images in dev mode
        const projects = findProjects();
        for (const project of projects) {
          server.watcher.add(project.mdPath);
          if (fs.existsSync(project.imagesPath)) {
            server.watcher.add(project.imagesPath);
          }
        }
        for (const lp of LEGAL_PAGES) {
          const mdPath = path.join(__dirname, 'src', lp.md);
          if (fs.existsSync(mdPath)) server.watcher.add(mdPath);
        }

        const triggersMarkdownPageReload = (filePath) => {
          const fp = path.normalize(filePath);
          if (fp.endsWith('.md')) {
            return fp.includes(`${path.sep}projects${path.sep}`) || fp.includes(`${path.sep}legal${path.sep}`);
          }
          if (fp.endsWith('project.html') || fp.endsWith('legal.html')) {
            return fp.startsWith(path.normalize(templatesDir));
          }
          return false;
        };

        // Markdown / templates drive HTML via middleware; tell the client to reload so the browser shows rebuilt HTML
        server.watcher.on('change', (filePath) => {
          if (!triggersMarkdownPageReload(filePath)) return;
          if (filePath.endsWith('.md')) {
            console.log(`Markdown changed, full reload: ${filePath}`);
          } else {
            console.log(`Project/legal template changed, full reload: ${filePath}`);
          }
          server.ws.send({ type: 'full-reload' });
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

              templateContent = renderProjectPageHtml(templateContent, metadata, html, project.slug, 'dev');

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
          const pathname = req.url.split('?')[0];
          const urlParts = pathname.split('/').filter(Boolean);
          // /lunevo/images/foo.jpg or /lunevo/images/renders/foo.jpg
          if (urlParts.length >= 3 && urlParts[1] === 'images') {
            const projectSlug = urlParts[0];
            const imageRelPath = decodeURIComponent(urlParts.slice(2).join('/'));
            if (imageRelPath.includes('..')) {
              next();
              return;
            }

            // First try to serve optimized images from src/assets/projects/
            let imagePath = path.join(__dirname, 'src', 'assets', 'projects', projectSlug, 'images', imageRelPath);

            // Fall back to original images in src/projects/
            if (!fs.existsSync(imagePath)) {
              imagePath = path.join(__dirname, 'src', 'projects', projectSlug, 'images', imageRelPath);
            }

            if (fs.existsSync(imagePath)) {
              const ext = path.extname(imageRelPath).toLowerCase();
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

        // Handle legal pages in dev mode
        server.middlewares.use('/legal', async (req, res, next) => {
          const urlPath =
            req.url.replace(/^\//, '').split('?')[0].replace(/\.html$/, '') || 'index';
          const lp = LEGAL_PAGES.find((p) => p.slug === urlPath);
          if (!lp) {
            next();
            return;
          }
          const slug = lp.slug;
          const mdPath = path.join(__dirname, 'src', lp.md);
          const templatePath = path.join(__dirname, 'src', 'templates', 'legal.html');
          if (!fs.existsSync(mdPath) || !fs.existsSync(templatePath)) {
            next();
            return;
          }
          try {
            const { html, metadata } = await processMarkdownFile(mdPath, slug);
            const { cta_hero, cta_footer } = buildLegalCtaBlocks(metadata);
            let templateContent = fs.readFileSync(templatePath, 'utf8');
            templateContent = replaceIncludes(templateContent);
            templateContent = renderLegalPageHtml(
              templateContent,
              metadata,
              html,
              slug,
              SITE_BASE,
              { cta_hero, cta_footer },
              'dev'
            );
            res.setHeader('Content-Type', 'text/html');
            res.end(templateContent);
          } catch (error) {
            console.error(`Error processing legal/${slug}:`, error.message);
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        });
      },
      async generateBundle() {
        const generationErrors = [];

        // Process and generate project pages for build
        const projects = findProjects();

        for (const project of projects) {
          try {
            const { html, metadata } = await processMarkdownFile(project.mdPath, project.slug);

            // Read project template
            const templatePath = path.join(__dirname, 'src', 'templates', 'project.html');
            let templateContent = fs.readFileSync(templatePath, 'utf8');

            templateContent = replaceIncludes(templateContent);

            templateContent = renderProjectPageHtml(templateContent, metadata, html, project.slug, 'build');

            // Emit project page
            this.emitFile({
              type: 'asset',
              fileName: `projects/${project.slug}.html`,
              source: templateContent
            });

          } catch (error) {
            generationErrors.push(`project ${project.slug}: ${error.message}`);
          }
        }

        // Process legal pages
        const legalTemplatePath = path.join(__dirname, 'src', 'templates', 'legal.html');
        if (fs.existsSync(legalTemplatePath)) {
          for (const lp of LEGAL_PAGES) {
            const mdPath = path.join(__dirname, 'src', lp.md);
            if (!fs.existsSync(mdPath)) continue;
            try {
              const { html, metadata } = await processMarkdownFile(mdPath, lp.slug);
              const { cta_hero, cta_footer } = buildLegalCtaBlocks(metadata);
              let templateContent = fs.readFileSync(legalTemplatePath, 'utf8');
              templateContent = replaceIncludes(templateContent);
              templateContent = renderLegalPageHtml(
                templateContent,
                metadata,
                html,
                lp.slug,
                SITE_BASE,
                { cta_hero, cta_footer },
                'build'
              );
              this.emitFile({
                type: 'asset',
                fileName: `legal/${lp.slug}.html`,
                source: templateContent
              });
            } catch (error) {
              generationErrors.push(`legal ${lp.slug}: ${error.message}`);
            }
          }
        }

        if (generationErrors.length > 0) {
          this.error(`Failed to generate markdown pages:\n${generationErrors.join('\n')}`);
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
            this.error(`Error generating favicons: ${error.message}`);
          }
        }
      }
    },
    {
      name: 'emit-mono-logos',
      generateBundle() {
        for (const name of MONO_LOGO_SVGS) {
          const abs = path.join(__dirname, 'src', 'assets', name);
          if (!fs.existsSync(abs)) {
            console.warn(`emit-mono-logos: missing ${abs}`);
            continue;
          }
          this.emitFile({
            type: 'asset',
            fileName: `assets/${name}`,
            source: fs.readFileSync(abs)
          });
        }
      }
    },
    {
      name: 'update-hashed-links',
      async writeBundle(options, bundle) {
        const dir = options.dir || distDir;
        const assets = getBundleAssets(bundle, (message) => this.error(message));

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

        // Legal pages (dist/legal/*.html) use ../ prefix
        const legalDir = path.join(dir, 'legal');
        if (fs.existsSync(legalDir)) {
          for (const f of fs.readdirSync(legalDir).filter((file) => file.endsWith('.html'))) {
            const filePath = path.join(legalDir, f);
            let content = fs.readFileSync(filePath, 'utf8');
            fs.writeFileSync(filePath, applyHashedLinks(content, assets, '../'));
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
      name: 'emit-robots-txt',
      async generateBundle() {
        const robots = `User-agent: *
Disallow: /
`;

        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      }
    }
  ]
});