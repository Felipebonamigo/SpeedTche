// V22/F7: a névoa atmosférica (docs/ondas/V22-f7-nevoa.md). O diagnóstico (V22 §3.5): a névoa era um `FogExp2` de cor única, sem altura e sem lado do sol, e a 300 m tirava só
// 28% da cor — objeto distante saía nítido e saturado, a profundidade achatava, o horizonte era uma pilha de silhuetas turquesa. Aqui o chunk GLOBAL `fog_fragment` do three
// (todo material com névoa, de uma vez: o mesmo padrão do `installToneMapping`) ganha três coisas, SEM trocar a base:
//   1. distância: uma bruma extra que começa em `ATMOS_ONSET` (90 m: a bíblia, "nenhuma até ~80 m", fica de pé) e chega ao teto em `ATMOS_REACH`; combinada com o FogExp2 como
//      1 − (1 − base)(1 − extra), então a densidade, o `sight.ts` e o corte do cenário (que leem o FogExp2) continuam valendo;
//   2. altura: o que está abaixo da câmera (vale) pega mais bruma, o que está acima (cume) menos — a bruma baixa que separa os planos;
//   3. tom por lado do sol: a cor da névoa vai ao brilho do período (a mesma conta do horizonte do domo, `SKY_FRAG`) do lado do sol e esfria do lado oposto.
// O que o three não entrega fica por conta de duas peças: `vFogRay` (a posição em espaço de vista, interpolada com perspectiva) vai do vértice ao fragmento, e três uniformes por
// viewport (`uFogUp`, `uFogSunH`: o "para cima" e o sol horizontal no espaço de vista, `setFogView` em stylize.ts). Sem eles (zero) a conta é neutra; `uFogAmt` = 0 é a névoa de antes.
// Os anéis de horizonte (fog: false, névoa assada na cor) usam a MESMA função (`ATMOS_FN`) no shader deles. Puro de DOM; só o three para o `ShaderChunk`.
import * as THREE from 'three';
import { daylight } from './sky-paint';
import type { Palette } from './palette';

/** Onde a bruma extra começa (m): antes disto o fragmento nem entra na conta (o `if` corta o custo do que está perto, que é quase toda a tela). */
export const ATMOS_ONSET = 90;
/** Onde ela chega ao teto (m). */
export const ATMOS_REACH = 380;
/** O teto da bruma extra (fração de cor) na câmera: com o FogExp2 da Alta (0,0019) dá 28% → ~52% a 300 m (~47% no entardecer, que é menos denso) (era 28%; o plano pede ≥ 40%). */
export const ATMOS_AMOUNT = 0.42;
/** Altura: a bruma extra vale `1 − hy·ATMOS_HEIGHT_K` (hy = metros acima da câmera), presa a [MIN, MAX]: 30 m abaixo da câmera = 1,36×; 30 m acima = 0,64×. */
export const ATMOS_HEIGHT_K = 0.012;
export const ATMOS_HEIGHT_MIN = 0.6;
export const ATMOS_HEIGHT_MAX = 1.8;
/** O lado oposto ao sol esfria (a mesma tinta do domo, `SKY_FRAG`). */
export const ATMOS_COOL: readonly [number, number, number] = [0.95, 0.985, 1.04];

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * A fração de cor que a névoa tira de um ponto a `d` m (profundidade de vista), `hy` m acima da câmera, com o FogExp2 de densidade `rho`: a MESMA conta do GLSL de
 * `ATMOS_FN` (os testes medem esta versão sem GPU; o GL confere a imagem). `amount` = 0 devolve o FogExp2 puro.
 */
export function fogFraction(rho: number, d: number, hy = 0, amount = ATMOS_AMOUNT): number {
  const base = 1 - Math.exp(-rho * rho * d * d);
  const hk = Math.min(ATMOS_HEIGHT_MAX, Math.max(ATMOS_HEIGHT_MIN, 1 - hy * ATMOS_HEIGHT_K));
  const extra = amount * smooth(ATMOS_ONSET, ATMOS_REACH, d) * hk;
  return 1 - (1 - base) * (1 - extra);
}

/** Os uniformes de uma paleta (puro): o quanto de bruma, a cor do lado do sol (linear) e os pesos do brilho, iguais aos do horizonte do domo. */
export interface AtmosphereLook {
  amount: number;
  /** A cor da névoa da paleta (linear): a base que o tom do lado do sol mexe. */
  base: [number, number, number];
  /** O brilho do período (linear): para onde a névoa vai do lado do sol. */
  sun: [number, number, number];
  /** Pesos: [az³ (o brilho do período, `uGlowAmt` do domo), az² (a faixa larga, só de dia), o frio do lado oposto (só de dia)]. */
  mix: [number, number, number];
}

const lin = (hex: string): [number, number, number] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

/** O entardecer vale 1 em `light` 0,7 e cai a 0 a 0,4 de distância dele (a mesma `duskAmount` do domo; copiada para não fechar o ciclo com sky.ts). */
function duskOf(light: number): number { return Math.max(0, Math.min(1, 1 - Math.abs(light - 0.7) / 0.3)); }

export function atmosphereLook(p: Palette): AtmosphereLook {
  const day = daylight(p.light);
  return {
    amount: ATMOS_AMOUNT,
    base: lin(p.fog),
    sun: lin(p.skyGlow),
    // 0,35 de dia e à noite, 0,8 no entardecer (o `glow` de `sunLook` em sky.ts); a faixa larga e o frio são da pintura de dia (V22/F3).
    mix: [0.35 + 0.45 * duskOf(p.light), 0.18 * day, 0.8 * day],
  };
}

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/**
 * A conta, em GLSL: `f` (a fração de névoa, entra a do FogExp2 e sai combinada), `col` (a cor da névoa, entra a base e sai com o tom do lado do sol) e `ray` (a posição em espaço
 * de vista); `depth` = a profundidade de vista (a mesma do FogExp2). Quem inclui declara os uniformes aqui.
 */
