// O jogo se chamava Nitro Crew até 10/10/2026 (agora Speed Tchê). As chaves de save eram `nitro-crew.*`; quem já jogou a
// 0.1.0 tem o progresso nelas. `migrateLegacyKeys` copia cada uma para `speed-tche.*` na primeira abertura, sem nunca
// sobrescrever uma chave nova, e só apaga a antiga depois de a nova ter sido gravada (cota cheia: fica como está).
export const LEGACY_KEY_PREFIX = 'nitro-crew.';
export const NEW_KEY_PREFIX = 'speed-tche.';

type KeyValueStore = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export function migrateLegacyKeys(store: KeyValueStore): void {
  const legacy: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null && k.startsWith(LEGACY_KEY_PREFIX)) legacy.push(k);
  }
  for (const old of legacy) {
    const fresh = NEW_KEY_PREFIX + old.slice(LEGACY_KEY_PREFIX.length);
    try {
      const value = store.getItem(old);
      if (value !== null && store.getItem(fresh) === null) store.setItem(fresh, value);
      store.removeItem(old);
    } catch {
      // cota cheia ou armazenamento recusando: a chave antiga fica, e a próxima abertura tenta de novo
    }
  }
}
