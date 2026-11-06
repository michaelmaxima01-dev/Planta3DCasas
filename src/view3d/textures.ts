/**
 * Texturas procedurais (canvas) dos acabamentos de parede/muro. 1 textura = 1 m × 1 m de parede
 * (as paredes já têm coordenadas de textura em metros), repetida.
 */
import * as THREE from 'three';
import type { WallFinish } from '../model/wallFinish';

const SIZE = 512; // px por metro
const cache = new Map<string, THREE.CanvasTexture | null>();

/** Gerador pseudoaleatório determinístico (mesma textura sempre). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, amount: number, seed: number, light = 245) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
  }
  void light;
  ctx.putImageData(img, 0, 0);
}

function draw(key: WallFinish, ctx: CanvasRenderingContext2D) {
  const r = rng(key.length * 7919);
  const fill = (c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, SIZE, SIZE);
  };
  switch (key) {
    case 'grafiato': {
      fill('#f0f0f0');
      for (let i = 0; i < 2600; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        const len = 20 + r() * 90;
        ctx.strokeStyle = `rgba(${r() < 0.5 ? '90,90,90' : '255,255,255'},${0.08 + r() * 0.14})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 6, y + len);
        ctx.stroke();
      }
      noise(ctx, 18, 3);
      break;
    }
    case 'textura': {
      fill('#eeeeee');
      for (let i = 0; i < 5000; i++) {
        const g = r() < 0.5 ? 120 : 255;
        ctx.fillStyle = `rgba(${g},${g},${g},${0.06 + r() * 0.12})`;
        ctx.beginPath();
        ctx.arc(r() * SIZE, r() * SIZE, 1 + r() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      noise(ctx, 24, 5);
      break;
    }
    case 'tijolinho': {
      fill('#d9d2c5'); // rejunte
      const bh = SIZE * 0.065; // 6,5 cm (5,5 + junta)
      const bw = SIZE * 0.24; // 24 cm (23 + junta)
      const j = SIZE * 0.01;
      for (let row = 0; row * bh < SIZE + bh; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < SIZE + bw; x += bw) {
          const t = r();
          const c = [Math.round(160 + t * 40), Math.round(78 + t * 30), Math.round(48 + t * 20)];
          ctx.fillStyle = `rgb(${c.join(',')})`;
          ctx.fillRect(x + off + j / 2, row * bh + j / 2, bw - j, bh - j);
        }
      }
      noise(ctx, 22, 7);
      break;
    }
    case 'madeira':
    case 'ripado': {
      const slat = key === 'ripado' ? SIZE * 0.07 : SIZE * 0.1;
      const gap = key === 'ripado' ? SIZE * 0.03 : SIZE * 0.004;
      fill(key === 'ripado' ? '#2e2620' : '#6e4a2c');
      for (let x = 0; x < SIZE; x += slat + gap) {
        const t = r();
        ctx.fillStyle = `rgb(${Math.round(150 + t * 40)},${Math.round(100 + t * 30)},${Math.round(62 + t * 20)})`;
        ctx.fillRect(x, 0, slat, SIZE);
        for (let k = 0; k < 14; k++) {
          ctx.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.12})`;
          ctx.lineWidth = 1 + r() * 1.5;
          const gx = x + r() * slat;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx + (r() - 0.5) * 8, SIZE * 0.3, gx + (r() - 0.5) * 8, SIZE * 0.7, gx, SIZE);
          ctx.stroke();
        }
      }
      noise(ctx, 14, 11);
      break;
    }
    case 'pedra': {
      fill('#5d564d');
      let y = 0;
      while (y < SIZE) {
        const h = SIZE * (0.025 + r() * 0.03);
        let x = -r() * 40;
        while (x < SIZE) {
          const w = SIZE * (0.06 + r() * 0.16);
          const t = r();
          const base = [[178, 165, 145], [150, 140, 125], [196, 186, 168], [128, 118, 104]][Math.floor(r() * 4)];
          ctx.fillStyle = `rgb(${base.map((v) => Math.round(v * (0.9 + t * 0.2))).join(',')})`;
          ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
          x += w;
        }
        y += h;
      }
      noise(ctx, 30, 13);
      break;
    }
    case 'ceramica':
    case 'porcelanato': {
      fill('#c9c6c0');
      const tw = key === 'ceramica' ? SIZE * 0.3 : SIZE * 0.6;
      const th = key === 'ceramica' ? SIZE * 0.6 : SIZE * 1.2;
      const j = key === 'ceramica' ? 3 : 2;
      for (let y = 0; y < SIZE; y += th) {
        for (let x = 0; x < SIZE; x += tw) {
          const t = r() * 6;
          ctx.fillStyle = `rgb(${250 - t},${250 - t},${248 - t})`;
          ctx.fillRect(x + j / 2, y + j / 2, tw - j, Math.min(th, SIZE) - j);
        }
      }
      noise(ctx, 6, 17);
      break;
    }
    case 'concreto': {
      fill('#a9abad');
      noise(ctx, 26, 19);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${r() < 0.5 ? '60,60,60' : '230,230,230'},${0.05 + r() * 0.1})`;
        ctx.beginPath();
        ctx.arc(r() * SIZE, r() * SIZE, 1 + r() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      // juntas das fôrmas e furos dos tirantes
      ctx.strokeStyle = 'rgba(70,70,70,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, SIZE - 2, SIZE * 0.5 - 2);
      ctx.strokeRect(1, SIZE * 0.5, SIZE - 2, SIZE * 0.5 - 2);
      ctx.fillStyle = 'rgba(55,55,55,0.55)';
      for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        ctx.beginPath();
        ctx.arc(x * SIZE, y * SIZE, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'marmore': {
      fill('#efece7');
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(${120 + r() * 40},${115 + r() * 40},${110 + r() * 40},${0.12 + r() * 0.25})`;
        ctx.lineWidth = 0.6 + r() * 2.4;
        ctx.beginPath();
        let x = r() * SIZE;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < SIZE) {
          x += (r() - 0.45) * 50;
          y += 20 + r() * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      noise(ctx, 8, 23);
      break;
    }
    default:
      fill('#f4f4f4');
      noise(ctx, 6, 1);
  }
}

/** Textura do acabamento (null para pintura lisa ou fora do navegador). */
export function finishTexture(key: WallFinish | undefined): THREE.CanvasTexture | null {
  if (!key || key === 'pintura' || typeof document === 'undefined') return null;
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) {
    cache.set(key, null);
    return null;
  }
  draw(key, ctx);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Miniatura (data URL) para os botões de escolha. */
export function finishPreview(key: WallFinish, color?: string): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d')!;
  const t = finishTexture(key);
  if (t) ctx.drawImage(t.image as HTMLCanvasElement, 0, 0, SIZE * 0.45, SIZE * 0.45, 0, 0, 48, 48);
  else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 48, 48);
  }
  if (color) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 48, 48);
  }
  return c.toDataURL();
}
