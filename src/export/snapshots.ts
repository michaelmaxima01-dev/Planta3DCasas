/** Gera imagens da casa em 3D (fora da tela) para o PDF. */
import * as THREE from 'three';
import { planBounds } from '../model/ops';
import type { Plan } from '../model/types';
import { buildHouseGroup } from '../view3d/buildScene';

export type ViewKind = 'front' | 'back' | 'top';

export function renderViews(plan: Plan, views: ViewKind[], width = 1600, height = 1000): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const b = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3f5f8');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a2', 1.0));
  scene.add(new THREE.AmbientLight('#ffffff', 0.15));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(cx + r * 0.8, r * 2.2, cz + r * 0.5);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -r * 1.4, right: r * 1.4, top: r * 1.4, bottom: -r * 1.4, near: 0.5, far: r * 6 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(r * 12, r * 12), new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.01, cz);
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(buildHouseGroup(plan, { lights: true }));

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 500);
  const out: string[] = [];
  for (const v of views) {
    if (v === 'front') camera.position.set(cx + r * 1.0, r * 1.4, cz + r * 1.5);
    else if (v === 'back') camera.position.set(cx - r * 1.05, r * 1.4, cz - r * 1.45);
    else camera.position.set(cx + 0.001, r * 2.1, cz + 0.001);
    camera.up.set(0, 1, 0);
    if (v === 'top') camera.up.set(0, 0, -1);
    camera.lookAt(cx, 0, cz);
    renderer.render(scene, camera);
    out.push(renderer.domElement.toDataURL('image/jpeg', 0.9));
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
