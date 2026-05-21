/**
 * Converts t.me URLs to tg:// deep links (avoids t.me blocking in Russia).
 * @param {string} url
 * @returns {string}
 */
function tmeToTg(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  if (url.startsWith('tg://')) {
    return url;
  }

  const match = url.match(/^https?:\/\/t\.me\/(.+)$/i);
  if (!match) {
    return url;
  }

  const rest = match[1];
  const [pathPart, queryPart] = rest.split('?');
  const segments = pathPart.split('/').filter(Boolean);

  if (segments[0] === 'c' && segments.length >= 3) {
    const [, channelId, postId] = segments;
    return `tg://privatepost?channel=${channelId}&post=${postId}`;
  }

  if (segments.length >= 2 && /^\d+$/.test(segments[1])) {
    const [domain, postId] = segments;
    return `tg://resolve?domain=${domain}&post=${postId}`;
  }

  const domain = segments[0];
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const start = params.get('start');
    if (start) {
      return `tg://resolve?domain=${domain}&start=${encodeURIComponent(start)}`;
    }
  }

  return `tg://resolve?domain=${domain}`;
}

module.exports = { tmeToTg };
