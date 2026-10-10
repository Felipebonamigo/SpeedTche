// N2, palco 3D (docs/ondas/N/N2.md §4.3, §6 "S"): a cena do palco sem GL — a luz de 3 pontos, o gancho do `Cars` que posa carro sem corrida
// (`poseDisplay`), o dispose (nada que o palco criou fica vivo) e o `enter`/`leave` que devolvem ao renderizador da corrida o que o palco
// mexeu (luz dos carros, uniformes da estilização, exposição, pai do grupo dos carros). O que precisa de GL (programas, PMREM, pipelines)
// está em tests/stage-gl.test.ts.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { stylizeUniforms } from '../src/render/stylize';
import { fakeCanvasDocument } from './canvas-fake';

let restoreDoc: () => void;
beforeEach(() => { restoreDoc = fakeCanvasDocument(); });
afterEach(() => restoreDoc());

type CarsT = import('../src/render/cars').Cars;
type StageT = import('../src/render/stage').Stage;

/** O renderizador falso: só o que o `enter`/`leave` leem e escrevem. */
function fakeGl(): THREE.WebGLRenderer {
  return { toneMappingExposure: 1.7, setScissorTest() {}, info: { reset() {}, render: { calls: 0, triangles: 0 } } } as unknown as THREE.WebGLRenderer;
}

async function setup(): Promise<{ cars: CarsT; stage: StageT; raceScene: THREE.Scene; gl: THREE.WebGLRenderer; light: { v: number } }> {
  const { Cars } = await import('../src/render/cars');
  const { Stage } = await import('../src/render/stage');
  const raceScene = new THREE.Scene();
  const cars = new Cars(raceScene);
  const gl = fakeGl();
  const light = { v: 0.5 };
  cars.setLight(light.v);
  const stage = new Stage({ renderer: gl, cars, raceScene, raceCarLight: () => light.v, raceCarQuality: () => 'high' });
  return { cars, stage, raceScene, gl, light };
}

const rigsOf = (cars: CarsT) => (cars as unknown as { rigs: Array<{ uniforms: Record<string, { value: number }> }> }).rigs;
const instanced = (cars: CarsT): THREE.InstancedMesh[] => cars.group.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh === true);

describe('luz de 3 pontos do palco', () => {
  it('principal quente à frente-esquerda e acima, preenchimento frio e mais fraco, contraluz forte ATRÁS com a borda; nenhuma projeta sombra', async () => {
    const { stage } = await setup();
    const { key, fill, rim } = stage.lights;
    for (const l of [key, fill, rim]) { expect(l).toBeInstanceOf(THREE.DirectionalLight); expect(l.castShadow).toBe(false); }
    // A câmera fica no +Z olhando para -Z: "à frente" é +Z e "atrás" é -Z.
    expect(key.position.z).toBeGreaterThan(0);
    expect(key.position.x).toBeLessThan(0);
    expect(key.position.y).toBeGreaterThan(2);
    expect(rim.position.z).toBeLessThan(0);
    expect(rim.position.y).toBeGreaterThan(2);
    expect(fill.position.x).toBeGreaterThan(0);
    expect(key.intensity).toBeGreaterThan(fill.intensity);
    expect(rim.intensity).toBeGreaterThan(fill.intensity);
    // Quente × frio: o vermelho da principal passa o azul; no preenchimento é o contrário.
    expect(key.color.r).toBeGreaterThan(key.color.b);
    expect(fill.color.b).toBeGreaterThan(fill.color.r);
    stage.dispose();
  });

  it('o estúdio tem o prato, o anel, o domo e a sombra de contato', async () => {
    const { stage } = await setup();
    for (const name of ['stage:dome', 'stage:floor', 'stage:plate', 'stage:ring', 'stage:contact']) expect(stage.scene.getObjectByName(name), name).toBeTruthy();
    stage.dispose();
  });
});

