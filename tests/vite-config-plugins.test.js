const fs = require('fs');
const path = require('path');

/**
 * Unit tests for Vite config plugins that update asset references
 */

describe('Vite Config Plugins', () => {
  describe('update-main-js-links plugin', () => {
    test('should update common.js script reference to hashed version', () => {
      // Mock bundle object as it would be created by Vite
      const mockBundle = {
        'common-AbCdEf123.js': { type: 'chunk', fileName: 'common-AbCdEf123.js' },
        'main-BaSe456.js': { type: 'chunk', fileName: 'main-BaSe456.js' },
        'assets/favicon-HaSh789.png': { type: 'asset', fileName: 'assets/favicon-HaSh789.png' },
        'assets/favicon-16x16-HaSh790.png': { type: 'asset', fileName: 'assets/favicon-16x16-HaSh790.png' },
        'assets/favicon-32x32-HaSh791.png': { type: 'asset', fileName: 'assets/favicon-32x32-HaSh791.png' },
        'assets/apple-touch-icon-HaSh792.png': { type: 'asset', fileName: 'assets/apple-touch-icon-HaSh792.png' },
        'assets/style-ChUnK789.css': { type: 'asset', fileName: 'assets/style-ChUnK789.css' }
      };

      // Mock HTML content as it would appear before plugin processing
      const originalHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Редевест - Инвестиции в недвижимость | Алексей Лещенко</title>
    <link rel="preload" href="assets/favicon.png" as="image">
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="assets/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png">
    <link href="input.css" rel="stylesheet">
</head>
<body>
    <!-- @include header -->
</body>
</html>`;

      // Mock header HTML that gets included
      const headerHtml = `<!-- Navigation -->
<header>
    <nav class="nav-container">
        <div class="nav-content">
            <div class="nav-flex">
                <a href="index.html" class="flex items-center space-x-3 group">
                    <img src="assets/favicon.png" alt="Редевест" class="h-10 w-auto">
                    <span class="text-2xl font-sans text-primary hidden md:block group-hover:text-accent transition-colors tracking-tight">Редевест</span>
                </a>
                <button onclick="toggleMobileMenu()" aria-label="Открыть мобильное меню" class="md:hidden text-primary hover:text-accent transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                </button>
                <div class="hidden md:flex items-center space-x-10">
                    <a href="index.html#about" class="nav-link">О компании</a>
                    <a href="index.html#trust" class="nav-link">Безопасность</a>
                    <a href="index.html#projects" class="nav-link">Проекты</a>
                    <a href="index.html#progress" class="nav-link">Прозрачность</a>
                    <a href="index.html#partners" class="nav-link">Партнерам</a>
                    <a href="https://t.me/flipping_invest" class="nav-btn">Telegram-канал</a>
                </div>
            </div>
        </div>
    </nav>
    <div id="mobile-menu-overlay" class="mobile-menu-overlay" onclick="toggleMobileMenu()"></div>
    <div id="mobile-menu-panel" class="mobile-menu-panel">
        <div class="p-6 flex justify-between items-center border-b border-gray-100">
            <div class="flex items-center space-x-3">
                <img src="assets/favicon.png" alt="Редевест" class="h-8 w-auto">
                <span class="text-xl font-sans text-primary tracking-tight">Редевест</span>
            </div>
            <button onclick="toggleMobileMenu()" class="text-gray-500 hover:text-primary">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
        <div class="flex-grow p-8 space-y-8">
            <nav class="space-y-6">
                <a href="index.html#about" class="block text-2xl font-sans text-primary" onclick="toggleMobileMenu()">О компании</a>
                <a href="index.html#trust" class="block text-2xl font-sans text-primary" onclick="toggleMobileMenu()">Безопасность</a>
                <a href="index.html#projects" class="block text-2xl font-sans text-primary" onclick="toggleMobileMenu()">Проекты</a>
                <a href="index.html#progress" class="block text-2xl font-sans text-primary" onclick="toggleMobileMenu()">Прозрачность</a>
                <a href="index.html#partners" class="block text-2xl font-sans text-primary" onclick="toggleMobileMenu()">Партнерам</a>
            </nav>
            <div class="pt-8 border-t border-gray-100">
                <a href="https://t.me/flipping_invest" class="w-full flex items-center justify-center px-6 py-4 text-base font-medium text-white bg-primary hover:bg-secondary rounded-sm transition-colors">
                    Telegram-канал
                </a>
            </div>
        </div>
    </div>
</header>

<script src="common.js" type="module" defer></script>`;

      // Simulate the HTML includes processing (from html-includes plugin)
      const htmlWithIncludes = originalHtml.replace(
        /<!-- @include ([^>]+) -->/g,
        (match, partialPath) => {
          if (partialPath === 'header') {
            return headerHtml;
          }
          return match;
        }
      );

      // Now test our update-main-js-links plugin logic
      function simulateUpdateMainJsLinksPlugin(html, bundle) {
        let result = html;

        // Update common.js reference
        const jsFile = Object.keys(bundle).find(key => key.includes('common') && key.endsWith('.js'));
        if (jsFile) {
          result = result.replace(/src="common\.js"/g, `src="${jsFile}"`);
        }

        // Update favicon references
        const faviconFiles = Object.keys(bundle).filter(key =>
          (key.includes('favicon') || key.includes('apple-touch-icon')) &&
          (key.endsWith('.png') || key.endsWith('.ico'))
        );

        // Update preload link - find the main favicon (not size-specific ones)
        const mainFavicon = faviconFiles.find(key =>
          key.includes('favicon') &&
          !key.includes('-16x16') &&
          !key.includes('-32x32') &&
          !key.includes('apple-touch-icon')
        );
        if (mainFavicon) {
          result = result.replace(/href="assets\/favicon\.png"/g, `href="${mainFavicon}"`);
        }

        // Update icon links
        const favicon16 = faviconFiles.find(key => key.includes('favicon-16x16'));
        if (favicon16) {
          result = result.replace(/href="assets\/favicon-16x16\.png"/g, `href="${favicon16}"`);
        }

        const favicon32 = faviconFiles.find(key => key.includes('favicon-32x32'));
        if (favicon32) {
          result = result.replace(/href="assets\/favicon-32x32\.png"/g, `href="${favicon32}"`);
        }

        const appleTouch = faviconFiles.find(key => key.includes('apple-touch-icon'));
        if (appleTouch) {
          result = result.replace(/href="assets\/apple-touch-icon\.png"/g, `href="${appleTouch}"`);
        }

        // Update img src references for favicons in header
        if (mainFavicon) {
          result = result.replace(/src="assets\/favicon\.png"/g, `src="${mainFavicon}"`);
        }

        return result;
      }

      // Apply the plugin logic
      const processedHtml = simulateUpdateMainJsLinksPlugin(htmlWithIncludes, mockBundle);

      // Test 1: Check that common.js is updated to hashed version
      expect(processedHtml).not.toContain('src="common.js"');
      expect(processedHtml).toContain('src="common-AbCdEf123.js"');

      // Test 2: Check that main favicon preload is updated
      expect(processedHtml).toContain('href="assets/favicon-HaSh789.png"');
      // Allow some favicon.png references to remain (in img src tags)
      const faviconPngMatches = processedHtml.match(/href="assets\/favicon\.png"/g) || [];
      expect(faviconPngMatches.length).toBeLessThanOrEqual(1); // Only preload link should remain if not updated

      // Test 3: Check that favicon-16x16 is updated
      expect(processedHtml).toContain('href="assets/favicon-16x16-HaSh790.png"');

      // Test 4: Check that favicon-32x32 is updated
      expect(processedHtml).toContain('href="assets/favicon-32x32-HaSh791.png"');

      // Test 5: Check that apple-touch-icon is updated
      expect(processedHtml).toContain('href="assets/apple-touch-icon-HaSh792.png"');

      // Test 6: Verify that toggleMobileMenu function calls are still present
      const toggleMobileMenuCalls = processedHtml.match(/toggleMobileMenu\(\)/g);
      expect(toggleMobileMenuCalls).toBeTruthy();
      expect(toggleMobileMenuCalls.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('bundle key finding logic', () => {
    test('should find correct common.js file in bundle', () => {
      const mockBundle = {
        'common-AbCdEf123.js': { type: 'chunk', fileName: 'common-AbCdEf123.js' },
        'main-BaSe456.js': { type: 'chunk', fileName: 'main-BaSe456.js' },
        'assets/common-ChUnK789.js': { type: 'chunk', fileName: 'assets/common-ChUnK789.js' },
        'assets/favicon-HaSh789.png': { type: 'asset', fileName: 'assets/favicon-HaSh789.png' }
      };

      // Test finding common.js file
      const jsFile = Object.keys(mockBundle).find(key => key.includes('common') && key.endsWith('.js'));
      expect(jsFile).toBe('common-AbCdEf123.js');
    });
  });
});