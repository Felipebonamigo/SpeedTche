// A1 (docs/ondas/A1-auditoria-save.md): compara duas versões do jogo (dois worktrees) sem tocar em nenhuma. Uso, de dentro do worktree da versão
// (com node_modules ligado), uma saída JSON por versão para comparar com `diff`/`node -e`:
//   npx tsx scripts/comparar-versoes.mts hashes <raiz>        as 8 corridas de referência (hashRace) e a impressão de volta dos 14 carros antigos nas 109 pistas
//   npx tsx scripts/comparar-versoes.mts sweep <raiz>         uma corrida de 4 humanos (carros antigos em rodízio) por pista, hash tick a tick (~35 s)
//   npx tsx scripts/comparar-versoes.mts feed <raiz> <save>   passa um save/opções gravados por OUTRA versão pelos saneadores desta e lista o que mudou
//                                                              (<save> = JSON { save, settings }; é o jeito de ver o que uma versão antiga perde ao regravar)
// <raiz> é o worktree da versão que está sendo medida (importado por caminho absoluto).
import { readFileSync } from 'node:fs';

const [mode, tree, arg] = process.argv.slice(2);
if (!mode || !tree) throw new Error('uso: comparar-versoes.mts hashes|sweep|feed <raiz> [save.json]');
const imp = (p: string) => import(`${tree}/${p}`);
const OLD = ['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto', 'curupira', 'sucuri', 'carcara', 'pororoca', 'iara', 'boitata', 'beijaflor'];
const fnv = (h: number, t: string) => { for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

if (mode === 'hashes') {
  const { fingerprintScenario, GOLDEN_SCENARIOS } = await imp('scripts/sim-scenarios.ts');
  const cv = await imp('src/game/content-version.ts');
  const { TRACKS } = await imp('src/core/track/index.ts');
  const out = { scenarios: {} as Record<string, string>, laps: {} as Record<string, string | null>, online: cv.onlineFingerprint() as string };
  for (const s of GOLDEN_SCENARIOS) { const r = fingerprintScenario(s); out.scenarios[s.name] = `${r.fingerprint}:${r.ticks}`; }
  for (const t of TRACKS) for (const c of OLD) out.laps[`${t.id}|${c}`] = cv.lapFingerprint(t.id, c);
  console.log(JSON.stringify(out));
} else if (mode === 'sweep') {
  const sc = await imp('scripts/sim-scenarios.ts');
  const { hashRace, serializeRace } = await imp('src/core/serialize.ts');
  const { createRace, stepRace } = await imp('src/core/sim/race.ts');
  const { getTrack, TRACKS } = await imp('src/core/track/index.ts');
  const out: Record<string, string> = {};
  TRACKS.forEach((t: { id: string }, i: number) => {
    const s = { name: 'x', trackId: t.id, humans: 4, versus: true, seed: 1000 + i, laps: 1 };
    const track = getTrack(t.id);
    const cfg = sc.scenarioConfig(s, track);
    cfg.humans.forEach((h: { carId: string }, k: number) => { h.carId = OLD[(i + k) % OLD.length]; });
    const state = createRace(cfg, track);
    let h = 0x811c9dc5; let n = 0;
    while (state.phase !== 'finished' && n < 6000) {
      stepRace(state, track, sc.scenarioInputs(state, track, s)); n++;
      h = fnv(h, String(hashRace(state)));
      if (state.events.length) h = fnv(h, JSON.stringify(state.events));
    }
    out[t.id] = `${fnv(h, serializeRace(state)).toString(16)}:${n}`;
  });
  console.log(JSON.stringify(out));
} else if (mode === 'feed') {
  const { sanitizeSave } = await imp('src/game/save.ts');
  const { sanitizeSettings } = await imp('src/game/settings.ts');
  const j = JSON.parse(readFileSync(arg, 'utf8')) as { save: unknown; settings: unknown };
  const diff = (a: any, b: any, path: string, out: string[]): void => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}.${k}`, out);
    } else out.push(`${path}: ${JSON.stringify(a)?.slice(0, 90)} -> ${JSON.stringify(b)?.slice(0, 90)}`);
  };
  const lines: string[] = [];
  diff(j.save, sanitizeSave(JSON.parse(JSON.stringify(j.save))), 'save', lines);
  diff(j.settings, sanitizeSettings(JSON.parse(JSON.stringify(j.settings))), 'settings', lines);
  console.log(lines.join('\n') || '(sem perdas)');
} else throw new Error(`modo desconhecido: ${mode}`);
