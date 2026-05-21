const { tmeToTg } = require('../telegram-links');

describe('tmeToTg', () => {
  test('converts channel link', () => {
    expect(tmeToTg('https://t.me/flipping_invest')).toBe('tg://resolve?domain=flipping_invest');
  });

  test('converts bot deep link', () => {
    expect(tmeToTg('https://t.me/FlippingInvestBot?start=dl-1764070124237')).toBe(
      'tg://resolve?domain=FlippingInvestBot&start=dl-1764070124237'
    );
  });

  test('converts public channel post', () => {
    expect(tmeToTg('https://t.me/lunevo_redevest/42')).toBe(
      'tg://resolve?domain=lunevo_redevest&post=42'
    );
  });

  test('converts private channel post', () => {
    expect(tmeToTg('https://t.me/c/5241721202/725912')).toBe(
      'tg://privatepost?channel=5241721202&post=725912'
    );
  });

  test('leaves tg:// links unchanged', () => {
    const url = 'tg://resolve?domain=flipping_invest';
    expect(tmeToTg(url)).toBe(url);
  });

  test('leaves non-telegram links unchanged', () => {
    expect(tmeToTg('https://redevest.ru/')).toBe('https://redevest.ru/');
  });
});
