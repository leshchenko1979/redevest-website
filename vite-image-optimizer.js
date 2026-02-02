import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Constants
const CACHE_DIR = '.image-cache';
const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG', '.webp', '.WEBP'];
const PROJECT_SIZES = [800, 1200, 1600];
const HERO_SIZES = [400, 800, 1200, 1600];

/**
 * Checks if optimized files need to be regenerated based on modification times
 */
function needsRegeneration(sourcePath, optimizedPath) {
  if (!fs.existsSync(optimizedPath)) return true;

  try {
    const sourceStats = fs.statSync(sourcePath);
    const optimizedStats = fs.statSync(optimizedPath);
    
    // Add 1-second tolerance to prevent false positives from filesystem timestamp resolution differences
    // or rounding issues. 1000ms is safe for most filesystems (even FAT32).
    return sourceStats.mtimeMs > (optimizedStats.mtimeMs + 1000);
  } catch (error) {
    return true;
  }
}

/**
 * Ensures a directory exists
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Copies a cached file to the output location or emits it to Vite bundle
 * In dev mode, optimized files are served via middleware - originals only copied on failure
 */
function copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile, isOriginalFallback = false) {
  // Handle original file fallback (when optimization fails)
  if (isOriginalFallback) {
    const originalPath = path.join(process.cwd(), 'src', relativeOutputPath);

    if (!fs.existsSync(originalPath)) {
      console.warn(`⚠️  Original file not found: ${originalPath}`);
      return false;
    }

    if (isDev) {
      // In dev mode, copy original to src/assets so Vite can serve it
      const devOutputPath = path.join(distDir, relativeOutputPath);
      ensureDirectoryExists(path.dirname(devOutputPath));
      fs.copyFileSync(originalPath, devOutputPath);
      return true;
    } else {
      // In production, emit original file to bundle
      if (emitFile) {
        try {
          const fileContent = fs.readFileSync(originalPath);
          emitFile({
            type: 'asset',
            fileName: relativeOutputPath,
            source: fileContent
          });
          return true;
        } catch (error) {
          console.warn(`❌ Failed to read or emit original file ${originalPath}: ${error.message}`);
          return false;
        }
      }
    }
    return false;
  }

  // Handle optimized/cached files
  if (!fs.existsSync(cachePath)) return false;

  // In dev mode, optimized files are served via middleware - no copying needed
  if (isDev) {
    return true; // File exists in cache, ready to be served via middleware
  }

  // Production mode: emit to Vite bundle
  if (emitFile) {
    try {
      const fileContent = fs.readFileSync(cachePath);
      emitFile({
        type: 'asset',
        fileName: relativeOutputPath,
        source: fileContent
      });
      return true;
    } catch (error) {
      console.warn(`❌ Failed to read or emit file ${cachePath}: ${error.message}`);
      return false;
    }
  }

  return false;
}

/**
 * Vite middleware to serve optimized images from cache during development
 */
function serveFromCacheMiddleware() {
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

  return {
    name: 'serve-optimized-images',
    configureServer(server) {
      server.middlewares.use('/assets', async (req, res, next) => {
        const url = req.url;

        // Only intercept requests for optimized formats
        const isOptimizedFormat = url.endsWith('.webp') || url.endsWith('.avif');

        if (!isOptimizedFormat) {
          return next();
        }

        // Construct cache path from request URL
        // e.g., /assets/founder.webp -> .image-cache/assets/founder.webp
        const relativePath = url.startsWith('/assets/') ? url.substring(8) : url.substring(1); // Remove /assets/ or leading /
        const cachePath = path.join(cacheDir, 'assets', relativePath);

        try {
          if (fs.existsSync(cachePath)) {
            const contentType = url.endsWith('.webp') ? 'image/webp' : 'image/avif';
            res.setHeader('Content-Type', contentType);

            // Set cache headers for development
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            fs.createReadStream(cachePath).pipe(res);
            return;
          }
        } catch (error) {
          console.warn(`⚠️ Error serving cached image ${cachePath}:`, error.message);
        }

        // If not found in cache, let Vite handle it (will fall back to original or 404)
        next();
      });
    }
  };
}

/**
 * Generates WebP version of an image
 */
