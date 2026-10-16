// N2, palco 3D (docs/ondas/N/N2.md §4.2, §6 "B"): o registro de painéis que liga uma tela de menu ao `renderIdle` sem que os
// menus conheçam o renderizador, e o `mountShowroom` (o que o lobby chama). Sem `three`, sem DOM de verdade: o host é um objeto
// com `getBoundingClientRect`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PANELS } from '../src/render/stage-plan';
import { stageBus } from '../src/render/stage-bus';
import { mountPodium, mountShowroom } from '../src/render/stage';

const rect = (w: number, h: number) => ({ left: 10, top: 20, width: w, height: h, right: 10 + w, bottom: 20 + h });
const host = (w = 300, h = 150) => ({ getBoundingClientRect: () => rect(w, h) });

class FakeEl {
  children: FakeEl[] = [];
  className = '';
  textContent = '';
  style: { opacity?: string; transform?: string } = {};
  attrs: Record<string, string> = {};
  parent: FakeEl | null = null;
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  appendChild(c: FakeEl): FakeEl { c.parent?.removeChild(c); c.parent = this; this.children.push(c); return c; }
  removeChild(c: FakeEl): void { this.children = this.children.filter((x) => x !== c); c.parent = null; }
  remove(): void { this.parent?.removeChild(this); }
  getBoundingClientRect() { return rect(300, 150); }
}
const findAll = (el: FakeEl, cls: string, out: FakeEl[] = []): FakeEl[] => {
  if (el.className.split(/\s+/).includes(cls)) out.push(el);
  for (const c of el.children) findAll(c, cls, out);
  return out;
};

beforeEach(() => {
  stageBus.clear();
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
});
afterEach(() => { stageBus.clear(); vi.unstubAllGlobals(); });

