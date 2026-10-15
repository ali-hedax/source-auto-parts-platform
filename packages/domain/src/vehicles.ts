import { compactSearchText, normalizeSearchText } from './search-normalize.js';

/**
 * Vehicle fitment («کاربرد در خودرو»): vehicles (پژو، دنا پلاس …) with optional models/trims
 * (۲۰۶، ۴۰۵ …). Names are compared by a key that ignores what people type differently: Persian,
 * Arabic and Latin digits (۲۰۶ = 206), Arabic ي/ك, spaces, half-spaces and dashes
 * («دنا پلاس» = «دناپلاس» = «دنا‌پلاس» = «دنا-پلاس»), case.
 */
export function vehicleKey(name: string): string {
  return compactSearchText(name);
}

/** Cells like «پژو ۲۰۶، دنا پلاس, رانا» → ['پژو ۲۰۶', 'دنا پلاس', 'رانا']. */
export function splitVehicleList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[،,؛;\n|]+/)) {
    const item = part.replace(/\s+/g, ' ').trim();
    const key = vehicleKey(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Edit distance between two keys (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/**
 * «Very similar» names that are probably the same vehicle typed differently (a letter missing,
 * swapped or extra): not created as new, but suggested for linking in the preview. Equal keys
 * are the same vehicle, not "similar".
 */
export function isSimilarVehicleName(a: string, b: string): boolean {
  const ka = vehicleKey(a);
  const kb = vehicleKey(b);
  if (!ka || !kb || ka === kb) return false;
  const shorter = Math.min(ka.length, kb.length);
  if (shorter < 3) return false;
  const allowed = shorter >= 8 ? 2 : 1;
  return editDistance(ka, kb) <= allowed;
}

export interface KnownVehicle {
  id: string;
  name: string;
  models: ReadonlyArray<{ id: string; name: string }>;
}

export type FitmentMatch =
  /** A known vehicle, optionally one of its known models (model null = the whole vehicle). */
  | { kind: 'KNOWN'; text: string; vehicleId: string; vehicleName: string; modelId: string | null; modelName: string | null }
  /** A known vehicle with a model that does not exist yet (created after confirmation). */
  | { kind: 'NEW_MODEL'; text: string; vehicleId: string; vehicleName: string; modelName: string }
  /** No such vehicle, but one with a very similar name exists: suggested, never created. */
  | { kind: 'SIMILAR'; text: string; suggestion: { vehicleId: string; vehicleName: string } }
  /** A vehicle that does not exist (created after confirmation in the preview). */
  | { kind: 'NEW_VEHICLE'; text: string; vehicleName: string };

/**
 * Reads one fitment item: «پژو ۲۰۶» → vehicle «پژو», model «۲۰۶». The longest known vehicle name at
 * the start wins («دنا پلاس توربو» → «دنا پلاس» + «توربو», not «دنا»).
 */
export function matchFitment(text: string, vehicles: readonly KnownVehicle[]): FitmentMatch {
  const tokens = normalizeSearchText(text).split(' ').filter(Boolean);
  const byKey = new Map(vehicles.map((v) => [vehicleKey(v.name), v]));
  for (let k = tokens.length; k >= 1; k -= 1) {
    const vehicle = byKey.get(tokens.slice(0, k).join(''));
    if (!vehicle) continue;
    const rest = originalTail(text, k);
    if (!rest) return { kind: 'KNOWN', text, vehicleId: vehicle.id, vehicleName: vehicle.name, modelId: null, modelName: null };
    const model = vehicle.models.find((m) => vehicleKey(m.name) === vehicleKey(rest));
    return model
      ? { kind: 'KNOWN', text, vehicleId: vehicle.id, vehicleName: vehicle.name, modelId: model.id, modelName: model.name }
      : { kind: 'NEW_MODEL', text, vehicleId: vehicle.id, vehicleName: vehicle.name, modelName: rest };
  }
  // A vehicle typed without its spaces («دناپلاس۲۰۶» is not split; «دناپلاس» is).
  const whole = byKey.get(vehicleKey(text));
  if (whole) return { kind: 'KNOWN', text, vehicleId: whole.id, vehicleName: whole.name, modelId: null, modelName: null };
  const similar = vehicles.find((v) => isSimilarVehicleName(v.name, text));
  if (similar) return { kind: 'SIMILAR', text, suggestion: { vehicleId: similar.id, vehicleName: similar.name } };
  return { kind: 'NEW_VEHICLE', text, vehicleName: text.replace(/\s+/g, ' ').trim() };
}

/** The original words of `text` after its first `count` normalized words (keeps the owner's spelling). */
function originalTail(text: string, count: number): string {
  const words = text.replace(/\u200c|\u200d|-/g, ' ').split(/\s+/).filter((w) => normalizeSearchText(w) !== '');
  return words.slice(count).join(' ').trim();
}

/** A URL slug from an English or Latin name, or a fallback. */
export function vehicleSlug(nameEn: string | null | undefined, fallback: string): string {
  const slug = (nameEn ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}
