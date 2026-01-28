const marked = require('marked');

/**
 * Test if marked is working correctly
 */

function testMarked() {
  console.log('Testing marked library...');

  const testMarkdown = `## Test Heading

This is a paragraph.

- List item 1
- List item 2`;

  const result = marked.parse(testMarkdown);
  console.log('Input:');
  console.log(testMarkdown);
  console.log('\nOutput:');
  console.log(result);

  const hasH2 = result.includes('<h2');
  const hasP = result.includes('<p>');
  const hasUl = result.includes('<ul>');

  if (hasH2 && hasP && hasUl) {
    console.log('✅ Marked is working correctly');
    return true;
  } else {
    console.error('❌ Marked is not working correctly');
    console.error('Has h2:', hasH2, 'Has p:', hasP, 'Has ul:', hasUl);
    return false;
  }
}

// Run test
if (require.main === module) {
  const success = testMarked();
  process.exit(success ? 0 : 1);
}

module.exports = {
  testMarked
};