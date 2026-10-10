// Silenciar jogador (N6, docs/ondas/N/N6.md §4.6): preferência LOCAL de quem escuta. Quem está silenciado não toca buzina nem
// mostra balão NESTE computador; nada vai à rede e ninguém mais é afetado. Guardada por NOME do jogador (no online não há outro
// identificador estável), na própria chave de armazenamento — fora de `Settings` e das Opções (que são da L2). A lista é pequena
// e relida a cada consulta (consulta rara: um cue de buzina ou de frase), então não há cache que possa ficar velho.
import { readJson, writeJson } from '../game/storage';

export const MUTED_KEY = 'speed-tche.voice-muted';
/** Quantos nomes a lista guarda; passando disso saem os mais antigos. */
export const MAX_MUTED = 64;
const NAME_MAX = 32;

/** O nome como é comparado: sem espaços nas pontas, sem diferenciar caixa. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().slice(0, NAME_MAX);
}

/** Os nomes silenciados, normalizados e sem repetição; lixo no armazenamento vira lista vazia. */
export function mutedNames(): string[] {
  const raw = readJson(MUTED_KEY);
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const n = normalizeName(v);
    if (n !== '' && !out.includes(n)) out.push(n);
  }
  return out.slice(-MAX_MUTED);
}

export function isMuted(name: string): boolean {
  const n = normalizeName(name);
  return n !== '' && mutedNames().includes(n);
}

/** Silencia ou volta a ouvir; devolve o estado em que o jogador ficou (nome vazio nunca é silenciado). */
export function setMuted(name: string, muted: boolean): boolean {
  const n = normalizeName(name);
  if (n === '') return false;
  const rest = mutedNames().filter((x) => x !== n);
  writeJson(MUTED_KEY, muted ? [...rest, n].slice(-MAX_MUTED) : rest);
  return muted;
}

export function toggleMuted(name: string): boolean {
  return setMuted(name, !isMuted(name));
}
