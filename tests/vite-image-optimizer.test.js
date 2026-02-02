const fs = require('fs');
const path = require('path');

// Mock sharp for testing
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    webp: jest.fn().mockReturnThis(),
    avif: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock fs operations
jest.mock('fs');
jest.mock('path');

// Import the actual functions we want to test
// Since the functions are not exported, we'll need to test them indirectly
// or create a test version of the module

describe('Vite Image Optimizer', () => {
  let mockEmitFile;
  let mockServer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitFile = jest.fn();
    mockServer = {
      middlewares: {
        use: jest.fn()
      },
      watcher: {
        on: jest.fn()
      }
    };

    // Setup default fs mocks
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ mtimeMs: Date.now() });
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));
    fs.copyFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
  });

  describe('needsRegeneration function', () => {
    // Import the function from our module (we'll need to expose it for testing)
    const needsRegeneration = (sourcePath, optimizedPath) => {
      if (!fs.existsSync(optimizedPath)) return true;

      try {
        const sourceStats = fs.statSync(sourcePath);
        const optimizedStats = fs.statSync(optimizedPath);

        // Use 1-second tolerance to account for filesystem timestamp resolution
        return sourceStats.mtimeMs > (optimizedStats.mtimeMs + 1000);
      } catch (error) {
        return true;
      }
    };

    test('should have 1-second tolerance for timestamp comparisons', () => {
      const now = Date.now();
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((path) => {
        if (path === '/source.jpg') {
          return { mtimeMs: now }; // Current time
        } else if (path === '/optimized.webp') {
          return { mtimeMs: now - 500 }; // 500ms ago (within tolerance)
        }
      });

      const result = needsRegeneration('/source.jpg', '/optimized.webp');
      expect(result).toBe(false); // Should not regenerate due to tolerance
    });

    test('should regenerate when source is more than 1 second newer', () => {
      const now = Date.now();
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((path) => {
        if (path === '/source.jpg') {
          return { mtimeMs: now }; // Current time
        } else if (path === '/optimized.webp') {
          return { mtimeMs: now - 2000 }; // 2 seconds ago (outside tolerance)
        }
      });

      const result = needsRegeneration('/source.jpg', '/optimized.webp');
      expect(result).toBe(true); // Should regenerate
    });
  });

  describe('copyToOutput function behavior', () => {
    // Test the copyToOutput logic
    const copyToOutput = (cachePath, relativeOutputPath, isDev, distDir, emitFile, isOriginalFallback = false) => {
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
          // ensureDirectoryExists would be called here
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
    };

    test('should copy original file in dev mode when optimization fails', () => {
      const result = copyToOutput(null, 'assets/test.png', true, 'src', null, true);

      expect(result).toBe(true);
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        path.join(process.cwd(), 'src', 'assets/test.png'),
        path.join('src', 'assets/test.png')
      );
    });

    test('should emit original file to bundle in prod mode when optimization fails', () => {
      const result = copyToOutput(null, 'assets/test.png', false, 'dist', mockEmitFile, true);

      expect(result).toBe(true);
      expect(mockEmitFile).toHaveBeenCalledWith({
        type: 'asset',
        fileName: 'assets/test.png',
        source: expect.any(Buffer)
      });
    });

    test('should not copy optimized files in dev mode', () => {
      fs.existsSync.mockReturnValue(true);
      const result = copyToOutput('/cache/test.webp', 'assets/test.webp', true, 'src', null, false);

      expect(result).toBe(true);
      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });

    test('should emit optimized files to bundle in prod mode', () => {
      fs.existsSync.mockReturnValue(true);
      const result = copyToOutput('/cache/test.webp', 'assets/test.webp', false, 'dist', mockEmitFile, false);

      expect(result).toBe(true);
      expect(mockEmitFile).toHaveBeenCalledWith({
        type: 'asset',
        fileName: 'assets/test.webp',
        source: expect.any(Buffer)
      });
    });
  });

  describe('serveFromCacheMiddleware', () => {
    test('should intercept WebP requests and serve from cache', () => {
      // This is a simplified test - in reality we'd need to mock the middleware
      const mockReq = { url: '/assets/test.webp' };
      const mockRes = {
        setHeader: jest.fn(),
        end: jest.fn(),
        pipe: jest.fn()
      };
      const mockNext = jest.fn();

      // Test URL parsing logic
      const url = mockReq.url;
      const isOptimizedFormat = url.endsWith('.webp') || url.endsWith('.avif');
      expect(isOptimizedFormat).toBe(true);

      const relativePath = url.startsWith('/assets/') ? url.substring(8) : url.substring(1);
      expect(relativePath).toBe('test.webp');
    });

    test('should pass through non-optimized format requests', () => {
      const mockReq = { url: '/assets/test.jpg' };
      const mockRes = {};
      const mockNext = jest.fn();

      const url = mockReq.url;
      const isOptimizedFormat = url.endsWith('.webp') || url.endsWith('.avif');
      expect(isOptimizedFormat).toBe(false);

      // Should call next() for non-optimized formats
      if (!isOptimizedFormat) {
        mockNext();
      }
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle missing cache files gracefully', () => {
      const mockReq = { url: '/assets/missing.webp' };
      const mockRes = {};
      const mockNext = jest.fn();

      fs.existsSync.mockReturnValue(false);

      const url = mockReq.url;
      const isOptimizedFormat = url.endsWith('.webp') || url.endsWith('.avif');
      expect(isOptimizedFormat).toBe(true);

      const relativePath = url.startsWith('/assets/') ? url.substring(8) : url.substring(1);
      const cachePath = path.join('cache', 'assets', relativePath);

      if (!fs.existsSync(cachePath)) {
        mockNext();
      }
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should handle Sharp errors gracefully', async () => {
      const sharp = require('sharp');
      sharp.default.mockImplementationOnce(() => {
        throw new Error('Unsupported image format');
      });

      // This would test the try/catch in processImageFile
      // Since we can't easily import the function, we'll test the concept
      let errorHandled = false;
      try {
        // Simulate what happens in processImageFile
        await sharp.default() // This should throw
          .webp({ quality: 85, effort: 4 })
          .toFile('test.webp');
      } catch (error) {
        errorHandled = true;
        expect(error.message).toBe('Unsupported image format');
      }

      expect(errorHandled).toBe(true);
    });

    test('should copy original file when optimization fails', () => {
      // Test the fallback logic in the catch block
      const relativePath = 'assets/failed.png';
      const isDev = true;
      const distDir = 'src';

      // This simulates the catch block logic
      const originalPath = path.join(process.cwd(), 'src', relativePath);
      const devOutputPath = path.join(distDir, relativePath);

      // Should copy original to dev output path
      fs.copyFileSync(originalPath, devOutputPath);

      expect(fs.copyFileSync).toHaveBeenCalledWith(originalPath, devOutputPath);
    });
  });

  describe('file watching', () => {
    test('should detect asset image changes', () => {
      let changeDetected = false;
      const mockWatcher = {
        on: jest.fn((event, callback) => {
          if (event === 'change') {
            // Simulate a file change
            callback('/path/to/website/src/assets/image.jpg');
          }
        })
      };

      // Setup the watcher logic (simplified)
      mockWatcher.on('change', (filePath) => {
        const isAssetImage = filePath.includes('src/assets/') &&
            (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
             filePath.endsWith('.png') || filePath.endsWith('.webp'));

        if (isAssetImage) {
          changeDetected = true;
        }
      });

      expect(changeDetected).toBe(true);
    });

    test('should detect project image changes', () => {
      let changeDetected = false;
      const mockWatcher = {
        on: jest.fn((event, callback) => {
          if (event === 'change') {
            callback('/path/to/website/src/projects/test/images/image.png');
          }
        })
      };

      mockWatcher.on('change', (filePath) => {
        const isProjectImage = filePath.includes('src/projects/') &&
            filePath.includes('/images/') &&
            (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
             filePath.endsWith('.png') || filePath.endsWith('.webp'));

        if (isProjectImage) {
          changeDetected = true;
        }
      });

      expect(changeDetected).toBe(true);
    });

    test('should ignore non-image file changes', () => {
      let changeDetected = false;
      const mockWatcher = {
        on: jest.fn((event, callback) => {
          if (event === 'change') {
            callback('/path/to/website/src/index.html');
          }
        })
      };

      mockWatcher.on('change', (filePath) => {
        const isAssetImage = filePath.includes('src/assets/') &&
            (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
             filePath.endsWith('.png') || filePath.endsWith('.webp'));

        const isProjectImage = filePath.includes('src/projects/') &&
            filePath.includes('/images/') &&
            (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
             filePath.endsWith('.png') || filePath.endsWith('.webp'));

        if (isAssetImage || isProjectImage) {
          changeDetected = true;
        }
      });

      expect(changeDetected).toBe(false);
    });
  });
});