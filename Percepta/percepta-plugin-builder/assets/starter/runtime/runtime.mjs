import { assertProject, sampleProject, clamp, randomAt } from './project.mjs';
import { createMaterialRenderer, colorRGB } from './materials.mjs';
export { sampleProject } from './project.mjs';

export async function loadAssets(project) {
  assertProject(project);
  if (typeof Image === 'undefined') throw new Error('loadAssets requires a browser Image implementation');
  const entries = await Promise.all(project.assets.map(asset => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error(`Image dimensions differ: ${asset.name}`);
        // Decode once at full resolution. A WebP Image and an RGBA Canvas can
        // take different scaled sampling paths even when decoded pixels match.
        const decoded = document.createElement('canvas'); decoded.width = asset.width; decoded.height = asset.height;
        const source = decoded.getContext('2d', { alpha: true, willReadFrequently: true }); source.drawImage(image, 0, 0);
        const rgba = source.getImageData(0, 0, asset.width, asset.height);
        const surface = document.createElement('canvas'); surface.width = asset.width; surface.height = asset.height;
        // Pin the source backing as well as capture targets. A default source
        // Canvas produced different cold/warm pixels for identical commands.
        const target = surface.getContext('2d', { alpha: true, willReadFrequently: true }), pixels = target.createImageData(asset.width, asset.height);
        pixels.data.set(rgba.data); target.putImageData(pixels, 0, 0);
        image.onload = image.onerror = null;
        resolve([asset.id, surface]);
      } catch (error) { image.onload = image.onerror = null; reject(error); }
    };
    image.onerror = () => reject(new Error(`Cannot load asset: ${asset.name}`));
    image.src = asset.src;
  })));
  return new Map(entries);
}

const TAU = Math.PI * 2;
const easeOut = value => 1 - (1 - clamp(value)) ** 3;
const rgba = (color, alpha) => `rgba(${colorRGB(color).map(value => Math.round(value * 255)).join(',')},${clamp(alpha)})`;

/** Preserve each trimmed frame's own pixels and origin through one common pixels-to-world scale. */
export function imageGeometry(project, layer, frame) {
  const asset = project.assets.find(item => item.id === frame.assetId);
  if (!asset) return null;
  const sequence = layer.kind === 'flipbook' ? layer.frames.map(item => project.assets.find(asset => asset.id === item.assetId)).filter(Boolean) : [asset];
  const referenceWidth = Math.max(...sequence.map(item => item.width)), referenceHeight = Math.max(...sequence.map(item => item.height));
  const unit = Math.min(frame.width / referenceWidth, frame.height / referenceHeight);
  const width = asset.width * unit, height = asset.height * unit, pivot = frame.pivot || asset.pivot || { x: 0.5, y: 0.5 };
  return { width, height, x: -width * pivot.x, y: -height * pivot.y, pivot, unit };
}

function extent(project, layer, frame) {
  if (layer.kind === 'material') return { minX: -frame.width / 2, maxX: frame.width / 2, minY: -frame.height, maxY: 0 };
  if (layer.kind === 'sprite' || layer.kind === 'flipbook') {
    const geometry = imageGeometry(project, layer, frame);
    if (geometry) return { minX: geometry.x, maxX: geometry.x + geometry.width, minY: geometry.y, maxY: geometry.y + geometry.height };
  }
  return { minX: -frame.width / 2, maxX: frame.width / 2, minY: -frame.height / 2, maxY: frame.height / 2 };
}

export function measureFrame(project, sampled) {
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }, size = project.controls.size;
  const include = (x, y) => { bounds.minX = Math.min(bounds.minX, x * size); bounds.maxX = Math.max(bounds.maxX, x * size); bounds.minY = Math.min(bounds.minY, y * size); bounds.maxY = Math.max(bounds.maxY, y * size); };
  for (const frame of sampled.activeLayers) {
    const layer = project.layers.find(item => item.id === frame.id), shape = extent(project, layer, frame);
    const cos = Math.cos(frame.rotation), sin = Math.sin(frame.rotation);
    for (const x of [shape.minX, shape.maxX]) for (const y of [shape.minY, shape.maxY]) include(layer.x + (x * cos - y * sin) * frame.scale, layer.y + (x * sin + y * cos) * frame.scale);
    for (const particle of frame.particles || []) {
      const radius = particle.size * particle.stretch * frame.scale;
      const x = layer.x + (particle.x * cos - particle.y * sin) * frame.scale;
      const y = layer.y + (particle.x * sin + particle.y * cos) * frame.scale;
      include(x - radius, y - radius); include(x + radius, y + radius);
    }
  }
  return bounds;
}

