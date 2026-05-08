const PROJECT_DEFAULTS = {
  hero_badge: 'Инвестиционный проект',
  cta_button: 'Узнать об инвестировании',
  max_cta_button: 'Перейти в MAX',
  cta_heading: 'Инвестировать в проект',
  cta_text: 'Запросите подробную документацию проекта в Telegram-боте.',
  cta_choice_text: 'Получить расчеты доходности можно в ботах — выберите, что вам по кайфу.',
  telegram_vpn_note: 'Переход в Telegram-бот работает с VPN.'
};

const LEGAL_DEFAULTS = {
  hero_badge: 'Документ'
};

const CACHE_CONTROL_META = `
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
`;

function withCacheControlMeta(templateContent) {
  if (templateContent.includes('http-equiv="Cache-Control"')) {
    return templateContent;
  }
  return templateContent.replace(/(<meta charset="UTF-8">)/, `$1${CACHE_CONTROL_META}`);
}

export function renderProjectPageHtml(templateContent, metadata, html, slug, mode) {
  let rendered = templateContent;
  rendered = rendered.replaceAll('{{title}}', metadata.title || slug);
  rendered = rendered.replaceAll('{{content}}', html);
  rendered = rendered.replaceAll('{{slug}}', slug);
  rendered = rendered.replaceAll('{{bot_link}}', metadata.bot_link || '');
  rendered = rendered.replaceAll('{{max_bot_link}}', metadata.max_bot_link || metadata.bot_link || '');
  rendered = rendered.replaceAll('{{date}}', metadata.date || '');
  rendered = rendered.replaceAll('{{hero_badge}}', metadata.hero_badge || PROJECT_DEFAULTS.hero_badge);
  rendered = rendered.replaceAll('{{cta_button}}', metadata.cta_button || PROJECT_DEFAULTS.cta_button);
  rendered = rendered.replaceAll('{{telegram_cta_label}}', metadata.telegram_cta_label || metadata.cta_button || 'Telegram');
  rendered = rendered.replaceAll('{{max_cta_button}}', metadata.max_cta_button || PROJECT_DEFAULTS.max_cta_button);
  rendered = rendered.replaceAll('{{cta_heading}}', metadata.cta_heading || PROJECT_DEFAULTS.cta_heading);
  rendered = rendered.replaceAll('{{cta_text}}', metadata.cta_text || PROJECT_DEFAULTS.cta_text);
  rendered = rendered.replaceAll('{{cta_choice_text}}', metadata.cta_choice_text ?? PROJECT_DEFAULTS.cta_choice_text);
  rendered = rendered.replaceAll('{{telegram_vpn_note}}', metadata.telegram_vpn_note || PROJECT_DEFAULTS.telegram_vpn_note);

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