export const ATMOS_FN = /* glsl */ `
uniform float uFogAmt; uniform vec3 uFogUp; uniform vec3 uFogSunH; uniform vec3 uFogSunCol; uniform vec3 uFogMix;
// O tom: a cor da névoa vai ao brilho do período do lado do sol e esfria do lado oposto (az = 1 no sol, 0 no oposto; o azimute da direção de visão no espaço de vista).
void stylizeFogTone( inout vec3 col, const in vec3 ray ) {
  if ( uFogAmt <= 0.0 ) return;
  vec3 r = ray / max( length( ray ), 1e-3 );
  vec3 rh = r - uFogUp * dot( r, uFogUp );
  float az = dot( rh, uFogSunH ) * inversesqrt( max( dot( rh, rh ), 1e-4 ) ) * 0.5 + 0.5;
  col = mix( col, uFogSunCol, clamp( az * az * az * uFogMix.x + ( 0.35 + 0.65 * az * az ) * uFogMix.y, 0.0, 1.0 ) );
  col *= mix( vec3( 1.0 ), vec3( ${ATMOS_COOL.map(f).join(', ')} ), ( 1.0 - az ) * uFogMix.z );
}
// A névoa inteira: a bruma extra de distância e altura combinada com a do FogExp2 (f), e o tom (col).
void stylizeAtmosphere( inout float f, inout vec3 col, const in vec3 ray, const in float depth ) {
  if ( uFogAmt <= 0.0 || depth <= ${f(ATMOS_ONSET)} ) return;
  float hk = clamp( 1.0 - dot( ray, uFogUp ) * ${f(ATMOS_HEIGHT_K)}, ${f(ATMOS_HEIGHT_MIN)}, ${f(ATMOS_HEIGHT_MAX)} );
  float e = uFogAmt * smoothstep( ${f(ATMOS_ONSET)}, ${f(ATMOS_REACH)}, depth ) * hk;
  stylizeFogTone( col, ray );
  f = 1.0 - ( 1.0 - f ) * ( 1.0 - e );
}`;

// ───────────────────────────── O remendo dos chunks do three ─────────────────────────────

const PARS_V_ANCHOR = 'varying float vFogDepth;';
const VERT_ANCHOR = 'vFogDepth = - mvPosition.z;';
const PARS_F_ANCHOR = 'varying float vFogDepth;';
const FRAG_ANCHOR = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';

function need(chunk: string, anchor: string, name: string): void {
  if (!chunk.includes(anchor)) throw new Error(`atmosphere: o three mudou o ${name} (âncora "${anchor}" não achada)`);
}

/** `fog_pars_vertex` com a posição de vista que vai ao fragmento. */
export function patchFogParsVertex(chunk: string): string {
  need(chunk, PARS_V_ANCHOR, 'fog_pars_vertex');
  return chunk.replace(PARS_V_ANCHOR, () => `${PARS_V_ANCHOR}\n\tvarying vec3 vFogRay;`);
}

/** `fog_vertex` escreve a posição de vista. */
export function patchFogVertex(chunk: string): string {
  need(chunk, VERT_ANCHOR, 'fog_vertex');
  return chunk.replace(VERT_ANCHOR, () => `${VERT_ANCHOR}\n\tvFogRay = mvPosition.xyz;`);
}

/** `fog_pars_fragment` recebe a posição de vista, os uniformes e a função (fora do `#ifdef FOG_EXP2`: só o EXP2 a chama). */
export function patchFogParsFragment(chunk: string): string {
  need(chunk, PARS_F_ANCHOR, 'fog_pars_fragment');
  // A função cabe depois do bloco inteiro do chunk (que termina no `#endif` do USE_FOG); ela mesma é protegida por USE_FOG.
  return `${chunk.replace(PARS_F_ANCHOR, () => `${PARS_F_ANCHOR}\n\tvarying vec3 vFogRay;`)}\n#ifdef USE_FOG\n${ATMOS_FN}\n#endif\n`;
}

/** `fog_fragment`: a mesma mistura, com a cor e a fração passando pela atmosfera (só no FogExp2 do jogo; a névoa linear do three fica como era). */
export function patchFogFragment(chunk: string): string {
  need(chunk, FRAG_ANCHOR, 'fog_fragment');
  return chunk.replace(FRAG_ANCHOR, () => `vec3 stylizeFogCol = fogColor;\n\t#ifdef FOG_EXP2\n\t\tstylizeAtmosphere( fogFactor, stylizeFogCol, vFogRay, vFogDepth );\n\t#endif\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, stylizeFogCol, fogFactor );`);
}

/** Remenda os quatro chunks globais uma vez (idempotente). Chamar antes do primeiro programa compilar (`installToneMapping` o faz). */
export function installAtmosphere(): void {
  const c = THREE.ShaderChunk;
  if (c.fog_fragment.includes('stylizeAtmosphere')) return;
  const next = {
    fog_pars_vertex: patchFogParsVertex(c.fog_pars_vertex),
    fog_vertex: patchFogVertex(c.fog_vertex),
    fog_pars_fragment: patchFogParsFragment(c.fog_pars_fragment),
    fog_fragment: patchFogFragment(c.fog_fragment),
  };
  Object.assign(c, next); // só depois de os quatro passarem: um falho não deixa os outros pela metade
}