/** Camera fit uses the reference size, so the Size control changes visible scale. */
export function measureEnvelope(project) {
  const reference = { ...project, controls: { ...project.controls, size: 1 } };
  const envelope = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const times = new Set(Array.from({ length: 41 }, (_, i) => project.duration * i / 41));
  for (const layer of project.layers) {
    times.add(layer.start + (layer.end - layer.start) * 0.2);
    times.add(layer.start + (layer.end - layer.start) * 0.5);
  }
  for (const time of times) {
    const bounds = measureFrame(reference, sampleProject(reference, time));
    envelope.minX = Math.min(envelope.minX, bounds.minX); envelope.maxX = Math.max(envelope.maxX, bounds.maxX);
    envelope.minY = Math.min(envelope.minY, bounds.minY); envelope.maxY = Math.max(envelope.maxY, bounds.maxY);
  }
  return envelope;
}

function drawHalo(ctx, width, height, color, alpha = 1) {
  ctx.save(); ctx.scale(1, height / width);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
  gradient.addColorStop(0, rgba(color, alpha)); gradient.addColorStop(0.2, rgba(color, alpha * 0.75));
  gradient.addColorStop(0.5, rgba(color, alpha * 0.2)); gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient; ctx.fillRect(-width / 2, -width / 2, width, width); ctx.restore();
}

function drawRing(ctx, frame, color) {
  const width = frame.width, height = frame.height;
  ctx.save(); ctx.scale(1, height / width); ctx.lineWidth = Math.max(1, 9 * (1 - frame.progress * 0.8));
  ctx.strokeStyle = rgba(color, 0.22); ctx.shadowColor = color; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.ellipse(0, 0, width / 2, width / 2, 0, 0, TAU); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = color; ctx.lineWidth *= 0.65; ctx.stroke();
  ctx.strokeStyle = '#fff7df'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

function drawParticle(ctx, particle, image, color) {
  ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation); ctx.globalAlpha *= particle.opacity;
  const size = particle.size;
  if (image) ctx.drawImage(image, -size * particle.stretch, -size, size * particle.stretch * 2, size * 2);
  else {
    ctx.shadowColor = color; ctx.shadowBlur = size * 3;
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, size * particle.stretch, size * 0.45, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff9db'; ctx.beginPath(); ctx.ellipse(0, 0, size * particle.stretch * 0.58, size * 0.2, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Reject collapsed destination caps before Canvas tries to invert their repeating texture transform. */
export function triangleMapping(source, destination) {
  if (![...source, ...destination].every(point => point.length === 2 && point.every(Number.isFinite))) return null;
  const [s0, s1, s2] = source, [p0, p1, p2] = destination;
  const ax = s1[0] - s0[0], ay = s1[1] - s0[1], bx = s2[0] - s0[0], by = s2[1] - s0[1], det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-8) return null;
  const dx1 = p1[0] - p0[0], dy1 = p1[1] - p0[1], dx2 = p2[0] - p0[0], dy2 = p2[1] - p0[1];
  const destinationDet = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(destinationDet) < 1e-4) return null;
  const a = (dx1 * by - dx2 * ay) / det, b = (dy1 * by - dy2 * ay) / det;
  const c = (dx2 * ax - dx1 * bx) / det, d = (dy2 * ax - dy1 * bx) / det;
  const e = p0[0] - a * s0[0] - c * s0[1], f = p0[1] - b * s0[0] - d * s0[1];
  if (![a, b, c, d, e, f].every(Number.isFinite)) return null;
  return { a, b, c, d, e, f };
}

