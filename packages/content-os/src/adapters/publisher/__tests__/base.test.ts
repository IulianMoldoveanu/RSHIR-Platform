import { describe, expect, it } from 'vitest';
import { composeCaption } from '../base';

describe('composeCaption', () => {
  it('returns caption + hashtags when within budget', () => {
    const out = composeCaption('Hello world', ['#a', '#b'], 100);
    expect(out).toBe('Hello world\n\n#a #b');
  });

  it('returns caption only when no hashtags', () => {
    expect(composeCaption('Hello', [], 100)).toBe('Hello');
  });

  it('trims caption to make room for hashtags when over budget', () => {
    const longCaption = 'X'.repeat(100);
    const out = composeCaption(longCaption, ['#hashtag'], 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toContain('#hashtag');
    expect(out).toContain('…');
  });

  it('filters empty hashtag entries', () => {
    expect(composeCaption('h', ['#a', '', '#b'], 100)).toBe('h\n\n#a #b');
  });

  it('handles exactly-at-budget caption with hashtags', () => {
    const caption = 'A'.repeat(10);
    const tags = ['#bb'];
    const out = composeCaption(caption, tags, caption.length + 2 + tags[0].length);
    expect(out).toBe(`${caption}\n\n${tags[0]}`);
  });
});