describe('Cars.poseDisplay (o gancho que posa carro sem corrida)', () => {
  const display = (carId: string, x = 0) => ({ carId, x, y: 0.18, z: 0, yaw: Math.PI });
  const total = (cars: CarsT): number => instanced(cars).filter((m) => m.visible).reduce((a, m) => a + m.count, 0);

  it('um carro: 1 casco + 4 rodas + 1 sombra de contato, e nada de chama nem estrela da corrida', async () => {
    const { cars } = await setup();
    cars.poseDisplay([display('falcao')]);
    expect(total(cars)).toBe(1 + 4 + 1);
    const visible = instanced(cars).filter((m) => m.visible);
    expect(visible.map((m) => m.count).sort()).toEqual([1, 1, 4]);
  });

  it('três carros de estilos diferentes: um casco cada, 12 rodas, 3 sombras', async () => {
    const { cars } = await setup();
    const ids = ['falcao', 'trovao', 'tornado'];
    expect(new Set(ids.map((id) => CARS.find((c) => c.id === id)?.body)).size).toBe(3);
    cars.poseDisplay(ids.map((id, i) => display(id, (i - 1) * 3)));
    expect(total(cars)).toBe(3 + 12 + 3);
  });

  it('chamar de novo substitui (não acumula) e uma lista vazia esconde tudo', async () => {
    const { cars } = await setup();
    cars.poseDisplay([display('falcao'), display('trovao', 3)]);
    cars.poseDisplay([display('camelo')]);
    expect(total(cars)).toBe(1 + 4 + 1);
    cars.poseDisplay([]);
    expect(total(cars)).toBe(0);
  });

  it('carro que não existe lança com o id no erro (nunca desenha um "qualquer")', async () => {
    const { cars } = await setup();
    expect(() => cars.poseDisplay([display('nao-existe')])).toThrow(/nao-existe/);
  });

  it('a pintura escolhida vira a cor da instância; sem ela vale a de fábrica', async () => {
    const { cars } = await setup();
    const shell = (): THREE.InstancedMesh => { const m = instanced(cars).find((x) => x.visible && x.count === 1 && x.geometry.getAttribute('instExtra')); if (!m) throw new Error('casco'); return m; };
    cars.poseDisplay([{ ...display('falcao'), paint: { color: '#336699', accent: '#ffcc00' } }]);
    const c = new THREE.Color(); shell().getColorAt(0, c);
    expect(c.getHexString()).toBe(new THREE.Color('#336699').getHexString());
    cars.poseDisplay([display('falcao')]);
    shell().getColorAt(0, c);
    expect(c.getHexString()).toBe(new THREE.Color(CARS.find((x) => x.id === 'falcao')?.color ?? '#000').getHexString());
  });

  it('a mola da oficina abaixa só o casco: a roda fica no chão', async () => {
    const { cars } = await setup();
    const y = (mesh: THREE.InstancedMesh): number => { const m = new THREE.Matrix4(); mesh.getMatrixAt(0, m); return new THREE.Vector3().setFromMatrixPosition(m).y; };
    const parts = () => {
      const vis = instanced(cars).filter((m) => m.visible);
      return { shell: vis.find((m) => m.count === 1 && m.geometry.getAttribute('instExtra')) as THREE.InstancedMesh, wheel: vis.find((m) => m.count === 4) as THREE.InstancedMesh };
    };
    cars.poseDisplay([display('falcao')]);
    const [shell0, wheel0] = [y(parts().shell), y(parts().wheel)];
    cars.poseDisplay([{ ...display('falcao'), dip: -0.07 }]);
    expect(y(parts().shell)).toBeCloseTo(shell0 - 0.07, 5);
    expect(y(parts().wheel)).toBeCloseTo(wheel0, 5);
  });

  it('modelOf devolve o modelo do carro (eixos, escapes, altura) e lança para o que não existe', async () => {
    const { cars } = await setup();
    const m = cars.modelOf('falcao');
    expect(m.axles).toHaveLength(2);
    expect(m.height).toBeGreaterThan(0.8);
    expect(() => cars.modelOf('nao-existe')).toThrow(/nao-existe/);
  });

  it('setHeadlights: 0 = os faróis do dia, 1 = acesos de noite, e sobe o farol escamoteável', async () => {
    const { cars } = await setup();
    cars.setHeadlights(0);
    const off = rigsOf(cars)[0].uniforms.uHeadGlow.value;
    const popOff = rigsOf(cars)[0].uniforms.uPopup.value;
    cars.setHeadlights(1);
    expect(rigsOf(cars)[0].uniforms.uHeadGlow.value).toBeGreaterThan(off + 1);
    expect(rigsOf(cars)[0].uniforms.uPopup.value).toBeGreaterThan(popOff);
    cars.setHeadlights(0.5);
    const mid = rigsOf(cars)[0].uniforms.uHeadGlow.value;
    expect(mid).toBeGreaterThan(off);
    expect(mid).toBeLessThan(rigsOf(cars)[0].uniforms.uHeadGlow.value + 10);
  });
});

