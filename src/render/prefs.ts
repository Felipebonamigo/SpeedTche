// Preferências visuais que o renderizador lê fora da corrida (onda L, L2b). `renderIdle(time, track)` e o limitador de quadros não recebem
// `Settings`; quem grava as opções (Opções, o boot) publica aqui. Sem localStorage, sem three: o valor inicial é "não sei" (nulo) e o renderizador
// cai no que fazia antes. Harness, bench e testes não publicam nada, então nada muda para eles.
import type { HeroCarsSetting, Quality } from '../game/contracts';

export interface RenderPrefs {
  /** Qualidade das Opções; nulo = ainda não publicada (o fundo do menu usa a última da corrida, ou a Alta). */
  quality: Quality | null;
  reduceEffects: boolean;
  lockFps30: boolean;
  /** O interruptor "Carros em alta definição" (V9): o palco 3D (garagem, lobby, pódio) o lê daqui; a corrida o recebe pronto em `options.heroCars`. */
  heroCars: HeroCarsSetting;
}

const prefs: RenderPrefs = { quality: null, reduceEffects: false, lockFps30: false, heroCars: 'auto' };

export function getRenderPrefs(): Readonly<RenderPrefs> { return prefs; }

export function setRenderPrefs(s: { quality: Quality; reduceEffects: boolean; lockFps30?: boolean; heroCars?: HeroCarsSetting }): void {
  prefs.quality = s.quality;
  prefs.reduceEffects = s.reduceEffects;
  prefs.lockFps30 = s.lockFps30 === true;
  prefs.heroCars = s.heroCars ?? 'auto';
}

/** Volta ao "não sei" do começo (testes e laboratório). */
export function resetRenderPrefs(): void { prefs.quality = null; prefs.reduceEffects = false; prefs.lockFps30 = false; prefs.heroCars = 'auto'; }
