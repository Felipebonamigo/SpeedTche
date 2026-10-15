// O shader dos carros com os acabamentos (N3, src/render/cars/material.ts): o texto que o `onBeforeCompile` produz sobre o shader REAL do
// three (`ShaderLib.physical`), sem GL — o que o compilador de verdade confere (o programa compila em cada qualidade, com a cena do laboratório)
// fica em tests/gl-render.test.ts (NC_REQUIRE_GL=1). Aqui: cada gancho foi aplicado uma vez, os varyings do vértice e do fragmento batem, a ordem das
// declarações permite o uso, a Média tem o ramo do brilho de Fresnel no lugar do verniz, e a chave do programa mudou.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FINISH_IDS } from '../src/game/cosmetics';
import { createCarMaterial, FINISH_MASK, FINISH_SHIFT, setCarQuality } from '../src/render/cars/material';
import { applyStylize } from '../src/render/stylize';

function compiled(): { material: THREE.MeshPhysicalMaterial; vert: string; frag: string } {
  const { material } = createCarMaterial();
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return { material, vert: shader.vertexShader, frag: shader.fragmentShader };
}

const count = (text: string, needle: string | RegExp): number => (typeof needle === 'string' ? text.split(needle).length - 1 : (text.match(needle) ?? []).length);
const at = (text: string, needle: string): number => {
  const i = text.indexOf(needle);
  expect(i, `faltou: ${needle}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe('shader dos carros: acabamentos', () => {
  const { material, vert, frag } = compiled();

  it('os bits do acabamento cabem em 3 bits, a partir do bit 3, e há um valor por acabamento do catálogo', () => {
    expect(FINISH_SHIFT).toBe(3);
    expect(FINISH_MASK).toBe(7);
    expect(FINISH_IDS.length - 1).toBeLessThanOrEqual(FINISH_MASK);
  });

  it('a chave do programa mudou (v5) e a estilização continua composta na chave', () => {
    const key = material.customProgramCacheKey();
    // v3 (nc/cameras): o corte do próprio carro nas câmeras de Capô e Frente; v4 (cor-brilho): a lente com miolo (aLens) e o verniz estilizado;
    // v5 (V2): o sol com rugosidade mínima na luz direta (o ponto branco com halo no teto do GT).
    expect(key).toContain('speed-tche-car-v5');
    expect(key).not.toContain('speed-tche-car-v1');
  });

  it('cada gancho foi aplicado uma vez: uma rugosidade, um metal, nenhuma declaração repetida', () => {
    expect(count(frag, /float roughnessFactor\b/g)).toBe(1);
    expect(count(frag, /float metalnessFactor\b/g)).toBe(1);
    expect(count(frag, /float fMetal\b/g)).toBe(1);
    expect(count(frag, /float fFlake\b/g)).toBe(1);
    for (const w of ['wMetallic', 'wPearl', 'wMatte', 'wChrome', 'wCham']) expect(count(frag, new RegExp(`float ${w}\\b`, 'g')), w).toBe(1);
    expect(count(vert, 'vFinish = float')).toBe(1);
    expect(count(vert, 'vFin = ')).toBe(1);
  });

  it('as declarações vêm antes dos usos: pesos → rugosidade → metal → cor/flocos → emissivo → verniz → reflexo', () => {
    const order = [
      at(frag, 'float wMetallic'), at(frag, 'float metalnessFactor'), at(frag, '#include <normal_fragment_maps>'), at(frag, 'float fFlake'),
      at(frag, 'fFlake * 0.9'), at(frag, '#include <lights_physical_fragment>'), at(frag, 'radiance *= uEnvBoost * ( 0.35 + fMetal )'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(at(frag, '#include <normal_fragment_maps>')).toBeLessThan(at(frag, 'dot( normal, V )')); // a normal existe quando a cor a usa
  });

  it('os varyings do vértice e do fragmento têm o mesmo tipo e o mesmo nome', () => {
    for (const [type, name] of [['float', 'vFin'], ['float', 'vFinish'], ['vec3', 'vLocal'], ['vec3', 'vAccent']] as const) {
      expect(count(vert, new RegExp(`varying ${type} ${name};`, 'g')), `${name} no vértice`).toBe(1);
      expect(count(frag, new RegExp(`varying ${type} ${name};`, 'g')), `${name} no fragmento`).toBe(1);
    }
  });

  it('o vértice lê o acabamento dos bits da instância (flags >> 3 & 7) e o peso só vale na carroceria pintada, sem o acento nem a faixa', () => {
    expect(vert).toContain('( flags >> 3 ) & 7');
    expect(vert).toMatch(/vFin = aPaint\.x \* \( 1\.0 - aPaint\.y \) \* \( 1\.0 - liv \)/);
  });

  it('chaves e parênteses do GLSL fecham: os ganchos não desequilibram o shader (a conta é contra o mesmo shader só com a estilização)', () => {
    const plain = new THREE.MeshPhysicalMaterial();
    applyStylize(plain, 'car');
    const base = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    plain.onBeforeCompile(base as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    // O texto cru do three tem `{` em ramos de `#if` opostos, então a conta é a DIFERENÇA em relação ao mesmo shader sem os ganchos do carro.
    const delta = (text: string, open: string, close: string) => count(text, open) - count(text, close);
    for (const [name, mine, theirs] of [['vértice', vert, base.vertexShader], ['fragmento', frag, base.fragmentShader]] as const) {
      expect(delta(mine, '{', '}'), `${name}: chaves`).toBe(delta(theirs, '{', '}'));
      expect(delta(mine, '(', ')'), `${name}: parênteses`).toBe(delta(theirs, '(', ')'));
    }
  });

  it('o brilho de verniz da Média: no lugar do clearcoat de verdade, um Fresnel sobre a reflexão que já foi amostrada (só metálico, perolado e camaleão)', () => {
    const iCoat = at(frag, '#ifdef USE_CLEARCOAT\n            clearcoatRadiance');
    const iElse = frag.indexOf('#else', iCoat);
    const iEnd = frag.indexOf('#endif', iElse);
    expect(iElse).toBeGreaterThan(iCoat);
    const media = frag.slice(iElse, iEnd);
    expect(media).toContain('wMetallic + wPearl + wCham');
    expect(media).toContain('radiance *=');
    expect(media).not.toContain('texture'); // nenhuma amostra a mais
    expect(media).not.toContain('wChrome'); // o cromado já é espelho, o brilho extra o estouraria
    expect(media).not.toContain('wMatte');
  });

  it('o fosco desliga o verniz; o cromado desliga a luz própria', () => {
    expect(frag).toContain('material.clearcoat *= vPaintW * 0.7 * ( 1.0 - wMatte )');
    expect(frag).toContain('( 1.0 - wChrome )');
  });

  it('o acabamento de brilho (padrão) não altera nada: com peso 0 a rugosidade e o metal são os do vértice', () => {
    // O ramo é `mix(x, novo, w)` com w = 0: o texto precisa partir do valor do vértice.
    expect(frag).toContain('float roughnessFactor = vMat.x;');
    expect(frag).toContain('float fMetal = vMat.y;');
    expect(frag).toContain('float metalnessFactor = fMetal;');
  });
});

describe('verniz só na Alta (a Média usa a aproximação)', () => {
  it.each([['low', 0], ['medium', 0], ['high', 1], ['ultra', 1]] as const)('setCarQuality(%s) → clearcoat %i', (q, coat) => {
    const { material } = createCarMaterial();
    setCarQuality(material, q);
    expect(material.clearcoat).toBe(coat);
  });
});

describe('shader dos carros: o realce do sol tem teto (V2)', () => {
  const { frag } = compiled();
  it('depois da luz direta e antes do reflexo do céu, o realce direto (base e verniz) fica abaixo de uSunCap; o reflexo do céu não tem teto', () => {
    const direct = at(frag, '#include <lights_fragment_begin>');
    const cap = at(frag, 'reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( uSunCap ) );');
    const coat = at(frag, 'clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( uSunCap ) );');
    const ibl = at(frag, '#include <lights_fragment_maps>');
    expect(cap).toBeGreaterThan(direct);
    expect(coat).toBeGreaterThan(direct);
    expect(cap).toBeLessThan(ibl);
    expect(coat).toBeLessThan(ibl);
    expect(count(frag, 'uSunCap )')).toBe(2);
  });
});
