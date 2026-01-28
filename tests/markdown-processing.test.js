const { processMarkdownFile, findProjects } = require('../build-markdown');
const { processCustomBlocks, fixImagePaths } = require('./test-helpers');

// Mock fs для тестирования
const fs = require('fs');
const path = require('path');
jest.mock('fs');
jest.mock('path');

// Mock marked
jest.mock('marked', () => ({
  parse: jest.fn((markdown) => `<p>${markdown.replace(/\n/g, '<br>')}</p>`)
}));

// Mock gray-matter
jest.mock('gray-matter', () => ({
  __esModule: true,
  default: jest.fn((content) => ({
    data: { title: 'Test Title', slug: 'test-slug' },
    content: content.replace(/^---[\s\S]*?---\n/, '')
  }))
}));

const matter = require('gray-matter').default;

describe('Markdown Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processCustomBlocks', () => {
    test('should process columns correctly (new syntax)', () => {
      const input = `[[columns]]
[[column]]
Content 1
[[column]]
Content 2
[[/columns]]`;

      const expected = `<div class="notion-columns"><div class="notion-column">Content 1</div><div class="notion-column">Content 2</div></div>`;

      const result = processCustomBlocks(input);
      expect(result.trim()).toBe(expected);
    });

    test('should process columns correctly (old syntax)', () => {
      const input = `[[columns]] | [[column]] | | Content 1 | [[column]] | | Content 2`;

      const expected = `<div class="notion-columns"><div class="notion-column">Content 1</div><div class="notion-column">Content 2</div></div>`;

      const result = processCustomBlocks(input);
      expect(result.trim()).toBe(expected);
    });

    test('should process callout blocks correctly', () => {
      const input = `[[callout | info]]
| This is an info callout`;

      const expected = `<div class="notion-callout notion-callout-info">
This is an info callout
</div>`;

      const result = processCustomBlocks(input);
      expect(result).toBe(expected);
    });

    test('should process toggle blocks correctly', () => {
      const input = `[[toggle | Test Title]]
| Content line 1
| Content line 2`;

      const expected = `<details class="notion-toggle">
<summary>Test Title</summary>
<div>
Content line 1
Content line 2
</div>
</details>`;

      const result = processCustomBlocks(input);
      expect(result).toBe(expected);
    });
  });

  describe('fixImagePaths', () => {
    test('should fix image paths correctly', () => {
      const input = `<img src="images/photo.jpg" alt="test">`;
      const expected = `<img src="../assets/projects/test-project/images/photo.jpg" alt="test">`;

      const result = fixImagePaths(input, 'test-project');
      expect(result).toBe(expected);
    });
  });

  describe('processMarkdownFile', () => {
    test('should process markdown file correctly', async () => {
      const mockFileContent = `---
title: "Test Project"
slug: "test-project"
---

# Header

Some content with **bold** text.`;

      fs.readFileSync.mockReturnValue(mockFileContent);

      // Mock matter to return correct structure
      matter.mockReturnValueOnce({
        data: { title: 'Test Project', slug: 'test-project' },
        content: '\n# Header\n\nSome content with **bold** text.'
      });

      const result = await processMarkdownFile('/path/to/test.md', 'test-project');

      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.title).toBe('Test Project');
      expect(result.metadata.slug).toBe('test-project');
    });
  });

  describe('findProjects', () => {
    test('should find projects correctly', () => {
      const mockItems = ['project1', 'project2', 'not-a-project'];

      path.join.mockImplementation((...args) => args.join('/'));
      fs.existsSync.mockImplementation((path) => {
        // Возвращаем true для всех путей, кроме not-a-project.md
        return !path.includes('not-a-project/not-a-project.md');
      });
      fs.readdirSync.mockReturnValue(mockItems);
      fs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = findProjects();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('slug', 'project1');
      expect(result[0]).toHaveProperty('mdPath', '/Users/leshchenko/redevest-ai/website/src/projects/project1/project1.md');
    });
  });
});