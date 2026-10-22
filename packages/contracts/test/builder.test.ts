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
  it('accepts the cinematic film block and only self-hosted MP4/WebM movies', () => {
    const doc = document(); doc.sections = [newBuilderBlock('cinematic-hero', 'film')];
    expect(builderDocumentSchema.safeParse(doc).success).toBe(true);
    for (const desktop of ['javascript:alert(1)', 'https://evil.example/x.mp4?<script>', '/media/x.html', 'http://plain.example/x.mp4', '//evil.example/x.mp4', '/media/x.mp4"onerror=1']) {
      const next = document(); const film = newBuilderBlock('cinematic-hero', 'film'); film.film!.desktop = desktop; next.sections = [film];
      expect(builderDocumentSchema.safeParse(next).success, desktop).toBe(false);
    }
    const missing = document(); const film = newBuilderBlock('cinematic-hero', 'film'); delete film.film; missing.sections = [film];
    expect(builderDocumentSchema.safeParse(missing).success).toBe(false);
    const extra = document(); const block = newBuilderBlock('cinematic-hero', 'film'); Object.assign(block.film!, { script: 'alert(1)' }); extra.sections = [block];
    expect(builderDocumentSchema.safeParse(extra).success).toBe(false);
    // Copies, never the shared default, so editing one block cannot change another.
    const a = newBuilderBlock('cinematic-hero', 'a'); a.film!.playback = 'loop';
    expect(newBuilderBlock('cinematic-hero', 'b').film!.playback).toBe('once');
  });
});
