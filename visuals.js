// visuals.js — the art layer for Bass Lake.
//
// Everything that decides how the world LOOKS lives here; sketch.js owns
// the simulation and calls into `Art`. Three kinds of drawing:
//
//   1. bakeStatic()   — ground, beach, water depth and shadows, painted once
//                       per world into an offscreen canvas.
//   2. sprite painters — trees, lily pads and rocks are painted once at high
//                       resolution and stamped with drawImage each frame, so
//                       they stay crisp at any zoom and cost almost nothing.
//   3. per-frame painters — kayak, fish, water shimmer, shoreline foam.
//
// One sun for the whole scene: light comes from the upper-left, so every
// shadow falls toward the lower-right and every highlight faces up-left.
//
// Nothing here calls p5's random() while the world is being generated, so a
// seed still produces exactly the same lake it always did.

const Art = (() => {
  const TAU = Math.PI * 2;
  const SUN = { x: 0.5, y: 0.7 };          // direction shadows fall
  const LIGHT = { x: -0.58, y: -0.81 };    // direction light comes from
  const TREE_R = 180;                      // canopy radius inside a tree sprite, px
  const LILY_R = 90;
  const ROCK_R = 46;
  const ROCK_SHAPES = 6;

  // Painted sprites + ambient state. Rebuilt when the level changes.
  const S = { level: null, trees: [], treeIsPine: [], lilies: [], rocks: [], glow: null, cloud: null, clouds: null };

  // ---- small helpers -------------------------------------------------------

  // Seeded PRNG (mulberry32) so every sprite is identical on every client.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Stable 0..1 value from a world position — per-prop variety without
  // touching the world's random sequence.
  function hash2(x, y) {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v)));
  function rgb(c, a) {
    return a == null
      ? `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`
      : `rgba(${ch(c[0])},${ch(c[1])},${ch(c[2])},${a})`;
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    return c;
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  // Rounded-rectangle path (ctx.roundRect is missing on older Safari).
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Soft-edged elliptical blob. Radial gradients instead of canvas blur
  // filters, because Safari ignores ctx.filter and would show hard discs.
  function softBlob(ctx, x, y, rx, ry, rot, c, a, core = 0.5, coreA = 0.62) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgb(c, a));
    g.addColorStop(core, rgb(c, a * coreA));
    g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // The lake outline as a smooth closed curve (through segment midpoints),
  // so the shore never shows the polygon's straight edges.
  function traceLake(ctx, begin = true) {
    const P = lake.points, n = P.length;
    if (begin) ctx.beginPath();
    ctx.moveTo((P[n - 1].x + P[0].x) / 2, (P[n - 1].y + P[0].y) / 2);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.closePath();
  }

  // Unit normals pointing into the water at each shoreline vertex.
  function shoreNormals() {
    if (lake._normals) return lake._normals;
    const P = lake.points, n = P.length, N = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      const tx = b.x - a.x, ty = b.y - a.y, m = Math.hypot(tx, ty) || 1;
      N[i] = { x: ty / m, y: -tx / m };
    }
    // Make sure they point inward, whichever way the loop was wound.
    let votes = 0;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 24))) {
      votes += lake.contains(P[i].x + N[i].x * 10, P[i].y + N[i].y * 10) ? 1 : -1;
    }
    if (votes < 0) for (const v of N) { v.x = -v.x; v.y = -v.y; }
    lake._normals = N;
    return N;
  }

  const isAlpine = () => lvl().treeStyle === 'pine';

  // ==========================================================================
  // Sprite painters
  // ==========================================================================

  // Broadleaf canopy seen from above: a lobed dark silhouette, leafy clumps
  // that each carry their own little shadow, lighter clumps and flecks on
  // the sunny side, then one shading pass so the whole crown reads round.
  function paintDeciduous(seed, base) {
    const R = TREE_R, size = R * 2 + 44;
    const c = makeCanvas(size, size), ctx = c.getContext('2d'), r = rng(seed);
    ctx.translate(size / 2, size / 2);
    const dark = shade(base, 0.6);
    const light = mix(shade(base, 1.32), [232, 226, 120], 0.2);
    const hi = mix(shade(base, 1.6), [246, 240, 150], 0.32);

    ctx.fillStyle = rgb(dark);
    circle(ctx, 0, 0, R * 0.78);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + r() * 0.25;
      const d = R * (0.72 + r() * 0.12);
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.14 + r() * 0.1));
    }
    for (let i = 0; i < 110; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.84;
      const x = Math.cos(a) * d - R * 0.03, y = Math.sin(a) * d - R * 0.04;
      const cr = R * (0.065 + r() * 0.075);
      const tone = shade(base, 0.8 + r() * 0.32);
      ctx.fillStyle = rgb(shade(tone, 0.7));
      circle(ctx, x + cr * 0.12, y + cr * 0.16, cr);
      ctx.fillStyle = rgb(tone);
      circle(ctx, x - cr * 0.1, y - cr * 0.12, cr * 0.86);
    }
    for (let i = 0; i < 60; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.58;
      ctx.fillStyle = rgb(mix(base, light, 0.45 + r() * 0.55), 0.9);
      circle(ctx, Math.cos(a) * d - R * 0.17, Math.sin(a) * d - R * 0.22, R * (0.04 + r() * 0.055));
    }
    for (let i = 0; i < 34; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.5;
      ctx.fillStyle = rgb(hi, 0.3 + r() * 0.35);
      circle(ctx, Math.cos(a) * d - R * 0.2, Math.sin(a) * d - R * 0.27, R * (0.018 + r() * 0.03));
    }
    // Shading and a few dark gaps, kept inside the painted canopy.
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.38, R * 0.25, 0, 0, R * 1.2);
    g.addColorStop(0, 'rgba(0,12,8,0)');
    g.addColorStop(0.55, 'rgba(0,12,8,0.12)');
    g.addColorStop(1, 'rgba(0,12,8,0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.fillStyle = 'rgba(0,16,8,0.3)';
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.7;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.02 + r() * 0.03));
    }
    return c;
  }

  function star(ctx, cx, cy, ro, ri, n, rot, jit) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU;
      const rad = (i % 2 === 0 ? ro : ri) * jit[i];
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Conifer from above: stacked tiers of boughs, each smaller and lighter
  // than the one below and each casting a shadow on the tier under it.
  // `snow` dusts the boughs that face the sun.
  function paintPine(seed, base, snow) {
    const R = TREE_R, size = R * 2 + 44;
    const c = makeCanvas(size, size), ctx = c.getContext('2d'), r = rng(seed);
    ctx.translate(size / 2, size / 2);
    const dark = shade(base, 0.5);
    const light = mix(shade(base, 1.5), [165, 205, 145], 0.18);
    const lightAng = Math.atan2(LIGHT.y, LIGHT.x);
    const tiers = 5;
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1);
      const rr = R * (1 - t * 0.74);
      const n = 13 - k * 2;
      const rot = r() * TAU;
      const jit = Array.from({ length: n * 2 }, () => 0.88 + r() * 0.2);
      const col = mix(dark, light, 0.08 + t * 0.85);
      if (k > 0) {
        ctx.fillStyle = 'rgba(0,10,6,0.32)';
        star(ctx, R * 0.035, R * 0.05, rr * 1.03, rr * 0.6, n, rot, jit); ctx.fill();
      }
      ctx.fillStyle = rgb(col);
      star(ctx, 0, 0, rr, rr * 0.58, n, rot, jit); ctx.fill();
      ctx.fillStyle = rgb(mix(col, light, 0.6), 0.5);
      star(ctx, -rr * 0.07, -rr * 0.09, rr * 0.8, rr * 0.46, n, rot, jit); ctx.fill();
      if (snow) {
        for (let i = 0; i < n; i++) {
          const a = rot + (i / n) * TAU;
          const facing = Math.cos(a - lightAng);
          if (facing < -0.15) continue;
          ctx.save();
          ctx.translate(Math.cos(a) * rr * 0.7, Math.sin(a) * rr * 0.7);
          ctx.rotate(a);
          ctx.fillStyle = `rgba(244,248,252,${0.5 + 0.42 * Math.max(0, facing)})`;
          ctx.beginPath(); ctx.ellipse(0, 0, rr * 0.2, rr * 0.085, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.fillStyle = rgb(snow ? [242, 247, 252] : light);
    circle(ctx, -R * 0.01, -R * 0.015, R * 0.05);
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.38, R * 0.3, 0, 0, R * 1.15);
    g.addColorStop(0, 'rgba(0,10,12,0)');
    g.addColorStop(1, 'rgba(0,10,12,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    return c;
  }

  // Lily pad: a real wedge cut out of the disc (the water shows through),
  // radiating veins, a darker rim, a couple of nibbled bites. Kinds 3 and 4
  // carry a white or pink water-lily bloom.
  function paintLily(seed, kind) {
    const R = LILY_R, size = R * 2 + 16;
    const c = makeCanvas(size, size), ctx = c.getContext('2d'), r = rng(seed);
    ctx.translate(size / 2, size / 2);
    const palettes = [
      { in: [100, 160, 80], out: [54, 114, 62], rim: [34, 84, 46] },
      { in: [80, 142, 76],  out: [40, 98, 56],  rim: [26, 72, 42] },
      { in: [132, 144, 72], out: [88, 104, 52], rim: [70, 78, 38] },   // young bronze pad
    ];
    const p = palettes[kind === 3 ? 0 : kind === 4 ? 1 : kind];
    const notch = 0.2 + r() * 0.12;
    const pad = () => {
      ctx.beginPath();
      ctx.arc(0, 0, R, notch, TAU - notch);
      ctx.lineTo(R * 0.1, 0);
      ctx.closePath();
    };
    const g = ctx.createRadialGradient(-R * 0.1, -R * 0.1, R * 0.05, 0, 0, R);
    g.addColorStop(0, rgb(p.in));
    g.addColorStop(0.7, rgb(mix(p.in, p.out, 0.7)));
    g.addColorStop(1, rgb(p.out));
    ctx.fillStyle = g; pad(); ctx.fill();

    ctx.save();
    pad(); ctx.clip();
    ctx.strokeStyle = rgb(mix(p.in, [214, 238, 164], 0.5), 0.5);
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const veins = 13;
    for (let i = 0; i < veins; i++) {
      const a = notch + 0.18 + (i / (veins - 1)) * (TAU - 2 * notch - 0.36);
      const ex = Math.cos(a) * R * 0.95, ey = Math.sin(a) * R * 0.95;
      ctx.beginPath(); ctx.moveTo(R * 0.1, 0); ctx.lineTo(ex, ey); ctx.stroke();
      const fx = Math.cos(a) * R * 0.6, fy = Math.sin(a) * R * 0.6;
      for (const d of [-0.13, 0.13]) {
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.lineTo(Math.cos(a + d) * R * 0.93, Math.sin(a + d) * R * 0.93);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.85;
      ctx.fillStyle = 'rgba(96,84,40,0.3)';
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 4);
    }
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgb(p.rim, 0.9); ctx.lineWidth = 3;
    pad(); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,232,160,0.22)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, R - 4.5, notch + 0.1, TAU - notch - 0.1); ctx.stroke();

    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2; i++) {
      const a = notch + 0.6 + r() * (TAU - 2 * notch - 1.2);
      circle(ctx, Math.cos(a) * (R + 1), Math.sin(a) * (R + 1), 5 + r() * 5);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < 2; i++) {       // beads of water
      const a = r() * TAU, d = R * (0.3 + r() * 0.45);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      ctx.fillStyle = 'rgba(225,245,250,0.4)'; circle(ctx, x, y, 3.2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; circle(ctx, x - 1, y - 1, 1.2);
    }

    if (kind >= 3) {
      const petal = kind === 3 ? [248, 246, 240] : [246, 196, 212];
      const under = kind === 3 ? [206, 212, 208] : [214, 144, 170];
      const fx = -R * 0.16, fy = R * 0.1;
      ctx.fillStyle = 'rgba(0,24,12,0.28)'; circle(ctx, fx + 5, fy + 7, R * 0.44);
      const ring = (count, len, w, rot, fillC, edgeC) => {
        for (let i = 0; i < count; i++) {
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(rot + (i / count) * TAU);
          ctx.fillStyle = rgb(edgeC);
          ctx.beginPath(); ctx.ellipse(len * 0.56, 0, len * 0.52, w * 0.56, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = rgb(fillC);
          ctx.beginPath(); ctx.ellipse(len * 0.52, -w * 0.05, len * 0.46, w * 0.42, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      };
      ring(10, R * 0.5, R * 0.19, r() * TAU, petal, under);
      ring(7, R * 0.34, R * 0.16, r() * TAU, mix(petal, [255, 255, 255], 0.5), mix(under, petal, 0.5));
      ctx.fillStyle = 'rgb(236,190,60)'; circle(ctx, fx, fy, R * 0.105);
      ctx.fillStyle = 'rgb(214,140,40)';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        circle(ctx, fx + Math.cos(a) * R * 0.06, fy + Math.sin(a) * R * 0.06, 1.6);
      }
    }
    return c;
  }

  // Boulder: an irregular rounded outline lit from the upper-left, with a
  // paler top plane, ridge lines, grit, and either moss or a cap of snow.
  function paintRock(seed, tone, moss, snow) {
    const R = ROCK_R, size = R * 2 + 14;
    const c = makeCanvas(size, size), ctx = c.getContext('2d'), r = rng(seed);
    ctx.translate(size / 2, size / 2);
    const n = 7 + Math.floor(r() * 3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r() - 0.5) * 0.5;
      const rad = R * (0.74 + r() * 0.24);
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad * 0.8, a]);
    }
    const poly = (k, ox, oy) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = p[0] * k + ox, y = p[1] * k + oy;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    const lg = ctx.createLinearGradient(-R * 0.6, -R * 0.7, R * 0.6, R * 0.7);
    lg.addColorStop(0, rgb(shade(tone, 1.3)));
    lg.addColorStop(0.5, rgb(tone));
    lg.addColorStop(1, rgb(shade(tone, 0.58)));
    ctx.fillStyle = lg; ctx.strokeStyle = lg; ctx.lineWidth = 5;
    poly(0.94, 0, 0); ctx.fill(); ctx.stroke();

    const top = rgb(shade(tone, 1.24), 0.9);
    ctx.fillStyle = top; ctx.strokeStyle = top; ctx.lineWidth = 4;
    poly(0.56, -R * 0.1, -R * 0.12); ctx.fill(); ctx.stroke();

    ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < n; i += 2) {
      const p = pts[i];
      const lit = Math.cos(p[2] - Math.atan2(LIGHT.y, LIGHT.x)) > 0;
      ctx.strokeStyle = lit ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(p[0] * 0.56 - R * 0.1, p[1] * 0.56 - R * 0.12);
      ctx.lineTo(p[0] * 0.92, p[1] * 0.92);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.8;
      ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.14)';
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.8, 1 + r() * 1.8);
    }
    if (moss) {
      softBlob(ctx, -R * 0.3, -R * 0.25, R * 0.5, R * 0.36, r() * 3, [78, 118, 52], 0.75);
      softBlob(ctx, R * 0.1, -R * 0.38, R * 0.34, R * 0.24, r() * 3, [96, 130, 58], 0.6);
    }
    if (snow) {
      ctx.fillStyle = 'rgba(246,249,253,0.94)'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 6;
      poly(0.5, -R * 0.16, -R * 0.19); ctx.fill(); ctx.stroke();
      softBlob(ctx, R * 0.12, R * 0.02, R * 0.4, R * 0.26, 0.4, [200, 214, 232], 0.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(14,18,16,0.32)'; ctx.lineWidth = 1.4;
    poly(0.97, 0, 0); ctx.stroke();
    return c;
  }

  // Soft radial glow, used for caustic light and (in a dark tint) cloud shade.
  function paintGlow(c) {
    const size = 96, cv = makeCanvas(size, size), ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, rgb(c, 1));
    g.addColorStop(0.4, rgb(c, 0.5));
    g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return cv;
  }

  // Each fallen log gets its own sprite, painted the first time it is drawn.
  // Because we know which way this log lies, the lit side is the side that
  // actually faces the sun.
  function paintLog(l) {
    const K = 2;                                   // sprite px per world unit
    const L = l.len, T = l.thick, pad = T * 1.7;
    const c = makeCanvas((L + pad * 2) * K, (T + pad * 2) * K), ctx = c.getContext('2d');
    const r = rng(Math.floor(hash2(l.x, l.y) * 1e9));
    ctx.scale(K, K);
    ctx.translate(L / 2 + pad, T / 2 + pad);
    const lly = -LIGHT.x * Math.sin(l.a) + LIGHT.y * Math.cos(l.a);   // light across the trunk
    const side = lly < 0 ? -1 : 1, k = Math.abs(lly);
    const bark = [98, 73, 46];
    const litC = mix(bark, [150, 118, 78], 0.35 + 0.65 * k);
    const darkC = mix(bark, [44, 31, 20], 0.45 + 0.5 * k);
    const trunkGrad = (half) => {
      const g = ctx.createLinearGradient(0, side * half, 0, -side * half);
      g.addColorStop(0, rgb(litC)); g.addColorStop(0.42, rgb(bark)); g.addColorStop(1, rgb(darkC));
      return g;
    };
    const trunk = () => {
      const rad = T * 0.45;
      ctx.beginPath();
      ctx.moveTo(-L / 2 + rad, -T / 2);
      ctx.lineTo(L / 2 - rad, -T / 2);
      ctx.quadraticCurveTo(L / 2, -T / 2, L / 2, 0);
      ctx.quadraticCurveTo(L / 2, T / 2, L / 2 - rad, T / 2);
      ctx.lineTo(-L / 2 + rad, T / 2);
      ctx.quadraticCurveTo(-L / 2, T / 2, -L / 2, 0);
      ctx.quadraticCurveTo(-L / 2, -T / 2, -L / 2 + rad, -T / 2);
      ctx.closePath();
    };

    const stubs = 1 + Math.floor(r() * 3);         // broken branch stubs, under the trunk
    for (let i = 0; i < stubs; i++) {
      const bx = (r() - 0.5) * L * 0.7, sd = r() < 0.5 ? -1 : 1;
      const len = T * (0.7 + r() * 0.9), w = T * (0.22 + r() * 0.1);
      ctx.save();
      ctx.translate(bx, sd * T * 0.3);
      ctx.rotate(sd * (Math.PI / 2 - 0.55 + r() * 0.7));
      ctx.fillStyle = rgb(mix(bark, darkC, 0.4));
      ctx.beginPath();
      ctx.moveTo(0, -w / 2); ctx.lineTo(len, -w * 0.3); ctx.lineTo(len + w * 0.3, 0);
      ctx.lineTo(len, w * 0.3); ctx.lineTo(0, w / 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgb(litC, 0.5); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0, -w * 0.25); ctx.lineTo(len, -w * 0.15); ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = trunkGrad(T / 2); trunk(); ctx.fill();
    ctx.save();
    trunk(); ctx.clip();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {                  // bark grain runs the length of the trunk
      let y = -T / 2 + T * (i + 0.5) / 5 + (r() - 0.5) * 1.5;
      ctx.strokeStyle = `rgba(30,20,12,${0.3 + r() * 0.25})`; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-L / 2, y);
      for (let x = -L / 2 + 9; x <= L / 2; x += 9) { y += (r() - 0.5) * 1.6; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * L * 0.9, y0 = (r() - 0.5) * T * 0.6;
      ctx.strokeStyle = 'rgba(24,15,9,0.38)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (r() - 0.5) * 2, y0 + T * (0.15 + r() * 0.25)); ctx.stroke();
    }
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
      const x = (r() - 0.5) * L * 0.75, y = (r() - 0.5) * T * 0.35;
      ctx.fillStyle = 'rgba(38,26,16,0.82)';
      ctx.beginPath(); ctx.ellipse(x, y, T * 0.2, T * 0.14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,120,80,0.45)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(x, y, T * 0.28, T * 0.2, 0, 0, TAU); ctx.stroke();
    }
    if (isAlpine()) {
      for (let i = 0; i < 4; i++) {
        softBlob(ctx, (r() - 0.5) * L * 0.85, side * T * 0.2, T * (1.2 + r()), T * 0.42, 0, [246, 249, 253], 0.9, 0.6, 0.85);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        softBlob(ctx, (r() - 0.5) * L * 0.8, side * T * 0.18, T * (0.9 + r() * 0.8), T * 0.4, 0, [80, 122, 54], 0.7);
      }
    }
    ctx.restore();

    for (const ex of [-L / 2 + T * 0.14, L / 2 - T * 0.14]) {      // sawn ends with growth rings
      ctx.fillStyle = 'rgb(170,136,92)';
      ctx.beginPath(); ctx.ellipse(ex, 0, T * 0.2, T * 0.45, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(108,78,46,0.7)'; ctx.lineWidth = 0.6;
      for (const s of [0.66, 0.34]) {
        ctx.beginPath(); ctx.ellipse(ex, 0, T * 0.2 * s, T * 0.45 * s, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(20,12,6,0.32)'; ctx.lineWidth = 0.8;
    trunk(); ctx.stroke();
    return c;
  }

  function buildSprites() {
    const alpine = isAlpine(), pal = lvl().palette;
    S.trees = []; S.treeIsPine = [];
    if (alpine) {
      const bases = [[34, 74, 54], [28, 64, 50], [42, 84, 58], [30, 70, 62], [38, 78, 48], [26, 60, 46]];
      bases.forEach((b, i) => { S.trees.push(paintPine(101 + i * 17, b, true)); S.treeIsPine.push(true); });
    } else {
      const bases = [[58, 104, 52], [46, 90, 48], [74, 116, 50], [62, 104, 66],
                     [88, 118, 46], [42, 82, 54], [66, 110, 44], [52, 96, 58]];
      bases.forEach((b, i) => { S.trees.push(paintDeciduous(11 + i * 23, b)); S.treeIsPine.push(false); });
      // A few conifers mixed through the hardwoods.
      [[36, 76, 48], [44, 84, 52]].forEach((b, i) => { S.trees.push(paintPine(71 + i * 19, b, false)); S.treeIsPine.push(true); });
    }
    S.lilies = [0, 1, 2, 3, 4].map(k => paintLily(40 + k * 7, k));
    const tones = alpine
      ? [[96, 102, 112], [124, 128, 134], [152, 154, 158]]
      : [[76, 80, 78], [94, 93, 86], [114, 110, 100]];
    S.rocks = [];
    for (let shape = 0; shape < ROCK_SHAPES; shape++) {
      for (let tone = 0; tone < 3; tone++) {
        const pick = hash2(shape * 3.1 + 1, tone * 5.7 + 2);
        S.rocks.push(paintRock(300 + shape * 31 + tone, tones[tone], !alpine && pick < 0.5, alpine && pick < 0.6));
      }
    }
    S.glow = paintGlow(pal.caustic || [140, 195, 175]);
    S.cloud = paintGlow([0, 14, 22]);
  }

  // Derive each prop's look from where it sits. Run once per world, after
  // the simulation has placed everything.
  function prepareWorld() {
    if (S.level !== currentLevel) { buildSprites(); S.level = currentLevel; }
    const mixed = S.trees.length > 8;              // hardwoods + a couple of pines
    for (const t of trees) {
      const fromShore = -lake.insideAmount(t.x, t.y);
      t.hidden = fromShore < 0;                    // landed in the water: don't draw
      const h = hash2(t.x, t.y);
      t.variant = mixed
        ? (h < 0.86 ? Math.floor((h / 0.86) * 8) : 8 + Math.floor(((h - 0.86) / 0.14) * 2))
        : Math.floor(h * S.trees.length);
      t.variant = Math.min(S.trees.length - 1, t.variant);
      const pine = S.treeIsPine[t.variant];
      const want = t.r * (t.pine ? 1.0 : pine ? 0.74 : 0.9);
      // Let a canopy lean out over the water, but only a little, so it never
      // hides the kayak or a fly.
      t.cr = Math.max(16, Math.min(want, fromShore + 14));
    }
    for (const r of rocks) {
      const shape = Math.floor(hash2(r.x, r.y) * ROCK_SHAPES);
      const tone = Math.max(0, Math.min(2, Math.floor((r.shade - 40) / 17)));
      r.variant = shape * 3 + tone;
      r.inWater = lake.contains(r.x, r.y, 2);
    }
    // Each lily "pad" the simulation placed becomes a small raft of pads.
    // Real pads are about a foot across; these are 9-16 units (2-3 ft), in
    // scale with the fish and nothing like the old boat-sized discs.
    //
    // A pad floats on open water, so every one is checked against the bank,
    // logs, rocks and snags. One that would overlap is tried in a few other
    // spots in the raft and dropped if none is clear.
    const padFits = (x, y, r) => {
      if (lake.insideAmount(x, y) < r + 3) return false;                 // on or touching the bank
      for (const l of logs) {
        const dx = x - l.x, dy = y - l.y;
        if (Math.abs(dx) > l.len && Math.abs(dy) > l.len) continue;
        const c = Math.cos(l.a), sn = Math.sin(l.a);
        const along = dx * c + dy * sn, across = -dx * sn + dy * c;
        const over = Math.max(0, Math.abs(along) - l.len / 2);
        // The margin covers the trunk plus its broken branch stubs.
        if (Math.hypot(over, across) < l.thick * 1.3 + r + 2) return false;
      }
      for (const k of rocks) if (Math.hypot(x - k.x, y - k.y) < k.r * 1.1 + r + 1.5) return false;
      for (const k of snags) if (Math.hypot(x - k.x, y - k.y) < k.r * 1.8 + r + 1.5) return false;
      return true;
    };
    for (const lp of lilypads) {
      const h = hash2(lp.x, lp.y);
      const bloom = h > 0.86 ? (h > 0.93 ? 4 : 3) : 0;
      const count = 3 + Math.floor(hash2(lp.y, lp.x) * 4);
      lp.pads = [];
      for (let k = 0; k < count; k++) {
        const hk = hash2(lp.x + k * 17.3, lp.y - k * 9.1), hk2 = hash2(lp.y + k * 5.7, lp.x + k * 3.3);
        const kind = (k === 0 && bloom) ? bloom : (hk2 < 0.5 ? 0 : hk2 < 0.84 ? 1 : 2);
        const r = kind >= 3 ? 7.5 : 4.5 + hk * 3.5;
        for (let attempt = 0; attempt < 6; attempt++) {
          const ang = lp.a + k * 2.4 + attempt * 1.1;
          const d = lp.r * 0.78 * Math.sqrt((k + 0.4) / count) * (1 - attempt * 0.12);
          const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d;
          if (!padFits(lp.x + dx, lp.y + dy, r)) continue;
          lp.pads.push({ dx, dy, r, a: ang * 1.7 + hk * 6, kind, ph: hk * 20 });
          break;
        }
      }
    }
    S.clouds = [];
    for (let i = 0; i < 7; i++) {
      S.clouds.push({
        x: Math.random() * WORLD_W, y: Math.random() * WORLD_H,
        r: 520 + Math.random() * 620, ar: 0.55 + Math.random() * 0.3,
      });
    }
  }

  // ==========================================================================
  // The baked world
  // ==========================================================================

  // Raised ground on the alpine map: nested contour bands shifted slightly
  // toward the sun as they climb, each casting a soft edge on the band below.
  function paintTopo(ctx, p) {
    softBlob(ctx, p.x + p.r * 0.2, p.y + p.r * 0.28, p.r * 1.15, p.r * 1.05, 0, [20, 30, 45], 0.36, 0.62, 0.8);
    const rings = Math.max(4, Math.floor(p.r / 14)), STEPS = 40;
    const ring = (i, ox, oy) => {
      const t = (i + 0.5) / rings, rr = p.r * (1 - t * 0.93);
      const lift = t * p.r * 0.07;
      ctx.beginPath();
      for (let s = 0; s <= STEPS; s++) {
        const a = (s / STEPS) * TAU;
        const nz = noise(p.wobbleSeed + i * 0.7 + Math.cos(a) * 1.4, Math.sin(a) * 1.4);
        const rad = rr * (0.86 + nz * 0.3);
        const x = p.x + LIGHT.x * lift + ox + Math.cos(a) * rad;
        const y = p.y + LIGHT.y * lift + oy + Math.sin(a) * rad;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    for (let i = 0; i < rings; i++) {
      const t = (i + 0.5) / rings;
      let c, a;
      if (t < 0.30)      { const k = t / 0.30;          c = [95 + k * 18, 120 + k * 8, 75 + k * 18];    a = 0.56; }
      else if (t < 0.65) { const k = (t - 0.30) / 0.35; c = [130 + k * 35, 125 + k * 28, 100 + k * 28]; a = 0.66; }
      else if (t < 0.88) { const k = (t - 0.65) / 0.23; c = [175 + k * 50, 178 + k * 50, 175 + k * 55]; a = 0.74; }
      else               { c = [242, 246, 251]; a = 0.9; }
      ctx.fillStyle = 'rgba(20,28,40,0.16)'; ring(i, 2.5, 3.5); ctx.fill();
      ctx.fillStyle = rgb(c, a); ring(i, 0, 0); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(55,60,50,0.4)'; ctx.lineWidth = 0.9;
    for (let i = 0; i < rings; i += 2) { ring(i, 0, 0); ctx.stroke(); }
  }

  function bakeStatic() {
    const sw = Math.floor(WORLD_W * STATIC_SCALE), sh = Math.floor(WORLD_H * STATIC_SCALE);
    const cv = makeCanvas(sw, sh), ctx = cv.getContext('2d');
    ctx.setTransform(STATIC_SCALE, 0, 0, STATIC_SCALE, 0, 0);
    const pal = lvl().palette, alpine = isAlpine();
    const onLand = (x, y, m) => lake.insideAmount(x, y) < -m;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ---- ground ----
    ctx.fillStyle = rgb(pal.forest);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 150; i++) {                 // broad drifts of light and shade
      const x = random(WORLD_W), y = random(WORLD_H), rr = random(220, 620);
      const dim = random() < 0.55;
      softBlob(ctx, x, y, rr, rr * random(0.6, 1), random(TAU),
        dim ? shade(pal.forest, 0.74) : mix(pal.forest, alpine ? [255, 255, 255] : [150, 162, 72], 0.5),
        dim ? 0.4 : 0.3);
    }
    for (const b of terrainBlobs) {
      softBlob(ctx, b.x, b.y, b.r * 1.3, b.r * 1.3 * b.ar, b.rot, b.c, Math.min(1, (b.a / 255) * 1.15));
    }
    for (const f of topoFeatures) paintTopo(ctx, f);
    for (const s of lake.dirtSpecks) { ctx.fillStyle = rgb(s.c, 0.7); circle(ctx, s.x, s.y, s.r / 2); }

    if (alpine) {
      for (let i = 0; i < 260; i++) {               // wind-packed snow drifts
        const p = randomShorePoint(random(20, 520)), rx = random(40, 120);
        softBlob(ctx, p.x, p.y, rx, rx * random(0.22, 0.4), lake.windAngle, [250, 252, 255], 0.5);
      }
      for (let i = 0; i < 900; i++) {               // scree
        const p = randomShorePoint(random(6, 500));
        if (!onLand(p.x, p.y, 4)) continue;
        for (let k = 0, n = 3 + Math.floor(random(6)); k < n; k++) {
          const x = p.x + random(-12, 12), y = p.y + random(-9, 9), rr = random(1.4, 4);
          const tone = random(95, 165);
          ctx.fillStyle = 'rgba(20,28,40,0.3)'; circle(ctx, x + rr * 0.4, y + rr * 0.5, rr);
          ctx.fillStyle = rgb([tone, tone + 3, tone + 9]); circle(ctx, x, y, rr);
        }
      }
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3200; i++) {              // dry bunchgrass poking through
        const p = randomShorePoint(random(6, 420));
        if (!onLand(p.x, p.y, 5)) continue;
        ctx.strokeStyle = rgb([random(140, 175), random(128, 150), random(84, 104)], 0.75);
        const h = random(4, 8);
        ctx.beginPath();
        ctx.moveTo(p.x - 2, p.y); ctx.lineTo(p.x - 3.5, p.y - h * 0.8);
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.5, p.y - h);
        ctx.moveTo(p.x + 2, p.y); ctx.lineTo(p.x + 4, p.y - h * 0.7);
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 14000; i++) {             // grass tufts
        const p = randomShorePoint(random(8, 460));
        if (!onLand(p.x, p.y, 6)) continue;
        ctx.strokeStyle = random() < 0.45
          ? rgb(mix(pal.forest, [176, 190, 84], 0.5), 0.75)
          : rgb(shade(pal.forest, 0.6), 0.75);
        const h = random(5, 10);
        ctx.beginPath();
        ctx.moveTo(p.x - 2.5, p.y); ctx.lineTo(p.x - 4, p.y - h * 0.8);
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h);
        ctx.moveTo(p.x + 2.5, p.y); ctx.lineTo(p.x + 4.5, p.y - h * 0.75);
        ctx.stroke();
      }
      for (let i = 0; i < 520; i++) {               // low shrubs
        const p = randomShorePoint(random(16, 400));
        if (!onLand(p.x, p.y, 12)) continue;
        const base = [random(38, 60), random(78, 104), random(40, 58)], sz = random(7, 13);
        softBlob(ctx, p.x + sz * 0.5, p.y + sz * 0.7, sz * 1.5, sz * 1.2, 0, [0, 14, 8], 0.4, 0.6, 0.8);
        ctx.fillStyle = rgb(shade(base, 0.62)); circle(ctx, p.x, p.y, sz);
        for (let k = 0; k < 5; k++) {
          const a = random(TAU), d = random(sz * 0.7);
          ctx.fillStyle = rgb(shade(base, random(0.85, 1.2)));
          circle(ctx, p.x + Math.cos(a) * d - sz * 0.12, p.y + Math.sin(a) * d - sz * 0.16, sz * random(0.35, 0.55));
        }
        ctx.fillStyle = rgb(mix(base, [210, 220, 120], 0.45), 0.85);
        circle(ctx, p.x - sz * 0.3, p.y - sz * 0.36, sz * 0.28);
      }
      const blooms = [[246, 246, 236], [240, 212, 84], [176, 136, 214], [236, 150, 170]];
      for (let i = 0; i < 460; i++) {               // wildflowers
        const p = randomShorePoint(random(10, 380));
        if (!onLand(p.x, p.y, 8)) continue;
        const col = blooms[Math.floor(random(blooms.length))];
        for (let k = 0, n = 3 + Math.floor(random(5)); k < n; k++) {
          ctx.fillStyle = rgb(col, 0.92);
          circle(ctx, p.x + random(-9, 9), p.y + random(-7, 7), random(0.9, 1.6));
        }
      }
    }

    // ---- beach: drawn only on the land side of the shoreline ----
    const bw = alpine ? 1 : 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    traceLake(ctx, false);
    ctx.clip('evenodd');
    for (let i = 0; i < 12; i++) {                  // many thin steps, so no banding
      const k = i / 11;
      ctx.strokeStyle = rgb(pal.sand, 0.05 + k * 0.1); ctx.lineWidth = (124 - k * 112) * bw;
      traceLake(ctx); ctx.stroke();
    }
    for (const s of lake.sandSpecks) { ctx.fillStyle = rgb(pal.sand, 0.55); circle(ctx, s.x, s.y, s.r / 2); }
    for (let i = 0; i < 2200; i++) {                // pebbles along the waterline
      const p = randomShorePoint(random(1, 15));
      const tone = random(70, 150);
      ctx.fillStyle = rgb(alpine ? [tone, tone + 4, tone + 12] : [tone, tone * 0.92, tone * 0.78], 0.75);
      circle(ctx, p.x, p.y, random(0.9, 2.4));
    }
    ctx.strokeStyle = rgb(mix(pal.sand, pal.shoreline, 0.6), 0.5); ctx.lineWidth = 10;   // damp edge
    traceLake(ctx); ctx.stroke();
    if (!alpine) {
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3400; i++) {              // lush fringe along the bank
        const p = randomShorePoint(random(4, 26));
        ctx.strokeStyle = rgb([random(54, 92), random(104, 140), random(48, 70)], 0.8);
        const h = random(4, 8), lean = random(-0.9, 0.9);
        ctx.beginPath();
        for (const fan of [-0.7, 0, 0.7]) {
          const a = -Math.PI / 2 + lean + fan;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(a) * h, p.y + Math.sin(a) * h);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // ---- water ----
    traceLake(ctx);
    ctx.fillStyle = rgb(pal.waterBase); ctx.fill();
    ctx.save();
    traceLake(ctx); ctx.clip();
    for (const p of lake.surfacePatches) {
      softBlob(ctx, p.x, p.y, p.r * 0.7, p.r * 0.7 * p.aspect, 0, p.c, Math.min(1, (p.a / 255) * 1.25));
    }
    // Depth: the basins and the channels between them fall away to dark.
    const deep = pal.deep || shade(mix(pal.waterBase, pal.patchAlgae, 0.7), 0.7);
    for (const b of lake.basins) softBlob(ctx, b.x, b.y, b.r * 1.15, b.r * 1.15, 0, deep, 0.78, 0.45, 0.7);
    for (const c of lake.channels) {
      for (const p of c.path) softBlob(ctx, p.x, p.y, c.w * 0.95, c.w * 0.95, 0, deep, 0.3);
    }
    // Shallows: stacked strokes along the shore make a smooth ramp from the
    // sandy margin down into deep water.
    const shallow = pal.shallow || mix(pal.patchTeal, pal.sand, 0.38);
    for (let i = 0; i < 16; i++) {
      const k = i / 15;
      ctx.strokeStyle = rgb(shallow, 0.03 + k * 0.04); ctx.lineWidth = 240 - 222 * Math.pow(k, 0.8);
      traceLake(ctx); ctx.stroke();
    }
    ctx.strokeStyle = rgb(mix(shallow, pal.sand, 0.5), 0.28); ctx.lineWidth = 12;
    traceLake(ctx); ctx.stroke();
    for (let i = 0; i < 2600; i++) {                // stones on the bottom, seen through the water
      const p = lake.randomEdgePoint(random(0.9, 0.995));
      ctx.fillStyle = random() < 0.5 ? 'rgba(10,22,20,0.22)' : rgb(mix(shallow, [255, 255, 255], 0.3), 0.2);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, random(1.5, 4.5), random(1.2, 3.2), random(TAU), 0, TAU); ctx.fill();
    }
    ctx.restore();

    // ---- waterline ----
    ctx.strokeStyle = rgb(pal.shoreline, 0.42); ctx.lineWidth = 6;
    traceLake(ctx); ctx.stroke();
    ctx.strokeStyle = rgb(pal.shoreline, 0.78); ctx.lineWidth = 2.2;
    traceLake(ctx); ctx.stroke();

    // ---- tree shadows, across land and water alike ----
    for (const t of trees) {
      if (t.hidden) continue;
      softBlob(ctx, t.x + t.cr * SUN.x * 0.6, t.y + t.cr * SUN.y * 0.6, t.cr * 1.14, t.cr * 1.02, 0,
        alpine ? [16, 28, 48] : [0, 14, 8], alpine ? 0.4 : 0.46, 0.7, 0.86);
    }
    return cv;
  }

  // ==========================================================================
  // Per-frame painters. All of them draw into the main canvas in world
  // coordinates and leave the context exactly as they found it.
  // ==========================================================================

  // Slow, broad cloud shadows sliding downwind.
  function drawCloudShadows() {
    if (!S.clouds || !S.cloud) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = 0.14;
    for (const c of S.clouds) {
      c.x += wind.x * 0.35; c.y += wind.y * 0.35;
      if (c.x - c.r > WORLD_W) c.x = -c.r; else if (c.x + c.r < 0) c.x = WORLD_W + c.r;
      if (c.y - c.r > WORLD_H) c.y = -c.r; else if (c.y + c.r < 0) c.y = WORLD_H + c.r;
      if (!inView(c.x, c.y, c.r)) continue;
      ctx.drawImage(S.cloud, c.x - c.r, c.y - c.r * c.ar, c.r * 2, c.r * 2 * c.ar);
    }
    ctx.restore();
  }

  // Shimmer on the water: soft caustic glows, wind-driven wavelet crests
  // with the odd sun sparkle, and drifting motes.
  function drawWaterFx() {
    if (zoom < 0.45 || !S.glow) return;
    const ctx = drawingContext, pal = lvl().palette, t = frameCount * 0.015;
    ctx.save();
    for (const c of lake.caustics) {
      if (!inView(c.x, c.y, c.size * 2)) continue;
      const n = noise(c.x * 0.0025, c.y * 0.0025, t * 0.3 + c.seed);
      if (n < 0.6) continue;
      const d = Math.sin(t * 0.5 + c.seed * 6) * 3;
      const sz = c.size * (1.5 + n * 1.2);
      ctx.globalAlpha = Math.min(0.5, (n - 0.6) * 1.1);
      ctx.drawImage(S.glow, c.x + d - sz / 2, c.y - d * 0.6 - sz * 0.35, sz, sz * 0.7);
    }
    ctx.globalAlpha = 1;

    const wc = pal.wavelet || [180, 215, 200], sparkle = pal.sparkle || [255, 255, 245];
    const wx = Math.cos(lake.windAngle), wy = Math.sin(lake.windAngle);
    ctx.lineCap = 'round'; ctx.lineWidth = 1.1;
    for (const w of lake.wavelets) {
      if (!inView(w.x, w.y, w.len + 30)) continue;
      const n = noise(w.x * 0.0035, w.y * 0.0035, t + w.seed * 0.5);
      if (n < 0.64) continue;
      const drift = (t * 10 + w.seed * 30) % 60 - 30;
      const fade = 1 - Math.abs(drift) / 30;       // ease in and out as the crest drifts
      const lx = w.x + wx * drift, ly = w.y + wy * drift;
      const ca = w.a + Math.PI / 2;                // crests lie across the wind
      const hx = Math.cos(ca) * w.len * 0.5, hy = Math.sin(ca) * w.len * 0.5;
      ctx.strokeStyle = rgb(wc, Math.min(0.85, (n - 0.64) * 3.2) * fade);
      ctx.beginPath();
      ctx.moveTo(lx - hx, ly - hy);
      ctx.quadraticCurveTo(lx + wx * 3, ly + wy * 3, lx + hx, ly + hy);
      ctx.stroke();
      if (n > 0.78) {
        ctx.fillStyle = rgb(sparkle, Math.min(0.9, (n - 0.78) * 6) * fade);
        circle(ctx, lx, ly, 1.1);
      }
    }

    const mp = pal.ambient;
    for (const p of lake.shimmerPoints) {
      if (!inView(p.x, p.y, 12)) continue;
      const a = noise(p.x * 0.01, p.y * 0.01, frameCount * 0.008);
      ctx.fillStyle = rgb(mp, a * 0.16);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 2 + a * 3, 1 + a * 1.5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Thin broken lines of foam breathing in and out along the shore.
  function drawShoreFoam() {
    if (zoom < 0.5) return;
    const ctx = drawingContext, P = lake.points, N = shoreNormals(), n = P.length;
    const t = frameCount * 0.03, fc = lvl().palette.foam || [236, 246, 240];
    const pal = lvl().palette;
    // First a thin dark waterline right on the bank (the baked shore is
    // low-resolution; this keeps the edge sharp when zoomed in), then two
    // broken, drifting lines of foam just off it.
    const passes = [
      { base: 0,   amp: 0,   sp: 0,   k: 0,    c: pal.shoreline, a: 0.5,  lw: 1.1, dash: null },
      { base: 3.4, amp: 2.4, sp: 1.0, k: 0.33, c: fc, a: 0.26, lw: 1.2, dash: [9, 13, 4, 17, 6, 21] },
      { base: 10,  amp: 3.4, sp: 0.7, k: 0.21, c: fc, a: 0.11, lw: 1.0, dash: [14, 24, 5, 19] },
    ];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const ps of passes) {
      ctx.strokeStyle = rgb(ps.c, ps.a); ctx.lineWidth = ps.lw;
      ctx.setLineDash(ps.dash || []); ctx.lineDashOffset = -t * 5 * ps.sp;
      ctx.beginPath();
      let pen = false, px = 0, py = 0;
      for (let i = 0; i <= n; i++) {
        const j = i % n, p = P[j];
        if (!inView(p.x, p.y, 40)) { pen = false; continue; }
        const off = ps.base && ps.base + Math.sin(t * ps.sp + j * ps.k) * ps.amp + Math.sin(t * 0.37 + j * 1.7) * 0.8;
        const x = p.x + N[j].x * off, y = p.y + N[j].y * off;
        if (!pen) { ctx.moveTo(x, y); pen = true; }
        else ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCanopies() {
    const ctx = drawingContext, tt = frameCount * 0.012;
    for (const t of trees) {
      if (t.hidden || !inView(t.x, t.y, t.cr * 1.3)) continue;
      const spr = S.trees[t.variant];
      if (!spr) continue;
      const k = t.cr / TREE_R;
      const sway = Math.sin(tt + t.x * 0.01 + t.y * 0.013) * (0.5 + wind.strength * 0.5);
      ctx.save();
      ctx.translate(t.x + sway * 0.9, t.y + sway * 0.55);
      ctx.rotate(sway * 0.012);
      ctx.scale(k, k);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
    }
  }

  // A raft of lily pads, each bobbing a little on its own.
  function drawLily(lp) {
    if (!lp.pads) return;
    const ctx = drawingContext, f = frameCount;
    ctx.fillStyle = 'rgba(0,18,14,0.28)';
    for (const p of lp.pads) {                     // shadows first, under every pad
      ctx.beginPath(); ctx.ellipse(lp.x + p.dx + 1, lp.y + p.dy + 1.5, p.r, p.r * 0.9, p.a, 0, TAU); ctx.fill();
    }
    for (const p of lp.pads) {
      const spr = S.lilies[p.kind];
      if (!spr) continue;
      const bob = Math.sin(f * 0.02 + p.ph);
      ctx.save();
      ctx.translate(lp.x + p.dx + bob * 0.35, lp.y + p.dy + Math.cos(f * 0.017 + p.ph) * 0.35);
      ctx.rotate(p.a + bob * 0.015);
      ctx.scale(p.r / LILY_R, (p.r * 0.9) / LILY_R);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
    }
  }

  function drawRock(r) {
    const ctx = drawingContext, spr = S.rocks[r.variant || 0];
    if (!spr) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,10,8,0.32)';
    ctx.beginPath(); ctx.ellipse(r.x + r.r * 0.28, r.y + r.r * 0.36, r.r * 1.02, r.r * 0.8, 0, 0, TAU); ctx.fill();
    if (r.inWater) {                               // water lapping round the base
      const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.04 + r.x);
      ctx.strokeStyle = rgb(lvl().palette.foam || [236, 246, 240], 0.1 + pulse * 0.1);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * (0.98 + pulse * 0.07), r.r * (0.8 + pulse * 0.06), 0, 0, TAU);
      ctx.stroke();
    }
    const k = r.r / ROCK_R;
    ctx.drawImage(spr, r.x - spr.width * k / 2, r.y - spr.height * k / 2, spr.width * k, spr.height * k);
    ctx.restore();
  }

  function drawLog(l) {
    if (!l._spr) l._spr = paintLog(l);
    const ctx = drawingContext, spr = l._spr;
    const w = spr.width / 2, h = spr.height / 2;   // back to world units
    ctx.save();
    ctx.translate(l.x + 2.5, l.y + 4);             // shadow, offset in world space
    ctx.rotate(l.a);
    ctx.fillStyle = 'rgba(0,10,8,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, l.len * 0.52, l.thick * 0.72, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.a);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Sunken stump with a stub breaking the surface.
  function drawSnag(s) {
    const ctx = drawingContext;
    ctx.save();
    softBlob(ctx, s.x, s.y, s.r * 1.7, s.r * 1.05, 0, [22, 18, 14], 0.5, 0.6, 0.8);   // the drowned base
    const pulse = (frameCount * 0.012 + s.seed) % 1;                                // slow ring spreading out
    ctx.strokeStyle = rgb(lvl().palette.ripple || [220, 240, 255], 0.3 * (1 - pulse));
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * (0.7 + pulse * 0.9), s.r * (0.34 + pulse * 0.45), 0, 0, TAU); ctx.stroke();
    ctx.translate(s.x, s.y - 1);
    ctx.rotate(s.stubLean);
    const w = s.r * 0.64, h = s.stubH;
    for (let i = 0; i < s.branches; i++) {
      const a = (noise(s.seed + i) - 0.5) * 1.8;
      ctx.save();
      ctx.translate(0, -h * (0.4 + i * 0.2));
      ctx.rotate(a);
      ctx.fillStyle = 'rgb(58,41,27)'; ctx.fillRect(0, -1, s.r * 0.62, 2);
      ctx.restore();
    }
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, 'rgb(104,76,50)'); g.addColorStop(0.4, 'rgb(70,50,33)'); g.addColorStop(1, 'rgb(40,28,19)');
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h, w, h);
    ctx.strokeStyle = 'rgba(24,16,10,0.5)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, -h * 0.9); ctx.lineTo(-w * 0.08, -h * 0.15);
    ctx.moveTo(w * 0.2, -h * 0.8); ctx.lineTo(w * 0.24, -h * 0.1);
    ctx.stroke();
    ctx.fillStyle = 'rgb(150,120,82)';
    ctx.beginPath(); ctx.ellipse(0, -h, w / 2, s.r * 0.12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgb(54,38,24)';
    ctx.beginPath(); ctx.ellipse(w * 0.05, -h + 0.4, w * 0.3, s.r * 0.06, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // A stand of cattails: a few stems, each with leaf blades, a seed head
  // and a spike, all leaning with the wind.
  function drawCattail(c) {
    const ctx = drawingContext, f = frameCount;
    const stems = 2 + Math.floor(hash2(c.x, c.y) * 2);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,16,10,0.22)';
    ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 1.5, 8, 3.2, 0, 0, TAU); ctx.fill();
    for (let k = 0; k < stems; k++) {
      const hk = hash2(c.x + k * 13.1, c.y - k * 7.7);
      const bx = c.x + (hk - 0.5) * 12, by = c.y + (hash2(c.y + k, c.x) - 0.5) * 5;
      const hgt = c.h * 0.75 * (0.75 + hk * 0.45);      // 4-9 ft of stem
      const sway = Math.sin(f * 0.018 + c.sway + k * 0.9) * (2.5 + hk * 2.5) + wind.x * 2;
      for (const sd of [-1, 1]) {
        ctx.strokeStyle = sd < 0 ? 'rgba(104,146,74,0.9)' : 'rgba(62,104,56,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sd * 3 + sway * 0.3, by - hgt * 0.55,
          bx + sd * (7 + hk * 5) + sway * 0.9, by - hgt * (0.78 + hk * 0.2));
        ctx.stroke();
      }
      const tx = bx + sway, ty = by - hgt;
      ctx.strokeStyle = 'rgba(90,126,64,0.95)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + sway * 0.3, by - hgt * 0.6, tx, ty);
      ctx.stroke();
      if (hk > 0.25) {
        ctx.strokeStyle = 'rgba(126,146,84,0.9)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + sway * 0.1, ty - 5); ctx.stroke();
        ctx.strokeStyle = 'rgb(76,45,24)'; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(tx, ty + 0.5); ctx.lineTo(tx - sway * 0.08, ty + 6); ctx.stroke();
        ctx.strokeStyle = 'rgba(146,96,54,0.8)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(tx - 0.7, ty + 1.2); ctx.lineTo(tx - 0.7 - sway * 0.07, ty + 5.2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Submerged weed: a few translucent fronds waving under the surface.
  function drawWeed(w) {
    const ctx = drawingContext, f = frameCount;
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const hk = hash2(w.x + k * 9.3, w.y + k * 4.1);
      const bx = w.x + (hk - 0.5) * 12, by = w.y + (k - 1) * 2;
      const hgt = w.h * 0.7 * (0.6 + hk * 0.6);
      const sway = Math.sin(f * 0.02 + w.sway + k * 1.3) * (2.5 + hk * 2.5);
      ctx.strokeStyle = k === 1 ? 'rgba(62,126,76,0.4)' : 'rgba(26,82,54,0.48)';
      ctx.lineWidth = 1.9 - k * 0.3;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.bezierCurveTo(bx + sway * 0.2 + 3, by - hgt * 0.35, bx + sway * 0.8 - 3, by - hgt * 0.7, bx + sway, by - hgt);
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,134,80,0.3)';
      ctx.beginPath(); ctx.ellipse(bx + sway * 0.5, by - hgt * 0.55, 2.2, 1.2, 0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // A fish seen through the surface: a dark shadow that swims. The body
  // is built on a spine carrying a wave from head to tail — barely moving
  // at the head, widest at the tail — so the whole fish flexes as it goes
  // rather than a stiff shape wagging a fin.
  // Expects the context translated to the fish and rotated to its heading.
  //   L, hw   length and half-width
  //   phase   swim cycle (advances faster the faster the fish is moving)
  //   amp     how far the tail swings, as a fraction of L
  function fishShadow(ctx, L, hw, phase, amp, alpha, glint) {
    const N = 12, sx = [], sy = [], lx = [], ly = [], rx = [], ry = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      sx.push(L * (0.5 - t));
      sy.push(amp * L * (0.1 + 0.9 * Math.pow(t, 1.7)) * Math.sin(phase - t * 2.6));
    }
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = Math.max(0, i - 1), b = Math.min(N, i + 1);
      const tx = sx[b] - sx[a], ty = sy[b] - sy[a], m = Math.hypot(tx, ty) || 1;
      const nx = -ty / m, ny = tx / m;
      let w;
      if (t < 0.8) {                       // body: fullest a third of the way back
        const u = t / 0.8;
        w = hw * Math.max(Math.sin(Math.PI * Math.pow(u, 0.6)), u > 0.5 ? 0.17 : 0);
      } else {                             // tail fin flaring out from the wrist
        w = hw * (0.17 + 0.78 * (t - 0.8) / 0.2);
      }
      lx.push(sx[i] + nx * w); ly.push(sy[i] + ny * w);
      rx.push(sx[i] - nx * w); ry.push(sy[i] - ny * w);
    }
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(lx[0], ly[0]);
      for (let i = 1; i <= N; i++) ctx.lineTo(lx[i], ly[i]);
      ctx.lineTo(sx[N - 1], sy[N - 1]);    // the fork in the tail
      for (let i = N; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
      ctx.closePath();
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(2,12,18,${alpha * 0.3})`;      // soft halo of deeper water
    ctx.lineWidth = Math.max(1.2, hw * 0.7);
    outline(); ctx.stroke();
    const fi = Math.round(N * 0.28);                        // pectoral fins, riding the spine
    ctx.fillStyle = `rgba(2,10,16,${alpha * 0.55})`;
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.translate(sx[fi], sy[fi] + sd * hw * 0.8);
      ctx.rotate(sd * (0.9 + Math.sin(phase * 0.5) * 0.15));
      ctx.beginPath(); ctx.ellipse(-L * 0.06, 0, L * 0.1, hw * 0.24, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = `rgba(2,10,16,${alpha})`;
    outline(); ctx.fill();
    if (glint > 0.05) {                                     // light along the back near the surface
      ctx.strokeStyle = `rgba(190,226,216,${glint * 0.2})`;
      ctx.lineWidth = Math.max(0.6, hw * 0.14);
      ctx.beginPath();
      ctx.moveTo(sx[2], sy[2]);
      for (let i = 3; i <= N - 3; i++) ctx.lineTo(sx[i], sy[i]);
      ctx.stroke();
    }
  }

  // Bow wave and stern wake. Drawn in the kayak's own frame (+x = bow).
  function kayakWake(ctx, s, speed) {
    if (speed < 0.4) return;
    const a = Math.min(1, speed / 3), c = lvl().palette.ripple || [220, 240, 255];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineWidth = 1.1;
    for (const sd of [-1, 1]) {
      ctx.strokeStyle = rgb(c, 0.5 * a);
      ctx.beginPath(); ctx.moveTo(1.3 * s, 0);
      ctx.quadraticCurveTo(0.6 * s, sd * 0.5 * s, -0.3 * s - speed * 4, sd * (0.62 * s + speed * 3));
      ctx.stroke();
      ctx.strokeStyle = rgb(c, 0.3 * a);
      ctx.beginPath(); ctx.moveTo(-1.25 * s, sd * 0.05 * s);
      ctx.quadraticCurveTo(-1.7 * s, sd * 0.2 * s, -2.0 * s - speed * 6, sd * (0.4 * s + speed * 3));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fly rod geometry in the kayak's own frame (+x = bow).
  //   ax, ay  unit direction the rod points
  //   k       its length on the water, in units of s. A rod is about 1.9 s
  //           long, but from above you only see how far it leans: short
  //           when held high, longer as it drops, negative when it is
  //           swung back over the shoulder.
  //   stroke  -1..1, how far the casting hand is pushed along that line
  function rodPose(s, ax, ay, k, stroke) {
    const reach = (0.25 + 0.2 * stroke) * s;       // the hand travels about a foot and a half
    const hx = -0.02 * s + ax * reach, hy = 0.2 * s + ay * reach;   // from the casting shoulder
    return { hx, hy, tx: hx + ax * k * s, ty: hy + ay * k * s };
  }

  // The kayak and its paddler, from above. One painter for the player, the
  // other anglers in a derby, and the profile preview. Expects the context
  // translated to the kayak and rotated to its heading (+x = bow).
  //   o.heading     world heading, so light and shadow stay put as it turns
  //   o.paddlePhase paddle stroke phase
  //   o.casting     rod in hand, paddle resting across the lap
  //   o.rod         { ax, ay, k, stroke, bend } — where the rod points (see rodPose)
  //   o.alpha       overall opacity (other players are drawn slightly sheer)
  function kayak(ctx, s, ap, o = {}) {
    const hp = HULL_PALETTES[ap && ap.hull] || HULL_PALETTES.navy;
    const pp = PFD_PALETTES[ap && ap.pfd] || PFD_PALETTES.orange;
    const hat = HAT_PALETTES[ap && ap.hat] || HAT_PALETTES.green;
    const h = o.heading || 0, cosH = Math.cos(h), sinH = Math.sin(h);
    const local = (x, y) => [x * cosH + y * sinH, -x * sinH + y * cosH];
    const [shx, shy] = local(0.12 * s, 0.2 * s);
    const [lx, ly] = local(LIGHT.x, LIGHT.y);
    const hull = (kx = 1, ky = 1) => {
      ctx.beginPath();
      ctx.moveTo(1.32 * s * kx, 0);
      ctx.bezierCurveTo(0.78 * s * kx, -0.5 * s * ky, -0.6 * s * kx, -0.52 * s * ky, -1.28 * s * kx, 0);
      ctx.bezierCurveTo(-0.6 * s * kx, 0.52 * s * ky, 0.78 * s * kx, 0.5 * s * ky, 1.32 * s * kx, 0);
      ctx.closePath();
    };
    const ell = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); };
    const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    ctx.save();                                    // shadow on the water
    ctx.translate(shx, shy);
    hull(1.02, 1.1); ctx.fillStyle = 'rgba(0,12,16,0.34)'; ctx.fill();
    ctx.restore();

    hull(); ctx.fillStyle = rgb(hp.dark); ctx.fill();            // hull sides
    hull(0.95, 0.82); ctx.fillStyle = rgb(hp.base); ctx.fill();   // deck
    ctx.save();                                                   // sun on the deck
    hull(0.95, 0.82); ctx.clip();
    const e = 1.3 * s * Math.abs(lx) + 0.4 * s * Math.abs(ly);
    const gl = ctx.createLinearGradient(lx * e, ly * e, -lx * e, -ly * e);
    gl.addColorStop(0, rgb(hp.light, 0.95));
    gl.addColorStop(0.5, rgb(hp.light, 0));
    gl.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = gl; ctx.fillRect(-1.4 * s, -0.6 * s, 2.8 * s, 1.2 * s);
    ctx.restore();

    ctx.strokeStyle = rgb(hp.dark, 0.55); ctx.lineWidth = s * 0.03;   // deck ridge
    seg(0.5 * s, 0, 1.2 * s, 0); seg(-0.55 * s, 0, -1.18 * s, 0);
    ctx.strokeStyle = rgb(hp.accent, 0.92); ctx.lineWidth = s * 0.04; // bow bungees
    seg(0.58 * s, -0.2 * s, 0.86 * s, 0.13 * s); seg(0.58 * s, 0.2 * s, 0.86 * s, -0.13 * s);
    ell(-0.82 * s, 0, 0.17 * s, 0.12 * s);                            // stern hatch
    ctx.fillStyle = rgb(hp.dark, 0.9); ctx.fill();
    ctx.strokeStyle = rgb(hp.light, 0.5); ctx.lineWidth = s * 0.02; ctx.stroke();

    if (!o.casting) {                              // rod stowed on the stern deck
      ctx.strokeStyle = 'rgba(28,28,30,0.85)'; ctx.lineWidth = s * 0.035;
      seg(-0.42 * s, 0.17 * s, -1.12 * s, 0.05 * s);
      ctx.fillStyle = 'rgb(150,150,156)'; ell(-0.5 * s, 0.17 * s, 0.045 * s, 0.045 * s); ctx.fill();
    }

    ell(-0.02 * s, 0, 0.5 * s, 0.27 * s); ctx.fillStyle = rgb(shade(hp.dark, 0.58)); ctx.fill();   // coaming
    ell(-0.02 * s, 0, 0.44 * s, 0.22 * s); ctx.fillStyle = 'rgb(14,18,24)'; ctx.fill();            // cockpit
    ell(-0.3 * s, 0, 0.06 * s, 0.17 * s); ctx.fillStyle = 'rgb(44,48,56)'; ctx.fill();             // seat back

    // Paddle: the blade on the stroke side sweeps bow-to-stern in the water
    // while the other swings forward through the air.
    const ph = o.paddlePhase || 0, sw = Math.sin(ph);
    const tilt = o.casting ? 0.1 : 0.55 * Math.cos(ph);
    const slide = o.casting ? 0 : sw * 0.14 * s;
    const dx = Math.sin(tilt), dy = Math.cos(tilt);
    const pvx = (o.casting ? 0.36 : 0.2) * s, half = 0.92 * s;
    const ends = [[pvx + dx * half, slide + dy * half, 1], [pvx - dx * half, slide - dy * half, -1]];
    const hands = [[pvx + dx * 0.3 * s, slide + dy * 0.3 * s], [pvx - dx * 0.3 * s, slide - dy * 0.3 * s]];

    ell(-0.02 * s, 0, 0.16 * s, 0.26 * s); ctx.fillStyle = rgb(pp.dark); ctx.fill();               // torso + PFD
    ell(-0.02 * s + lx * 0.03 * s, ly * 0.03 * s, 0.135 * s, 0.225 * s); ctx.fillStyle = rgb(pp.base); ctx.fill();
    ctx.strokeStyle = rgb(shade(pp.dark, 0.7), 0.8); ctx.lineWidth = s * 0.03;
    seg(-0.1 * s, -0.1 * s, 0.08 * s, -0.1 * s); seg(-0.1 * s, 0.1 * s, 0.08 * s, 0.1 * s);

    // With a cast out, both hands leave the paddle: one drives the rod
    // through the casting stroke, the other tends line at the lap.
    let rod = null, lookX = 1, lookY = 0;
    if (o.casting) {
      const rd = o.rod || { ax: 1, ay: 0, k: 0.8, stroke: 0, bend: 0 };
      rod = Object.assign({}, rd, rodPose(s, rd.ax, rd.ay, rd.k, rd.stroke || 0));
      hands[0] = [rod.hx, rod.hy];
      hands[1] = [0.17 * s, -0.07 * s];
      lookX = rd.ax; lookY = rd.ay;                // the angler watches the cast
    }
    ctx.strokeStyle = rgb(shade(pp.dark, 0.82)); ctx.lineWidth = s * 0.1;                          // arms
    seg(-0.02 * s, 0.2 * s, hands[0][0], hands[0][1]);
    seg(-0.02 * s, -0.2 * s, hands[1][0], hands[1][1]);

    ctx.strokeStyle = 'rgb(40,36,32)'; ctx.lineWidth = s * 0.07;                                   // shaft
    seg(ends[0][0], ends[0][1], ends[1][0], ends[1][1]);
    for (const [ex, ey, sd] of ends) {
      const wet = !o.casting && sw * sd > 0.25;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(Math.atan2(dy * sd, dx * sd));
      ell(-0.17 * s, 0, 0.2 * s, 0.085 * s);
      ctx.fillStyle = wet ? rgb(mix(hp.accent, [20, 60, 60], 0.45), 0.75) : rgb(hp.accent);
      ctx.fill();
      ctx.strokeStyle = rgb(shade(hp.accent, 0.6), 0.7); ctx.lineWidth = s * 0.02;
      seg(-0.35 * s, 0, 0, 0);
      ctx.restore();
      if (wet && (o.speed || 0) > 0.3) {           // water kicked up off the blade
        const f = typeof frameCount === 'number' ? frameCount : 0;
        ctx.fillStyle = 'rgba(232,244,248,0.75)';
        for (let i = 0; i < 3; i++) {
          const j = hash2(f * 0.37 + i * 3.1, sd * 5.3);
          ell(ex - dx * sd * 0.2 * s + (j - 0.5) * 0.3 * s,
              ey - dy * sd * 0.1 * s + (hash2(i, f * 0.21) - 0.5) * 0.22 * s, 0.04 * s, 0.04 * s);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = 'rgb(226,196,156)';                                                             // hands
    for (const [hx, hy] of hands) { ell(hx, hy, 0.05 * s, 0.05 * s); ctx.fill(); }

    if (rod) {
      const { hx, hy, tx, ty, ax, ay } = rod, sg = rod.k < 0 ? -1 : 1;
      // A loaded rod bows sideways a touch; the curve runs through this point.
      const cx = (hx + tx) / 2 - ay * (rod.bend || 0) * s, cy = (hy + ty) / 2 + ax * (rod.bend || 0) * s;
      const blank = (t0, t1) => {
        const at = (t) => [(1 - t) * (1 - t) * hx + 2 * t * (1 - t) * cx + t * t * tx,
                           (1 - t) * (1 - t) * hy + 2 * t * (1 - t) * cy + t * t * ty];
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const [x, y] = at(t0 + (t1 - t0) * i / 6);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      ctx.strokeStyle = 'rgba(0,10,12,0.4)'; ctx.lineWidth = s * 0.09; blank(0, 1);     // contrast on any water
      ctx.strokeStyle = 'rgb(206,162,82)'; ctx.lineWidth = s * 0.065; blank(0, 0.45);   // butt section
      ctx.strokeStyle = 'rgb(226,190,116)'; ctx.lineWidth = s * 0.038; blank(0.45, 1);  // fine tip
      ctx.strokeStyle = 'rgb(150,108,62)'; ctx.lineWidth = s * 0.075;                   // cork grip
      seg(hx - ax * sg * 0.08 * s, hy - ay * sg * 0.08 * s, hx + ax * sg * 0.07 * s, hy + ay * sg * 0.07 * s);
      ctx.fillStyle = 'rgb(170,172,178)';                                               // reel
      ell(hx - ax * sg * 0.06 * s - ay * 0.055 * s, hy - ay * sg * 0.06 * s + ax * 0.055 * s, 0.05 * s, 0.05 * s);
      ctx.fill();
    }

    // Head and hat. The brim points wherever the angler is looking.
    ell(0.03 * s + lookX * 0.1 * s, lookY * 0.1 * s, 0.12 * s, 0.15 * s, Math.atan2(lookY, lookX));
    ctx.fillStyle = rgb(shade(hat, 0.76)); ctx.fill();
    ell(0.03 * s, 0, 0.13 * s, 0.13 * s); ctx.fillStyle = 'rgb(226,196,156)'; ctx.fill();           // head
    ell(0.02 * s, 0, 0.15 * s, 0.15 * s); ctx.fillStyle = rgb(hat); ctx.fill();                     // crown
    ell(0.02 * s + lx * 0.05 * s, ly * 0.05 * s, 0.075 * s, 0.075 * s);
    ctx.fillStyle = rgb(mix(hat, [255, 255, 255], 0.2)); ctx.fill();
    ctx.restore();
  }

  // Screen-space finish, drawn after the world: a soft vignette and a faint
  // wash of warm light from the sun's corner.
  function drawScreenFx() {
    const ctx = drawingContext, w = width, h = height;
    ctx.save();
    const sun = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.7);
    sun.addColorStop(0, 'rgba(255,238,196,0.085)');
    sun.addColorStop(1, 'rgba(255,238,196,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(4,10,12,0)');
    v.addColorStop(1, 'rgba(4,10,12,0.4)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return {
    prepareWorld, bakeStatic,
    drawCloudShadows, drawWaterFx, drawShoreFoam, drawCanopies,
    drawLily, drawRock, drawLog, drawSnag, drawCattail, drawWeed,
    fishShadow, kayak, kayakWake, rodPose, drawScreenFx, roundRect,
  };
})();