describe('enter / leave: o que o palco mexe é devolvido à corrida', () => {
  const snapshot = () => ({
    rim: stylizeUniforms.uStylizeRim.value.toArray(), term: stylizeUniforms.uStylizeTerm.value.toArray(),
    shadows: stylizeUniforms.uGradeShadows.value.toArray(), highlights: stylizeUniforms.uGradeHighlights.value.toArray(), adjust: stylizeUniforms.uGradeAdjust.value.toArray(),
  });

  it('enter muda de cena, luz, uniformes e exposição; leave devolve tudo exatamente', async () => {
    const { cars, stage, raceScene, gl } = await setup();
    stylizeUniforms.uStylizeRim.value.set(0.11, 0.22, 0.33);
    stylizeUniforms.uGradeAdjust.value.set(0.05, 0.07, 0);
    const before = snapshot();
    const glow = rigsOf(cars)[0].uniforms.uHeadGlow.value;
    const self = rigsOf(cars)[0].uniforms.uSelfLight.value;
    expect(cars.group.parent).toBe(raceScene);

    stage.enter();
    expect(stage.active).toBe(true);
    expect(cars.group.parent).toBe(stage.scene);
    expect(snapshot()).not.toEqual(before);
    expect(gl.toneMappingExposure).not.toBe(1.7);

    stage.leave();
    expect(stage.active).toBe(false);
    expect(cars.group.parent).toBe(raceScene);
    expect(snapshot()).toEqual(before);
    expect(gl.toneMappingExposure).toBe(1.7);
    expect(rigsOf(cars)[0].uniforms.uHeadGlow.value).toBe(glow);
    expect(rigsOf(cars)[0].uniforms.uSelfLight.value).toBe(self);
    stage.dispose();
  });

  it('enter e leave são idempotentes: um 2º enter NÃO regrava o que a corrida tinha com o valor do estúdio', async () => {
    const { cars, stage, raceScene, gl } = await setup();
    const before = snapshot();
    stage.enter(); stage.enter();
    stage.leave(); stage.leave();
    expect(snapshot()).toEqual(before);
    expect(gl.toneMappingExposure).toBe(1.7);
    expect(cars.group.parent).toBe(raceScene);
    stage.dispose();
  });

  it('leave sem enter não faz nada; dispose sem enter também não quebra', async () => {
    const { cars, stage, raceScene } = await setup();
    const before = snapshot();
    stage.leave();
    expect(snapshot()).toEqual(before);
    expect(cars.group.parent).toBe(raceScene);
    stage.dispose();
    stage.dispose();
  });

  it('dispose com o palco ativo devolve os carros à corrida antes de soltar a cena', async () => {
    const { cars, stage, raceScene } = await setup();
    stage.enter();
    stage.dispose();
    expect(cars.group.parent).toBe(raceScene);
  });
});

describe('dispose: nada do que o palco criou fica vivo', () => {
  /** Tudo o que a cena do palco guarda na GPU (geometria, material, textura), com um ouvinte de `dispose` em cada um. */
  function track(scene: THREE.Scene): { fired: Set<object>; all: Set<object> } {
    const all = new Set<object>(); const fired = new Set<object>();
    const hook = (o: { addEventListener(t: 'dispose', f: () => void): void }): void => { if (all.has(o)) return; all.add(o); o.addEventListener('dispose', () => fired.add(o)); };
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) hook(m.geometry);
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        hook(mat);
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) hook(v);
      }
    });
    return { fired, all };
  }

  it('toda geometria, material e textura da cena do palco recebe dispose; a cena fica sem filhos', async () => {
    const { stage, cars } = await setup();
    const { fired, all } = track(stage.scene);
    expect(all.size).toBeGreaterThan(15);
    stage.dispose();
    const missing = [...all].filter((o) => !fired.has(o)).map((o) => (o as { type?: string; name?: string }).type ?? (o as { name?: string }).name ?? '?');
    expect(missing).toEqual([]);
    expect(stage.scene.children).toHaveLength(0);
    expect(cars.group.children.length).toBeGreaterThan(10); // o `Cars` do renderizador seguiu intacto
  });

  it('12 ciclos criar → usar → soltar não deixam nada vivo', async () => {
    const { Stage } = await import('../src/render/stage');
    const { cars, raceScene, gl } = await setup();
    for (let i = 0; i < 12; i++) {
      const stage = new Stage({ renderer: gl, cars, raceScene, raceCarLight: () => 0.5, raceCarQuality: () => 'high' });
      const { fired, all } = track(stage.scene);
      stage.enter();
      cars.poseDisplay([{ carId: 'falcao', x: 0, y: 0.18, z: 0, yaw: 1 }]);
      stage.leave();
      stage.dispose();
      expect([...all].filter((o) => !fired.has(o)), `ciclo ${i}`).toEqual([]);
      expect(cars.group.parent, `ciclo ${i}`).toBe(raceScene);
    }
  });
});
