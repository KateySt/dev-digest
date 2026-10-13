import { describe, it, expect } from 'vitest';
import { matchesAnyGlob } from '../src/glob.js';

describe('matchesAnyGlob', () => {
  it('src/** matches nested files', () => {
    expect(matchesAnyGlob('src/a/b.ts', ['src/**'])).toBe(true);
  });
  it('*.ts does not cross directories', () => {
    expect(matchesAnyGlob('a/b.ts', ['*.ts'])).toBe(false);
    expect(matchesAnyGlob('b.ts', ['*.ts'])).toBe(true);
  });
  it('src/*/x.ts matches one level only', () => {
    expect(matchesAnyGlob('src/a/x.ts', ['src/*/x.ts'])).toBe(true);
    expect(matchesAnyGlob('src/a/b/x.ts', ['src/*/x.ts'])).toBe(false);
  });
  it('**/ prefix matches at any depth including root', () => {
    expect(matchesAnyGlob('ratelimit.ts', ['**/ratelimit.ts'])).toBe(true);
    expect(matchesAnyGlob('src/mw/ratelimit.ts', ['**/ratelimit.ts'])).toBe(true);
  });
  it('? matches one char, regex metachars are literal', () => {
    expect(matchesAnyGlob('a1.ts', ['a?.ts'])).toBe(true);
    expect(matchesAnyGlob('a+b.ts', ['a+b.ts'])).toBe(true);
    expect(matchesAnyGlob('aab.ts', ['a+b.ts'])).toBe(false);
  });
  it('empty glob list matches everything', () => {
    expect(matchesAnyGlob('anything.ts', [])).toBe(true);
  });
});
