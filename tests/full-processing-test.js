const fs = require('fs');
const path = require('path');
const matter = require('gray-matter').default || require('gray-matter');
const marked = require('marked');
const { processCustomBlocks } = require('../build-markdown');

/**
 * Test the full processing pipeline on lubenki.md
 */

function testFullProcessing() {
  const filePath = path.join(__dirname, '../src/projects/lubenki/lubenki.md');

  // Read file
  const fileContent = fs.readFileSync(filePath, 'utf8');
  console.log('=== Original file content ===');
  console.log(fileContent.substring(0, 500) + '...');

  // Parse frontmatter
  const { data: metadata, content } = matter(fileContent);
  console.log('\n=== Content after frontmatter parsing ===');
  console.log(content.substring(300, 400) + '...'); // Show around the problematic area

  // Process custom blocks
  const processedContent = processCustomBlocks(content);
  console.log('\n=== Content after custom block processing ===');
  console.log(processedContent.substring(400, 600) + '...'); // Show around the problematic area

  // Convert to HTML
  const html = marked.parse(processedContent);
  console.log('\n=== HTML output ===');
  console.log(html.substring(1000, 1200) + '...'); // Show around where the heading should be

  // Check if the heading is converted
  const hasMarkdownHeading = html.includes('## Преимущества для инвестора');
  const hasHtmlHeading = html.includes('<h2>Преимущества для инвестора</h2>');

  console.log('\n=== Heading check ===');
  console.log('Has markdown heading:', hasMarkdownHeading);
  console.log('Has HTML heading:', hasHtmlHeading);

  // Debug: find where the heading is in the processed content
  const headingIndex = processedContent.indexOf('## Преимущества для инвестора');
  console.log('Heading position in processed content:', headingIndex);
  if (headingIndex !== -1) {
    console.log('Context around heading:');
    console.log(processedContent.substring(Math.max(0, headingIndex - 50), headingIndex + 100));
  }

  // Debug: find where it appears in HTML
  const htmlHeadingIndex = html.indexOf('## Преимущества для инвестора');
  console.log('Heading position in HTML:', htmlHeadingIndex);
  if (htmlHeadingIndex !== -1) {
    console.log('Context around heading in HTML:');
    console.log(html.substring(Math.max(0, htmlHeadingIndex - 50), htmlHeadingIndex + 100));
  }

  if (hasMarkdownHeading && !hasHtmlHeading) {
    console.error('❌ Issue: Heading not converted to HTML');
    return false;
  } else if (hasHtmlHeading) {
    console.log('✅ Heading properly converted to HTML');
    return true;
  } else {
    console.log('✅ No heading found (might be correct)');
    return true;
  }
}

// Run test
if (require.main === module) {
  const success = testFullProcessing();
  process.exit(success ? 0 : 1);
}

module.exports = {
  testFullProcessing
};