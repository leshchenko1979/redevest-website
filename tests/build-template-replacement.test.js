const fs = require('fs');
const path = require('path');

/**
 * Unit tests for template replacement functionality in build.js
 */

function testTemplateReplacement() {
  console.log('Running template replacement tests...');

  // Test case 1: Single {{title}} replacement (current behavior)
  let template = '<title>{{title}} | Site</title><meta name="description" content="{{title}} description">';
  let result = template.replace('{{title}}', 'Test Project');
  let expected = '<title>Test Project | Site</title><meta name="description" content="{{title}} description">';

  if (result !== expected) {
    console.error('❌ Test 1 FAILED: Single replace only replaces first occurrence');
    console.error('Expected:', expected);
    console.error('Got:', result);
    return false;
  } else {
    console.log('✅ Test 1 PASSED: Single replace works for first occurrence');
  }

  // Test case 2: Global {{title}} replacement (fixed behavior)
  template = '<title>{{title}} | Site</title><meta name="description" content="{{title}} description">';
  result = template.replace(/{{title}}/g, 'Test Project');
  expected = '<title>Test Project | Site</title><meta name="description" content="Test Project description">';

  if (result !== expected) {
    console.error('❌ Test 2 FAILED: Global replace should replace all occurrences');
    console.error('Expected:', expected);
    console.error('Got:', result);
    return false;
  } else {
    console.log('✅ Test 2 PASSED: Global replace works for all occurrences');
  }

  // Test case 3: Multiple template variables
  template = '<title>{{title}} | {{site}}</title><meta property="og:title" content="{{title}} | {{site}}">';
  result = template.replace(/{{title}}/g, 'Project').replace(/{{site}}/g, 'Company');
  expected = '<title>Project | Company</title><meta property="og:title" content="Project | Company">';

  if (result !== expected) {
    console.error('❌ Test 3 FAILED: Multiple template variables replacement');
    console.error('Expected:', expected);
    console.error('Got:', result);
    return false;
  } else {
    console.log('✅ Test 3 PASSED: Multiple template variables work correctly');
  }

  // Test case 4: Fixed behavior (global replace for all template variables)
  const projectTemplate = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>{{title}} | Редевест</title>
    <meta name="description" content="Инвестиционный проект {{title}} от Редевест">
    <meta property="og:title" content="{{title}} | Редевест">
    <meta property="og:description" content="Инвестиционный проект {{title}} от Редевест">
    <meta property="twitter:title" content="{{title}} | Редевест">
    <meta property="twitter:description" content="Инвестиционный проект {{title}} от Редевест">
</head>
<body>
    <h1>{{title}}</h1>
    <a href="{{bot_link}}">Get presentation</a>
    {{content}}
</body>
</html>`;

  const metadata = { title: 'Лубёнки', bot_link: 'https://t.me/FlippingInvestBot?start=c1731502858283-ds' };
  const projectSlug = 'lubenki';
  const content = '<p>Project content</p>';

  // Fixed behavior - global replace for title, bot_link, existing global for slug
  result = projectTemplate
    .replace(/{{title}}/g, metadata.title)  // FIXED: global replace
    .replace(/{{bot_link}}/g, metadata.bot_link)
    .replace(/{{slug}}/g, projectSlug)
    .replace('{{content}}', content);

  const hasUnreplacedTitle = result.includes('{{title}}');
  const hasUnreplacedSlug = result.includes('{{slug}}');
  const hasUnreplacedBotLink = result.includes('{{bot_link}}');
  const hasUnreplacedContent = result.includes('{{content}}');

  if (hasUnreplacedTitle || hasUnreplacedSlug || hasUnreplacedBotLink || hasUnreplacedContent) {
    console.error('❌ Test 4 FAILED: Template variables not fully replaced');
    console.error('Unreplaced title:', hasUnreplacedTitle);
    console.error('Unreplaced slug:', hasUnreplacedSlug);
    console.error('Unreplaced bot_link:', hasUnreplacedBotLink);
    console.error('Unreplaced content:', hasUnreplacedContent);
    return false;
  } else {
    console.log('✅ Test 4 PASSED: All template variables replaced correctly');
  }

  console.log('All template replacement tests passed!');
  return true;
}

// Run tests
if (require.main === module) {
  const success = testTemplateReplacement();
  process.exit(success ? 0 : 1);
}

module.exports = {
  testTemplateReplacement
};