import { describe, expect, it } from 'vitest';
import { builderDocumentSchema, newBuilderBlock, DEFAULT_BUILDER_CHROME, DEFAULT_BUILDER_THEME } from '../src/builder.js';
const document = () => ({ schemaVersion: 1, title: { fa: 'خانه', en: 'Home' }, description: { fa: '', en: '' }, sections: [newBuilderBlock('hero', 'hero')], theme: DEFAULT_BUILDER_THEME, chrome: DEFAULT_BUILDER_CHROME });
describe('visual page safety contract', () => {
  it('accepts structured blocks and rejects arbitrary code and unsafe links', () => {
    expect(builderDocumentSchema.safeParse(document()).success).toBe(true);
    for (const href of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'data:text/html,evil']) {
      const doc = document(); doc.sections[0]!.href = href;
      expect(builderDocumentSchema.safeParse(doc).success, href).toBe(false);
    }
    expect(builderDocumentSchema.safeParse({ ...document(), javascript: 'alert(1)' }).success).toBe(false);
    const doc = document(); Object.assign(doc.sections[0]!.style, { background: 'url(https://evil.example)' });
    expect(builderDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it('rejects duplicate ids, unbounded sizes and reversed schedules', () => {
    const doc = document(); doc.sections.push(doc.sections[0]!);
    expect(builderDocumentSchema.safeParse(doc).success).toBe(false);
    const next = document(); next.sections[0]!.style = { mobile: { columns: 99 } };
    expect(builderDocumentSchema.safeParse(next).success).toBe(false);
    next.sections[0]!.style = {}; next.sections[0]!.startsAt = '2026-10-20T00:00:00Z'; next.sections[0]!.endsAt = '2026-10-19T00:00:00Z';
    expect(builderDocumentSchema.safeParse(next).success).toBe(false);
  });
  it('does not alias independently edited localized fields', () => {
    const block = newBuilderBlock('hero', 'hero'); block.title.fa = 'عنوان';
    expect(block.body.fa).toBe(''); expect(block.alt.fa).toBe(''); expect(block.button.fa).toBe('');
  });
});