function triangle(ctx, pattern, source, destination) {
  const matrix = triangleMapping(source, destination);
  if (!matrix) return false;
  const { a, b, c, d, e, f } = matrix, [p0, p1, p2] = destination;
  ctx.save(); ctx.beginPath();
  // Subpixel expansion seals hairline cracks between separately rasterized mesh triangles.
  const center = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3];
  for (let i = 0; i < 3; i++) {
    const point = destination[i], vx = point[0] - center[0], vy = point[1] - center[1], length = Math.hypot(vx, vy) || 1;
    const x = point[0] + vx / length * 0.4, y = point[1] + vy / length * 0.4;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.clip(); ctx.transform(a, b, c, d, e, f); ctx.fillStyle = pattern;
  const xs = source.map(point => point[0]), ys = source.map(point => point[1]);
  const minX = Math.min(...xs) - 2, minY = Math.min(...ys) - 2;
  ctx.fillRect(minX, minY, Math.max(...xs) - minX + 2, Math.max(...ys) - minY + 2); ctx.restore();
  return true;
}

function drawRibbon(ctx, layer, frame, image, color, metrics) {
  const ribbon = layer.ribbon || {}, radius = ribbon.radius || 200, thickness = ribbon.thickness || 70;
  const head = easeOut(frame.progress / 0.48), tail = easeOut((frame.progress - 0.28) / 0.72) * 0.98;
  if (head - tail < 0.002) return;
  const sweep = ribbon.sweep ?? 4.8, angle = -Math.PI / 2 - sweep / 2;
  const scaleX = frame.width / (radius * 2 + thickness), scaleY = frame.height / ((radius * 2 + thickness) * (ribbon.tilt || 0.6));
  const points = [], count = 64;
  for (let i = 0; i <= count; i++) {
    const u = i / count, along = tail + (head - tail) * u, theta = angle + along * sweep;
    const width = thickness * Math.sin(Math.PI * u) ** 0.55 * (0.45 + u * 0.55);
    const inner = radius - width * 0.7, outer = radius + width * 0.3;
    const point = r => [Math.cos(theta) * r * scaleX, Math.sin(theta) * r * (ribbon.tilt || 0.6) * scaleY];
    points.push({ a: point(inner), b: point(outer), u });
  }
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha *= 0.48;
  ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(...point.a) : ctx.moveTo(...point.a));
  points.slice().reverse().forEach(point => ctx.lineTo(...point.b)); ctx.closePath(); ctx.fillStyle = '#160c17'; ctx.fill(); ctx.restore();
  if (image) {
    const pattern = ctx.createPattern(image, 'repeat'), iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const shift = frame.age * (ribbon.scroll || 0) * iw;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], x0 = a.u * iw + shift, x1 = b.u * iw + shift;
      const dissolve = Math.max(frame.dissolve, clamp((frame.progress - 0.4) / 0.6) * (ribbon.dissolve || 0));
      const keep = 0.2 + randomAt(317, i, 3) * 0.7 + a.u * 0.45 - dissolve * 1.45;
      if (keep <= 0) continue;
      ctx.save(); ctx.globalAlpha *= Math.min(1, keep / 0.08);
      const first = triangle(ctx, pattern, [[x0, ih], [x0, 0], [x1, 0]], [a.a, a.b, b.b]);
      const second = triangle(ctx, pattern, [[x0, ih], [x1, 0], [x1, ih]], [a.a, b.b, b.a]);
      if (dissolve > 0.02 && keep < 0.16) {
        ctx.strokeStyle = '#fff3ca'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(...a.b); ctx.lineTo(...b.b); ctx.stroke();
      }
      ctx.restore();
      const drawn = Number(first) + Number(second);
      metrics.meshTriangles += drawn; metrics.skippedDegenerateTriangles += 2 - drawn;
    }
  } else {
    ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(...point.a) : ctx.moveTo(...point.a));
    points.slice().reverse().forEach(point => ctx.lineTo(...point.b)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  const tip = points.at(-2)?.b;
  if (tip && frame.progress < 0.7) { ctx.save(); ctx.translate(...tip); drawHalo(ctx, 75, 75, color, 0.8); ctx.restore(); }
}

