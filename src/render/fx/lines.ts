// Linhas de velocidade 3D e túnel de ar do vácuo (M5): traços finos no mundo em volta do carro do viewport, que passam pela câmera. Sai o gradiente
// cônico CSS (`.lines` do hud.css, que só ligava no nitro e girava em círculo): estas ficam NO MUNDO, voam para fora da tela como o cenário e são
// funções do deslocamento do carro, sem estado e sem sorteio — a mesma posição em qualquer quadro de tela, em qualquer taxa de quadros.
// Coordenadas relativas ao carro do viewport, em metros: `dz` + à frente, `lat` + à direita, `h` altura sobre a pista. Quem as joga no lote de
// traços (cabeça = ponta mais perto da câmera, brilhante; cauda = `tail`, mais à frente) é o `effects.ts`.
import { hash2 } from '../noise';

/** Fração da velocidade máxima em que as linhas começam (V8: "só acima de ~90%"; a M5 começava em 85%). */
export const SPEED_LINES_START = 0.9;
/** O que o nitro garante mesmo devagar (0..1). */
const NITRO_FLOOR = 0.5;

export interface LineSpec { dz: number; tail: number; lat: number; h: number; width: number; r: number; g: number; b: number; a: number }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, v: number): number => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Intensidade das linhas, 0..1: nada até 90% da máxima, cheia na máxima; o nitro garante metade. */
export function speedLineStrength(speedFrac: number, nitro: boolean): number {
  const fast = clamp01((speedFrac - SPEED_LINES_START) / (1 - SPEED_LINES_START));
  return nitro ? Math.max(fast, NITRO_FLOOR) : fast;
}

/** Quantas das `max` linhas acendem na intensidade `strength` (a primeira acende com qualquer intensidade). */
export function lineCount(max: number, strength: number): number {
  if (max <= 0 || strength <= 0) return 0;
  return Math.min(max, Math.ceil(max * Math.min(1, strength)));
}

/** A volta de uma linha: de 12 m atrás do carro (atrás da câmera) a 48 m à frente (mais longe que isso a linha de 10 cm some no miolo da tela). */
const NEAR = -12;
const FAR = 48;
const SPAN = FAR - NEAR;
/** O comprimento (m) da volta de uma linha de velocidade: a cada tanto de deslocamento ela reaparece lá longe. */
export const SPEED_LINE_SPAN = SPAN;

/**
 * A linha `k` de `count`, com o carro tendo andado `travel` m (soma contínua, sem volta de pista) a `speedMs` m/s. Falso se `k` não existe ou a
 * intensidade é zero. Fica parada no mundo: andar 1 m puxa 1 m para a câmera, e ao passar atrás dela reaparece lá longe (apagada nas duas pontas).
 */
export function speedLine(k: number, count: number, travel: number, speedMs: number, strength: number, out: LineSpec): boolean {
  if (k < 0 || k >= count || strength <= 0) return false;
  const h1 = hash2(k, 101); const h2 = hash2(k, 202); const h3 = hash2(k, 303); const h4 = hash2(k, 404); const h5 = hash2(k, 505); const h6 = hash2(k, 606);
  const dz = NEAR + mod(h2 * SPAN - travel, SPAN);
  const fade = smoothstep(FAR, FAR - 14, dz) * smoothstep(NEAR, NEAR + 8, dz);
  out.dz = dz;
  out.tail = dz + 2 + 0.07 * speedMs * (0.7 + 0.6 * h6);
  out.lat = (h1 < 0.5 ? -1 : 1) * (2.6 + 8.4 * h4);
  out.h = 0.4 + 5.6 * h3 * h3;
  // V8 (docs/ondas/V8-efeitos.md): finas e sutis — de 3,5 a 7 cm (1 a 2,5 px a 10–30 m: um fio, não uma barra; eram 9–20 cm) e alfa até 0,30 (era
  // 0,75): a sensação de vento, não um efeito que se nota. O brilho ainda cai com a luz do período (`Effects.lineGain`: no entardecer não brilham).
  out.width = 0.035 + 0.035 * h5;
  out.r = 1.0; out.g = 1.0; out.b = 1.08;
  out.a = (0.12 + 0.18 * clamp01(strength)) * fade;
  return true;
}

/** A volta de um traço do túnel: de 9 m atrás do carro a 23 m à frente (o miolo da tela: mais longe o traço encolhe até sumir; o carro do vácuo está a até 24 m). */
const T_NEAR = -9;
const T_SPAN = 32;

