const marked = require('marked');

/**
 * Test if marked processes markdown correctly when it contains HTML
 */

function testMarkedWithHTML() {
  // Test case similar to what happens in the processing
  const testContent = `Some text here.

<div class="content-columns"><div class="content-column">Content</div></div>

## Преимущества для инвестора

<div class="content-callout content-callout-success">
**Bold text**
</div>

## Another Heading

More text.`;

  console.log('Testing marked with HTML content:');
  console.log(testContent);

  const result = marked.parse(testContent);
  console.log('\nResult:');
  console.log(result);

  const hasMarkdownHeading = result.includes('## Преимущества для инвестора');
  const hasHtmlHeading = result.includes('<h2>Преимущества для инвестора</h2>');

  console.log('\nHeading check:');
  console.log('Has markdown heading:', hasMarkdownHeading);
  console.log('Has HTML heading:', hasHtmlHeading);

  if (hasMarkdownHeading) {
    console.error('❌ Marked failed to convert heading to HTML');
    return false;
  } else if (hasHtmlHeading) {
    console.log('✅ Marked converted heading correctly');
    return true;
  } else {
    console.log('✅ Heading not found (unexpected)');
    return false;
  }
}

// Run test
if (require.main === module) {
  const success = testMarkedWithHTML();
  process.exit(success ? 0 : 1);
}

module.exports = {
  testMarkedWithHTML
};