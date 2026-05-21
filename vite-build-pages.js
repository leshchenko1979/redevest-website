import { tmeToTg } from './telegram-links.js';

const PROJECT_DEFAULTS = {
  hero_badge: 'Инвестиционный проект',
  cta_heading: 'Инвестировать в проект',
  cta_text: 'Запросите подробную документацию проекта в Telegram-боте.',
  cta_choice_text: 'Получить расчеты доходности можно в ботах — выберите, что вам по кайфу.'
};

const LEGAL_DEFAULTS = {
  hero_badge: 'Документ'
};

const CACHE_CONTROL_META = `
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
`;

/** Matches MAX CTA anchor in project.html (hero and footer). */
const PROJECT_MAX_CTA_ANCHOR =
  /\s*<a href="\{\{max_bot_link\}\}"[\s\S]*?<\/a>\n/g;

function withCacheControlMeta(templateContent) {
  if (templateContent.includes('http-equiv="Cache-Control"')) {
    return templateContent;
  }
  return templateContent.replace(/(<meta charset="UTF-8">)/, `$1${CACHE_CONTROL_META}`);
}

function applyProjectMaxCtaLayout(rendered, maxBotLink) {
  if (maxBotLink) {
    return rendered;
  }
  return rendered
    .replace(PROJECT_MAX_CTA_ANCHOR, '\n')
    .replace(/sm:grid-cols-2/g, 'grid-cols-1');
}

export function renderProjectPageHtml(templateContent, metadata, html, slug, mode) {
  const maxBotLink = metadata.max_bot_link || '';
  let rendered = templateContent;
  rendered = applyProjectMaxCtaLayout(rendered, maxBotLink);
  rendered = rendered.replaceAll('{{title}}', metadata.title || slug);
  rendered = rendered.replaceAll('{{content}}', html);
  rendered = rendered.replaceAll('{{slug}}', slug);
  rendered = rendered.replaceAll('{{bot_link}}', tmeToTg(metadata.bot_link || ''));
  rendered = rendered.replaceAll('{{max_bot_link}}', maxBotLink);
  rendered = rendered.replaceAll('{{hero_badge}}', metadata.hero_badge || PROJECT_DEFAULTS.hero_badge);
  rendered = rendered.replaceAll('{{cta_heading}}', metadata.cta_heading || PROJECT_DEFAULTS.cta_heading);
  rendered = rendered.replaceAll('{{cta_text}}', metadata.cta_text || PROJECT_DEFAULTS.cta_text);
  rendered = rendered.replaceAll('{{cta_choice_text}}', metadata.cta_choice_text ?? PROJECT_DEFAULTS.cta_choice_text);

  if (mode === 'dev') {
    rendered = rendered.replace(/src="assets\//g, 'src="/assets/');
    rendered = rendered.replace(/src="common\.js/g, 'src="/common.js');
  } else {
    rendered = rendered.replace(/href="index\.html/g, 'href="../index.html');
    rendered = rendered.replace(/href="scheme\.html/g, 'href="../scheme.html');
    rendered = rendered.replace(/src="assets\//g, 'src="../assets/');
    rendered = rendered.replace(/src="common\.js/g, 'src="../common.js');
  }

  return withCacheControlMeta(rendered);
}

export function renderLegalPageHtml(templateContent, metadata, html, slug, siteBase, ctaBlocks, mode) {
  let rendered = templateContent;
  rendered = rendered.replaceAll('{{title}}', metadata.title || slug);
  rendered = rendered.replaceAll('{{description}}', metadata.description || '');
  rendered = rendered.replaceAll('{{hero_badge}}', metadata.hero_badge || LEGAL_DEFAULTS.hero_badge);
  rendered = rendered.replaceAll('{{canonical_url}}', `${siteBase}/legal/${slug}.html`);
  rendered = rendered.replaceAll('{{content}}', html);
  rendered = rendered.replaceAll('{{cta_hero}}', ctaBlocks.cta_hero);
  rendered = rendered.replaceAll('{{cta_footer}}', ctaBlocks.cta_footer);

  if (mode === 'dev') {
    rendered = rendered.replace(/href="\.\.\/assets\//g, 'href="/assets/');
    rendered = rendered.replace(/href="\.\.\/input\.css"/g, 'href="/input.css"');
    rendered = rendered.replace(/src="common\.js/g, 'src="/common.js');
  } else {
    rendered = rendered.replace(/href="index\.html/g, 'href="../index.html');
    rendered = rendered.replace(/href="scheme\.html/g, 'href="../scheme.html');
    rendered = rendered.replace(/src="assets\//g, 'src="../assets/');
    rendered = rendered.replace(/src="common\.js/g, 'src="../common.js');
  }

  return rendered;
}
