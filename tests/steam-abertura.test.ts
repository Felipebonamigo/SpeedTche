// A1 (docs/ondas/A1-auditoria-save.md, achado 4c): o que o jogo faz com a Steam ao ABRIR (src/game/desktop.ts: resendAchievements, adoptSteamName,
// syncSteamOnOpen). Até a A1 nenhum teste chamava estas três funções. A ponte é falsa: o IPC pode negar, lançar, ficar pendurado ou não existir.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SAVE } from '../src/game/contracts';
import { ACHIEVEMENTS, adoptSteamName, resendAchievements, syncSteamOnOpen, type DesktopApi } from '../src/game/desktop';
import { emptyStats } from '../src/game/stats';

const ids = ACHIEVEMENTS.map((a) => a.id);

describe('resendAchievements: reenvia à Steam toda conquista guardada', () => {
  it('manda uma de cada vez, só as que a lista da Steam conhece, e conta as que ela aceitou', async () => {
    const sent: string[] = [];
    let inFlight = 0; let maxInFlight = 0;
    const api = {
      achievement: async (id: string) => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        sent.push(id); inFlight--;
        return id !== 'DEZ_VITORIAS'; // a Steam recusa uma
      },
    };
    const n = await resendAchievements(api, ['PRIMEIRA_VITORIA', 'ID_QUE_NAO_EXISTE', 'DEZ_VITORIAS', 'CAVALO_DE_ACO']);
    expect(sent).toEqual(['PRIMEIRA_VITORIA', 'DEZ_VITORIAS', 'CAVALO_DE_ACO']);
    expect(maxInFlight).toBe(1); // o IPC não recebe 69 de uma vez
    expect(n).toBe(2);
  });

  it('IPC que lança, rejeita ou responde lixo numa conquista não para as outras', async () => {
    const calls: string[] = [];
    const api = {
      achievement: (id: string): Promise<boolean> => {
        calls.push(id);
        if (id === 'A') throw new Error('lançou síncrono');
        if (id === 'B') return Promise.reject(new Error('IPC caiu'));
        return Promise.resolve(id === 'C' ? true : (undefined as unknown as boolean));
      },
    };
    // Os ids precisam ser da lista da Steam: usa os reais, na ordem.
    const [a, b, c, d] = [ids[0], ids[1], ids[2], ids[3]];
    const map: Record<string, string> = { [a]: 'A', [b]: 'B', [c]: 'C', [d]: 'D' };
    const wrapped = { achievement: (id: string) => api.achievement(map[id]) };
    await expect(resendAchievements(wrapped, [a, b, c, d])).resolves.toBe(1);
    expect(calls).toEqual(['A', 'B', 'C', 'D']);
  });

  it('save sem conquista: nada a mandar', async () => {
    const achievement = vi.fn(async () => true);
    expect(await resendAchievements({ achievement }, [])).toBe(0);
    expect(achievement).not.toHaveBeenCalled();
  });
});

describe('adoptSteamName: o nome da Steam no P1', () => {
  const save = (over: { name?: string; races?: number } = {}) => {
    const stats = emptyStats();
    if (over.races !== undefined) stats.players.push({ name: 'P1', ...stats.totals, races: over.races });
    return { seatNames: [over.name ?? DEFAULT_SAVE.seatNames[0], 'P2', 'P3', 'P4'], stats };
  };

  it('P1 com o nome padrão e sem corrida: vira o nome da Steam, limpo e cortado em 12', () => {
    const s = save();
    expect(adoptSteamName(s, '  Felipe Bonamigo Silva  ')).toBe(true);
    expect(s.seatNames[0]).toBe('Felipe Bonam');
    expect(s.seatNames.slice(1)).toEqual(['P2', 'P3', 'P4']);
  });

  it('não mexe em quem já escolheu um nome, nem em perfil P1 que já tem corrida (o histórico ficaria órfão)', () => {
    const named = save({ name: 'Ana' });
    expect(adoptSteamName(named, 'Felipe')).toBe(false);
    expect(named.seatNames[0]).toBe('Ana');
    const played = save({ races: 3 });
    expect(adoptSteamName(played, 'Felipe')).toBe(false);
    expect(played.seatNames[0]).toBe('P1');
  });

  it('nome da Steam ausente, vazio ou que não é texto: nada muda', () => {
    for (const bad of [null, undefined, '', '   ', 42, {}]) {
      const s = save();
      expect(adoptSteamName(s, bad), String(bad)).toBe(false);
      expect(s.seatNames[0]).toBe('P1');
    }
  });
});

describe('syncSteamOnOpen: a abertura no Electron', () => {
  const fullApi = (over: Partial<DesktopApi>): DesktopApi => ({ steamName: async () => 'Felipe', achievement: async () => true, ...over } as unknown as DesktopApi);
  const save = () => ({ achievements: ['PRIMEIRA_VITORIA', 'DEZ_VITORIAS'], seatNames: ['P1', 'P2', 'P3', 'P4'], stats: emptyStats() });

  it('fora do Electron (sem ponte): não faz nada e não lança', async () => {
    const persist = vi.fn();
    await expect(syncSteamOnOpen(null, save(), persist)).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it('reenvia as conquistas e, se adotou o nome, grava o save uma vez', async () => {
    const sent: string[] = [];
    const persist = vi.fn();
    const s = save();
    await syncSteamOnOpen(fullApi({ achievement: async (id: string) => { sent.push(id); return true; } }), s, persist);
    expect(sent).toEqual(['PRIMEIRA_VITORIA', 'DEZ_VITORIAS']);
    expect(s.seatNames[0]).toBe('Felipe');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('nome já escolhido: reenvia, mas não regrava o save à toa', async () => {
    const persist = vi.fn();
    const s = save(); s.seatNames[0] = 'Ana';
    await syncSteamOnOpen(fullApi({}), s, persist);
    expect(persist).not.toHaveBeenCalled();
  });

  it('Steam fechada (nome rejeita e conquista rejeita): resolve sem rejeitar — não vira "unhandled rejection" da abertura', async () => {
    const persist = vi.fn();
    const s = save();
    await expect(syncSteamOnOpen(fullApi({ steamName: () => Promise.reject(new Error('sem Steam')), achievement: () => Promise.reject(new Error('sem Steam')) }), s, persist)).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
    expect(s.seatNames[0]).toBe('P1');
  });

  it('manda uma CÓPIA da lista: conquista que entra no save durante o reenvio não muda o que está sendo enviado', async () => {
    const s = save();
    const sent: string[] = [];
    const api = fullApi({ achievement: async (id: string) => { sent.push(id); if (sent.length === 1) s.achievements.push('MESTRE_DO_VACUO'); return true; } });
    await syncSteamOnOpen(api, s, () => undefined);
    expect(sent).toEqual(['PRIMEIRA_VITORIA', 'DEZ_VITORIAS']);
  });
});