describe('registro de painéis do palco (stageBus)', () => {
  it('panel(id) é estável: o mesmo id devolve o mesmo painel', () => {
    const a = stageBus.panel('garage:P1');
    expect(stageBus.panel('garage:P1')).toBe(a);
    expect(stageBus.panel('garage:P2')).not.toBe(a);
  });

  it('live() só tem painel com host de tamanho > 0, na ordem em que nasceram, e no máximo 4', () => {
    const p1 = stageBus.panel('a'); p1.setHost(host(300, 150));
    const p2 = stageBus.panel('b'); p2.setHost(host(0, 150));
    const p3 = stageBus.panel('c'); // sem host
    expect(stageBus.live().map((l) => l.panel.id)).toEqual(['a']);
    expect(p3.host).toBeNull();
    p2.setHost(host(200, 100));
    expect(stageBus.live().map((l) => l.panel.id)).toEqual(['a', 'b']);
    for (const id of ['d', 'e', 'f', 'g']) stageBus.panel(id).setHost(host());
    expect(stageBus.live()).toHaveLength(MAX_PANELS);
    expect(stageBus.live().map((l) => l.panel.id)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('live() traz o retângulo em px CSS do host', () => {
    stageBus.panel('a').setHost(host(320, 180));
    expect(stageBus.live()[0].rect).toEqual({ x: 10, y: 20, w: 320, h: 180 });
  });

  it('set guarda carro, pintura, foco, qualidade, efeitos e a cor do assento; release tira da lista e muda a versão', () => {
    const p = stageBus.panel('a'); p.setHost(host());
    p.set({ carId: 'trovao', paint: { color: '#111111', accent: '#eeeeee' }, focus: 'tires', quality: 'high', reduceEffects: true, ring: '#3ddc84' });
    expect(p.carId).toBe('trovao');
    expect(p.paint).toEqual({ color: '#111111', accent: '#eeeeee' });
    expect(p.focus).toBe('tires');
    expect(p.quality).toBe('high');
    expect(p.reduceEffects).toBe(true);
    expect(p.ring).toBe('#3ddc84');
    const v = stageBus.version;
    p.release();
    expect(stageBus.live()).toHaveLength(0);
    expect(stageBus.version).not.toBe(v);
    expect(stageBus.panel('a')).not.toBe(p); // um painel solto não volta sozinho: o id nasce de novo
  });

  it('reveal() e workshop() contam as chamadas (o palco compara com o que já viu)', () => {
    const p = stageBus.panel('a');
    expect([p.revealCount, p.workshopCount]).toEqual([0, 0]);
    p.reveal(); p.reveal(); p.workshop();
    expect([p.revealCount, p.workshopCount]).toEqual([2, 1]);
  });

  it('a versão muda com entrada, saída e troca de host, e NÃO com um set que não muda a lotação', () => {
    const v0 = stageBus.version;
    const p = stageBus.panel('a');
    expect(stageBus.version).not.toBe(v0);
    const v1 = stageBus.version;
    p.setHost(host());
    expect(stageBus.version).not.toBe(v1);
    const v2 = stageBus.version;
    p.set({ focus: 'engine' });
    expect(stageBus.version).toBe(v2);
  });
});

describe('mountShowroom (o que o lobby chama)', () => {
  it('registra um painel de carro com o que foi pedido e solta no release()', () => {
    const el = new FakeEl('div');
    const h = mountShowroom(el as unknown as HTMLElement, { id: 'lobby:P1', carId: 'falcao', quality: 'medium', ring: '#ffd23f' });
    const p = stageBus.panel('lobby:P1');
    expect(h.panel).toBe(p);
    expect(p.kind).toBe('car');
    expect(p.carId).toBe('falcao');
    expect(p.ring).toBe('#ffd23f');
    expect(stageBus.live().map((l) => l.panel.id)).toEqual(['lobby:P1']);
    h.release();
    expect(stageBus.live()).toHaveLength(0);
  });

  it('T8: o look (visual inteiro) vai ao painel, e set({ look }) o troca; sem ele, null', () => {
    const el = new FakeEl('div');
    const look = { finish: 'perolado', wheel: 'aero', rim: 'grafite' };
    const h = mountShowroom(el as unknown as HTMLElement, { id: 'lobby:P1', carId: 'falcao', look });
    expect(h.panel.look).toEqual(look);
    h.set({ look: null });
    expect(h.panel.look).toBeNull();
    h.release();
    const h2 = mountShowroom(new FakeEl('div') as unknown as HTMLElement, { id: 'lobby:P2', carId: 'falcao' });
    expect(h2.panel.look).toBeNull();
    h2.release();
  });

  it('o mesmo id de novo re-aponta o painel para o elemento novo (a garagem refaz o DOM a cada ação), sem duplicar', () => {
    const a = new FakeEl('div'); const b = new FakeEl('div');
    const h1 = mountShowroom(a as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao' });
    const h2 = mountShowroom(b as unknown as HTMLElement, { id: 'g:P1', carId: 'trovao' });
    expect(h2.panel).toBe(h1.panel);
    expect(h1.panel.host).toBe(b);
    expect(h1.panel.carId).toBe('trovao');
    expect(stageBus.all()).toHaveLength(1);
  });

  it('sem id, cada montagem ganha um painel próprio', () => {
    const a = mountShowroom(new FakeEl('div') as unknown as HTMLElement);
    const b = mountShowroom(new FakeEl('div') as unknown as HTMLElement);
    expect(a.panel).not.toBe(b.panel);
  });

  it('reveal() e workshop() chegam ao painel; os selos do host acompanham o plano (o palco os guia por quadro, sem CSS animation)', () => {
    const el = new FakeEl('div');
    const h = mountShowroom(el as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao' });
    expect(findAll(el, 'stage-novo')).toHaveLength(1);
    expect(findAll(el, 'stage-flash')).toHaveLength(1);
    h.reveal(); h.workshop();
    expect([h.panel.revealCount, h.panel.workshopCount]).toEqual([1, 1]);
    h.panel.fx?.novo(1); h.panel.fx?.flash(0.5);
    expect(findAll(el, 'stage-novo')[0].style.opacity).toBe('1');
    expect(findAll(el, 'stage-flash')[0].style.opacity).toBe('0.5');
  });

  it('reduzir efeitos não cria o selo de clarão (o "NOVO!" fica)', () => {
    const el = new FakeEl('div');
    mountShowroom(el as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao', reduceEffects: true });
    expect(findAll(el, 'stage-flash')).toHaveLength(0);
    expect(findAll(el, 'stage-novo')).toHaveLength(1);
  });

  it('os selos sobrevivem a um re-aponte: vão para o elemento novo', () => {
    const a = new FakeEl('div'); const b = new FakeEl('div');
    mountShowroom(a as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao' });
    mountShowroom(b as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao' });
    expect(findAll(a, 'stage-novo')).toHaveLength(0);
    expect(findAll(b, 'stage-novo')).toHaveLength(1);
  });

  it('release() tira os selos do host', () => {
    const el = new FakeEl('div');
    const h = mountShowroom(el as unknown as HTMLElement, { id: 'g:P1', carId: 'falcao' });
    h.release();
    expect(findAll(el, 'stage-novo')).toHaveLength(0);
    expect(findAll(el, 'stage-flash')).toHaveLength(0);
  });
});

describe('mountPodium', () => {
  it('registra um painel de pódio com os três primeiros pintados, na ordem do lugar', () => {
    const el = new FakeEl('div');
    const h = mountPodium(el as unknown as HTMLElement, [
      { place: 2, carId: 'trovao', paint: { color: '#d7263d', accent: '#f4f4f2' } },
      { place: 1, carId: 'falcao', paint: null },
      { place: 3, carId: 'tornado', paint: { color: '#2346d6', accent: '#ffcf26' } },
    ], { id: 'results:podium' });
    const p = h.panel;
    expect(p.kind).toBe('podium');
    expect(p.podium.map((e) => [e.place, e.carId])).toEqual([[1, 'falcao'], [2, 'trovao'], [3, 'tornado']]);
    expect(p.podium[1].paint).toEqual({ color: '#d7263d', accent: '#f4f4f2' });
    expect(stageBus.live()).toHaveLength(0 + 1);
    h.release();
    expect(stageBus.live()).toHaveLength(0);
  });

  it('T8: cada lugar leva o visual inteiro (look), não só a pintura', () => {
    const el = new FakeEl('div');
    const look = { finish: 'cromado', wheel: 'mag', rim: 'dourado', stripe: 'nenhuma', flame: 'rosa' };
    const h = mountPodium(el as unknown as HTMLElement, [
      { place: 1, carId: 'falcao', paint: null, look },
      { place: 2, carId: 'trovao', paint: null },
    ]);
    expect(h.panel.podium[0].look).toEqual(look);
    expect(h.panel.podium[1].look ?? null).toBeNull();
    h.release();
  });

  it('só os três primeiros entram e carro que não existe é recusado', () => {
    const el = new FakeEl('div');
    const mk = (place: number, carId: string) => ({ place: place as 1 | 2 | 3, carId, paint: null });
    const h = mountPodium(el as unknown as HTMLElement, [mk(1, 'falcao'), mk(2, 'trovao'), mk(3, 'tornado'), { place: 4 as 1, carId: 'camelo', paint: null }]);
    expect(h.panel.podium).toHaveLength(3);
    expect(() => mountPodium(el as unknown as HTMLElement, [mk(1, 'nao-existe')])).toThrow(/nao-existe/);
  });
});
