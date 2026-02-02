const fs = require('fs');
const path = require('path');
jest.mock('fs');
jest.mock('path');

// Import the functions we want to test
// We'll need to extract the needsRegeneration function and related logic
function needsRegeneration(sourcePath, formatPath) {
  if (!fs.existsSync(formatPath)) return true;
  const sourceStats = fs.statSync(sourcePath);
  const optimizedStats = fs.statSync(formatPath);
  return sourceStats.mtime > optimizedStats.mtime;
}

describe('Image Optimizer Caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('needsRegeneration function', () => {
    test('should return true when optimized file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = needsRegeneration('/path/to/source.jpg', '/path/to/optimized.webp');

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/optimized.webp');
      expect(fs.statSync).not.toHaveBeenCalled();
    });

    test('should return false when source file is older than optimized file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((filePath) => {
        if (filePath === '/path/to/source.jpg') {
          return { mtime: new Date('2024-01-01T10:00:00Z') };
        } else if (filePath === '/path/to/optimized.webp') {
          return { mtime: new Date('2024-01-02T10:00:00Z') };
        }
      });

      const result = needsRegeneration('/path/to/source.jpg', '/path/to/optimized.webp');

      expect(result).toBe(false);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/optimized.webp');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/source.jpg');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/optimized.webp');
    });

    test('should return true when source file is newer than optimized file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((filePath) => {
        if (filePath === '/path/to/source.jpg') {
          return { mtime: new Date('2024-01-02T10:00:00Z') };
        } else if (filePath === '/path/to/optimized.webp') {
          return { mtime: new Date('2024-01-01T10:00:00Z') };
        }
      });

      const result = needsRegeneration('/path/to/source.jpg', '/path/to/optimized.webp');

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/optimized.webp');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/source.jpg');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/optimized.webp');
    });

    test('should return false when source and optimized files have the same modification time', () => {
      const sameTime = new Date('2024-01-01T10:00:00Z');
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation(() => ({ mtime: sameTime }));

      const result = needsRegeneration('/path/to/source.jpg', '/path/to/optimized.webp');

      expect(result).toBe(false);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/optimized.webp');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/source.jpg');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/optimized.webp');
    });
  });

  describe('caching behavior simulation', () => {
    test('should skip optimization when cached file exists and is newer', () => {
      // Simulate the caching logic used in the optimizer
      const sourcePath = '/path/to/source.jpg';
      const cachePath = '/path/to/cache/source.webp';

      fs.existsSync.mockReturnValue(true); // Cache file exists
      fs.statSync.mockImplementation((path) => {
        if (path === sourcePath) {
          return { mtime: new Date('2024-01-01T10:00:00Z') };
        } else if (path === cachePath) {
          return { mtime: new Date('2024-01-02T10:00:00Z') }; // Cache is newer
        }
      });

      const shouldRegenerate = needsRegeneration(sourcePath, cachePath);

      expect(shouldRegenerate).toBe(false);
      expect(fs.existsSync).toHaveBeenCalledWith(cachePath);
    });

    test('should regenerate when source file is newer than cached file', () => {
      // Simulate the caching logic used in the optimizer
      const sourcePath = '/path/to/source.jpg';
      const cachePath = '/path/to/cache/source.webp';

      fs.existsSync.mockReturnValue(true); // Cache file exists
      fs.statSync.mockImplementation((path) => {
        if (path === sourcePath) {
          return { mtime: new Date('2024-01-02T10:00:00Z') }; // Source is newer
        } else if (path === cachePath) {
          return { mtime: new Date('2024-01-01T10:00:00Z') }; // Cache is older
        }
      });

      const shouldRegenerate = needsRegeneration(sourcePath, cachePath);

      expect(shouldRegenerate).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(cachePath);
    });
  });

  describe('cache invalidation scenarios', () => {
    test('should handle missing source file gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((path) => {
        if (path.includes('source')) {
          throw new Error('ENOENT: no such file or directory');
        }
        return { mtime: new Date('2024-01-01T10:00:00Z') };
      });

      expect(() => {
        needsRegeneration('/path/to/missing-source.jpg', '/path/to/optimized.webp');
      }).toThrow('ENOENT: no such file or directory');
    });

    test('should handle missing optimized file gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      fs.statSync.mockImplementation(() => {
        throw new Error('Should not be called when file does not exist');
      });

      const result = needsRegeneration('/path/to/source.jpg', '/path/to/missing-optimized.webp');

      expect(result).toBe(true);
      expect(fs.statSync).not.toHaveBeenCalled();
    });

    test('should handle filesystem errors during stat operations', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => {
        needsRegeneration('/path/to/source.jpg', '/path/to/optimized.webp');
      }).toThrow('EACCES: permission denied');
    });
  });
});