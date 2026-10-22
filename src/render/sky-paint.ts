// V22/F3: a pintura nova do céu, a parte que se mede sem GPU. O gradiente do domo (mais paradas, só com luz do dia) em JS e em GLSL — o texto GLSL é gerado
// da MESMA tabela de paradas, e `tests/ceu-f3.test.ts` mede a versão JS (monótono, contínuo na corrida que muda, idêntico ao de antes sem luz do dia). Puro de DOM e de three.
//
// Por que "só de dia": o entardecer (o cânion, o pôr do sol do Paraty) é a cena que o diagnóstico elogia e a noite roxa é da V12; nenhum dos dois muda. O gradiente de
// antes continua dentro de `skyGradient` (dois smoothsteps) e `day` (0..1, `daylight(light)`) é quanto da pintura nova entra: 0 é idêntico ao de antes.

export type Rgb = readonly [number, number, number];

/** Posição das paradas em `hp` = seno da elevação (0 = horizonte, 1 = zênite): 7 (antes eram 3: horizonte, meio e topo). */
export const SKY_STOP_HP: readonly number[] = [0, 0.04, 0.1, 0.2, 0.42, 0.75, 1];

/** Quanto o horizonte clareia rumo ao branco de dia (a bruma rente ao chão) e o quanto o zênite escurece e puxa para o anil (canais R, G, B). */
const LIFT = 0.1;
const DEEP: Rgb = [0.84, 0.88, 1];

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Quanto do dia há na luz da paleta (1 em 1; 0 em 0,7 — o entardecer — e abaixo): contínua e monótona, a corrida que muda anda por aqui. */
export function daylight(light: number): number { return smooth(0.7, 1, light); }

/** As cores das 7 paradas (linear) de uma paleta, na ordem de `SKY_STOP_HP`. */
export function skyStops(top: Rgb, mid: Rgb, hor: Rgb): Rgb[] {
  return [
    mix3(hor, [1, 1, 1], LIFT), mix3(hor, mid, 0.18), mix3(hor, mid, 0.55), mid, mix3(mid, top, 0.42), top,
    [top[0] * DEEP[0], top[1] * DEEP[1], top[2] * DEEP[2]],
  ];
}

/**
 * A cor do céu à altura `hp` (seno da elevação, ≥ 0), linear. `day` 0 = o gradiente de antes (horizonte → meio por um smoothstep de 0 a 0,2, meio → topo de 0,16 a 0,75);
 * `day` 1 = as 7 paradas, cada uma entrando por um smoothstep entre a anterior e ela. Entre os dois, a mistura.
 */
export function skyGradient(hp: number, top: Rgb, mid: Rgb, hor: Rgb, day: number): [number, number, number] {
  const a = smooth(0, 0.2, hp); const b = smooth(0.16, 0.75, hp);
  const legacy = mix3(mix3(hor, mid, a), top, b);
  if (day <= 0) return [legacy[0], legacy[1], legacy[2]];
  const st = skyStops(top, mid, hor);
  let c: Rgb = st[0];
  for (let i = 1; i < st.length; i++) c = mix3(c, st[i], smooth(SKY_STOP_HP[i - 1], SKY_STOP_HP[i], hp));
  const o = mix3(legacy, c, day);
  return [o[0], o[1], o[2]];
}

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** O mesmo gradiente em GLSL (a função `skyGradient`), gerado da tabela de paradas acima. */
export const SKY_GRADIENT_GLSL = /* glsl */ `
vec3 skyGradient(float hp, vec3 top, vec3 mid, vec3 hor, float day) {
  vec3 legacy = mix(mix(hor, mid, smoothstep(0.0, 0.2, hp)), top, smoothstep(0.16, 0.75, hp));
  if (day <= 0.0) return legacy;
  vec3 c = mix(hor, vec3(1.0), ${f(LIFT)});
  c = mix(c, mix(hor, mid, 0.18), smoothstep(${f(SKY_STOP_HP[0])}, ${f(SKY_STOP_HP[1])}, hp));
  c = mix(c, mix(hor, mid, 0.55), smoothstep(${f(SKY_STOP_HP[1])}, ${f(SKY_STOP_HP[2])}, hp));
  c = mix(c, mid, smoothstep(${f(SKY_STOP_HP[2])}, ${f(SKY_STOP_HP[3])}, hp));
  c = mix(c, mix(mid, top, 0.42), smoothstep(${f(SKY_STOP_HP[3])}, ${f(SKY_STOP_HP[4])}, hp));
  c = mix(c, top, smoothstep(${f(SKY_STOP_HP[4])}, ${f(SKY_STOP_HP[5])}, hp));
  c = mix(c, top * vec3(${f(DEEP[0])}, ${f(DEEP[1])}, ${f(DEEP[2])}), smoothstep(${f(SKY_STOP_HP[5])}, ${f(SKY_STOP_HP[6])}, hp));
  return mix(legacy, c, day);
}`;