function background(ctx, width, height, color, grid, origin, zoom) {
  ctx.clearRect(0, 0, width, height);
  const light = /^#[0-9a-f]{6}$/i.test(color || '') && colorRGB(color).reduce((sum, value) => sum + value, 0) / 3 > 0.6;
  if (color !== 'transparent') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color || '#111727'); gradient.addColorStop(1, light ? '#e0ddd6' : '#080d18');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const floor = ctx.createRadialGradient(origin.x, origin.y, 1, origin.x, origin.y, width * 0.45);
    floor.addColorStop(0, light ? 'rgba(95,88,75,.08)' : 'rgba(49,65,83,.3)'); floor.addColorStop(1, 'rgba(20,30,45,0)');
    ctx.fillStyle = floor; ctx.fillRect(0, 0, width, height);
  }
  if (grid) {
    ctx.strokeStyle = light ? 'rgba(62,73,87,.13)' : 'rgba(132,158,181,.12)'; ctx.lineWidth = 1; ctx.beginPath();
    const step = 50 * zoom;
    for (let x = origin.x % step; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = origin.y % step; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    ctx.strokeStyle = light ? 'rgba(52,67,84,.4)' : 'rgba(150,178,203,.35)'; ctx.beginPath();
    ctx.moveTo(origin.x - 8, origin.y); ctx.lineTo(origin.x + 8, origin.y);
    ctx.moveTo(origin.x, origin.y - 8); ctx.lineTo(origin.x, origin.y + 8); ctx.stroke();
  }
}

