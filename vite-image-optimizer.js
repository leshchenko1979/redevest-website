import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { glob } from 'glob';

// Constants
const CACHE_DIR = '.image-cache';
const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png'];
const PROJECT_SIZES = [800, 1200, 1600];
const HERO_SIZES = [400, 800, 1200, 1600];

/**
 * Checks if optimized files need to be regenerated based on modification times
 * @param {string} sourcePath - Path to source file
 * @param {string} optimizedPath - Path to optimized file
 * @returns {boolean} True if regeneration is needed
 */
function needsRegeneration(sourcePath, optimizedPath) {
  if (!fs.existsSync(optimizedPath)) return true;

  // In CI/CD environments, cached files might have older timestamps than source files
  // due to cache restoration, but if the cache was hit based on source file hashes,
  // we can trust the cached files are valid
  const isCi = process.env.CI || process.env.GITHUB_ACTIONS;
  if (isCi) {
    // In CI, if the optimized file exists, assume it's valid (cache hit means source unchanged)
    return false;
  }

  const sourceStats = fs.statSync(sourcePath);
  const optimizedStats = fs.statSync(optimizedPath);
  return sourceStats.mtime > optimizedStats.mtime;
}

/**
 * Checks if any images need optimization by examining cache state
 * @param {boolean} isDev - Whether running in development mode
 * @returns {Promise<boolean>} True if optimization is needed
 */
async function needsOptimization(isDev) {
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

  if (!fs.existsSync(cacheDir)) {
    return true; // No cache directory, need optimization
  }

  try {
    const cacheStats = fs.statSync(cacheDir);
    const cacheAge = Date.now() - cacheStats.mtime.getTime();

    // If cache is older than 1 hour, do detailed check
    if (cacheAge > CACHE_MAX_AGE) {
      return await needsDetailedOptimization();
    }

    // For recent cache, do quick check of main assets
    const mainAssets = ['src/assets/lunevo_new.jpg', 'src/assets/golubitskaya.jpg', 'src/assets/lubenki_new.jpg'];
    for (const asset of mainAssets) {
      if (fs.existsSync(path.join(process.cwd(), asset))) {
        const assetName = path.basename(asset, path.extname(asset));
        const avifCachePath = path.join(cacheDir, 'assets', `${assetName}.avif`);
        if (!fs.existsSync(avifCachePath)) {
          return true;
        }
      }
    }

    return false; // Cache exists and is recent, assume optimization is up to date

  } catch (error) {
    return true; // If we can't check, assume optimization is needed
  }
}

/**
 * Performs detailed optimization check for key files
 * @returns {Promise<boolean>} True if optimization is needed
 */
async function needsDetailedOptimization() {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

  // Check representative files from different areas
  const checkFiles = [
    'src/assets/lunevo_new.jpg',
    'src/assets/golubitskaya.jpg',
    'src/projects/golubitskaya/images/hero.jpg'
  ];

  for (const file of checkFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    const ext = path.extname(file).toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) continue;

    const relativePath = path.relative(srcDir, fullPath);
    const cacheFileDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(file, ext);

    const webpCachePath = path.join(cacheFileDir, `${baseName}.webp`);
    const avifCachePath = path.join(cacheFileDir, `${baseName}.avif`);

    if (!fs.existsSync(webpCachePath) || !fs.existsSync(avifCachePath)) {
      return true;
    }

    if (needsRegeneration(fullPath, webpCachePath) || needsRegeneration(fullPath, avifCachePath)) {
      return true;
    }
  }

  return false; // Optimization appears to be up to date
}


/**
 * Finds all large project images that need responsive versions
 * @returns {Promise<string[]>} Array of file paths for large images
 */
