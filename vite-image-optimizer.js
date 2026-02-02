import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { glob } from 'glob';

// Helper function to check if optimized files need to be regenerated
function needsRegeneration(sourcePath, formatPath) {
  if (!fs.existsSync(formatPath)) return true;

  // In CI/CD environments, cached files might have older timestamps than source files
  // due to cache restoration, but if the cache was hit based on source file hashes,
  // we can trust the cached files are valid
  const isCi = process.env.CI || process.env.GITHUB_ACTIONS;
  if (isCi) {
    // In CI, if the optimized file exists, assume it's valid (cache hit means source unchanged)
    return false;
  }

  const sourceStats = fs.statSync(sourcePath);
  const optimizedStats = fs.statSync(formatPath);
  return sourceStats.mtime > optimizedStats.mtime;
}

// Helper function to check if any images need optimization
async function needsOptimization(isDev) {
  // Simple check: see if the cache directory exists and has been modified recently
  // If cache exists and is recent, assume optimization has run
  const cacheDir = path.join(process.cwd(), '.image-cache');

  if (!fs.existsSync(cacheDir)) {
    return true; // No cache directory, need optimization
  }

  try {
    const cacheStats = fs.statSync(cacheDir);
    const now = Date.now();
    const cacheAge = now - cacheStats.mtime.getTime();

    // If cache is older than 1 hour, assume we need to check
    if (cacheAge > 60 * 60 * 1000) {
      return await needsDetailedOptimization();
    }

    // For recent cache, do a quick check of main assets
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

// Detailed optimization check for when we need to be thorough
async function needsDetailedOptimization() {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), '.image-cache');

  // Only check a few representative files instead of all files
  const checkFiles = [
    'src/assets/lunevo_new.jpg',
    'src/assets/golubitskaya.jpg',
    'src/projects/golubitskaya/images/hero.jpg'
  ];

  for (const file of checkFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    const ext = path.extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;

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

// Legacy function - keeping for compatibility but not used
async function oldNeedsOptimization(isDev) {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), '.image-cache');

  // Find all images in src directory
  const imagePatterns = [
    'src/assets/**/*.{jpg,jpeg,png,gif,webp}',
    'src/projects/*/images/*.{jpg,jpeg,png,gif,webp}'
  ];

  console.log('🔍 Checking if images need optimization...');

  for (const pattern of imagePatterns) {
    const files = await glob(pattern, { cwd: process.cwd() });
    console.log(`🔍 Found ${files.length} files for pattern: ${pattern}`);

    for (const file of files) {
      const inputPath = path.join(process.cwd(), file);
      const relativePath = path.relative(srcDir, inputPath);
      const cachePath = path.join(cacheDir, relativePath);

      // Ensure directories exist for cache path
      const cacheFileDir = path.dirname(cachePath);
      if (!fs.existsSync(cacheFileDir)) {
        return true; // Cache directory doesn't exist, need optimization
      }

      // Get file extension to determine what formats to check
      const ext = path.extname(file).toLowerCase();

      // Only check optimization for original source formats (jpg, jpeg, png)
      // Skip webp and other already-optimized formats
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        continue; // Skip this file, it's already optimized or not a source format
      }

      // Check if optimized versions exist and are up to date
      const webpCachePath = path.join(cacheFileDir, path.basename(file, ext) + '.webp');
      const avifCachePath = path.join(cacheFileDir, path.basename(file, ext) + '.avif');

      // Skip files that are known to fail optimization (like unsupported formats)
      // We'll assume if the file has been processed before and failed, it will fail again
      try {
        // Quick check if the file can be processed by sharp
        const stats = fs.statSync(inputPath);
        if (stats.size === 0) {
          console.log(`🔍 Skipping empty file: ${file}`);
          continue; // Skip empty files
        }
      } catch (error) {
        console.log(`🔍 Skipping unreadable file: ${file}`);
        continue; // Skip files we can't read
      }

      if (!fs.existsSync(webpCachePath) || !fs.existsSync(avifCachePath)) {
        console.log(`🔍 Missing optimized versions for ${file}`);
        return true; // Missing optimized versions
      }

      if (needsRegeneration(inputPath, webpCachePath) || needsRegeneration(inputPath, avifCachePath)) {
        console.log(`🔍 Optimized versions outdated for ${file}`);
        return true; // Optimized versions are outdated
      }
    }
  }

  // Check for large project images that need responsive versions
  const largeProjectImages = [];
  const largeImageFiles = await glob('src/projects/*/images/*.{jpg,jpeg,png,gif,webp}', { cwd: process.cwd() });

  for (const file of largeImageFiles) {
    try {
      const inputPath = path.join(process.cwd(), file);
      const stats = fs.statSync(inputPath);
      if (stats.size > 500 * 1024) {
        largeProjectImages.push(file);
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  // Check if responsive versions exist for large images
  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const cacheProjectDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(projectImage, path.extname(projectImage));

    const projectSizes = [800, 1200, 1600];

    for (const size of projectSizes) {
      const webpCachePath = path.join(cacheProjectDir, `${baseName}-${size}.webp`);
      const avifCachePath = path.join(cacheProjectDir, `${baseName}-${size}.avif`);

      if (!fs.existsSync(webpCachePath) || !fs.existsSync(avifCachePath)) {
        return true; // Missing responsive versions
      }

      if (needsRegeneration(inputPath, webpCachePath) || needsRegeneration(inputPath, avifCachePath)) {
        return true; // Responsive versions are outdated
      }
    }
  }

  return false; // No optimization needed
}


async function generateResponsiveDevImages() {
  const srcDir = path.join(process.cwd(), 'src');
  const cacheDir = path.join(process.cwd(), '.image-cache');

  // Find all project images
  const projectFiles = await glob('src/projects/*/images/*.{jpg,jpeg,png}', { cwd: process.cwd() });
  const largeProjectImages = [];

  // Find large images
  for (const file of projectFiles) {
    try {
      const inputPath = path.join(process.cwd(), file);
      const stats = fs.statSync(inputPath);
      if (stats.size > 500 * 1024) {
        largeProjectImages.push(file);
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  // Generate responsive versions for large project images
  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const outputDir = path.join(srcDir, path.dirname(relativePath));
    const cacheProjectDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(projectImage, path.extname(projectImage));

    // Ensure directories exist
    if (!fs.existsSync(cacheProjectDir)) {
      fs.mkdirSync(cacheProjectDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Generate responsive sizes for project images
      const projectSizes = [800, 1200, 1600];

      for (const size of projectSizes) {
        const cachePath = path.join(cacheProjectDir, `${baseName}-${size}.webp`);
        const outputPath = path.join(outputDir, `${baseName}-${size}.webp`);
        if (needsRegeneration(inputPath, cachePath)) {
          await sharp(inputPath)
            .resize(size, null, {
              withoutEnlargement: true,
              fit: 'inside'
            })
            .webp({
              quality: 85,
              effort: 4
            })
            .toFile(cachePath);
          console.log(`✅ Generated dev responsive project image: ${cachePath}`);
        }
        fs.copyFileSync(cachePath, outputPath);
      }

      // Also generate AVIF versions
      for (const size of projectSizes) {
        const cachePath = path.join(cacheProjectDir, `${baseName}-${size}.avif`);
        const outputPath = path.join(outputDir, `${baseName}-${size}.avif`);
        if (needsRegeneration(inputPath, cachePath)) {
          await sharp(inputPath)
            .resize(size, null, {
              withoutEnlargement: true,
              fit: 'inside'
            })
            .avif({
              quality: 80,
              effort: 4
            })
            .toFile(cachePath);
          console.log(`✅ Generated dev responsive project AVIF: ${cachePath}`);
        }
        fs.copyFileSync(cachePath, outputPath);
      }

      console.log(`📱 Generated responsive images for: ${projectImage}`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

async function generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile = null) {
  for (const projectImage of largeProjectImages) {
    const inputPath = path.join(process.cwd(), projectImage);
    const relativePath = path.relative(srcDir, inputPath);
    const outputDirPath = isDev ? srcDir : distDir;
    const outputDirFull = path.join(outputDirPath, path.dirname(relativePath));
    const cacheProjectDir = path.join(cacheDir, path.dirname(relativePath));
    const baseName = path.basename(projectImage, path.extname(projectImage));

    // Ensure directories exist
    if (!fs.existsSync(cacheProjectDir)) {
      fs.mkdirSync(cacheProjectDir, { recursive: true });
    }
    if (!fs.existsSync(outputDirFull)) {
      fs.mkdirSync(outputDirFull, { recursive: true });
    }

    try {
      // Generate responsive sizes for project images
      const projectSizes = [800, 1200, 1600]; // Smaller sizes for project images

      for (const size of projectSizes) {
        const cachePath = path.join(cacheProjectDir, `${baseName}-${size}.webp`);
        const outputPath = path.join(outputDirFull, `${baseName}-${size}.webp`);
        if (needsRegeneration(inputPath, cachePath)) {
          await sharp(inputPath)
            .resize(size, null, {
              withoutEnlargement: true,
              fit: 'inside'
            })
            .webp({
              quality: 85,
              effort: 4
            })
            .toFile(cachePath);
          console.log(`✅ Generated cached responsive project image: ${cachePath}`);
        } else {
          console.log(`⏭️  Skipped responsive project image (cached): ${cachePath}`);
        }
        // Copy cached version to output
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
            console.warn(`Failed to copy WebP file: ${error.message}`);
          }
        }
      }

      // Also generate AVIF versions
      for (const size of projectSizes) {
        const cachePath = path.join(cacheProjectDir, `${baseName}-${size}.avif`);
        const outputPath = path.join(outputDirFull, `${baseName}-${size}.avif`);
        if (needsRegeneration(inputPath, cachePath)) {
          await sharp(inputPath)
            .resize(size, null, {
              withoutEnlargement: true,
              fit: 'inside'
            })
            .avif({
              quality: 80,
              effort: 4
            })
            .toFile(cachePath);
          console.log(`✅ Generated cached responsive project AVIF: ${cachePath}`);
        } else {
          console.log(`⏭️  Skipped responsive project AVIF (cached): ${cachePath}`);
        }
        // Copy cached version to output
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
            console.warn(`Failed to copy AVIF file: ${error.message}`);
          }
        }
      }

      console.log(`📱 Generated responsive images for: ${projectImage}`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate responsive images for ${projectImage}:`, error.message);
    }
  }
}

async function optimizeImages(isDev, emitFile = null) {
  const srcDir = path.join(process.cwd(), 'src');
  const distDir = isDev ? srcDir : path.join(process.cwd(), 'dist');
  const cacheDir = path.join(process.cwd(), '.image-cache');

  // Ensure cache directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Find all images in src directory
  const imagePatterns = [
    'src/assets/**/*.{jpg,jpeg,png,gif,webp}',
    'src/projects/*/images/*.{jpg,jpeg,png,gif,webp}'
  ];

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let processedCount = 0;
  const largeProjectImages = [];

  for (const pattern of imagePatterns) {
    const files = await glob(pattern, { cwd: process.cwd() });

    for (const file of files) {
      try {
        const inputPath = path.join(process.cwd(), file);
        const relativePath = path.relative(srcDir, inputPath);
        const outputPath = path.join(distDir, relativePath);
        const cachePath = path.join(cacheDir, relativePath);

        // Ensure directories exist
        const outputDir = path.dirname(outputPath);
        const cacheFileDir = path.dirname(cachePath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        if (!fs.existsSync(cacheFileDir)) {
          fs.mkdirSync(cacheFileDir, { recursive: true });
        }

        // Get original file size
        const originalStats = fs.statSync(inputPath);
        totalOriginalSize += originalStats.size;

        // Track large project images for responsive generation
        if (file.includes('src/projects/') && originalStats.size > 500 * 1024) {
          largeProjectImages.push(file);
        }

        const ext = path.extname(file).toLowerCase();
        const originalExt = path.extname(file);
        const baseName = path.basename(file, originalExt);

        // Skip if this is in src/assets and we're in dev mode and the file already exists
        // (don't overwrite originals in dev mode)
        if (isDev && outputPath.includes('src/assets') && ext !== '.webp' && ext !== '.avif' && fs.existsSync(outputPath)) {
          // Still generate WebP and AVIF versions if needed
        }

        // Optimize based on image type
        if (['.jpg', '.jpeg'].includes(ext)) {
          // Generate optimized JPEG (only in build mode)
          if (!isDev) {
            const cachedJpeg = path.join(cacheFileDir, `${baseName}${originalExt}`);
            if (needsRegeneration(inputPath, cachedJpeg)) {
              await sharp(inputPath)
                .jpeg({
                  quality: 85,
                  progressive: true,
                  mozjpeg: true
                })
                .toFile(cachedJpeg);
              console.log(`✅ Generated cached JPEG: ${cachedJpeg}`);
            }
            // Copy cached version to output
            fs.copyFileSync(cachedJpeg, outputPath);
          }

          // Generate WebP version
          const webpCachePath = path.join(cacheFileDir, `${baseName}.webp`);
          const webpOutputPath = path.join(outputDir, `${baseName}.webp`);
          if (needsRegeneration(inputPath, webpCachePath)) {
            await sharp(inputPath)
              .webp({
                quality: 85,
                effort: 4
              })
              .toFile(webpCachePath);
            console.log(`✅ Generated cached WebP: ${webpCachePath}`);
          } else {
            console.log(`⏭️  Skipped WebP (cached): ${webpCachePath}`);
          }
          // Copy cached version to output
          fs.copyFileSync(webpCachePath, webpOutputPath);

          // Generate AVIF version
          const avifCachePath = path.join(cacheFileDir, `${baseName}.avif`);
          const avifOutputPath = path.join(outputDir, `${baseName}.avif`);
          if (needsRegeneration(inputPath, avifCachePath)) {
            console.log(`📝 Generating cached AVIF: ${baseName} -> ${avifCachePath}`);
            try {
              await sharp(inputPath)
                .avif({
                  quality: 80,
                  effort: 4
                })
                .toFile(avifCachePath);
              console.log(`✅ Generated cached AVIF: ${avifCachePath}`);
            } catch (error) {
              console.error(`❌ Error generating AVIF ${avifCachePath}:`, error.message);
            }
          } else {
            console.log(`⏭️  Skipped AVIF (cached): ${avifCachePath}`);
          }
          // Copy cached version to output
          if (fs.existsSync(avifCachePath)) {
            if (!isDev && emitFile) {
              // In production, emit the file through Vite
              const relativeOutputPath = path.relative(distDir, avifOutputPath);
              const fileContent = fs.readFileSync(avifCachePath);
              emitFile({
                type: 'asset',
                fileName: relativeOutputPath,
                source: fileContent
              });
            } else {
              // In dev mode, copy directly
              try {
                fs.copyFileSync(avifCachePath, avifOutputPath);
              } catch (error) {
                console.warn(`Failed to copy AVIF file: ${error.message}`);
              }
            }
          }

        } else if (ext === '.png') {
          // Generate optimized PNG (only in build mode)
          if (!isDev) {
            const cachedPng = path.join(cacheFileDir, `${baseName}${originalExt}`);
            if (needsRegeneration(inputPath, cachedPng)) {
              await sharp(inputPath)
                .png({
                  quality: 90,
                  compressionLevel: 6,
                  palette: true
                })
                .toFile(cachedPng);
              console.log(`✅ Generated cached PNG: ${cachedPng}`);
            }
            // Copy cached version to output
            fs.copyFileSync(cachedPng, outputPath);
          }

          // Generate WebP version
          const webpCachePathPng = path.join(cacheFileDir, `${baseName}.webp`);
          const webpOutputPathPng = path.join(outputDir, `${baseName}.webp`);
          if (needsRegeneration(inputPath, webpCachePathPng)) {
            await sharp(inputPath)
              .webp({
                quality: 90,
                effort: 4
              })
              .toFile(webpCachePathPng);
            console.log(`✅ Generated cached WebP: ${webpCachePathPng}`);
          } else {
            console.log(`⏭️  Skipped WebP (cached): ${webpCachePathPng}`);
          }
          // Copy cached version to output
          fs.copyFileSync(webpCachePathPng, webpOutputPathPng);

          // Generate AVIF version
          const avifCachePathPng = path.join(cacheFileDir, `${baseName}.avif`);
          const avifOutputPathPng = path.join(outputDir, `${baseName}.avif`);
          if (needsRegeneration(inputPath, avifCachePathPng)) {
            await sharp(inputPath)
              .avif({
                quality: 85,
                effort: 4
              })
              .toFile(avifCachePathPng);
            console.log(`✅ Generated cached AVIF: ${avifCachePathPng}`);
          } else {
            console.log(`⏭️  Skipped AVIF (cached): ${avifCachePathPng}`);
          }
          // Copy cached version to output
          if (!isDev && emitFile) {
            // In production, emit the file through Vite
            const relativeOutputPath = path.relative(distDir, avifOutputPathPng);
            const fileContent = fs.readFileSync(avifCachePathPng);
            emitFile({
              type: 'asset',
              fileName: relativeOutputPath,
              source: fileContent
            });
          } else {
            // In dev mode, copy directly
            try {
              fs.copyFileSync(avifCachePathPng, avifOutputPathPng);
            } catch (error) {
              console.warn(`Failed to copy AVIF file: ${error.message}`);
            }
          }

        } else if (ext === '.webp') {
          // Copy WebP as-is (only in build mode)
          if (!isDev) {
            const cachedWebp = path.join(cacheFileDir, `${baseName}${originalExt}`);
            if (needsRegeneration(inputPath, cachedWebp)) {
              fs.copyFileSync(inputPath, cachedWebp);
              console.log(`✅ Cached WebP: ${cachedWebp}`);
            }
            // Copy cached version to output
            fs.copyFileSync(cachedWebp, outputPath);
          }

          // Generate AVIF version
          const avifCachePathWebp = path.join(cacheFileDir, `${baseName}.avif`);
          const avifOutputPathWebp = path.join(outputDir, `${baseName}.avif`);
          if (needsRegeneration(inputPath, avifCachePathWebp)) {
            await sharp(inputPath)
              .avif({
                quality: 85,
                effort: 4
              })
              .toFile(avifCachePathWebp);
            console.log(`✅ Generated cached AVIF: ${avifCachePathWebp}`);
          } else {
            console.log(`⏭️  Skipped AVIF (cached): ${avifCachePathWebp}`);
          }
          // Copy cached version to output
          if (!isDev && emitFile) {
            // In production, emit the file through Vite
            const relativeOutputPath = path.relative(distDir, avifOutputPathWebp);
            const fileContent = fs.readFileSync(avifCachePathWebp);
            emitFile({
              type: 'asset',
              fileName: relativeOutputPath,
              source: fileContent
            });
          } else {
            // In dev mode, copy directly
            try {
              fs.copyFileSync(avifCachePathWebp, avifOutputPathWebp);
            } catch (error) {
              console.warn(`Failed to copy AVIF file: ${error.message}`);
            }
          }
        }

        // Get optimized file size (for build mode statistics)
        if (!isDev && fs.existsSync(outputPath)) {
          const optimizedStats = fs.statSync(outputPath);
          totalOptimizedSize += optimizedStats.size;
        }

        // In dev mode, count WebP/AVIF sizes for statistics
        if (isDev) {
          const webpPath = path.join(outputDir, `${baseName}.webp`);
          const avifPath = path.join(outputDir, `${baseName}.avif`);

          if (fs.existsSync(webpPath)) {
            const webpStats = fs.statSync(webpPath);
            totalOptimizedSize += webpStats.size;
          }
          if (fs.existsSync(avifPath)) {
            const avifStats = fs.statSync(avifPath);
            totalOptimizedSize += avifStats.size;
          }
        }

        processedCount++;
        console.log(`✅ Optimized: ${file}`);

      } catch (error) {
        console.warn(`⚠️  Failed to optimize ${file}:`, error.message);
        // Copy original file if optimization fails
        try {
          if (!isDev) {
            fs.copyFileSync(inputPath, outputPath);
          }
        } catch (copyError) {
          console.error(`❌ Failed to copy ${file}:`, copyError.message);
        }
      }
    }
  }

  // Generate responsive images for hero images
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

      // Ensure cache directory exists
      if (!fs.existsSync(cacheHeroDir)) {
        fs.mkdirSync(cacheHeroDir, { recursive: true });
      }

      try {
        const inputPath = path.join(process.cwd(), heroImage);

        // Generate responsive sizes
        const sizes = [400, 800, 1200, 1600];

        for (const size of sizes) {
          const cachePath = path.join(cacheHeroDir, `${baseName}-${size}.webp`);
          const outputPath = path.join(outputDir, `${baseName}-${size}.webp`);
          if (needsRegeneration(inputPath, cachePath)) {
            await sharp(inputPath)
              .resize(size, null, {
                withoutEnlargement: true,
                fit: 'inside'
              })
              .webp({
                quality: 85,
                effort: 4
              })
              .toFile(cachePath);
            console.log(`✅ Generated cached responsive: ${cachePath}`);
          } else {
            console.log(`⏭️  Skipped responsive (cached): ${cachePath}`);
          }
          // Copy cached version to output
          fs.copyFileSync(cachePath, outputPath);
        }

        console.log(`📱 Generated responsive images for: ${heroImage}`);
      } catch (error) {
        console.warn(`⚠️  Failed to generate responsive images for ${heroImage}:`, error.message);
      }
    }
  }

  // Generate responsive images for large project images
  await generateResponsiveProjectImages(isDev, largeProjectImages, srcDir, distDir, cacheDir, emitFile);

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