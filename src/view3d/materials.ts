import * as THREE from 'three';
import type { PartMaterial } from '../catalog/catalog';

/** Plano de corte das paredes no modo "paredes baixas": mantém tudo com y <= 1,2 m. */
export const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2);

export const wallMaterial = new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.92 });
export const wallSelectedMaterial = new THREE.MeshStandardMaterial({ color: '#9cc2fb', roughness: 0.85 });
export const frameMaterial = new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.5 });
export const doorLeafMaterial = new THREE.MeshStandardMaterial({ color: '#b48a60', roughness: 0.6 });
export const handleMaterial = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.85, roughness: 0.3 });
export const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#cfe8f7',
  transparent: true,
  opacity: 0.28,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});
export const openingSelectedMaterial = new THREE.MeshStandardMaterial({ color: '#2f7cf6', roughness: 0.5 });

const cutMaterials = [wallMaterial, wallSelectedMaterial, frameMaterial, doorLeafMaterial, glassMaterial, handleMaterial, openingSelectedMaterial];

let cutOn = false;
const wallCache = new Map<string, THREE.MeshStandardMaterial>();

/** Material de parede por cor (respeita o corte de "paredes baixas"). */
export function wallMaterialFor(color: string | undefined): THREE.Material {
  if (!color) return wallMaterial;
  let m = wallCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
    cutMaterials.push(m);
    wallCache.set(color, m);
    if (cutOn) {
      m.clippingPlanes = [CUT_PLANE];
      m.side = THREE.DoubleSide;
    }
  }
  return m;
}

const slabCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material de laje/teto por cor. */
export function slabMaterialFor(color = '#cfcac2'): THREE.Material {
  let m = slabCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    slabCache.set(color, m);
  }
  return m;
}

export function setWallCut(on: boolean) {
  cutOn = on;
  for (const m of cutMaterials) {
    m.clippingPlanes = on ? [CUT_PLANE] : null;
    m.side = on && (m === wallMaterial || m === wallSelectedMaterial || [...wallCache.values()].includes(m as THREE.MeshStandardMaterial)) ? THREE.DoubleSide : THREE.FrontSide;
    m.needsUpdate = true;
  }
}

const partCache = new Map<string, THREE.Material>();

/** Material compartilhado por cor/tipo (evita criar centenas de materiais iguais). */
export function partMaterial(color: string, kind: PartMaterial | undefined, selected: boolean): THREE.Material {
  const key = `${color}|${kind ?? 'matte'}|${selected ? 1 : 0}`;
  let m = partCache.get(key);
  if (m) return m;
  const emissive = selected ? new THREE.Color('#2f7cf6') : new THREE.Color('#000000');
  const emissiveIntensity = selected ? 0.35 : 0;
  switch (kind) {
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.3, roughness: 0.05, emissive, emissiveIntensity, depthWrite: false });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.32, emissive, emissiveIntensity });
      break;
    case 'ceramic':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, emissive, emissiveIntensity });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, emissive, emissiveIntensity });
      break;
    case 'fabric':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, emissive, emissiveIntensity });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive, emissiveIntensity });
  }
  partCache.set(key, m);
  return m;
}

const floorCache = new Map<string, THREE.Material>();
export function floorMaterial(color: string, selected: boolean): THREE.Material {
  const key = `${color}|${selected}`;
  let m = floorCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      side: THREE.DoubleSide,
      emissive: selected ? new THREE.Color('#2f7cf6') : new THREE.Color('#000000'),
      emissiveIntensity: selected ? 0.25 : 0,
    });
    floorCache.set(key, m);
  }
  return m;
}

// Geometrias unitárias compartilhadas, escaladas por peça.
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
export const unitSphere = new THREE.SphereGeometry(0.5, 24, 16);
