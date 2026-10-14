// Opções do jogador: leitura e gravação (storage.ts) com saneamento. Nada aqui lança —
// sem localStorage (Electron sem sessão, testes em Node, modo privado) tudo cai nos padrões.
import { COLOR_PALETTES } from '../core/data/drivers';
import { ASSIST_LEVELS } from '../core/sim/assist';
import type { AssistLevel, CoopAssists, Difficulty } from '../core/types';
import type { Lang } from '../i18n';
import { pickCameraMode, type CameraMode } from '../render/camera-base';
import { sanitizeBindings } from '../ui/remap/bindings';
import { normalizeServerUrl } from '../net/protocol';
import { applyAutoQuality, shouldAutoQuality } from './auto-quality';
import { DEFAULT_SETTINGS, type Quality, type RenderStyle, type Settings } from './contracts';
import type { DesktopApi } from './desktop';
import { readJson, writeJson } from './storage';

// Onde gravar (localStorage, arquivo do Electron, memória da sessão) é com storage.ts; save e fantasmas importam daqui.
export { readJson, writeJson };

export const SETTINGS_KEY = 'speed-tche.settings';
export const TOTAL_CARS_MIN = 8;
export const TOTAL_CARS_MAX = 20;
export const QUICK_LAPS_MIN = 2;
export const QUICK_LAPS_MAX = 8;
export const HUD_SCALE_MIN = 0.8;
export const HUD_SCALE_MAX = 1.5;

export const LANGUAGES: readonly Lang[] = ['pt', 'en'];
export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];
export const RENDER_STYLES: readonly RenderStyle[] = ['modern', 'retro'];
export const DIFFICULTIES: readonly Difficulty[] = ['amador', 'profissional', 'campeao'];

// ───────────────────────────── Saneamento ─────────────────────────────

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Número dentro de [min, max]; fora da faixa é trazido para a borda; lixo vira `fallback`. */
export function pickNumber(v: unknown, min: number, max: number, fallback: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = integer ? Math.round(v) : v;
  return Math.min(max, Math.max(min, n));
}

export function pickString(v: unknown, fallback: string, maxLength = 64): string {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, maxLength) : fallback;
}

function pickAssists(v: unknown): CoopAssists {
  const d = DEFAULT_SETTINGS.assists;
  const r = isRecord(v) ? v : {};
  return {
    sharedNitro: pickBool(r.sharedNitro, d.sharedNitro),
    tow: pickBool(r.tow, d.tow),
    teamDraft: pickBool(r.teamDraft, d.teamDraft),
    catchup: pickBool(r.catchup, d.catchup),
  };
}

/** Uma assistência por assento (4), cada uma válida; o que faltar ou vier errado vira 'none'. */
function pickSeatAssists(v: unknown): AssistLevel[] {
  const r = Array.isArray(v) ? v : [];
  return DEFAULT_SETTINGS.seatAssists.map((d, i) => pickEnum(r[i], ASSIST_LEVELS, d));
}

/** Uma câmera por assento (4), cada uma válida; o que faltar ou vier errado vira a Alta (save de antes da frente das câmeras). */
function pickSeatCameras(v: unknown): CameraMode[] {
  const r = Array.isArray(v) ? v : [];
  return DEFAULT_SETTINGS.seatCameras.map((d, i) => pickCameraMode(r[i], d));
}

/** Funde `raw` com os padrões, validando faixas e enumerações. Nunca lança. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    language: pickEnum(r.language, LANGUAGES, d.language),
    masterVolume: pickNumber(r.masterVolume, 0, 1, d.masterVolume),
    musicVolume: pickNumber(r.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: pickNumber(r.sfxVolume, 0, 1, d.sfxVolume),
    fullscreen: pickBool(r.fullscreen, d.fullscreen),
    quality: pickEnum(r.quality, QUALITIES, d.quality),
    renderStyle: pickEnum(r.renderStyle, RENDER_STYLES, d.renderStyle),
    showMinimap: pickBool(r.showMinimap, d.showMinimap),
    screenShake: pickBool(r.screenShake, d.screenShake),
    difficulty: pickEnum(r.difficulty, DIFFICULTIES, d.difficulty),
    manualGear: pickBool(r.manualGear, d.manualGear),
    assists: pickAssists(r.assists),
    totalCars: pickNumber(r.totalCars, TOTAL_CARS_MIN, TOTAL_CARS_MAX, d.totalCars, true),
    quickLaps: pickNumber(r.quickLaps, QUICK_LAPS_MIN, QUICK_LAPS_MAX, d.quickLaps, true),
    music: pickString(r.music, d.music),
    // O booleano `telemetry` de antes dos termos versionados não vale como consentimento: volta desligada.
    telemetryConsent: pickNumber(r.telemetryConsent, 0, 1_000_000, d.telemetryConsent, true),
    controls: sanitizeBindings(r.controls),
    vibration: pickBool(r.vibration, d.vibration),
    serverUrl: normalizeServerUrl(r.serverUrl) ?? d.serverUrl,
    ghost: pickBool(r.ghost, d.ghost),
    seatAssists: pickSeatAssists(r.seatAssists),
    colorPalette: pickEnum(r.colorPalette, COLOR_PALETTES, d.colorPalette),
    // Em passos de 10%, como a tela de opções anda.
    hudScale: Math.round(pickNumber(r.hudScale, HUD_SCALE_MIN, HUD_SCALE_MAX, d.hudScale) * 10) / 10,
    largeText: pickBool(r.largeText, d.largeText),
    reduceEffects: pickBool(r.reduceEffects, d.reduceEffects),
    // Config de antes da legenda (sem o campo) liga: ela é o padrão.
    landmarkCaptions: pickBool(r.landmarkCaptions, d.landmarkCaptions),
    lockFps30: pickBool(r.lockFps30, d.lockFps30),
    seatCameras: pickSeatCameras(r.seatCameras),
    // Sem o campo (save de antes da L2b) fica ausente de propósito: só a 1ª abertura de verdade o grava.
    ...(QUALITIES.includes(r.autoQuality as Quality) ? { autoQuality: r.autoQuality as Quality } : {}),
  };
}

export function loadSettings(): Settings {
  return sanitizeSettings(readJson(SETTINGS_KEY));
}

export function saveSettings(s: Settings): void {
  writeJson(SETTINGS_KEY, sanitizeSettings(s));
}

// ───────────────────────────── Idioma da 1ª abertura (O5) ─────────────────────────────

/** Os idiomas da Steam (`apps.currentGameLanguage()`, nomes da API) que o jogo tem. */
const STEAM_LANGS: Readonly<Record<string, Lang>> = { brazilian: 'pt', portuguese: 'pt', english: 'en' };