async function findLargeProjectImages() {
  const projectFiles = await glob('src/projects/*/images/*.{jpg,jpeg,png}', { cwd: process.cwd() });
  const largeProjectImages = [];

  for (const file of projectFiles) {
    try {
      const inputPath = path.join(process.cwd(), file);
      const stats = fs.statSync(inputPath);
      if (stats.size > LARGE_FILE_THRESHOLD) {
        largeProjectImages.push(file);
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  return largeProjectImages;
}

/**
 * Generates responsive images for development mode
 */
async function generateResponsiveDevImages() {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), CACHE_DIR);
  const largeProjectImages = await findLargeProjectImages();

  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const outputDir = path.join(srcDir, path.dirname(relativePath));
    const cacheProjectDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(projectImage, path.extname(projectImage));

    // Ensure directories exist
    ensureDirectoryExists(cacheProjectDir);
    ensureDirectoryExists(outputDir);

    try {
      await generateResponsiveVersions(inputPath, cacheProjectDir, outputDir, baseName, PROJECT_SIZES);
      console.log(`📱 Generated responsive images for: ${projectImage}`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

/**
 * Generates responsive versions for an image at multiple sizes
 * @param {string} inputPath - Source image path
 * @param {string} cacheDir - Cache directory path
 * @param {string} outputDir - Output directory path
 * @param {string} baseName - Base filename without extension
 * @param {number[]} sizes - Array of sizes to generate
 */
async function generateResponsiveVersions(inputPath, cacheDir, outputDir, baseName, sizes) {
  // Generate WebP versions
  for (const size of sizes) {
    const cachePath = path.join(cacheDir, `${baseName}-${size}.webp`);
    const outputPath = path.join(outputDir, `${baseName}-${size}.webp`);

    if (needsRegeneration(inputPath, cachePath)) {
      await sharp(inputPath)
        .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 85, effort: 4 })
        .toFile(cachePath);
      console.log(`✅ Generated responsive WebP: ${cachePath}`);
    }
    fs.copyFileSync(cachePath, outputPath);
  }

  // Generate AVIF versions
  for (const size of sizes) {
    const cachePath = path.join(cacheDir, `${baseName}-${size}.avif`);
    const outputPath = path.join(outputDir, `${baseName}-${size}.avif`);

    if (needsRegeneration(inputPath, cachePath)) {
      await sharp(inputPath)
        .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
        .avif({ quality: 80, effort: 4 })
        .toFile(cachePath);
      console.log(`✅ Generated responsive AVIF: ${cachePath}`);
    }
    fs.copyFileSync(cachePath, outputPath);
  }
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path to ensure exists
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generates responsive project images for production or development
 * @param {boolean} isDev - Whether in development mode
 * @param {string[]} largeProjectImages - Array of large project image paths
 * @param {string} srcDir - Source directory path
 * @param {string} distDir - Distribution directory path
 * @param {string} cacheDir - Cache directory path
 * @param {Function} emitFile - Vite emitFile function (production only)
 */
async function generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile = null) {
  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const outputDirPath = isDev ? srcDir : distDir;
    const outputDirFull = path.join(outputDirPath, path.dirname(relativePath));
    const cacheProjectDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(projectImage, path.extname(projectImage));

    // Ensure directories exist
    ensureDirectoryExists(cacheProjectDir);
    ensureDirectoryExists(outputDirFull);

    try {
      await generateResponsiveVersionsForBuild(inputPath, cacheProjectDir, outputDirFull, baseName, PROJECT_SIZES, isDev, distDir, emitFile);
      console.log(`📱 Generated responsive images for: ${projectImage}`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

/**
 * Generates responsive versions for build mode (with caching and Vite integration)
 * @param {string} inputPath - Source image path
 * @param {string} cacheDir - Cache directory path
 * @param {string} outputDir - Output directory path
 * @param {string} baseName - Base filename without extension
 * @param {number[]} sizes - Array of sizes to generate
 * @param {boolean} isDev - Whether in development mode
 * @param {string} distDir - Distribution directory path
 * @param {Function} emitFile - Vite emitFile function
 */
async function generateResponsiveVersionsForBuild(inputPath, cacheDir, outputDir, baseName, sizes, isDev, distDir, emitFile) {
  const formats = [
    { ext: 'webp', quality: 85, generator: (img) => img.webp({ quality: 85, effort: 4 }) },
    { ext: 'avif', quality: 80, generator: (img) => img.avif({ quality: 80, effort: 4 }) }
  ];

  for (const format of formats) {
    for (const size of sizes) {
      const cachePath = path.join(cacheDir, `${baseName}-${size}.${format.ext}`);
      const outputPath = path.join(outputDir, `${baseName}-${size}.${format.ext}`);

      if (needsRegeneration(inputPath, cachePath)) {
        await sharp(inputPath)
          .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
          [format.ext]({ quality: format.quality, effort: 4 })
          .toFile(cachePath);
        console.log(`✅ Generated cached responsive ${format.ext.toUpperCase()}: ${cachePath}`);
      } else {
        console.log(`⏭️  Skipped responsive ${format.ext.toUpperCase()} (cached): ${cachePath}`);
      }

      // Copy cached version to output
      copyToOutput(cachePath, outputPath, isDev, distDir, emitFile);
    }
  }
}

/**
 * Copies a cached file to the output location
 * @param {string} cachePath - Cache file path
 * @param {string} outputPath - Output file path
 * @param {boolean} isDev - Whether in development mode
 * @param {string} distDir - Distribution directory path
 * @param {Function} emitFile - Vite emitFile function
 */
function copyToOutput(cachePath, outputPath, isDev, distDir, emitFile) {
  if (!isDev && emitFile) {
    // In production, emit the file through Vite
    const relativeOutputPath = path.relative(distDir, outputPath);
    const fileContent = fs.readFileSync(cachePath);
    emitFile({
      type: 'asset',
      fileName: relativeOutputPath,
      source: fileContent
    });
  } else {
    // In dev mode, copy directly
    try {
      fs.copyFileSync(cachePath, outputPath);
    } catch (error) {
      console.warn(`Failed to copy file: ${error.message}`);
    }
  }
}

/**
 * Processes a single image file with format-specific optimization
 * @param {string} file - Relative file path
 * @param {string} srcDir - Source directory
 * @param {string} distDir - Distribution directory
 * @param {string} cacheDir - Cache directory
 * @param {boolean} isDev - Whether in development mode
 * @param {Function} emitFile - Vite emitFile function
 * @returns {Promise<{originalSize: number, optimizedSize: number}>} Size statistics
 */
async function processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile) {
  const inputPath = path.join(process.cwd(), file);
  const relativePath = path.relative(srcDir, inputPath);
  const outputPath = path.join(distDir, relativePath);
  const cachePath = path.join(cacheDir, relativePath);

  // Ensure directories exist
  const outputDir = path.dirname(outputPath);
  const cacheFileDir = path.dirname(cachePath);
  ensureDirectoryExists(outputDir);
  ensureDirectoryExists(cacheFileDir);

  // Get original file size
  const originalStats = fs.statSync(inputPath);
  const originalSize = originalStats.size;
  let optimizedSize = 0;

  const ext = path.extname(file).toLowerCase();
  const baseName = path.basename(file, path.extname(file));

  try {
    // Process based on image format
    if (['.jpg', '.jpeg'].includes(ext)) {
      optimizedSize = await processJpegImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile);
    } else if (ext === '.png') {
      optimizedSize = await processPngImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile);
    } else if (ext === '.webp') {
      optimizedSize = await processWebpImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile);
    }

    console.log(`✅ Optimized: ${file}`);
    return { originalSize, optimizedSize };
  } catch (error) {
    console.warn(`⚠️  Failed to optimize ${file}:`, error.message);
    // Copy original file if optimization fails
    if (!isDev) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return { originalSize, optimizedSize: originalSize };
  }
}

/**
 * Processes JPEG images
 */
async function processJpegImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;

  // Generate optimized JPEG (only in build mode)
  if (!isDev) {
    const cachedJpeg = path.join(cacheFileDir, `${baseName}.jpg`);
    if (needsRegeneration(inputPath, cachedJpeg)) {
      await sharp(inputPath)
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toFile(cachedJpeg);
      console.log(`✅ Generated cached JPEG: ${cachedJpeg}`);
    }
    fs.copyFileSync(cachedJpeg, outputPath);
    optimizedSize += fs.statSync(outputPath).size;
  }

  // Generate WebP and AVIF versions
  optimizedSize += await generateWebpVersion(inputPath, cacheFileDir, path.dirname(outputPath), baseName, isDev, distDir, emitFile);
  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, path.dirname(outputPath), baseName, isDev, distDir, emitFile);

  return optimizedSize;
}

