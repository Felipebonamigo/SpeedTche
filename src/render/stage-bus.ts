// O registro de painéis do palco 3D (onda N, N2; docs/ondas/N/N2.md §4.2). Uma tela de menu diz "este elemento é uma janela de palco, com
// este carro, esta pintura e este foco"; o `renderIdle` (stage.ts) pergunta ao registro, a cada quadro, quais janelas estão vivas e onde.
// Assim os menus não conhecem o renderizador e a sessão não muda. Sem `three` e sem DOM: o host é qualquer coisa com `getBoundingClientRect`.
// O estado do palco (a câmera, o ângulo do prato, a revelação em curso) mora no `stage.ts`, por id; aqui só mora o que a tela quer.
import type { CarColors, Quality } from '../game/contracts';
import type { CarLook } from '../core/types';
import { MAX_PANELS, type Rect, type StageFocus } from './stage-plan';

/** Um elemento que sabe onde está na tela (um `HTMLElement` serve). */
export interface StageHost {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

export type PanelKind = 'car' | 'podium';

/** Um dos três primeiros do pódio. `look` (o visual inteiro da corrida) vale mais que `paint`; sem ele, só as cores (ou as de fábrica). */
export interface PodiumEntry { place: 1 | 2 | 3; carId: string; paint: CarColors | null; look?: CarLook | null }

/** Os selos DOM do host (o "NOVO!" e o clarão), guiados pelo palco a cada quadro: o plano da revelação manda, não uma animação de CSS. */
export interface PanelFx {
  novo(v: number): void;
  flash(v: number): void;
}

/** O que a tela pode mudar num painel sem mexer na lotação. */
export interface PanelState {
  kind: PanelKind;
  carId: string | null;
  paint: CarColors | null;
  /** O visual inteiro (acabamento, roda, aro, faixa, chama; N3); vale mais que `paint`. Null = só as cores. */
  look: CarLook | null;
  focus: StageFocus;
  /** Qualidade das Opções; sem ela o palco usa a Média (o padrão do Deck). */
  quality: Quality | undefined;
  reduceEffects: boolean;
  /** Cor do assento (anel do prato e névoa do fundo). */
  ring: string;
  podium: PodiumEntry[];
}

export class StagePanel implements PanelState {
  host: StageHost | null = null;
  kind: PanelKind = 'car';
  carId: string | null = null;
  paint: CarColors | null = null;
  look: CarLook | null = null;
  focus: StageFocus = null;
  quality: Quality | undefined = undefined;
  reduceEffects = false;
  ring = '#ff5a36';
  podium: PodiumEntry[] = [];
  /** Quantas vezes a tela pediu a revelação e a oficina; o palco compara com as que já viu. */
  revealCount = 0;
  workshopCount = 0;
  fx: PanelFx | null = null;
  /** A tela que montou o painel limpa o que pôs no host (os selos). */
  onRelease: (() => void) | null = null;

  constructor(readonly id: string, private readonly bus: StageBus) {}

  setHost(host: StageHost | null): void {
    this.host = host;
    this.bus.bump();
  }

  /** Muda o que se vê. Não mexe na lotação: a versão do registro fica como está. */
  set(patch: Partial<PanelState>): void {
    Object.assign(this, patch);
  }

  reveal(): void { this.revealCount++; }
  workshop(): void { this.workshopCount++; }

  /** Solta o painel: some da lista (o id, se voltar, nasce de novo, com o palco zerado). */
  release(): void {
    this.onRelease?.();
    this.onRelease = null;
    this.bus.drop(this);
  }
}

export interface LivePanel { panel: StagePanel; rect: Rect }

export class StageBus {
  private readonly panels = new Map<string, StagePanel>();
  private v = 0;

  /** Muda a cada entrada, saída e troca de elemento: o renderizador sabe quando a lotação mudou. */
  get version(): number { return this.v; }

  bump(): void { this.v++; }

  /** O painel de id estável (criado na primeira vez). */
  panel(id: string): StagePanel {
    let p = this.panels.get(id);
    if (!p) {
      p = new StagePanel(id, this);
      this.panels.set(id, p);
      this.bump();
    }
    return p;
  }

  drop(p: StagePanel): void {
    if (this.panels.get(p.id) === p) { this.panels.delete(p.id); this.bump(); }
  }

  all(): StagePanel[] { return [...this.panels.values()]; }

  /** Os painéis desenháveis agora (host de tamanho > 0), na ordem em que nasceram, no máximo `MAX_PANELS`, com o retângulo em px CSS. */
  live(): LivePanel[] {
    const out: LivePanel[] = [];
    for (const panel of this.panels.values()) {
      if (!panel.host) continue;
      const r = panel.host.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      out.push({ panel, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
      if (out.length >= MAX_PANELS) break;
    }
    return out;
  }

  /** Solta tudo (os testes; e a troca de renderizador, que não tem mais onde desenhar). */
  clear(): void {
    for (const p of this.all()) p.release();
  }
}

/** O registro do jogo: um só, como o canvas. */
export const stageBus = new StageBus();
