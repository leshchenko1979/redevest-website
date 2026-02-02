const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizePeoplePhotos() {
  const photos = [
    {
      input: 'src/assets/founder.png',
      output: 'src/assets/founder-optimized.jpg',
      size: 300
    },
    {
      input: 'src/projects/golubitskaya/images/BeautyPlus_20210922154159771_save.jpg',
      output: 'src/projects/golubitskaya/images/ksenia-optimized.jpg',
      size: 300
    }
  ];

  for (const photo of photos) {
    try {
      console.log(`Optimizing ${photo.input}...`);

      const stats = fs.statSync(photo.input);
      console.log(`Original size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      await sharp(photo.input)
        .resize(photo.size, photo.size, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toFile(photo.output);

      const newStats = fs.statSync(photo.output);
      console.log(`Optimized size: ${(newStats.size / 1024).toFixed(2)} KB`);
      console.log(`Compression ratio: ${(stats.size / newStats.size).toFixed(1)}x\n`);

    } catch (error) {
      console.error(`Error optimizing ${photo.input}:`, error.message);
    }
  }
}

optimizePeoplePhotos();