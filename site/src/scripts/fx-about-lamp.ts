// The desk lamp under the About hero (components/fx/DeskLamp.astro).
// One full-canvas fragment shader: procedural paper fibers + tooth + cockle as a height
// field, lit by a point light that follows the mouse. Renders only on demand (while the
// lamp moves or flickers on), pauses offscreen and in background tabs, and re-reads the
// design tokens whenever the theme changes.
import { afterPaint, luminance, onThemeChange, tokenRGB } from '../components/fx/theme';

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

// Pass 1, once per size: paper fibers + tooth + cockle as a height field, baked to a
// normal map at CSS-pixel resolution.
const FRAG_BAKE = HEAD + `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// long, thin streaks: a ridge of stretched noise at one angle
float fibers(vec2 p, float ang, float w) {
  float c = cos(ang), s = sin(ang);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  q *= vec2(1.0 / (w * 14.0), 1.0 / w);
  float r = 1.0 - abs(vnoise(q) * 2.0 - 1.0);
  return pow(r, 22.0);
}
// Drawing paper, not cloth: fine tooth and a few faint fibres. (Strong long fibres plus
// big cockle waves, lit by a moving light, read as crumpled fabric.)
float height(vec2 p) {
  float h = fibers(p, 0.35, 2.6) * 0.3
          + fibers(p + 31.7, 1.45, 3.4) * 0.25;
  h += vnoise(p * 0.7) * 0.22 + vnoise(p * 1.6) * 0.12; // tooth
  return h;
}
void main() {
  vec2 p = gl_FragCoord.xy;
  float h0 = height(p);
  vec3 n = normalize(vec3(-(height(p + vec2(1.0, 0.0)) - h0) * 0.7, -(height(p + vec2(0.0, 1.0)) - h0) * 0.7, 1.0));
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, 0.0, 1.0);
}`;

// Pass 2, per frame: one texture read and a point light.
const FRAG = HEAD + `
uniform sampler2D uNormals;
uniform vec2 uRes;     // canvas size, css px
uniform float uScale;  // device px per css px
uniform vec3 uLight;   // css px, y up; z = lamp height
uniform float uPower;  // 0..1
uniform float uRadius;
uniform float uDark;
uniform vec3 uWarm;
uniform vec3 uShadow;
void main() {
  vec2 p = gl_FragCoord.xy / uScale;
  vec2 nxy = texture2D(uNormals, p / uRes).xy * 2.0 - 1.0;
  vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));

  vec3 ld = vec3(uLight.xy - p, uLight.z);
  float dist = length(ld.xy);
  vec3 l = normalize(ld);
  float relief = dot(n, l) - l.z;            // + faces the lamp, - turns away
  float pool = exp(-(dist * dist) / (uRadius * uRadius));
  float glow = pool * uPower;

  float warmA = glow * mix(0.17, 0.16, uDark) + max(relief, 0.0) * glow * mix(0.7, 1.1, uDark);
  float shadeA = max(-relief, 0.0) * glow * mix(0.55, 1.1, uDark) + (1.0 - pool) * uPower * mix(0.04, 0.11, uDark);

  vec2 e = smoothstep(vec2(0.0), vec2(110.0), p) * smoothstep(vec2(0.0), vec2(110.0), uRes - p);
  float fade = e.x * e.y;
  warmA = min(warmA * fade, 0.32);
  shadeA = min(shadeA * fade, 0.22);
  gl_FragColor = vec4(uWarm * warmA + uShadow * shadeA, warmA + shadeA);
}`;

type V3 = [number, number, number];

