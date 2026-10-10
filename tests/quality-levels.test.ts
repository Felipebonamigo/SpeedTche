// Onda L, L1: o nível Ultra e o `atLeast` (o contrato que a L2 espera). Hoje `ultra` faz o mesmo que `high`: os efeitos
// são da L2. O que se trava aqui é que ninguém compare qualidade por igualdade ('high') — o `ultra` cairia no "senão" — e
// que toda tabela por qualidade tenha o degrau novo.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { atLeast, QUALITY_ORDER } from '../src/game/quality';
import { createCarMaterial, setCarQuality } from '../src/render/cars/material';
import { FRAME_AHEAD } from '../src/render/roadframe';
import { FOG_DENSITY } from '../src/render/sky';

const LEVELS = ['low', 'medium', 'high', 'ultra'] as const;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('Quality.ultra e atLeast', () => {
  it('atLeast segue a ordem low < medium < high < ultra (tabela inteira)', () => {
    expect([...QUALITY_ORDER]).toEqual([...LEVELS]);
    LEVELS.forEach((q, i) => LEVELS.forEach((level, j) => {
      expect(atLeast(q, level), `${q} ≥ ${level}`).toBe(i >= j);
    }));
  });

  it('toda tabela por qualidade tem o degrau ultra, igual ao high até a L2 ligar os efeitos', () => {
    for (const table of [FOG_DENSITY, FRAME_AHEAD]) {
      expect(Object.keys(table).sort()).toEqual([...LEVELS].sort());
      expect(table.ultra).toBe(table.high);
    }
  });

  it('ninguém compara a qualidade por igualdade com high/ultra: a regra é atLeast', () => {
    const bad: string[] = [];
    // src/bench fica fora: o `run.quality === 'high'` do metrics.ts é o NÍVEL exato do banco de prova ("a Alta não tem piso"),
    // não "alta ou melhor".
    for (const dir of ['src/render', 'src/render-pseudo3d', 'src/game']) {
      for (const file of sources(dir)) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/\b(?:quality|q)\s*[!=]==\s*'(?:high|ultra)'/i.test(line)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });

  it('o verniz do carro (clearcoat) liga em high e ultra, não em medium nem low', () => {
    const { material } = createCarMaterial();
    const clearcoat: Record<string, number> = {};
    for (const q of LEVELS) { setCarQuality(material, q); clearcoat[q] = material.clearcoat; }
    expect(clearcoat).toEqual({ low: 0, medium: 0, high: 1, ultra: 1 });
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });
});
