// M5: as linhas de velocidade passaram para o mundo 3D (src/render/fx/lines.ts); o gradiente cônico CSS `.lines` do hud.css saiu. A M5 deixou o
// `<div class="lines">` no hud.ts, escondido por CSS, como pendência para quem fosse dono do HUD: a V5 (docs/ondas/V5-hud.md) o removeu de vez.
// Nada mais cria, liga ou estiliza `.lines` no HUD.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('as linhas de velocidade não moram mais no HUD', () => {
  it('o hud.ts não cria nem liga o div.lines', () => {
    const ts = read('render/hud.ts');
    expect(ts).not.toMatch(/['"]lines['"]/);
    expect(ts).not.toMatch(/this\.lines\b/);
  });

  it('nenhuma folha do HUD tem regra para .lines (o cone girando e a regra que o escondia saíram)', () => {
    for (const p of ['render/hud.css', 'access/access.css']) expect(read(p), p).not.toMatch(/\.lines\b/);
    const css = read('render/hud.css');
    expect(css).not.toContain('rgba(200, 235, 255, 0.28)'); // a cor do cone
    expect(css).not.toContain('nc-spin'); // e o giro que só ele usava
  });
});
