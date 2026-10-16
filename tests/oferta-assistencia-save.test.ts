// T8 (docs/ondas/T8-pontas.md, item 6): a recusa da oferta de assistência fica nas opções (`speed-tche.settings`) como campo ADITIVO.
// Opções antigas (0.1.5, sem o campo) abrem iguais e com a oferta ainda de pé; as novas trazem todos os campos que a 0.1.4/0.1.5 leem,
// com os mesmos valores (o saneador delas é lista branca: lê o que conhece e ignora o resto).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';

/** Opções gravadas pela 0.1.5 (6e5aacd): os campos do saneador dela, valores fora do padrão onde dá. */
const SETTINGS_0_1_5 = {
  language: 'en', masterVolume: 0.5, musicVolume: 0.4, sfxVolume: 0.9, fullscreen: true, quality: 'low', renderStyle: 'modern',
  showMinimap: false, screenShake: false, difficulty: 'amador', manualGear: true,
  assists: { sharedNitro: false, tow: true, teamDraft: false, catchup: true }, totalCars: 10, quickLaps: 2, music: 'off',
  telemetryConsent: 0, vibration: false, ghost: false, seatAssists: ['brake', 'none', 'steer', 'none'], colorPalette: 'default',
  hudScale: 1.2, largeText: true, reduceEffects: true, landmarkCaptions: false, seatCameras: ['low', 'high', 'hood', 'high'],
};
const KEYS_0_1_5 = [
  'language', 'masterVolume', 'musicVolume', 'sfxVolume', 'fullscreen', 'quality', 'renderStyle', 'showMinimap', 'screenShake',
  'difficulty', 'manualGear', 'assists', 'totalCars', 'quickLaps', 'music', 'telemetryConsent', 'controls', 'vibration', 'serverUrl',
  'ghost', 'seatAssists', 'colorPalette', 'hudScale', 'largeText', 'reduceEffects', 'landmarkCaptions', 'seatCameras',
] as const;

const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('recusa da oferta de assistência nas opções (aditiva)', () => {
  it('o padrão é não recusada', () => {
    expect(DEFAULT_SETTINGS.assistOfferDeclined).toBe(false);
  });

  it('opções da 0.1.5 (sem o campo) abrem iguais, com a oferta de pé', () => {
    const s = sanitizeSettings(roundTrip(SETTINGS_0_1_5));
    expect(s.assistOfferDeclined).toBe(false);
    for (const [k, v] of Object.entries(SETTINGS_0_1_5)) expect(s[k as keyof typeof s], k).toEqual(v);
  });

  it('a recusa gravada volta; lixo no campo vira "não recusada"', () => {
    expect(sanitizeSettings(roundTrip({ ...SETTINGS_0_1_5, assistOfferDeclined: true })).assistOfferDeclined).toBe(true);
    for (const junk of ['yes', 1, null, {}, []]) expect(sanitizeSettings({ assistOfferDeclined: junk }).assistOfferDeclined).toBe(false);
  });

  it('as opções novas trazem todos os campos que a 0.1.4/0.1.5 leem, com os mesmos valores (ela abre sem perder nada)', () => {
    const fresh = sanitizeSettings(roundTrip({ ...SETTINGS_0_1_5, assistOfferDeclined: true }));
    const old = sanitizeSettings(roundTrip(SETTINGS_0_1_5));
    const written = roundTrip(fresh) as Record<string, unknown>;
    for (const k of KEYS_0_1_5) expect(written[k], k).toEqual(roundTrip(old[k]));
  });
});
