import { formatWhen, shortUrl } from './history-view';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 30, 15, 0);

  it('shows only the time for a run of today', () => {
    expect(formatWhen(new Date(2026, 9, 30, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('adds the day for an older run', () => {
    const text = formatWhen(new Date(2026, 9, 28, 18, 30).toISOString(), now);

    expect(text).toContain('28');
    expect(text).toContain('18:30');
  });

  it('shows nothing for a date it cannot read', () => {
    expect(formatWhen('no es una fecha', now)).toBe('');
  });
});

describe('shortUrl', () => {
  it('drops the scheme', () => {
    expect(shortUrl('https://api.test/users?id=1')).toBe('api.test/users?id=1');
    expect(shortUrl('HTTP://localhost:3000/')).toBe('localhost:3000/');
  });

  it('leaves a url without scheme as it is', () => {
    expect(shortUrl('api.test/x')).toBe('api.test/x');
  });
});
