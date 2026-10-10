// A ponte entre uma tela de menu (DOM) e o palco 3D (onda N, N2; docs/ondas/N/N2.md §4.4): `mountShowroom` e `mountPodium` registram o
// elemento como janela de palco no `stageBus`, põem dentro dele os selos DOM ("NOVO!" e o clarão da revelação) e devolvem a alça que a
// tela usa para trocar carro, pintura e foco e disparar a revelação e a oficina. Sem `three`: quem desenha é o `stage.ts`, pelo registro.
// Sem WebGL (ou no Retrô, que não consulta o registro) o host fica transparente e vazio de carro; a tela não depende disso.
import { CARS } from '../core/data/cars';
import type { CarColors, Quality } from '../game/contracts';
import { t } from '../i18n';
import '../dealership/strings';
import { stageBus, type PodiumEntry, type StageHost, type StagePanel } from './stage-bus';
import type { StageFocus } from './stage-plan';
import './stage.css';

export interface ShowroomOptions {
  /** Id estável do painel: o mesmo id de novo re-aponta o painel (a garagem refaz o DOM a cada ação) e o estado do palco continua. */
  id?: string;
  carId?: string | null;
  paint?: CarColors | null;
  focus?: StageFocus;
  quality?: Quality;
  reduceEffects?: boolean;
  /** Cor do assento (o anel do prato). */
  ring?: string;
}

export interface StageHandle {
  readonly panel: StagePanel;
  set(patch: Partial<ShowroomOptions>): void;
  /** A compra de um carro: holofote, capa saindo, faróis, confete e "NOVO!". */
  reveal(): void;
  /** A compra de uma peça: faísca e o carro afundando como mola. */
  workshop(): void;
  /** Solta o painel e tira os selos do host. */
  release(): void;
}

/** O que a tela pode pôr dentro do host: só o que um elemento DOM de verdade (ou o falso dos testes) sabe fazer. */
type HostEl = StageHost & { appendChild(c: unknown): unknown };
interface OverlayEl { style: { opacity?: string; transform?: string }; remove(): void; className: string; textContent: string | null; setAttribute(k: string, v: string): void }

interface Overlay { novo: OverlayEl | null; flash: OverlayEl | null }
const overlays = new WeakMap<StagePanel, Overlay>();
let anonymous = 0;

function element(cls: string, text?: string): OverlayEl {
  const el = document.createElement('div') as unknown as OverlayEl;
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.style.opacity = '0';
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Cria (ou refaz, se `reduceEffects` mudou) os selos do painel e os põe no host; liga `panel.fx` a eles. */
function attachOverlay(panel: StagePanel, host: HostEl, reduce: boolean): void {
  let o = overlays.get(panel);
  if (o && (o.flash === null) !== reduce) { o.novo?.remove(); o.flash?.remove(); o = undefined; }
  if (!o) {
    o = { novo: element('stage-novo', t('dealership.novo')), flash: reduce ? null : element('stage-flash') };
    overlays.set(panel, o);
  }
  // O clarão por baixo e o selo por cima; ambos movidos para o host novo se a tela refez o DOM.
  if (o.flash) host.appendChild(o.flash);
  if (o.novo) host.appendChild(o.novo);
  const { novo, flash } = o;
  panel.fx = {
    novo: (v) => { if (novo) { novo.style.opacity = String(v); novo.style.transform = `translate(-50%, -50%) rotate(-8deg) scale(${(0.55 + 0.45 * v).toFixed(3)})`; } },
    flash: (v) => { if (flash) flash.style.opacity = String(v); },
  };
}

function detachOverlay(panel: StagePanel): void {
  const o = overlays.get(panel);
  o?.novo?.remove(); o?.flash?.remove();
  overlays.delete(panel);
  panel.fx = null;
}

function handleFor(panel: StagePanel): StageHandle {
  panel.onRelease = () => detachOverlay(panel);
  return {
    panel,
    set(patch) {
      const { id: _id, ...rest } = patch;
      void _id;
      panel.set(rest);
      if (patch.reduceEffects !== undefined && panel.host) attachOverlay(panel, panel.host as HostEl, panel.reduceEffects);
    },
    reveal: () => panel.reveal(),
    workshop: () => panel.workshop(),
    release: () => panel.release(),
  };
}

function mount(host: HostEl, kind: StagePanel['kind'], opts: ShowroomOptions): StageHandle {
  const panel = stageBus.panel(opts.id ?? `showroom:${++anonymous}`);
  panel.kind = kind;
  panel.setHost(host);
  const { id: _id, ...rest } = opts;
  void _id;
  // `undefined` = "não mexe"; `null` é um valor (sem carro, de fábrica, sem foco).
  panel.set({
    carId: rest.carId === undefined ? panel.carId : rest.carId, paint: rest.paint === undefined ? panel.paint : rest.paint,
    focus: rest.focus === undefined ? panel.focus : rest.focus, quality: rest.quality ?? panel.quality,
    reduceEffects: rest.reduceEffects ?? panel.reduceEffects, ring: rest.ring ?? panel.ring,
  });
  attachOverlay(panel, host, panel.reduceEffects);
  return handleFor(panel);
}

/**
 * Uma janela de palco com um carro girando no prato. O lobby, a garagem e a Concessionária a chamam com o elemento onde o carro
 * aparece; o mesmo `id` de novo re-aponta o painel para o elemento novo sem zerar a câmera nem a revelação em curso.
 */
export function mountShowroom(host: HTMLElement, opts: ShowroomOptions = {}): StageHandle {
  return mount(host as unknown as HostEl, 'car', opts);
}

/**
 * O pódio 3D: os três primeiros, pintados, sobre os blocos de ouro, prata e bronze. `entries` em qualquer ordem; só os lugares 1 a 3
 * entram, e um carro que não existe é erro (o pódio nunca desenha um carro "qualquer").
 */
export function mountPodium(host: HTMLElement, entries: readonly PodiumEntry[], opts: Omit<ShowroomOptions, 'carId' | 'paint'> = {}): StageHandle {
  const podium = entries
    .filter((e) => e.place >= 1 && e.place <= 3)
    .map((e) => {
      if (!CARS.some((c) => c.id === e.carId)) throw new Error(`Pódio com carro que não existe: ${e.carId}`);
      return { place: e.place, carId: e.carId, paint: e.paint };
    })
    .sort((a, b) => a.place - b.place)
    .slice(0, 3);
  const h = mount(host as unknown as HostEl, 'podium', opts);
  h.panel.podium = podium;
  return h;
}
