import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { glob } from 'glob';

// Constants
const CACHE_DIR = '.image-cache';
const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG'];
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

  const isCi = process.env.CI || process.env.GITHUB_ACTIONS;
  if (isCi) {
    try {
      const sourceStats = fs.statSync(sourcePath);
      const optimizedStats = fs.statSync(optimizedPath);
      return sourceStats.mtime > optimizedStats.mtime;
    } catch (error) {
      return true;
    }
  }

  const sourceStats = fs.statSync(sourcePath);
  const optimizedStats = fs.statSync(optimizedPath);
  return sourceStats.mtime > optimizedStats.mtime;
}

/**
 * Checks if any images need optimization by examining cache state
 */
async function needsOptimization(isDev) {
  const cacheDir = path.join(process.cwd(), CACHE_DIR);
  if (!fs.existsSync(cacheDir)) return true;

  try {
    const cacheStats = fs.statSync(cacheDir);
    const cacheAge = Date.now() - cacheStats.mtime.getTime();

    if (cacheAge > CACHE_MAX_AGE) return await needsDetailedOptimization();

    const mainAssets = ['src/assets/lunevo_new.jpg', 'src/assets/golubitskaya.jpg', 'src/assets/lubenki_new.jpg'];
    for (const asset of mainAssets) {
      if (fs.existsSync(path.join(process.cwd(), asset))) {
        const assetName = path.basename(asset, path.extname(asset));
        const avifCachePath = path.join(cacheDir, 'assets', `${assetName}.avif`);
        if (!fs.existsSync(avifCachePath)) return true;
      }
    }
    return false;
  } catch (error) {
    return true;
  }
}

/**
 * Performs detailed optimization check for key files
 */
async function needsDetailedOptimization() {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), CACHE_DIR);

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

    if (!fs.existsSync(webpCachePath) || !fs.existsSync(avifCachePath)) return true;
    if (needsRegeneration(fullPath, webpCachePath) || needsRegeneration(fullPath, avifCachePath)) return true;
  }
  return false;
}

/**
 * Finds all large project images that need responsive versions
 */
