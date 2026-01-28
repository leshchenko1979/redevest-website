/**
 * Test the column processing regex
 */

function testRegex() {
  const content = `[[columns]]
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

  // The regex from build-markdown.js
  const regex = /(\[\[columns\]\]\s*\|\s*\[\[column\]\][\s\S]*?)(?=\n(?:\[\[|#|$))/g;

  console.log('Testing regex:', regex);
  console.log('Content:');
  console.log(content);
  console.log('\nMatches:');

  let match;
  while ((match = regex.exec(content)) !== null) {
    console.log('Match:', match[1]);
    console.log('---');
  }

  // Test replacement
  const result = content.replace(regex, (match, captured) => {
    console.log('Processing match:', captured);
    return '[COLUMNS_PROCESSED]';
  });

  console.log('\nResult after replacement:');
  console.log(result);
}

// Run test
testRegex();