/** readback fixes the compositor for pixel capture; use a fresh canvas because its first context wins. */
export function createRenderer(canvas, { readback = false, context } = {}) {
  const ctx = context || canvas.getContext('2d', { alpha: true, willReadFrequently: readback });
  if (!ctx) throw new Error('EasyVFX requires Canvas2D');
  const compositor = (ctx.getContextAttributes?.().willReadFrequently ?? readback) ? 'readback' : 'display';
  const materials = createMaterialRenderer({ readback: compositor === 'readback' });
  let disposed = false, cachedSignature = '', envelope = { minX: -300, maxX: 300, minY: -500, maxY: 100 };
  const tinted = new Map(), imageKeys = new WeakMap(); let nextImageKey = 0;
  function tintedImage(image, color) {
    if (!imageKeys.has(image)) imageKeys.set(image, ++nextImageKey);
    const key = `${imageKeys.get(image)}:${color}`;
    if (tinted.has(key)) return tinted.get(key);
    const output = document.createElement('canvas'); output.width = image.naturalWidth || image.width; output.height = image.naturalHeight || image.height;
    const tc = output.getContext('2d'); tc.drawImage(image, 0, 0);
    // Multiply retains dark texture detail; a screen pass restores its bright cutting edge.
    tc.globalCompositeOperation = 'multiply'; tc.fillStyle = color; tc.fillRect(0, 0, output.width, output.height);
    tc.globalCompositeOperation = 'screen'; tc.globalAlpha = 0.3; tc.drawImage(image, 0, 0);
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'destination-in'; tc.drawImage(image, 0, 0);
    tinted.set(key, output);
    if (tinted.size > 32) tinted.delete(tinted.keys().next().value);
    return output;
  }
  function updateEnvelope(project) {
    const signature = JSON.stringify([project.seed, project.duration, project.controls.intensity, project.layers, project.assets.map(item => [item.id, item.width, item.height, item.pivot])]);
    if (signature === cachedSignature) return;
    cachedSignature = signature; envelope = measureEnvelope(project);
  }
  function paint(project, sample, images, metrics) {
    for (const frame of sample.activeLayers) {
        if (frame.opacity <= 0.001 || frame.scale <= 0.001) continue;
        const layer = project.layers.find(item => item.id === frame.id);
        const color = layer.color && layer.color !== '#ffffff' ? layer.color : project.controls.color;
        ctx.save(); ctx.translate(layer.x, layer.y); ctx.rotate(frame.rotation); ctx.scale(frame.scale, frame.scale);
        ctx.globalCompositeOperation = layer.blend === 'normal' ? 'source-over' : 'lighter';
        ctx.globalAlpha *= frame.opacity; ctx.filter = `brightness(${project.controls.intensity})`;
        if (layer.kind === 'halo') drawHalo(ctx, frame.width, frame.height, color);
        else if (layer.kind === 'ring') drawRing(ctx, frame, color);
        else if (layer.kind === 'particles') {
          const image = images.get(layer.assetId);
          for (const particle of frame.particles || []) drawParticle(ctx, particle, image, color);
          metrics.drawCalls += frame.particles?.length || 0;
        } else if (layer.kind === 'material') {
          if (!materials.draw(ctx, layer, frame, images, color)) metrics.missingAssets.push(layer.name);
          if (materials.lastSample) metrics.materialSamples.push(materials.lastSample);
        } else if (layer.kind === 'ribbon') {
          const image = images.get(layer.assetId);
          drawRibbon(ctx, layer, frame, image ? tintedImage(image, color) : null, color, metrics);
        } else if (layer.kind === 'sprite' || layer.kind === 'flipbook') {
          const image = images.get(frame.assetId), geometry = imageGeometry(project, layer, frame);
          if (image && geometry) ctx.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height);
          else metrics.missingAssets.push(layer.name);
        }
        ctx.restore(); metrics.drawCalls++;
      }
  }
  function metricsFor(project, sample) {
    return { activeLayers: sample.activeLayers.length, particles: sample.particleCount, drawCalls: 0, meshTriangles: 0, skippedDegenerateTriangles: 0, materialBackend: materials.backend, materialBridge: materials.bridge, materialSamples: [], compositor, bounds: measureFrame(project, sample), missingAssets: [] };
  }
  return {
    /** Draw in the caller's logical coordinates without clearing, fitting or resetting its transform. */
    draw(project, time, images = new Map(), { matrix = [1, 0, 0, 1, 0, 0] } = {}) {
      if (disposed) throw new Error('EasyVFX renderer has been disposed');
      if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)) throw new Error('EasyVFX logical draw requires a finite affine matrix');
      const sample = sampleProject(project, time), metrics = metricsFor(project, sample);
      ctx.save();
      try { ctx.transform(...matrix); ctx.scale(project.controls.size, project.controls.size); paint(project, sample, images, metrics); }
      finally { ctx.restore(); }
      metrics.materialBackend = materials.backend; metrics.materialBridge = materials.bridge;
      return metrics;
    },
    render(project, time, images = new Map(), options = {}) {
      if (disposed) throw new Error('EasyVFX renderer has been disposed');
      updateEnvelope(project);
      const sample = sampleProject(project, time), bounds = measureFrame(project, sample), width = canvas.width, height = canvas.height;
      const camera = options.camera || {}, padding = 38;
      const baseZoom = Math.min(width / 960, height / 640);
      const maxSide = Math.max(Math.abs(envelope.minX), Math.abs(envelope.maxX), 100);
      const top = Math.max(-envelope.minY, 100), bottom = Math.max(envelope.maxY, 60);
      const fit = camera.fit === false ? baseZoom : Math.min(baseZoom * 1.15, (width / 2 - padding) / maxSide, (height - padding * 2) / (top + bottom));
      const zoom = fit * (camera.zoom || 1), origin = { x: width / 2 + (camera.x || 0) * baseZoom, y: padding + top * fit + (camera.y || 0) * baseZoom };
      const metrics = { activeLayers: sample.activeLayers.length, particles: sample.particleCount, drawCalls: 0, meshTriangles: 0, skippedDegenerateTriangles: 0, materialBackend: materials.backend, materialBridge: materials.bridge, materialSamples: [], compositor, bounds, envelope: { ...envelope }, origin, zoom, missingAssets: [] };
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
      background(ctx, width, height, options.background ?? '#111727', options.grid !== false, origin, zoom);
      ctx.translate(origin.x, origin.y); ctx.scale(zoom * project.controls.size, zoom * project.controls.size);
      paint(project, sample, images, metrics);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      metrics.materialBackend = materials.backend;
      metrics.materialBridge = materials.bridge;
      return metrics;
    },
    dispose() { materials.dispose(); tinted.clear(); disposed = true; },
  };
}

/** Host-owned scene adapter: no preview background, camera or whole-frame state reset. */
export function createLogicalRenderer(ctx, options = {}) {
  const renderer = createRenderer(ctx.canvas, { ...options, context: ctx });
  return { draw: renderer.draw, dispose: renderer.dispose };
}