async function findLargeProjectImages() {
  const projectFiles = await glob('src/projects/*/images/*.{jpg,jpeg,png}', { cwd: process.cwd() });
  const largeProjectImages = [];

  for (const file of projectFiles) {
    try {
      const inputPath = path.join(process.cwd(), file);
      const stats = fs.statSync(inputPath);
      if (stats.size > LARGE_FILE_THRESHOLD) largeProjectImages.push(file);
    } catch (error) {}
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
    const relativeDir = path.dirname(relativePath);
    const cacheProjectDir = path.join(cacheDir, relativeDir);
    const baseName = path.basename(projectImage, path.extname(projectImage));

    ensureDirectoryExists(cacheProjectDir);

    try {
      await generateResponsiveVersions(inputPath, cacheProjectDir, srcDir, relativeDir, baseName, PROJECT_SIZES, true, null);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

/**
 * Generates responsive versions for an image at multiple sizes
 */
async function generateResponsiveVersions(inputPath, cacheDir, distDir, relativeDir, baseName, sizes, isDev, emitFile) {
  for (const size of sizes) {
    const formats = [
      { ext: 'webp', quality: 85, generator: (img) => img.webp({ quality: 85, effort: 4 }) },
      { ext: 'avif', quality: 80, generator: (img) => img.avif({ quality: 80, effort: 4 }) }
    ];

    for (const format of formats) {
      const cachePath = path.join(cacheDir, `${baseName}-${size}.${format.ext}`);
      const relativeOutputPath = path.join(relativeDir, `${baseName}-${size}.${format.ext}`);

      if (needsRegeneration(inputPath, cachePath)) {
        await sharp(inputPath)
          .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
          [format.ext]({ quality: format.quality, effort: 4 })
          .toFile(cachePath);
      }
      copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
    }
  }
}

/**
 * Ensures a directory exists
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Generates responsive project images for production or development
 */
async function generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile = null) {
  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const relativeDir = path.dirname(relativePath);
    const cacheProjectDir = path.join(cacheDir, relativeDir);
    const baseName = path.basename(projectImage, path.extname(projectImage));

    ensureDirectoryExists(cacheProjectDir);

    try {
      await generateResponsiveVersionsForBuild(inputPath, cacheProjectDir, relativeDir, baseName, PROJECT_SIZES, isDev, distDir, emitFile);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

/**
 * Generates responsive versions for build mode
 */
async function generateResponsiveVersionsForBuild(inputPath, cacheDir, relativeDir, baseName, sizes, isDev, distDir, emitFile) {
  const formats = [
    { ext: 'webp', quality: 85, generator: (img) => img.webp({ quality: 85, effort: 4 }) },
    { ext: 'avif', quality: 80, generator: (img) => img.avif({ quality: 80, effort: 4 }) }
  ];

  for (const format of formats) {
    for (const size of sizes) {
      const cachePath = path.join(cacheDir, `${baseName}-${size}.${format.ext}`);
      const relativeOutputPath = path.join(relativeDir, `${baseName}-${size}.${format.ext}`);

      if (needsRegeneration(inputPath, cachePath)) {
        await sharp(inputPath)
          .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
          [format.ext]({ quality: format.quality, effort: 4 })
          .toFile(cachePath);
      }
      copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
    }
  }
}

/**
 * Copies a cached file to the output location
 */
function copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile) {
  if (!isDev && emitFile) {
    try {
      const fileContent = fs.readFileSync(cachePath);
      emitFile({
        type: 'asset',
        fileName: relativeOutputPath,
        source: fileContent
      });
    } catch (error) {
      console.warn(`❌ Failed to read or emit file ${cachePath}: ${error.message}`);
    }
  } else {
    try {
      const outputPath = path.join(distDir, relativeOutputPath);
      ensureDirectoryExists(path.dirname(outputPath));
      fs.copyFileSync(cachePath, outputPath);
    } catch (error) {
      console.warn(`⚠️ Failed to copy file: ${error.message}`);
    }
  }
}

/**
 * Processes a single image file
 */
async function processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile) {
  const inputPath = path.join(process.cwd(), file);
  const relativePath = path.relative(srcDir, inputPath);
  const outputPath = path.join(distDir, relativePath);
  const cachePath = path.join(cacheDir, relativePath);

  const cacheFileDir = path.dirname(cachePath);
  ensureDirectoryExists(cacheFileDir);

  const originalStats = fs.statSync(inputPath);
  const originalSize = originalStats.size;
  let optimizedSize = 0;

  const ext = path.extname(file).toLowerCase();
  const baseName = path.basename(file, path.extname(file));

  try {
    if (['.jpg', '.jpeg', '.JPG', '.JPEG'].includes(ext)) {
      optimizedSize = await processJpegImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile);
    } else if (['.png', '.PNG'].includes(ext)) {
      optimizedSize = await processPngImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile);
    } else if (['.webp', '.WEBP'].includes(ext)) {
      optimizedSize = await processWebpImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile);
    }

    if (!isDev && optimizedSize === 0) optimizedSize = originalSize;
    return { originalSize, optimizedSize };
  } catch (error) {
    console.warn(`⚠️  Failed to optimize ${file}:`, error.message);
    if (!isDev) copyToOutput(inputPath, relativePath, isDev, distDir, emitFile);
    return { originalSize, optimizedSize: originalSize };
  }
}

/**
 * Processes JPEG images
 */
async function processJpegImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;
  const relativeDir = path.dirname(relativePath);

  if (!isDev) {
    const cachedJpeg = path.join(cacheFileDir, `${baseName}.jpg`);
    if (needsRegeneration(inputPath, cachedJpeg)) {
      await sharp(inputPath)
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toFile(cachedJpeg);
    }
    copyToOutput(cachedJpeg, relativePath, isDev, distDir, emitFile);
    optimizedSize += fs.existsSync(cachedJpeg) ? fs.statSync(cachedJpeg).size : 0;
  }

  optimizedSize += await generateWebpVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
  return optimizedSize;
}

/**
 * Processes PNG images
 */
async function processPngImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;
  const relativeDir = path.dirname(relativePath);

  if (!isDev) {
    const cachedPng = path.join(cacheFileDir, `${baseName}.png`);
    if (needsRegeneration(inputPath, cachedPng)) {
      await sharp(inputPath)
        .png({ quality: 90, compressionLevel: 6, palette: true })
        .toFile(cachedPng);
    }
    copyToOutput(cachedPng, relativePath, isDev, distDir, emitFile);
    optimizedSize += fs.existsSync(cachedPng) ? fs.statSync(cachedPng).size : 0;
  }

  optimizedSize += await generateWebpVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
  return optimizedSize;
}

/**
 * Processes WebP images
 */
async function processWebpImage(inputPath, relativePath, cacheFileDir, baseName, isDev, distDir, emitFile) {
  let optimizedSize = 0;
  const relativeDir = path.dirname(relativePath);

  if (!isDev) {
    const cachedWebp = path.join(cacheFileDir, `${baseName}.webp`);
    if (needsRegeneration(inputPath, cachedWebp)) fs.copyFileSync(inputPath, cachedWebp);
    copyToOutput(cachedWebp, relativePath, isDev, distDir, emitFile);
    optimizedSize += fs.existsSync(cachedWebp) ? fs.statSync(cachedWebp).size : 0;
  }

  optimizedSize += await generateAvifVersion(inputPath, cacheFileDir, relativeDir, baseName, isDev, distDir, emitFile);
  return optimizedSize;
}

