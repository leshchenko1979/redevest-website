const { processCustomBlocks } = require('../build-markdown');

/**
 * Unit test for column processing functionality
 */
async function testColumnProcessing() {
  console.log('Running column processing tests...');

  // Test the problematic case from lubenki.md
  const testMarkdown = `[[columns]]
| [[column]]
| | **Основная инфраструктура:**
| | - Дорожные сети
| | - Электричество
| [[column]]
| | **Рекреационная зона (2 га):**
| | - Благоустроенный пляж
| | - Мини-зоопарк

## Преимущества для инвестора

Some other content`;

  const result = await processCustomBlocks(testMarkdown);

  console.log('Input:');
  console.log(testMarkdown);
  console.log('\nOutput:');
  console.log(result);

  // Check if the heading is properly separated from the columns
  const hasCleanHeading = result.includes('## Преимущества для инвестора') &&
                         !result.includes('## Преимущества для инвестора</div>');

  if (!hasCleanHeading) {
    console.error('❌ Test FAILED: Heading is not properly separated from columns');
    return false;
  } else {
    console.log('✅ Test PASSED: Heading is properly separated from columns');
  }

  // Check if columns are properly formed
  const hasProperColumns = result.includes('<div class="notion-columns">') &&
                          result.includes('<div class="notion-column">');

  if (!hasProperColumns) {
    console.error('❌ Test FAILED: Columns are not properly formed');
    return false;
  } else {
    console.log('✅ Test PASSED: Columns are properly formed');
  }

  return true;
}

// Run tests
if (require.main === module) {
  testColumnProcessing().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testColumnProcessing
};