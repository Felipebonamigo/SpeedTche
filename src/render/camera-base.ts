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