/**
 * Generates WebP version
 */
async function generateWebpVersion(inputPath, cacheDir, relativeDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.webp`);
  const relativeOutputPath = path.join(relativeDir, `${baseName}.webp`);

  if (needsRegeneration(inputPath, cachePath)) {
    await sharp(inputPath).webp({ quality: 85, effort: 4 }).toFile(cachePath);
  }
  copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
  return fs.existsSync(cachePath) ? fs.statSync(cachePath).size : 0;
}

/**
 * Generates AVIF version
 */
async function generateAvifVersion(inputPath, cacheDir, relativeDir, baseName, isDev, distDir, emitFile) {
  const cachePath = path.join(cacheDir, `${baseName}.avif`);
  const relativeOutputPath = path.join(relativeDir, `${baseName}.avif`);

  if (needsRegeneration(inputPath, cachePath)) {
    try {
      await sharp(inputPath).avif({ quality: 80, effort: 4 }).toFile(cachePath);
    } catch (error) {
      return 0;
    }
  }

  if (fs.existsSync(cachePath)) {
    copyToOutput(cachePath, relativeOutputPath, isDev, distDir, emitFile);
    return fs.statSync(cachePath).size;
  }
  return 0;
}

/**
 * Generates responsive hero images
 */
async function generateResponsiveHeroImages(srcDir, distDir, cacheDir, isDev, emitFile) {
  const heroImages = ['src/assets/founder.png', 'src/assets/golubitskaya.jpg', 'src/assets/lubenki_new.jpg', 'src/assets/lunevo_new.jpg'];
  for (const heroImage of heroImages) {
    if (fs.existsSync(path.join(process.cwd(), heroImage))) {
      const relativePath = path.relative(srcDir, heroImage);
      const relativeDir = path.dirname(relativePath);
      const cacheHeroDir = path.join(cacheDir, relativeDir);
      const baseName = path.basename(heroImage, path.extname(heroImage));

      ensureDirectoryExists(cacheHeroDir);
      try {
        const inputPath = path.join(process.cwd(), heroImage);
        await generateResponsiveVersions(inputPath, cacheHeroDir, distDir, relativeDir, baseName, HERO_SIZES, isDev, emitFile);
      } catch (error) {}
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

  const imagePatterns = [
    'src/assets/**/*.{jpg,jpeg,JPG,JPEG,png,PNG,gif,GIF,webp,WEBP}',
    'src/projects/*/images/*.{jpg,jpeg,JPG,JPEG,png,PNG,gif,GIF,webp,WEBP}'
  ];

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let processedCount = 0;
  const largeProjectImages = [];

  for (const pattern of imagePatterns) {
    const files = await glob(pattern, { cwd: process.cwd() });
    for (const file of files) {
      const inputPath = path.join(process.cwd(), file);
      if (file.includes('src/projects/')) {
        const stats = fs.statSync(inputPath);
        if (stats.size > LARGE_FILE_THRESHOLD) largeProjectImages.push(file);
      }
      const stats = await processImageFile(file, srcDir, distDir, cacheDir, isDev, emitFile);
      totalOriginalSize += stats.originalSize;
      totalOptimizedSize += stats.optimizedSize;
      processedCount++;
    }
  }

  await generateResponsiveHeroImages(srcDir, distDir, cacheDir, isDev, emitFile);
  await generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile);

  printOptimizationStats(processedCount, totalOriginalSize, totalOptimizedSize, isDev);
}

function printOptimizationStats(processedCount, totalOriginalSize, totalOptimizedSize, isDev) {
  console.log(`\n📊 Image Optimization Complete:`);
  console.log(`   Processed: ${processedCount} images`);
  console.log(`   Original size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  if (!isDev) {
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
      if (isDev) {
        needsOptimization(isDev).then(needsOpt => {
          if (needsOpt) {
            console.log('🖼️  Generating optimized images for development...');
            optimizeImages(isDev).then(async () => {
              await generateResponsiveDevImages();
            });
          } else {
            console.log('🖼️  Optimized images are up to date, skipping generation');
          }
        }).catch(() => {});
      }
    },
    async generateBundle(options, bundle) {
      emitFile = this.emitFile.bind(this);
      await optimizeImages(isDev, emitFile);
    }
  };
}