export function initDeskLamp(canvas: HTMLCanvasElement): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return () => {};
  const cleanups: (() => void)[] = [];
  let dead = false;

  cleanups.push(afterPaint(() => !dead && start()));

  function start() {
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' } as const;
    const gl = (canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) return;
    // Software rendering (SwiftShader, llvmpipe, Microsoft Basic Render) bakes the paper on
    // the CPU: a long, janky task for a barely-there effect. Leave the paper alone there.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return;
    }

    const sh = (type: number, src: string) => {
      const x = gl.createShader(type)!;
      gl.shaderSource(x, src);
      gl.compileShader(x);
      return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const link = (src: string) => {
      const fs = sh(gl.FRAGMENT_SHADER, src);
      if (!vs || !fs) return null;
      const pr = gl.createProgram()!;
      gl.attachShader(pr, vs);
      gl.attachShader(pr, fs);
      gl.bindAttribLocation(pr, 0, 'a');
      gl.linkProgram(pr);
      return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null;
    };
    const bake = link(FRAG_BAKE);
    const prog = link(FRAG);
    if (!bake || !prog) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let texW = 0, texH = 0;
    /** Bake the paper's normal map (CSS px resolution) when the size changes. */
    const bakeNormals = () => {
      const tw = Math.ceil(W), th = Math.ceil(H);
      if (tw === texW && th === texH) return;
      texW = tw; texH = th;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, tw, th);
      gl.useProgram(bake);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
    };
    gl.useProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U('uRes'), uScale = U('uScale'), uLight = U('uLight'), uPower = U('uPower');
    const uRadius = U('uRadius'), uDark = U('uDark'), uWarm = U('uWarm'), uShadow = U('uShadow');
    gl.uniform1i(U('uNormals'), 0);

    // ---- colors from the tokens ----
    let warm: V3 = [1, 0.9, 0.4];
    let shadow: V3 = [0, 0, 0];
    let dark = 0;
    const readColors = () => {
      const paper = tokenRGB('--paper', [0.99, 0.98, 0.97]);
      const ink = tokenRGB('--ink', [0.12, 0.11, 0.1]);
      const hl = tokenRGB('--hl', [0.98, 0.9, 0.36]);
      const scrap = tokenRGB('--paper-scrap', paper);
      dark = luminance(paper) < luminance(ink) ? 1 : 0;
      // lamp light: highlighter yellow softened toward the brightest paper
      const t = dark ? 0.25 : 0.15;
      warm = [0, 1, 2].map((i) => hl[i] * (1 - t) + Math.max(scrap[i], ink[i] * dark) * t) as V3;
      shadow = dark ? tokenRGB('--shadow', [0, 0, 0]) : ink;
    };
    readColors();

    // ---- size ----
    let W = 1, H = 1, scale = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      scale = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      bakeNormals();
      if (!moved) { pos.x = target.x = rest().x; pos.y = target.y = rest().y; }
      kick();
    };
    const narrow = () => W < 700;
    // resting spot: over the title on desktop, over the portrait on phones
    const rest = () => (narrow() ? { x: W * 0.5, y: H * 0.22 } : { x: W * 0.3, y: H * 0.4 });

    // ---- state ----
    const pos = { x: 0, y: 0, vx: 0, vy: 0 };
    const target = { x: 0, y: 0 };
    let moved = false;
    let power = 0;
    let flickerT0 = -1;
    let visible = false;
    let raf = 0;
    let last = 0;
    let rect: DOMRect | null = null;

    // A desk lamp clicking on: one quick catch, then steady. (Six stutters read as a
    // failing fluorescent tube, not a lamp.) Only the first time this visit; after that the
    // light just fades up with the canvas.
    const FLICKER: [number, number][] = [[0, 0], [60, 0.85], [120, 0.5], [320, 1]];
    let clicked = false;
    try { clicked = sessionStorage.getItem('fx-lamp-on') === '1'; } catch {}
    const flicker = (ms: number) => {
      for (let i = 1; i < FLICKER.length; i++) {
        const [t1, v1] = FLICKER[i];
        const [t0, v0] = FLICKER[i - 1];
        if (ms <= t1) return v0 + (v1 - v0) * ((ms - t0) / (t1 - t0));
      }
      return 1;
    };

    const draw = () => {
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uScale, scale);
      gl.uniform3f(uLight, pos.x, H - pos.y, narrow() ? 150 : 190);
      gl.uniform1f(uPower, power);
      gl.uniform1f(uRadius, narrow() ? Math.max(170, W * 0.42) : Math.min(420, Math.max(260, W * 0.24)));
      gl.uniform1f(uDark, dark);
      gl.uniform3f(uWarm, warm[0], warm[1], warm[2]);
      gl.uniform3f(uShadow, shadow[0], shadow[1], shadow[2]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      // a lamp arm on a spring: a little lag, no wobble
      const k = 70, c = 2 * Math.sqrt(k);
      pos.vx += ((target.x - pos.x) * k - pos.vx * c) * dt;
      pos.vy += ((target.y - pos.y) * k - pos.vy * c) * dt;
      pos.x += pos.vx * dt;
      pos.y += pos.vy * dt;
      let busy = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.4 || Math.abs(pos.vx) + Math.abs(pos.vy) > 1;
      if (flickerT0 >= 0) {
        const ms = now - flickerT0;
        power = flicker(ms);
        if (ms > 320) flickerT0 = -1;
        else busy = true;
      }
      draw();
      if (busy) kick();
      else last = 0;
    };
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    // ---- input ----
    const local = (cx: number, cy: number) => {
      rect ??= canvas.getBoundingClientRect();
      return { x: cx - rect.left, y: cy - rect.top };
    };
    const forget = () => (rect = null);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !visible) return;
      const p = local(e.clientX, e.clientY);
      target.x = Math.max(-80, Math.min(W + 80, p.x));
      target.y = Math.max(-80, Math.min(H + 80, p.y));
      moved = true;
      kick();
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.relatedTarget) return;
      Object.assign(target, rest());
      kick();
    };
    // touch and pen: a tap in the hero moves the lamp there
    const host = canvas.parentElement!;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const p = local(e.clientX, e.clientY);
      target.x = p.x;
      target.y = p.y;
      moved = true;
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    host.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('scroll', forget, { passive: true });
    window.addEventListener('resize', forget, { passive: true });
    const ro = new ResizeObserver(() => { forget(); resize(); });
    resize();
    // too slow here (software GL, a tired GPU)? Leave the paper alone.
    const px = new Uint8Array(4);
    draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the GPU
    const t0 = performance.now();
    power = 1;
    draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    power = 0;
    const ms = performance.now() - t0;
    canvas.dataset.probeMs = ms.toFixed(1);
    if (ms > 14) {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', forget);
      window.removeEventListener('resize', forget);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return;
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    ro.observe(canvas);

    let switchedOn = false;
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && !switchedOn) {
        switchedOn = true;
        canvas.classList.add('is-on');
        if (clicked) power = 1;
        else {
          flickerT0 = performance.now();
          try { sessionStorage.setItem('fx-lamp-on', '1'); } catch {}
        }
      }
      kick();
    });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    const offTheme = onThemeChange(() => { readColors(); if (!raf) draw(); });
    const onReduce = () => { if (reduce.matches) canvas.classList.remove('is-on'); };
    reduce.addEventListener('change', onReduce);
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; };
    canvas.addEventListener('webglcontextlost', onLost);

    cleanups.push(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', forget);
      window.removeEventListener('resize', forget);
      document.removeEventListener('visibilitychange', onVis);
      reduce.removeEventListener('change', onReduce);
      canvas.removeEventListener('webglcontextlost', onLost);
      ro.disconnect();
      io.disconnect();
      offTheme();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    });
  }

  return () => {
    dead = true;
    cleanups.forEach((f) => f());
  };
}
