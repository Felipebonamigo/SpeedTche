// A pose-base da câmera de perseguição, numa folha SEM imports (M5). Ela morava em `camera.ts`, mas `camera.ts` passou a usar o modelo de
// deslocamentos dinâmicos de `scenery/sight.ts`, e o `sight.ts` lê esta pose na carga do módulo (o `TAN_V`): com a pose ainda em
// `camera.ts` seria um ciclo de importação que só funciona conforme quem carrega primeiro. `camera.ts` a reexporta; nenhum importador muda.

/**
 * Pose da câmera de perseguição, exportada para a conta de enquadramento dos marcos turísticos (scenery/sight.ts):
 * FOV vertical (°) parado, + por fração da velocidade máxima (até 1,2) e + no nitro; altura sobre a pista e distância
 * atrás do carro (m); ponto olhado à frente (m) e a altura dele. NÃO muda na M5: os deslocamentos dinâmicos (câmera mais baixa,
 * mola de FOV, tremor, órbita, cresta) saem DESTA pose e têm limite em `CAMERA_DYNAMICS` (scenery/sight.ts).
 */
export const CHASE_CAMERA = { baseFov: 62, speedFov: 13, nitroFov: 8, height: 2.05, back: 7.8, lookAhead: 18, lookY: 0.85 } as const;

// ───────────────────────────── Câmeras selecionáveis (nc/cameras) ─────────────────────────────
// Quatro câmeras, escolhidas por assento (Settings.seatCameras) e trocadas em corrida pela ação `camera`. É só renderização e entrada local:
// a escolha nunca viaja pelo lockstep nem toca o núcleo. A Baixa é a `CHASE_CAMERA` de sempre; a Alta é a pose B do quadro-alvo
// (docs/ondas/quadro-alvo.md, rodada 5); Capô e Frente são presas ao carro (ponto de montagem em cars/mount.ts).

export type CameraMode = 'high' | 'low' | 'hood' | 'bumper';
/** Ordem do ciclo da ação `camera` e das opções. */
export const CAMERA_MODES: readonly CameraMode[] = ['high', 'low', 'hood', 'bumper'];
export const DEFAULT_CAMERA_MODE: CameraMode = 'high';

/** A pose de uma câmera: os mesmos campos da `CHASE_CAMERA`. Nas presas ao carro `height`/`back` valem só como olho aproximado (régua de visão dos marcos). */
export interface CameraPose { readonly baseFov: number; readonly speedFov: number; readonly nitroFov: number; readonly height: number; readonly back: number; readonly lookAhead: number; readonly lookY: number }

export const CAMERA_POSES: Readonly<Record<CameraMode, CameraPose>> = {
  // Alta: h 2,5 · mira 0,7 (a pose B aprovada). O FOV foi de 36 para 54 e o recuo de 7,8 para 5,8 m: com 36° os marcos de lado saíam do quadro (103 instâncias
  // abaixo do mínimo; com 54°, 46, perto das 36 da Baixa: tests/landmarks-enquadramento-cameras.test.ts), e o recuo menor mantém o carro do tamanho que o dono aprovou.
  high: { baseFov: 54, speedFov: 8, nitroFov: 5, height: 2.5, back: 5.8, lookAhead: 18, lookY: 0.7 },
  low: CHASE_CAMERA,
  // Capô: olho ~0,55 m acima do capô (cars/mount.ts), a ~1,3 m do chão; Frente: na ponta do bico, ~0,4 m do chão.
  hood: { baseFov: 72, speedFov: 9, nitroFov: 6, height: 1.35, back: 0, lookAhead: 30, lookY: 1.0 },
  bumper: { baseFov: 78, speedFov: 11, nitroFov: 7, height: 0.42, back: -1.9, lookAhead: 30, lookY: 0.55 },
};

/** Capô e Frente: a câmera anda com o carro (sem atraso lateral, sem cresta, sem órbita). */
export function isMountedCamera(m: CameraMode): boolean {
  return m === 'hood' || m === 'bumper';
}

export function nextCameraMode(m: CameraMode): CameraMode {
  return CAMERA_MODES[(CAMERA_MODES.indexOf(m) + 1) % CAMERA_MODES.length];
}

export function pickCameraMode(v: unknown, fallback: CameraMode): CameraMode {
  return typeof v === 'string' && (CAMERA_MODES as readonly string[]).includes(v) ? (v as CameraMode) : fallback;
}
