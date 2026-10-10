// Escritor mínimo de .glb (glTF 2.0 binário) para os scripts de arte dos carros: nós com malha, materiais por nome
// (cor, emissivo, rugosidade, metal, atlas `map`, `normalMap`) e as imagens PNG embutidas. Existe porque o
// GLTFExporter do three precisa de canvas para exportar textura e o Node não tem; aqui o arquivo sai byte a byte
// do que o conversor mandou. Só para scripts e testes.

export interface GlbPrimitive {
  positions: readonly number[];
  normals?: readonly number[];
  uvs?: readonly number[];
  /** Sem índices = lista de triângulos solta. */
  indices?: readonly number[];
  /** Índice em `GlbScene.materials`. */
  material: number;
}
export interface GlbNode {
  name: string;
  translation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
  mesh?: readonly GlbPrimitive[];
  children?: readonly GlbNode[];
  extras?: Record<string, unknown>;
}
export interface GlbMaterial {
  name: string;
  color?: readonly [number, number, number, number];
  emissive?: readonly [number, number, number];
  roughness?: number;
  metalness?: number;
  /** Índice em `GlbScene.images` (atlas de cor). */
  map?: number;
  normalMap?: number;
  extras?: Record<string, unknown>;
}
export interface GlbScene { nodes: readonly GlbNode[]; materials: readonly GlbMaterial[]; images?: readonly Buffer[] }

type Json = Record<string, unknown>;

export function writeGlb(scene: GlbScene): Buffer {
  const chunks: Buffer[] = [];
  const bufferViews: Json[] = [];
  const accessors: Json[] = [];
  let size = 0;
  const addBytes = (data: Buffer, target?: number): number => {
    const pad = (4 - (size % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); size += pad; }
    bufferViews.push({ buffer: 0, byteOffset: size, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(data); size += data.length;
    return bufferViews.length - 1;
  };
  const addFloats = (values: readonly number[], count: number, type: 'VEC3' | 'VEC2'): number => {
    const data = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => data.writeFloatLE(v, i * 4));
    const view = addBytes(data, 34962);
    const acc: Json = { bufferView: view, componentType: 5126, count, type };
    if (type === 'VEC3' && count > 0) {
      const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], values[i * 3 + k]); hi[k] = Math.max(hi[k], values[i * 3 + k]); }
      acc.min = lo; acc.max = hi;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const addIndices = (values: readonly number[]): number => {
    const data = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => data.writeUInt32LE(v, i * 4));
    accessors.push({ bufferView: addBytes(data, 34963), componentType: 5125, count: values.length, type: 'SCALAR' });
    return accessors.length - 1;
  };

  const meshes: Json[] = [];
  const nodes: Json[] = [];
  const build = (n: GlbNode): number => {
    const node: Json = { name: n.name };
    if (n.translation) node.translation = [...n.translation];
    if (n.scale) node.scale = [...n.scale];
    if (n.extras) node.extras = n.extras;
    if (n.mesh) {
      meshes.push({
        name: n.name,
        primitives: n.mesh.map((p) => {
          const attributes: Json = { POSITION: addFloats(p.positions, p.positions.length / 3, 'VEC3') };
          if (p.normals) attributes.NORMAL = addFloats(p.normals, p.normals.length / 3, 'VEC3');
          if (p.uvs) attributes.TEXCOORD_0 = addFloats(p.uvs, p.uvs.length / 2, 'VEC2');
          return { attributes, ...(p.indices ? { indices: addIndices(p.indices) } : {}), material: p.material };
        }),
      });
      node.mesh = meshes.length - 1;
    }
    const index = nodes.push(node) - 1;
    if (n.children?.length) node.children = n.children.map(build);
    return index;
  };
  const roots = scene.nodes.map(build);

  const images = (scene.images ?? []).map((png) => ({ bufferView: addBytes(png), mimeType: 'image/png' }));
  const materials = scene.materials.map((m) => {
    const pbr: Json = {
      baseColorFactor: [...(m.color ?? [1, 1, 1, 1])], roughnessFactor: m.roughness ?? 0.6, metallicFactor: m.metalness ?? 0,
    };
    if (m.map !== undefined) pbr.baseColorTexture = { index: m.map };
    const out: Json = { name: m.name, pbrMetallicRoughness: pbr };
    if (m.emissive) out.emissiveFactor = [...m.emissive];
    if (m.normalMap !== undefined) out.normalTexture = { index: m.normalMap };
    if (m.extras) out.extras = m.extras;
    return out;
  });

  const json: Json = {
    asset: { version: '2.0', generator: 'speedtche scripts/lib/glb-write.ts' },
    scene: 0, scenes: [{ nodes: roots }], nodes, meshes, materials,
    ...(images.length ? { images, textures: images.map((_, i) => ({ source: i, sampler: 0 })), samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }] } : {}),
    accessors, bufferViews, buffers: [{ byteLength: 0 }],
  };
  const bin = Buffer.concat(chunks);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  (json.buffers as Json[])[0].byteLength = binPadded.length;
  const jsonText = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonText, Buffer.alloc((4 - (jsonText.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  head.writeUInt32LE(jsonPadded.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binPadded.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jsonPadded, binHead, binPadded]);
}
