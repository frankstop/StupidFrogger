import * as THREE from '../vendor/three.module.js';

function createPixelCanvas(width, height, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGameTextures() {
  // 1. Vibrant Neon Retro Grass (matches frame_01 & frame_28)
  const grass = createPixelCanvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2ef200';
    ctx.fillRect(0, 0, w, h);
    const shades = ['#25d900', '#3cff0a', '#1eb800', '#58ff2b'];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const frac = hash - Math.floor(hash);
        if (frac > 0.35) {
          ctx.fillStyle = shades[Math.floor(frac * shades.length) % shades.length];
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  }, 45, 12);

  // 2. Multi-lane Highway Road Texture (8 lanes with dashed white dividers & solid edges)
  const highway = createPixelCanvas(256, 512, (ctx, w, h) => {
    // Dark retro asphalt base
    ctx.fillStyle = '#2b2d30';
    ctx.fillRect(0, 0, w, h);

    // Subtle pixel asphalt grain
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const n = ((x * 37 + y * 17) % 19) / 19;
        if (n > 0.6) {
          ctx.fillStyle = n > 0.8 ? '#34373b' : '#232528';
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Solid white shoulder lines on top and bottom (Z boundaries of highway)
    ctx.fillStyle = '#f2f5f8';
    ctx.fillRect(0, 6, w, 10);
    ctx.fillRect(0, h - 16, w, 10);

    // 8 lanes -> 7 internal lane dividers
    const lanes = 8;
    const laneH = (h - 24) / lanes;
    for (let i = 1; i < lanes; i++) {
      const y = Math.round(12 + i * laneH);
      ctx.fillStyle = '#eef2f6';
      // Dashed lane markings along X
      for (let x = 16; x < w; x += 64) {
        ctx.fillRect(x, y - 3, 38, 6);
      }
    }
  }, 18, 1);

  // 3. Animated Bright Cyan/Blue Retro River Water (matches frame_21 & frame_27)
  const water = createPixelCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0098ff';
    ctx.fillRect(0, 0, w, h);

    // Darker blue depth patches
    ctx.fillStyle = '#0068dd';
    for (let i = 0; i < 40; i++) {
      const px = ((i * 53) % w);
      const py = ((i * 97) % h);
      ctx.fillRect(px, py, 18, 6);
    }

    // Bright cyan & white pixel wave highlights
    ctx.fillStyle = '#4cdbff';
    for (let i = 0; i < 55; i++) {
      const px = ((i * 71 + 13) % w);
      const py = ((i * 43 + 7) % h);
      ctx.fillRect(px, py, 14, 4);
    }
    ctx.fillStyle = '#bdf4ff';
    for (let i = 0; i < 28; i++) {
      const px = ((i * 89 + 29) % w);
      const py = ((i * 61 + 19) % h);
      ctx.fillRect(px, py, 8, 2);
    }
  }, 24, 10);

  // 4. Floating Log Bark Texture (crunchy brown bark streaks matching frame_21)
  const bark = createPixelCanvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(0, 0, w, h);
    const streaks = ['#472b16', '#6e472b', '#38200f', '#7d5233'];
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = streaks[(y / 4) % streaks.length];
      ctx.fillRect(0, y, w, 3);
      for (let x = 0; x < w; x += 8) {
        if ((x + y) % 16 === 0) {
          ctx.fillStyle = '#331c0c';
          ctx.fillRect(x, y, 6, 2);
        }
      }
    }
  }, 2, 1);

  // 5. Log End-Grain Rings
  const logEnd = createPixelCanvas(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#8c6239';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5c3a21';
    ctx.lineWidth = 2;
    for (let r = 4; r < 15; r += 4) {
      ctx.strokeRect(16 - r, 16 - r, r * 2, r * 2);
    }
  }, 1, 1);

  // 6.Frog Skin Texture (bright lime-yellow back with subtle spots like frame_01 & frame_23)
  const frogSkin = createPixelCanvas(64, 64, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#b8f52c');
    grad.addColorStop(0.5, '#92db1f');
    grad.addColorStop(1, '#68ad14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Lighter dorsal ridge & subtle mottled pixel spots
    ctx.fillStyle = '#d4ff4d';
    ctx.fillRect(w / 2 - 6, 8, 12, h - 16);
    ctx.fillStyle = '#7bc418';
    const spots = [
      [18, 16], [42, 16], [14, 30], [46, 30], [20, 44], [40, 44], [28, 24], [32, 38]
    ];
    for (const [sx, sy] of spots) {
      ctx.fillRect(sx, sy, 6, 6);
    }
  }, 1, 1);

  // 7. BOTW Paraglider Canopy Texture (White outer wings, dark forest-green center stripe, geometric motif)
  const gliderCanopy = createPixelCanvas(128, 64, (ctx, w, h) => {
    // Crisp white outer wings
    ctx.fillStyle = '#f2f5f7';
    ctx.fillRect(0, 0, w, h);

    // Shading along back edge
    ctx.fillStyle = '#d8e0e5';
    ctx.fillRect(0, h - 10, w, 10);

    // Bold forest-green center section (matches frame_23 & thumb.jpg!)
    ctx.fillStyle = '#144d14';
    ctx.fillRect(w * 0.24, 0, w * 0.52, h);

    // Subtle lighter green center crest stripe
    ctx.fillStyle = '#1f661f';
    ctx.fillRect(w * 0.46, 4, w * 0.08, h - 8);

    // Crisp black border around the canopy
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }, 1, 1);

  // 8. Muddy Stepped Riverbank Dirt Texture
  const dirtBank = createPixelCanvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#633919';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        if (((x * 19 + y * 31) % 7) < 3) {
          ctx.fillStyle = '#4d2b11';
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
  }, 30, 2);

  return {
    grass,
    highway,
    water,
    bark,
    logEnd,
    frogSkin,
    gliderCanopy,
    dirtBank
  };
}
