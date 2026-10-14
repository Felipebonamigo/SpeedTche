// Trocar a câmera de um assento em corrida (ação remapeável `camera`). Só entrada local e renderização: o resultado vai para
// `Settings.seatCameras` (lembrado nas opções) e para o aviso na tela; nada disto toca o núcleo, o lockstep ou o `hashRace`.
import { t } from '../i18n';
import { DEFAULT_CAMERA_MODE, nextCameraMode, pickCameraMode, type CameraMode } from '../render/camera-base';
import './strings';

export const CAMERA_NAME_KEYS: Readonly<Record<CameraMode, string>> = {
  high: 'session.camera.high', low: 'session.camera.low', hood: 'session.camera.hood', bumper: 'session.camera.bumper',
};

export function cameraName(mode: CameraMode): string {
  return t(CAMERA_NAME_KEYS[mode]);
}

/** Passa o assento à próxima câmera (grava em `seatCameras`) e devolve a nova e o aviso ("Câmera: Capô"); null para assento que não existe. */
export function switchCamera(seatCameras: CameraMode[], seat: number): { mode: CameraMode; text: string } | null {
  if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return null;
  while (seatCameras.length < 4) seatCameras.push(DEFAULT_CAMERA_MODE);
  const mode = nextCameraMode(pickCameraMode(seatCameras[seat], DEFAULT_CAMERA_MODE));
  seatCameras[seat] = mode;
  return { mode, text: t('session.camera', { name: cameraName(mode) }) };
}
