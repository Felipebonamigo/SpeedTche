// Sombra do sol por viewport (onda L, L2). O sol é UMA luz e o mundo é reposicionado a cada viewport, então um mapa só não serve a dois
// viewports. Com 1 e 2 jogadores cada viewport refaz o mapa todo quadro (o do three, como sempre). Com 3 e 4, cada viewport tem o SEU
// mapa (menor) e o refaz a cada 2 quadros; nos quadros em que não refaz, o mapa velho é usado com a matriz da sombra DESLOCADA pelos
// metros que o mundo andou desde que ele foi desenhado (`shadowShiftMeters`), senão a sombra pisca a 30 Hz.
import * as THREE from 'three';
import { shadowDue, shadowShiftMeters, type ShadowPlan } from './plan';

interface Slot { map: THREE.WebGLRenderTarget | null; matrix: THREE.Matrix4; z: number; valid: boolean }

export class ShadowRing {
  private readonly slots: Slot[] = [0, 1, 2, 3].map(() => ({ map: null, matrix: new THREE.Matrix4(), z: 0, valid: false }));
  private readonly shift = new THREE.Matrix4();
  private mode: 1 | 2 = 1;
  private size = 0;
  private frame = 0;
  /** Mapas redesenhados no último quadro (conta do gate). */
  updates = 0;

  constructor(private readonly shadow: THREE.DirectionalLightShadow) {}

  /** Uma vez por quadro, antes dos viewports: tamanho do mapa e modo (compartilhado ou por viewport). */
  beginFrame(plan: ShadowPlan): void {
    this.frame++;
    this.updates = 0;
    const sh = this.shadow;
    if (plan.mapSize > 0 && sh.mapSize.x !== plan.mapSize) {
      sh.mapSize.set(plan.mapSize, plan.mapSize);
      this.disposeMaps(); // a luz recria o mapa no tamanho novo
    } else if (this.size !== plan.mapSize) {
      this.disposeMaps();
    }
    this.size = plan.mapSize;
    // V22/F6: o filtro (PCF) e os bias acompanham o tamanho do mapa; trocar de 2 para 3 jogadores muda o texel, então vale a cada quadro (três atribuições).
    if (plan.mapSize > 0) { sh.radius = plan.radius; sh.bias = plan.bias; sh.normalBias = plan.normalBias; }
    if (plan.every !== this.mode) {
      this.disposeMaps();
      this.mode = plan.every;
    }
    if (this.mode === 1) sh.autoUpdate = true;
  }

  /** Antes de desenhar o viewport `i`; devolve se o mapa dele é refeito neste quadro. */
  beginViewport(i: number, carZ: number, trackLength: number): boolean {
    const sh = this.shadow;
    if (this.mode === 1) { this.updates++; return true; }
    const s = this.slots[i];
    const due = shadowDue(this.frame, i, 2, s.map !== null && s.valid);
    sh.autoUpdate = false;
    sh.needsUpdate = due;
    sh.map = s.map;
    if (due) { this.updates++; return true; }
    // Mapa velho: a matriz de quando foi desenhado, deslocada pelo que o mundo andou desde então.
    const d = shadowShiftMeters(s.z, carZ, trackLength);
    sh.matrix.copy(s.matrix).multiply(this.shift.makeTranslation(0, 0, -d));
    return false;
  }

  /** Depois de desenhar o viewport `i`. */
  endViewport(i: number, due: boolean, carZ: number): void {
    if (this.mode === 1) return;
    const sh = this.shadow; const s = this.slots[i];
    s.map = sh.map as THREE.WebGLRenderTarget | null;
    if (due) { s.matrix.copy(sh.matrix); s.z = carZ; s.valid = s.map !== null; }
  }

  /** Volta ao jeito do three (um mapa, todo quadro): fora de corrida (fundo dos menus) e com 1 ou 2 jogadores. */
  shared(): void {
    if (this.mode !== 1) { this.disposeMaps(); this.mode = 1; }
    this.shadow.autoUpdate = true;
    this.updates = 1;
  }

  private disposeMaps(): void {
    for (const s of this.slots) { s.map?.depthTexture?.dispose(); s.map?.dispose(); s.map = null; s.valid = false; }
    const sh = this.shadow;
    if (sh.map) { sh.map.depthTexture?.dispose(); sh.map.dispose(); sh.map = null; }
  }

  dispose(): void { this.disposeMaps(); }
}
