// M5: as linhas de velocidade passaram para o mundo 3D (src/render/fx/lines.ts); o gradiente cônico CSS `.lines` do hud.css sai. O `hud.ts` (de outra
// frente) ainda cria o <div class="lines"> e liga a classe `on`: o CSS o esconde de vez, então nada pinta por cima do canvas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/render/hud.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]*\.lines[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

describe('sai o gradiente CSS das linhas de velocidade', () => {
  it('nenhuma regra de .lines tem gradiente, máscara ou animação; o elemento fica escondido', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.body, r.sel).not.toMatch(/gradient|mask|animation/);
    }
    const base = rules.find((r) => /\.nc-hud \.lines\s*$/.test(r.sel));
    expect(base?.body).toMatch(/display:\s*none/);
  });

  it('o resto do hud.css não depende do gradiente das linhas (o cone girando não existe mais em lugar nenhum)', () => {
    expect(css).not.toContain('rgba(200, 235, 255, 0.28)'); // a cor do cone
    expect(css).not.toContain('nc-spin'); // e o giro que só ele usava
  });
});