/**
 * Processes PNG images
 */
async function processPngImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;

  // Generate optimized PNG (only in build mode)
  if (!isDev) {
    const cachedPng = path.join(cacheFileDir, `${baseName}.png`);
    if (needsRegeneration(inputPath, cachedPng)) {
      await sharp(inputPath)
        .png({ quality: 90, compressionLevel: 6, palette: true })
        .toFile(cachedPng);
      console.log(`✅ Generated cached PNG: ${cachedPng}`);
    }
    fs.copyFileSync(cachedPng, outputPath);
    optimizedSize += fs.statSync(outputPath).size;
  }

  // Generate WebP and AVIF versions
  optimizedSize += await generateWebpVersion(inputPath, cacheFileDir, path.dirname(outputPath), baseName, isDev, distDir, emitFile);
  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, path.dirname(outputPath), baseName, isDev, distDir, emitFile);

  return optimizedSize;
}

/**
 * Processes WebP images
 */
async function processWebpImage(inputPath, outputPath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;

  // Copy WebP as-is (only in build mode)
  if (!isDev) {
    const cachedWebp = path.join(cacheFileDir, `${baseName}.webp`);
    if (needsRegeneration(inputPath, cachedWebp)) {
      fs.copyFileSync(inputPath, cachedWebp);
      console.log(`✅ Cached WebP: ${cachedWebp}`);
    }
    fs.copyFileSync(cachedWebp, outputPath);
    optimizedSize += fs.statSync(outputPath).size;
  }

  // Generate AVIF version
  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, path.dirname(outputPath), baseName, isDev, distDir, emitFile);

  return optimizedSize;
}