/** 'brazilian' (Steam), 'pt-BR', 'en_US', 'pt'… → o idioma do jogo; o que o jogo não tem → null. */
export function langOf(tag: unknown): Lang | null {
  if (typeof tag !== 'string') return null;
  const v = tag.trim().toLowerCase();
  if (Object.hasOwn(STEAM_LANGS, v)) return STEAM_LANGS[v];
  const m = /^([a-z]{2})(?:[-_]|$)/.exec(v);
  return m && (LANGUAGES as readonly string[]).includes(m[1]) ? (m[1] as Lang) : null;
}

/** O primeiro candidato que o jogo reconhece; nenhum → null (fica o padrão de hoje, `DEFAULT_SETTINGS.language`). */
export function pickLanguage(candidates: readonly unknown[]): Lang | null {
  for (const c of candidates) { const l = langOf(c); if (l) return l; }
  return null;
}

/**
 * Os candidatos, na ordem do pedido: o idioma do jogo na Steam, o do sistema (`app.getLocale`) e os do navegador (`navigator.languages`,
 * depois `navigator.language`). A ponte é opcional (preload antigo) e o IPC pode falhar ou não responder: segue para o navegador.
 */
export async function languageCandidates(
  desktop: Pick<DesktopApi, 'locale'> | null, nav: { language?: string; languages?: readonly string[] } | null, timeoutMs = 1500,
): Promise<string[]> {
  const out: string[] = [];
  if (desktop && typeof desktop.locale === 'function') {
    try {
      const l = await new Promise<{ steam: string | null; app: string | null } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        desktop.locale?.().then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
      });
      if (l && typeof l.steam === 'string' && l.steam) out.push(l.steam);
      if (l && typeof l.app === 'string' && l.app) out.push(l.app);
    } catch { /* segue sem a ponte */ }
  }
  if (nav) {
    for (const x of Array.isArray(nav.languages) ? nav.languages : []) if (typeof x === 'string' && x) out.push(x);
    if (typeof nav.language === 'string' && nav.language) out.push(nav.language);
  }
  return out;
}

/** Só na 1ª abertura de verdade (nem opções nem save gravados) e nunca sob automação: escolha salva nunca é sobrescrita. */
export function shouldDetectLanguage(savedSettings: unknown, savedSave: unknown, env: { webdriver: boolean }): boolean {
  if (env.webdriver) return false;
  return (savedSettings === null || savedSettings === undefined) && (savedSave === null || savedSave === undefined);
}

/**
 * O que gravar nas opções na 1ª abertura (main.ts, antes de a sessão lê-las): a qualidade automática (L2b) e o idioma detectado (O5), numa
 * gravação só; null quando não há nada a gravar (já abriu antes, automação). As sondas só rodam quando valem.
 */
export async function firstOpenSettings(
  saved: { settings: unknown; save: unknown }, env: { webdriver: boolean; search: string },
  probes: { quality: () => Promise<Quality>; candidates: () => Promise<string[]> },
): Promise<Record<string, unknown> | null> {
  let out: Record<string, unknown> | null = null;
  if (shouldAutoQuality(saved.settings ?? saved.save, env)) out = applyAutoQuality(saved.settings, await probes.quality());
  if (shouldDetectLanguage(saved.settings, saved.save, env)) {
    const lang = pickLanguage(await probes.candidates());
    if (lang) out = { ...(out ?? {}), language: lang };
  }
  return out;
}
