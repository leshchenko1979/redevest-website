import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { glob } from 'glob';

// Helper function to check if optimized files need to be regenerated
function needsRegeneration(sourcePath, formatPath) {
  if (!fs.existsSync(formatPath)) return true;
  const sourceStats = fs.statSync(sourcePath);
  const optimizedStats = fs.statSync(formatPath);
  return sourceStats.mtime > optimizedStats.mtime;
}

async function optimizeImages(isDev) {
  const srcDir = path.join(process.cwd(), 'src');
  const distDir = isDev ? srcDir : path.join(process.cwd(), 'dist');

  // Find all images in src directory
  const imagePatterns = [
    'src/assets/**/*.{jpg,jpeg,png,gif,webp}',
    'src/projects/*/images/*.{jpg,jpeg,png,gif,webp}'
  ];

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let processedCount = 0;

  for (const pattern of imagePatterns) {
    const files = await glob(pattern, { cwd: process.cwd() });

    for (const file of files) {
      try {
        const inputPath = path.join(process.cwd(), file);
        const relativePath = path.relative(srcDir, inputPath);
        const outputPath = path.join(distDir, relativePath);

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Get original file size
        const originalStats = fs.statSync(inputPath);
        totalOriginalSize += originalStats.size;

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
            await sharp(inputPath)
              .jpeg({
                quality: 85,
                progressive: true,
                mozjpeg: true
              })
              .toFile(outputPath);
          }

          // Generate WebP version (only if needed)
          const webpPath = path.join(outputDir, `${baseName}.webp`);
          if (needsRegeneration(inputPath, webpPath)) {
            await sharp(inputPath)
              .webp({
                quality: 85,
                effort: 4
              })
              .toFile(webpPath);
            console.log(`✅ Generated WebP: ${webpPath}`);
          } else {
            console.log(`⏭️  Skipped WebP (cached): ${webpPath}`);
          }

          // Generate AVIF version (only if needed)
          const avifPath = `${outputDir}/${baseName}.avif`;
          if (needsRegeneration(inputPath, avifPath)) {
            console.log(`📝 Generating AVIF: ${baseName} -> ${avifPath}`);
            try {
              // Use the full path as-is - sharp should respect the extension
              await sharp(inputPath)
                .avif({
                  quality: 80,
                  effort: 4
                })
                .toFile(avifPath);

              // Verify the file was created with correct name
              if (fs.existsSync(avifPath)) {
                console.log(`✅ Generated AVIF: ${avifPath}`);
              } else {
                console.error(`❌ AVIF file not found after creation: ${avifPath}`);
                // Check if it was created with wrong name
                const dirFiles = fs.readdirSync(outputDir);
                const avifFiles = dirFiles.filter(f => f.endsWith('.avif') || !f.includes('.'));
                console.log(`Files in output dir: ${avifFiles.join(', ')}`);
              }
            } catch (error) {
              console.error(`❌ Error generating AVIF ${avifPath}:`, error.message);
            }
          } else {
            console.log(`⏭️  Skipped AVIF (cached): ${avifPath}`);
          }

        } else if (ext === '.png') {
          // Generate optimized PNG (only in build mode)
          if (!isDev) {
            await sharp(inputPath)
              .png({
                quality: 90,
                compressionLevel: 6,
                palette: true
              })
              .toFile(outputPath);
          }

          // Generate WebP version (only if needed)
          const webpPathPng = path.join(outputDir, `${baseName}.webp`);
          if (needsRegeneration(inputPath, webpPathPng)) {
            await sharp(inputPath)
              .webp({
                quality: 90,
                effort: 4
              })
              .toFile(webpPathPng);
            console.log(`✅ Generated WebP: ${webpPathPng}`);
          } else {
            console.log(`⏭️  Skipped WebP (cached): ${webpPathPng}`);
          }

          // Generate AVIF version (only if needed)
          const avifPathPng = path.join(outputDir, `${baseName}.avif`);
          if (needsRegeneration(inputPath, avifPathPng)) {
            await sharp(inputPath)
              .avif({
                quality: 85,
                effort: 4
              })
              .toFile(avifPathPng);
            console.log(`✅ Generated AVIF: ${avifPathPng}`);
          } else {
            console.log(`⏭️  Skipped AVIF (cached): ${avifPathPng}`);
          }

        } else if (ext === '.webp') {
          // Copy WebP as-is (only in build mode)
          if (!isDev) {
            fs.copyFileSync(inputPath, outputPath);
          }

              // Generate AVIF version (only if needed)
              const avifPathWebp = path.join(outputDir, `${baseName}.avif`);
              if (needsRegeneration(inputPath, avifPathWebp)) {
                await sharp(inputPath)
                  .avif({
                    quality: 85,
                    effort: 4
                  })
                  .toFile(avifPathWebp);
                console.log(`✅ Generated AVIF: ${avifPathWebp}`);
              } else {
                console.log(`⏭️  Skipped AVIF (cached): ${avifPathWebp}`);
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
      const baseName = path.basename(heroImage, path.extname(heroImage));

      try {
        const inputPath = path.join(process.cwd(), heroImage);

        // Generate responsive sizes (only if needed)
        const sizes = [400, 800, 1200, 1600];

        for (const size of sizes) {
          const outputPath = path.join(outputDir, `${baseName}-${size}.webp`);
          if (needsRegeneration(inputPath, outputPath)) {
            await sharp(inputPath)
              .resize(size, null, {
                withoutEnlargement: true,
                fit: 'inside'
              })
              .webp({
                quality: 85,
                effort: 4
              })
              .toFile(outputPath);
            console.log(`✅ Generated responsive: ${outputPath}`);
          } else {
            console.log(`⏭️  Skipped responsive (cached): ${outputPath}`);
          }
        }

        console.log(`📱 Generated responsive images for: ${heroImage}`);
      } catch (error) {
        console.warn(`⚠️  Failed to generate responsive images for ${heroImage}:`, error.message);
      }
    }
  }

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
        console.log('🖼️  Generating optimized images for development...');
        optimizeImages(isDev);

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
      await optimizeImages(isDev);
    }
  };
}