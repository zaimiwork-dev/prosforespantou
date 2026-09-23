import { describe, it, expect } from 'vitest';
import { normalizeBase, rewriteBase, likePrefix } from './image-host.mjs';

const OLD = 'https://pub-8545c51f54284a0cb271d90ff32b0832.r2.dev';
const NEW = 'https://images.prosforespantou.gr';

describe('normalizeBase', () => {
  it('drops trailing slashes and whitespace', () => {
    expect(normalizeBase(' https://images.prosforespantou.gr/// ')).toBe(NEW);
  });
  it('refuses plain http (mixed content on the live site)', () => {
    expect(() => normalizeBase('http://images.prosforespantou.gr')).toThrow(/https/);
  });
  it('refuses something that is not a URL', () => {
    expect(() => normalizeBase('images.prosforespantou.gr')).toThrow(/not a URL/);
    expect(() => normalizeBase('')).toThrow(/not a URL/);
  });
});

describe('rewriteBase', () => {
  it('swaps the base and keeps the key untouched', () => {
    expect(rewriteBase(`${OLD}/ab/7720655.webp`, OLD, NEW)).toBe(`${NEW}/ab/7720655.webp`);
  });
  it('keeps a query string on the key', () => {
    expect(rewriteBase(`${OLD}/lidl/x.webp?v=2`, OLD, NEW)).toBe(`${NEW}/lidl/x.webp?v=2`);
  });
  it('leaves other hosts alone', () => {
    expect(rewriteBase('https://cdn.mymarket.gr/a.png', OLD, NEW)).toBeNull();
    expect(rewriteBase(`${NEW}/ab/1.webp`, OLD, NEW)).toBeNull();
  });
  it('does not match a look-alike host that merely starts with the base', () => {
    expect(rewriteBase(`${OLD}.example.com/ab/1.webp`, OLD, NEW)).toBeNull();
  });
  it('returns null for a missing url', () => {
    expect(rewriteBase(null, OLD, NEW)).toBeNull();
    expect(rewriteBase(undefined, OLD, NEW)).toBeNull();
  });
});

describe('likePrefix', () => {
  it('matches everything under the base', () => {
    expect(likePrefix(OLD)).toBe(`${OLD}/%`);
  });
  it('escapes LIKE wildcards so the base matches literally', () => {
    expect(likePrefix('https://a_b.example%.com')).toBe('https://a\\_b.example\\%.com/%');
  });
});