async function generateWebpVersion(inputPath, cacheDir, relativeDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.webp`);
  const relativeOutputPath = path.join(relativeDir, `${baseName}.webp`);

  if (needsRegeneration(inputPath, cachePath)) {
    await sharp(inputPath).webp({ quality: 85, effort: 4 }).toFile(cachePath);
    console.log(`✨ Generated WebP: ${relativeOutputPath}`);
  } else {
    // console.log(`⏭️  Skipping WebP (up to date): ${relativeOutputPath}`);
  }

  copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
}

/**
 * Generates AVIF version of an image
 */
async function generateAvifVersion(inputPath, cacheDir, relativeDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.avif`);
  const relativeOutputPath = path.join(relativeDir, `${baseName}.avif`);

  if (needsRegeneration(inputPath, cachePath)) {
    try {
      await sharp(inputPath).avif({ quality: 80, effort: 4 }).toFile(cachePath);
      console.log(`✨ Generated AVIF: ${relativeOutputPath}`);
    } catch (error) {
      return;
    }
  } else {
    // console.log(`⏭️  Skipping AVIF (up to date): ${relativeOutputPath}`);
  }

  copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
}

/**
 * Processes a single image file
 */
async function processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile) {
  const inputPath = path.join(process.cwd(), file);
  const relativePath = path.relative(srcDir, inputPath);
  const relativeDir = path.dirname(relativePath);
  const cacheFileDir = path.join(cacheDir, relativeDir);
  const baseName = path.basename(file, path.extname(file));
  const ext = path.extname(file).toLowerCase();

  ensureDirectoryExists(cacheFileDir);

  try {
    if (['.jpg', '.jpeg', '.JPG', '.JPEG'].includes(ext)) {
      if (!isDev) {
        const cachedJpeg = path.join(cacheFileDir, `${baseName}.jpg`);
        if (needsRegeneration(inputPath, cachedJpeg)) {
          await sharp(inputPath)
            .jpeg({ quality: 85, progressive: true, mozjpeg: true })
            .toFile(cachedJpeg);
          console.log(`✨ Optimized JPEG: ${relativePath}`);
        } else {
          // console.log(`⏭️  Skipping JPEG (up to date): ${relativePath}`);
        }
        copyToOutput(cachedJpeg, relativePath, isDev, distDir, emitFile);
      }
      await generateWebpVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
      await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
    } else if (['.png', '.PNG'].includes(ext)) {
      if (!isDev) {
        const cachedPng = path.join(cacheFileDir, `${baseName}.png`);
        if (needsRegeneration(inputPath, cachedPng)) {
          await sharp(inputPath)
            .png({ quality: 90, compressionLevel: 6, palette: true })
            .toFile(cachedPng);
          console.log(`✨ Optimized PNG: ${relativePath}`);
        } else {
          // console.log(`⏭️  Skipping PNG (up to date): ${relativePath}`);
        }
        copyToOutput(cachedPng, relativePath, isDev, distDir, emitFile);
      }
      await generateWebpVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
      await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
    } else if (['.webp', '.WEBP'].includes(ext)) {
      if (!isDev) {
        const cachedWebp = path.join(cacheFileDir, `${baseName}.webp`);
        if (needsRegeneration(inputPath, cachedWebp)) {
          fs.copyFileSync(inputPath, cachedWebp);
        }
        copyToOutput(cachedWebp, relativePath, isDev, distDir, emitFile);
      }
      await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to process ${file}:`, error.message);
    // Always copy original file for failed processing (both dev and prod)
    copyToOutput(null, relativePath, isDev, distDir, emitFile, true);
  }
}

/**
 * Generates responsive versions
 */
async function generateResponsiveVersions(inputPath, cacheDir, distDir, relativeDir, baseName, sizes, isDev, emitFile) {
  for (const size of sizes) {
    const formats = [
      { ext: 'webp', method: 'webp', options: { quality: 85, effort: 4 } },
      { ext: 'avif', method: 'avif', options: { quality: 80, effort: 4 } }
    ];

    for (const format of formats) {
      const cachePath = path.join(cacheDir, `${baseName}-${size}.${format.ext}`);
      const relativeOutputPath = path.join(relativeDir, `${baseName}-${size}.${format.ext}`);

      if (needsRegeneration(inputPath, cachePath)) {
        await sharp(inputPath)
          .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
          [format.method](format.options)
          .toFile(cachePath);
        console.log(`✨ Generated responsive ${format.ext.toUpperCase()} (${size}w): ${relativeOutputPath}`);
      }
      copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
    }
  }
}

/**
 * Finds files matching patterns using fs.readdirSync recursive
 */
function findFiles(dir, patterns) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const allFiles = fs.readdirSync(dir, { recursive: true });
  for (const file of allFiles) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (patterns.some(p => ext === p || (p === '.jpg' && ext === '.jpeg') || (p === '.jpeg' && ext === '.jpg'))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/**
 * Main optimization entry point
 */
async function optimizeImages(isDev, emitFile = null) {
  const srcDir = path.join(process.cwd(), 'src');
  const distDir = isDev ? srcDir : path.join(process.cwd(), 'dist');
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

  ensureDirectoryExists(cacheDir);

  const formats = ['.jpg', '.jpeg', '.png', '.webp'];
  const assetFiles = findFiles(path.join(srcDir, 'assets'), formats);
  const projectFiles = findFiles(path.join(srcDir, 'projects'), formats).filter(f => f.includes('/images/'));
  
  const allFiles = [...assetFiles, ...projectFiles];
  const largeProjectImages = [];

  for (const fullPath of allFiles) {
    const file = path.relative(process.cwd(), fullPath);
    if (file.includes('src/projects/')) {
      const stats = fs.statSync(fullPath);
      if (stats.size > LARGE_FILE_THRESHOLD) {
        largeProjectImages.push(file);
      }
    }
    await processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile);
  }

  // Hero images responsive versions
  const heroImages = ['src/assets/founder.png', 'src/assets/golubitskaya.jpg', 'src/assets/lubenki_new.jpg', 'src/assets/lunevo_new.jpg'];
  for (const heroImage of heroImages) {
    const fullHeroPath = path.join(process.cwd(), heroImage);
    if (fs.existsSync(fullHeroPath)) {
      const relativePath = path.relative(srcDir, fullHeroPath);
      const relativeDir = path.dirname(relativePath);
      const cacheHeroDir = path.join(cacheDir, relativeDir);
      const baseName = path.basename(heroImage, path.extname(heroImage));
      await generateResponsiveVersions(fullHeroPath, cacheHeroDir, distDir, relativeDir, baseName, HERO_SIZES, isDev, emitFile);
    }
  }

  // Large project images responsive versions
  for (const projectImage of largeProjectImages) {
    const fullPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, fullPath);
    const relativeDir = path.dirname(relativePath);
    const cacheProjectDir = path.join(cacheDir, relativeDir);
    const baseName = path.basename(projectImage, path.extname(projectImage));
    await generateResponsiveVersions(fullPath, cacheProjectDir, distDir, relativeDir, baseName, PROJECT_SIZES, isDev, emitFile);
  }
}

let optimizationPromise = null;

export function imageOptimizerPlugin() {
  let isDev = false;
  let emitFile = null;

  return [
    // Main optimizer plugin
    {
      name: 'image-optimizer',
      config(config, { command }) {
        isDev = command === 'serve';
      },
      buildStart() {
        console.log('🔍 Starting image optimization process...');
      },
      configureServer(server) {
        if (isDev) {
          // Initial optimization on server start
          if (!optimizationPromise) {
            optimizationPromise = optimizeImages(true)
              .then(() => {
                console.log('✅ Dev image optimization complete.');
              })
              .catch(err => {
                console.error('❌ Error in dev image optimization:', err);
              })
              .finally(() => {
                optimizationPromise = null;
              });
          }

          // Watch for changes to source images and re-optimize
          server.watcher.on('change', async (filePath) => {
            const isAssetImage = filePath.includes('src/assets/') &&
                (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
                 filePath.endsWith('.png') || filePath.endsWith('.webp'));

            const isProjectImage = filePath.includes('src/projects/') &&
                filePath.includes('/images/') &&
                (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
                 filePath.endsWith('.png') || filePath.endsWith('.webp'));

            if (isAssetImage || isProjectImage) {
              console.log(`📸 Source image changed: ${filePath}, re-optimizing...`);

              // Prevent multiple simultaneous optimizations
              if (!optimizationPromise) {
                optimizationPromise = optimizeImages(true)
                  .then(() => {
                    console.log('✅ Re-optimization complete.');
                  })
                  .catch(err => {
                    console.error('❌ Error in re-optimization:', err);
                  })
                  .finally(() => {
                    optimizationPromise = null;
                  });
              }
            }
          });
        }
      },
      async generateBundle() {
        emitFile = this.emitFile.bind(this);
        console.log('📦 Emitting optimized images to bundle...');
        await optimizeImages(false, emitFile);
        console.log('✅ Image emission complete.');
      }
    },
    // Middleware plugin for serving from cache
    serveFromCacheMiddleware()
  ];
}