/**
 * O traço `k` do anel de `count` do túnel de ar, com a intensidade `intensity` (0..1, suavizada por quem chama). Um tubo de 1,9 a 2,8 m de raio em
 * volta do eixo do carro (altura 0,8 m), que emoldura a carroceria, que gira devagar com o tempo `time` (s) e corre para trás com o deslocamento `travel`.
 */
export function draftLine(k: number, count: number, travel: number, time: number, speedMs: number, intensity: number, out: LineSpec): boolean {
  if (k < 0 || k >= count || intensity <= 0.01) return false;
  const h1 = hash2(k, 707); const h2 = hash2(k, 808); const h3 = hash2(k, 909); const h4 = hash2(k, 1010);
  const theta = (2 * Math.PI * k) / count + time * 0.9 + 0.5 * h1;
  const r = 1.9 + 0.9 * h2;
  const dz = T_NEAR + mod(h3 * T_SPAN - travel, T_SPAN);
  const fade = smoothstep(T_NEAR + T_SPAN, T_NEAR + T_SPAN - 8, dz) * smoothstep(T_NEAR, T_NEAR + 6, dz);
  out.dz = dz;
  out.tail = dz + 4 + 0.06 * speedMs * (0.7 + 0.6 * h4);
  out.lat = r * Math.cos(theta);
  out.h = 0.8 + 0.75 * r * Math.sin(theta);
  // V8: fio, não barra — de 5 a 10 cm e alfa até 0,4 (eram 14–26 cm e 0,8: nas capturas lia como as barras brancas das linhas de velocidade). O HUD já
  // diz "VÁCUO"; o túnel é a sensação.
  out.width = 0.05 + 0.05 * h2;
  out.r = 0.95; out.g = 1.0; out.b = 1.05;
  out.a = 0.4 * clamp01(intensity) * fade;
  return true;
}

/**
 * V10 (HC2): os riscos LARGOS de canto de tela (18 a 42 cm, alfa até 0,75) — o Horizon Chase 2 enche os cantos com riscos brancos largos que saem do miolo para fora; os fios de 3,5 a 7
 * cm da V8 (acima) são o vento, estes são o "estou voando". Mesma malha de traços (`Streaks`, sem chamada nova): são só mais alguns traços, GROSSOS, fora do
 * eixo do carro — 3,2 a 6,2 m para o lado e ou baixos (0,2 a 1,1 m, o canto de baixo) ou altos (2,4 a 4,5 m, o canto de cima), onde a câmera de corrida os
 * joga para a borda. O `k` escolhe o canto (k % 4: alto-esquerdo, alto-direito, baixo-esquerdo, baixo-direito), então 4 riscos já cobrem a tela.
 * Função só do deslocamento (sem tempo, sem sorteio, sem estado): nada pisca; nascem e somem em rampa de 6 a 8 m. `cartoon` ("Efeitos de cartum"): mais largos.
 */
const C_NEAR = -4;
const C_FAR = 22;
const C_SPAN = C_FAR - C_NEAR;

export function cornerStreak(k: number, count: number, travel: number, speedMs: number, strength: number, cartoon: boolean, out: LineSpec): boolean {
  if (k < 0 || k >= count || strength <= 0) return false;
  const h2 = hash2(k, 1101); const h3 = hash2(k, 1202); const h4 = hash2(k, 1303); const h5 = hash2(k, 1404); const h6 = hash2(k, 1505);
  const dz = C_NEAR + mod(h2 * C_SPAN - travel, C_SPAN);
  const fade = smoothstep(C_FAR, C_FAR - 8, dz) * smoothstep(C_NEAR, C_NEAR + 6, dz);
  const zone = k % 4;
  const high = zone < 2;
  out.dz = dz;
  out.tail = dz + 4 + 0.1 * speedMs * (0.7 + 0.6 * h6);
  out.lat = (zone % 2 === 0 ? -1 : 1) * (3.2 + 3.0 * h4);
  out.h = high ? 2.4 + 2.1 * h3 : 0.2 + 0.9 * h3;
  out.width = cartoon ? 0.26 + 0.34 * h5 : 0.18 + 0.24 * h5;
  out.r = 1.0; out.g = 1.0; out.b = 1.08;
  out.a = Math.min(0.8, (0.28 + 0.47 * clamp01(strength)) * (cartoon ? 1.08 : 1)) * fade;
  return true;
}