/**
 * Generates WebP version of an image
 */
async function generateWebpVersion(inputPath, cacheDir, outputDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.webp`);
  const outputPath = path.join(outputDir, `${baseName}.webp`);

  if (needsRegeneration(inputPath, cachePath)) {
    await sharp(inputPath).webp({ quality: 85, effort: 4 }).toFile(cachePath);
    console.log(`✅ Generated cached WebP: ${cachePath}`);
  } else {
    console.log(`⏭️  Skipped WebP (cached): ${cachePath}`);
  }

  copyToOutput(cachePath, outputPath, isDev, distDir, emitFile);
  return fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
}

/**
 * Generates AVIF version of an image
 */
async function generateAvifVersion(inputPath, cacheDir, outputDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.avif`);
  const outputPath = path.join(outputDir, `${baseName}.avif`);

  if (needsRegeneration(inputPath, cachePath)) {
    try {
      await sharp(inputPath).avif({ quality: 80, effort: 4 }).toFile(cachePath);
      console.log(`✅ Generated cached AVIF: ${cachePath}`);
    } catch (error) {
      console.error(`❌ Error generating AVIF ${cachePath}:`, error.message);
      return 0;
    }
  } else {
    console.log(`⏭️  Skipped AVIF (cached): ${cachePath}`);
  }

  if (fs.existsSync(cachePath)) {
    copyToOutput(cachePath, outputPath, isDev, distDir, emitFile);
    return fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
  }

  return 0;
}

/**
 * Generates responsive hero images
 */
async function generateResponsiveHeroImages(srcDir, distDir, cacheDir) {
  const heroImages = [
    'src/assets/founder.png',
    'src/assets/golubitskaya.jpg',
    'src/assets/lubenki_new.jpg',
    'src/assets/lunevo_new.jpg'
  ];

  for (const heroImage of heroImages) {
    if (fs.existsSync(path.join(process.cwd(), heroImage))) {
      const relativePath = path.relative(srcDir, heroImage);
      const outputDir = path.join(distDir, path.dirname(relativePath));
      const cacheHeroDir = path.join(cacheDir, path.dirname(relativePath));
      const baseName = path.basename(heroImage, path.extname(heroImage));

      ensureDirectoryExists(cacheHeroDir);

      try {
        const inputPath = path.join(process.cwd(), heroImage);
        await generateResponsiveVersions(inputPath, cacheHeroDir, outputDir, baseName, HERO_SIZES);
        console.log(`📱 Generated responsive images for: ${heroImage}`);
      } catch (error) {
        console.warn(`⚠️  Failed to generate responsive images for ${heroImage}:`, error.message);
      }
    }
  }
}

