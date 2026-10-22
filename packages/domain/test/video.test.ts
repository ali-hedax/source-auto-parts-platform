import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectVideo, VIDEO_LIMITS } from '../src/video.js';

// Synthetic 1 s, 64×64 colour bars made with ffmpeg testsrc (no third-party footage).
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/video/${name}`, import.meta.url)));

describe('site video inspection', () => {
  it('reads real MP4 and WebM containers: size, duration and fast start', () => {
    const mp4 = inspectVideo('hero.mp4', fixture('tiny-faststart.mp4'));
    expect(mp4).toMatchObject({ verdict: 'ACCEPT', kind: 'mp4', mime: 'video/mp4', width: 64, height: 64, fastStart: true });
    expect(mp4.durationMs).toBeGreaterThan(900); expect(mp4.durationMs).toBeLessThan(1100);
    expect(inspectVideo('hero.mp4', fixture('tiny-tail-index.mp4'))).toMatchObject({ verdict: 'ACCEPT', fastStart: false });
    const webm = inspectVideo('hero.webm', fixture('tiny.webm'));
    expect(webm).toMatchObject({ verdict: 'ACCEPT', kind: 'webm', mime: 'video/webm', width: 64, height: 64 });
    expect(webm.durationMs).toBeGreaterThan(900); expect(webm.durationMs).toBeLessThan(1100);
  });
  it('trusts bytes, not names: renamed, disguised and audio-only files are rejected', () => {
    expect(inspectVideo('hero.webm', fixture('tiny-faststart.mp4')).reason).toBe('CONTENT_MISMATCH');
    expect(inspectVideo('hero.mp4', fixture('tiny.webm')).reason).toBe('CONTENT_MISMATCH');
    expect(inspectVideo('hero.mp4', new TextEncoder().encode('<html><script>alert(1)</script></html>')).reason).toBe('CONTENT_MISMATCH');
    expect(inspectVideo('hero.mp4', fixture('audio-only.mp4')).reason).toBe('NO_VIDEO_TRACK');
    expect(inspectVideo('hero.mov', fixture('tiny-faststart.mp4')).reason).toBe('EXTENSION_NOT_ALLOWED');
    expect(inspectVideo('hero.mp4', new Uint8Array()).reason).toBe('EMPTY_FILE');
  });
  it('rejects truncated or corrupt containers without throwing', () => {
    const mp4 = fixture('tiny-faststart.mp4');
    expect(inspectVideo('hero.mp4', mp4.subarray(0, 40)).verdict).toBe('REJECT');
    const broken = mp4.slice(); broken.set([0xff, 0xff, 0xff, 0xff], 32);
    expect(inspectVideo('hero.mp4', broken).verdict).toBe('REJECT');
    const webm = fixture('tiny.webm');
    for (const cut of [5, 30, 60]) expect(() => inspectVideo('hero.webm', webm.subarray(0, cut))).not.toThrow();
  });
  it('enforces the size bound before parsing', () => {
    expect(inspectVideo('hero.mp4', new Uint8Array(VIDEO_LIMITS.maxBytes + 1)).reason).toBe('FILE_TOO_LARGE');
  });
});
