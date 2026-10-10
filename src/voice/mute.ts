// O modelo do seletor "Voz dos outros" da lista da sala online (N6, docs/ondas/N/N6.md §4.6): anda pelos jogadores de OUTROS
// computadores e silencia ou volta a ouvir o escolhido (prefs.ts). Puro; a tela (ui/screens/online.ts) só o põe num `selector`.
import { t } from '../i18n';
import { isMuted, toggleMuted } from './prefs';
import './strings';

export interface MuteModel {
  /** O texto do seletor: "Bia: ouvindo", "Bia: silenciado" ou um traço sem ninguém. */
  value(): string;
  label(): string;
  /** Troca o jogador escolhido (com volta). */
  step(dir: -1 | 1): void;
  /** Silencia ou volta a ouvir o escolhido; devolve quem e como ficou, ou null sem ninguém. */
  toggle(): { name: string; muted: boolean } | null;
}

/** `players` devolve, a cada chamada, os nomes dos jogadores de outros computadores (a sala muda: entra e sai gente). */
export function createMuteModel(players: () => readonly string[]): MuteModel {
  let index = 0;
  /** O escolhido agora; o índice se ajusta se a lista encolheu. */
  const current = (): string | null => {
    const list = players();
    if (list.length === 0) return null;
    index = ((index % list.length) + list.length) % list.length;
    return list[index];
  };
  return {
    value() {
      const name = current();
      return name === null ? t('voice.mute.none') : t(isMuted(name) ? 'voice.mute.silenced' : 'voice.mute.heard', { name });
    },
    label: () => t('voice.mute.label'),
    step(dir) {
      if (players().length === 0) return;
      index += dir;
      current();
    },
    toggle() {
      const name = current();
      return name === null ? null : { name, muted: toggleMuted(name) };
    },
  };
}
