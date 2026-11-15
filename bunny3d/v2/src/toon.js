import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Create a quantized 1D gradient DataTexture for MeshToonMaterial.
 * Uses RGBAFormat + NearestFilter for maximum WebGL compatibility.
 */
export function createToonGradient(levels = [118, 172, 226, 255]) {
  const width = levels.length;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = levels[i];
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Inflate a geometry along smoothed vertex normals so backface outlines
 * stay uniform and never split along UV seams.
 */
export function createOutlineGeometry(sourceGeometry, thickness = 0.012) {
  const geo = sourceGeometry.clone();
  const posAttr = geo.attributes.position;
  let normAttr = geo.attributes.normal;
  if (!normAttr) {
    geo.computeVertexNormals();
    normAttr = geo.attributes.normal;
  }

  // Average normals for vertices sharing the same spatial coordinate.
  const normalSums = new Map();
  const keyFor = (i) => {
    const x = Math.round(posAttr.getX(i) * 10000);
    const y = Math.round(posAttr.getY(i) * 10000);
    const z = Math.round(posAttr.getZ(i) * 10000);
    return `${x},${y},${z}`;
  };

  for (let i = 0; i < posAttr.count; i++) {
    const key = keyFor(i);
    let sum = normalSums.get(key);
    if (!sum) {
      sum = [0, 0, 0];
      normalSums.set(key, sum);
    }
    sum[0] += normAttr.getX(i);
    sum[1] += normAttr.getY(i);
    sum[2] += normAttr.getZ(i);
  }

  for (let i = 0; i < posAttr.count; i++) {
    const sum = normalSums.get(keyFor(i));
    const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    const nx = sum[0] / len;
    const ny = sum[1] / len;
    const nz = sum[2] / len;
    posAttr.setXYZ(
      i,
      posAttr.getX(i) + nx * thickness,
      posAttr.getY(i) + ny * thickness,
      posAttr.getZ(i) + nz * thickness
    );
  }

  posAttr.needsUpdate = true;
  // Strip unused attributes on outline meshes to keep memory lean.
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

/**
 * Attach a BackSide toon outline child mesh using a shared outline material.
 */
export function attachOutline(mesh, outlineMaterial, thickness = 0.012) {
  const outlineGeo = createOutlineGeometry(mesh.geometry, thickness);
  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMaterial);
  outlineMesh.name = `${mesh.name || 'part'}_outline`;
  outlineMesh.renderOrder = -1;
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Merge static meshes sharing the same material inside a group to reduce draw calls.
 * Preserves local transforms and renderOrder per material bucket.
 */
export function mergeGroupByMaterial(group) {
  group.updateMatrixWorld(true);
  const invRoot = group.matrixWorld.clone().invert();
  const buckets = new Map();
  const toRemove = [];

  group.traverse((child) => {
    if (!child.isMesh) return;
    toRemove.push(child);
    const key = `${child.material.uuid}_${child.renderOrder}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: child.material, renderOrder: child.renderOrder, geos: [] };
      buckets.set(key, bucket);
    }
    const geo = child.geometry.clone();
    const relMatrix = invRoot.clone().multiply(child.matrixWorld);
    geo.applyMatrix4(relMatrix);
    if (geo.index) {
      const nonIndexed = geo.toNonIndexed();
      geo.dispose();
      bucket.geos.push(nonIndexed);
    } else {
      bucket.geos.push(geo);
    }
  });

  if (toRemove.length <= 2) return group;

  for (const child of toRemove) {
    child.geometry.dispose();
    if (child.parent) child.parent.remove(child);
  }

  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geos, false);
    for (const g of bucket.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.renderOrder = bucket.renderOrder;
    group.add(mesh);
  }
  return group;
}

/**
 * Build the shared 3-step pastel toon material palette with color-matched outlines.
 */
export function createCharacterMaterials(fishnetTexture) {
  const skinGradient = createToonGradient([188, 224, 255]);
  const softGradient = createToonGradient([156, 208, 255]);
  const crispGradient = createToonGradient([132, 194, 255]);

  return {
    gradients: { skinGradient, softGradient, crispGradient },
    skin: new THREE.MeshToonMaterial({
      color: 0xffd9be,
      gradientMap: skinGradient,
    }),
    skinShadow: new THREE.MeshToonMaterial({
      color: 0xeba98c,
      gradientMap: skinGradient,
    }),
    hair: new THREE.MeshToonMaterial({
      color: 0x7c4324,
      gradientMap: crispGradient,
    }),
    hairHighlight: new THREE.MeshToonMaterial({
      color: 0xc9844f,
      gradientMap: softGradient,
      emissive: 0x42220d,
      emissiveIntensity: 0.22,
    }),
    suit: new THREE.MeshToonMaterial({
      color: 0x763cb0,
      gradientMap: crispGradient,
      emissive: 0x1d0a33,
      emissiveIntensity: 0.22,
    }),
    suitTrim: new THREE.MeshToonMaterial({
      color: 0x9b5fd9,
      gradientMap: softGradient,
    }),
    innerEar: new THREE.MeshToonMaterial({
      color: 0xde8ff2,
      gradientMap: softGradient,
    }),
    white: new THREE.MeshToonMaterial({
      color: 0xfbf8ff,
      gradientMap: softGradient,
    }),
    heel: new THREE.MeshToonMaterial({
      color: 0x261a30,
      gradientMap: crispGradient,
    }),
    fishnet: new THREE.MeshToonMaterial({
      color: 0xffffff,
      map: fishnetTexture,
      gradientMap: skinGradient,
    }),
    gold: new THREE.MeshToonMaterial({
      color: 0xf0c788,
      gradientMap: crispGradient,
    }),
    outline: new THREE.MeshBasicMaterial({
      color: 0x221528,
      side: THREE.BackSide,
    }),
    outlineHair: new THREE.MeshBasicMaterial({
      color: 0x3a2214,
      side: THREE.BackSide,
    }),
    outlineSkin: new THREE.MeshBasicMaterial({
      color: 0x9c6152,
      side: THREE.BackSide,
    }),
    outlinePurple: new THREE.MeshBasicMaterial({
      color: 0x3b1a63,
      side: THREE.BackSide,
    }),
    outlineWhite: new THREE.MeshBasicMaterial({
      color: 0x7b6894,
      side: THREE.BackSide,
    }),
    outlineDark: new THREE.MeshBasicMaterial({
      color: 0x221528,
      side: THREE.BackSide,
    }),
  };
}
