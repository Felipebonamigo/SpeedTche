// Mensagem ao fechar uma volta (session.ts: handleEvent). Na última volta não há mensagem: a faixa ÚLTIMA VOLTA do HUD
// (render/hud-motion.ts: stepLastLapBand) já a anuncia, e dizer a mesma coisa duas vezes polui a tela.
import { t } from '../i18n';
import './strings';

/** "VOLTA n/total" para a volta `lap` que começa; `null` quando ela é a última (ou além). */
export function lapMessage(lap: number, laps: number): string | null {
  return lap < laps ? t('session.lap', { n: lap, total: laps }) : null;
}