/**
 * Main image optimization function
 */
async function optimizeImages(isDev, emitFile = null) {
  const srcDir = path.join(process.cwd(), 'src');
  const distDir = isDev ? srcDir : path.join(process.cwd(), 'dist');
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

  ensureDirectoryExists(cacheDir);

  // Find all images
  const imagePatterns = [
    'src/assets/**/*.{jpg,jpeg,png,gif,webp}',
    'src/projects/*/images/*.{jpg,jpeg,png,gif,webp}'
  ];

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let processedCount = 0;
  const largeProjectImages = [];

  // Process all images
  for (const pattern of imagePatterns) {
    const files = await glob(pattern, { cwd: process.cwd() });

    for (const file of files) {
      const inputPath = path.join(process.cwd(), file);

      // Track large project images for responsive generation
      if (file.includes('src/projects/')) {
        const stats = fs.statSync(inputPath);
        if (stats.size > LARGE_FILE_THRESHOLD) {
          largeProjectImages.push(file);
        }
      }

      const stats = await processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile);
      totalOriginalSize += stats.originalSize;
      totalOptimizedSize += stats.optimizedSize;
      processedCount++;
    }
  }

  // Generate responsive images
  await generateResponsiveHeroImages(srcDir, distDir, cacheDir);
  await generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile);

  // Print statistics
  printOptimizationStats(processedCount, totalOriginalSize, totalOptimizedSize, isDev);
}

/**
 * Prints optimization statistics
 */
function printOptimizationStats(processedCount, totalOriginalSize, totalOptimizedSize, isDev) {
  console.log(`\n📊 Image Optimization Complete:`);
  console.log(`   Processed: ${processedCount} images`);
  console.log(`   Original size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);

  if (isDev) {
    console.log(`   Generated optimized formats: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB (WebP/AVIF)`);
    console.log(`   Note: Dev mode generates additional files without replacing originals`);
  } else {
    const savings = totalOriginalSize - totalOptimizedSize;
    const savingsPercentage = totalOriginalSize > 0 ? ((savings / totalOriginalSize) * 100).toFixed(2) : 0;
    console.log(`   Final build size: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Space saved: ${(savings / 1024 / 1024).toFixed(2)} MB (${savingsPercentage}%)`);
  }
}

export function imageOptimizerPlugin() {
  let isDev = false;
  let emitFile = null;

  return {
    name: 'image-optimizer',
    config(config, { command }) {
      isDev = command === 'serve';
    },
    buildStart() {
      console.log('🔍 Starting image optimization process...');
    },
    configureServer(server) {
      // In dev mode, generate optimized images when server starts
      if (isDev) {
        needsOptimization(isDev).then(needsOpt => {
          if (needsOpt) {
            console.log('🖼️  Generating optimized images for development...');
            optimizeImages(isDev).then(async () => {
              // After basic optimization, generate responsive project images
              await generateResponsiveDevImages();
            });
          } else {
            console.log('🖼️  Optimized images are up to date, skipping generation');
          }
        }).catch(error => {
          console.log('❌ Error checking optimization needs:', error.message);
        });

        // Watch for changes to source images and regenerate optimized versions
        const watcher = server.watcher;
        watcher.on('change', async (filePath) => {
          if (filePath.includes('src/assets/') &&
              (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
               filePath.endsWith('.png'))) {
            console.log(`📸 Source image changed: ${filePath}, regenerating optimized versions...`);
            await optimizeImages(isDev);
          }
        });
      }
    },

    async generateBundle(options, bundle) {
      emitFile = this.emitFile.bind(this);
      await optimizeImages(isDev, emitFile);
    }
  };
}