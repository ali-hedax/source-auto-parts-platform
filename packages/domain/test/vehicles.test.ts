import { describe, expect, it } from 'vitest';
import { editDistance, isSimilarVehicleName, matchFitment, splitVehicleList, vehicleKey, vehicleSlug } from '../src/index.js';

const vehicles = [
  { id: 'peugeot', name: 'پژو', models: [{ id: 'p206', name: '۲۰۶' }, { id: 'p405', name: '405' }] },
  { id: 'dena', name: 'دنا', models: [] },
  { id: 'dena-plus', name: 'دنا پلاس', models: [] },
  { id: 'rira', name: 'ری‌را', models: [] },
  { id: 'samand', name: 'سمند', models: [] },
];

describe('vehicle names', () => {
  it('one key for spaces, half-spaces, dashes, Arabic letters and any digits', () => {
    expect(vehicleKey('دنا پلاس')).toBe(vehicleKey('دناپلاس'));
    expect(vehicleKey('دنا‌پلاس')).toBe(vehicleKey('دنا-پلاس'));
    expect(vehicleKey('ري‌را')).toBe(vehicleKey('ری را'));
    expect(vehicleKey('پژو ۲۰۶')).toBe(vehicleKey('پژو 206'));
    expect(vehicleKey('پژو ٢٠٦')).toBe(vehicleKey('پژو206'));
    expect(vehicleKey('Haima')).toBe(vehicleKey(' HAIMA '));
  });

  it('splits lists on Persian and Latin commas, without duplicates', () => {
    expect(splitVehicleList('پژو ۲۰۶، دنا پلاس, رانا ،دناپلاس')).toEqual(['پژو ۲۰۶', 'دنا پلاس', 'رانا']);
    expect(splitVehicleList('  ')).toEqual([]);
  });

  it('flags very similar names but not equal or unrelated ones', () => {
    expect(isSimilarVehicleName('سمند', 'سمن')).toBe(true);
    expect(isSimilarVehicleName('سوزوکی', 'سوزکی')).toBe(true);
    expect(isSimilarVehicleName('دنا پلاس', 'دناپلاس')).toBe(false);
    expect(isSimilarVehicleName('پژو', 'رانا')).toBe(false);
    expect(editDistance('abc', 'abd')).toBe(1);
  });

  it('reads «vehicle model» items: longest known vehicle first, then its model', () => {
    expect(matchFitment('پژو 206', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'peugeot', modelId: 'p206' });
    expect(matchFitment('پژو ۴۰۵', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'peugeot', modelId: 'p405' });
    expect(matchFitment('پژو', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'peugeot', modelId: null });
    expect(matchFitment('پژو پارس', vehicles)).toMatchObject({ kind: 'NEW_MODEL', vehicleId: 'peugeot', modelName: 'پارس' });
    expect(matchFitment('دنا پلاس', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'dena-plus', modelId: null });
    expect(matchFitment('دناپلاس', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'dena-plus' });
    expect(matchFitment('دنا‌پلاس توربو', vehicles)).toMatchObject({ kind: 'NEW_MODEL', vehicleId: 'dena-plus', modelName: 'توربو' });
    expect(matchFitment('ري را', vehicles)).toMatchObject({ kind: 'KNOWN', vehicleId: 'rira' });
    expect(matchFitment('سمن', vehicles)).toMatchObject({ kind: 'SIMILAR', suggestion: { vehicleId: 'samand' } });
    expect(matchFitment('کوییک', vehicles)).toMatchObject({ kind: 'NEW_VEHICLE', vehicleName: 'کوییک' });
  });

  it('makes slugs from English names', () => {
    expect(vehicleSlug('Dena Plus', 'x')).toBe('dena-plus');
    expect(vehicleSlug(null, 'vehicle-1')).toBe('vehicle-1');
  });
});
