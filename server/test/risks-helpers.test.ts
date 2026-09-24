import { describe, it, expect } from 'vitest';
import { renderDiffBlocks } from '../src/modules/risks/helpers.js';

describe('renderDiffBlocks', () => {
  it('renders one fenced diff block per file, in order', () => {
    const out = renderDiffBlocks([
      { path: 'a.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
      { path: 'b.ts', patch: '@@ -1 +1 @@\n-x\n+y' },
    ]);
    expect(out).toBe(
      '### a.ts\n```diff\n@@ -1 +1 @@\n-old\n+new\n```\n\n### b.ts\n```diff\n@@ -1 +1 @@\n-x\n+y\n```',
    );
  });

  it('skips files with no patch (e.g. binary/renamed-only)', () => {
    const out = renderDiffBlocks([
      { path: 'image.png', patch: null },
      { path: 'a.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
    ]);
    expect(out).toBe('### a.ts\n```diff\n@@ -1 +1 @@\n-old\n+new\n```');
  });

  it('returns an empty string when nothing has a patch', () => {
    expect(renderDiffBlocks([{ path: 'image.png', patch: null }])).toBe('');
  });

  it('caps each file patch at MAX_PATCH_CHARS_PER_FILE so one huge file cannot starve the rest', () => {
    const huge = 'x'.repeat(5000);
    const out = renderDiffBlocks([{ path: 'a.ts', patch: huge }]);
    // 3000-char cap + the fenced wrapper around it.
    expect(out).toBe(`### a.ts\n\`\`\`diff\n${'x'.repeat(3000)}\n\`\`\``);
  });

  it('caps the number of files at MAX_FILES', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      path: `f${i}.ts`,
      patch: '@@ -1 +1 @@\n-a\n+b',
    }));
    const out = renderDiffBlocks(files);
    expect(out.match(/^### /gm)?.length).toBe(25);
    expect(out).not.toContain('f25.ts');
  });
});
