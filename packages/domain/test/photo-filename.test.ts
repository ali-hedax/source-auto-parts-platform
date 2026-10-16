import { describe, expect, it } from 'vitest';
import { photoCodeReadings, technicalKey } from '../src/index.js';

describe('photo file names', () => {
  it('a plain name is the code itself, position 1', () => {
    expect(photoCodeReadings('0450102805.jpg')).toEqual([{ code: '0450102805', position: 1 }]);
    expect(photoCodeReadings('ABC 123.JPEG')).toEqual([{ code: 'ABC 123', position: 1 }]);
  });

  it('a -N or _N suffix gives the whole name first, then the code with its position', () => {
    expect(photoCodeReadings('0450102805-2.jpg')).toEqual([{ code: '0450102805-2', position: 1 }, { code: '0450102805', position: 2 }]);
    expect(photoCodeReadings('0450102805_3.webp')).toEqual([{ code: '0450102805_3', position: 1 }, { code: '0450102805', position: 3 }]);
  });

  it('a long numeric tail is part of the code, not a position', () => {
    expect(photoCodeReadings('04501-02805.png')).toEqual([{ code: '04501-02805', position: 1 }]);
  });

  it('"(N)" copies are always a position', () => {
    expect(photoCodeReadings('0450102805 (4).png')).toEqual([{ code: '0450102805', position: 4 }]);
  });

  it('folders, Persian digits and empty names', () => {
    expect(photoCodeReadings('عکس‌ها/پژو/۰۴۵۰۱۰۲۸۰۵-۲.jpg')).toEqual([{ code: '0450102805-2', position: 1 }, { code: '0450102805', position: 2 }]);
    expect(photoCodeReadings('C:\\photos\\X1.jpg')[0]?.code).toBe('X1');
    expect(photoCodeReadings('.jpg')).toEqual([]);
  });

  it('codes compare like technical numbers', () => {
    expect(technicalKey(photoCodeReadings('04501 028 05.jpg')[0]!.code)).toBe(technicalKey('0450102805'));
  });
});
