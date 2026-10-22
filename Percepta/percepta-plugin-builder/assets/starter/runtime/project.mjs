/** EasyVFX's portable, data-only project model. All times are seconds; pivots are normalized. */
export const FORMAT = 'easyvfx.project';
export const VERSION = '1.0.0';
export const KINDS = ['sprite', 'flipbook', 'particles', 'ring', 'halo', 'ribbon', 'material'];
const clone = value => JSON.parse(JSON.stringify(value));
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const fail = message => { throw new Error(`Invalid EasyVFX project: ${message}`); };
const number = (value, label, min, max) => {
  if (!Number.isFinite(value) || value < min || value > max) fail(`${label} must be ${min}…${max}`);
};
const text = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.length || value.length > max) fail(`${label} must be a nonempty string`);
};

export function collectAssetIds(project) {
  const ids = new Set();
  for (const layer of project.layers || []) {
    if (layer.assetId) ids.add(layer.assetId);
    for (const frame of layer.frames || []) if (frame.assetId) ids.add(frame.assetId);
    for (const key of ['mainAssetId', 'maskAssetId', 'noiseAssetId', 'rampAssetId']) {
      if (layer.material?.[key]) ids.add(layer.material[key]);
    }
  }
  return [...ids];
}

export function assertProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) fail('expected an object');
  if (project.format !== FORMAT || project.version !== VERSION) fail('unsupported format/version');
  text(project.id, 'id'); text(project.name, 'name'); text(project.preset, 'preset');
  number(project.seed, 'seed', 0, 4294967295);
  if (!Number.isInteger(project.seed)) fail('seed must be an integer');
  number(project.duration, 'duration', 0.1, 60);
  if (typeof project.loop !== 'boolean') fail('loop must be boolean');
  const control = project.controls;
  if (!control || !/^#[0-9a-f]{6}$/i.test(control.color)) fail('controls.color must be #rrggbb');
  number(control.size, 'controls.size', 0.1, 4);
  number(control.intensity, 'controls.intensity', 0.05, 4);
  if (!Array.isArray(project.assets) || project.assets.length > 256) fail('assets must be an array of at most 256 items');
  if (!Array.isArray(project.layers) || project.layers.length > 128) fail('layers must be an array of at most 128 items');
  const ids = new Set();
  let decodedBytes = 0;
  for (const asset of project.assets) {
    text(asset.id, 'asset.id'); text(asset.name, 'asset.name', 512); text(asset.src, 'asset.src', 23000000);
    if (ids.has(asset.id)) fail(`duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    // Data images and relative paths work in the editor and in exported standalone players.
    if (!/^(?:data:image\/(?:png|jpeg|webp);base64,|(?:\.\/)?assets\/)/i.test(asset.src)) fail(`unsafe asset source ${asset.id}`);
    if (asset.src.includes('..') && !asset.src.startsWith('data:')) fail(`asset path escapes assets: ${asset.id}`);
    number(asset.width, 'asset.width', 1, 4096); number(asset.height, 'asset.height', 1, 4096);
    if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height)) fail('image dimensions must be integer pixels');
    decodedBytes += asset.width * asset.height * 4;
    if (decodedBytes > 128 * 1024 * 1024) fail('decoded images exceed 128 MiB');
    if (asset.pivot) { number(asset.pivot.x, 'pivot.x', 0, 1); number(asset.pivot.y, 'pivot.y', 0, 1); }
  }
  const layerIds = new Set();
  for (const layer of project.layers) {
    text(layer.id, 'layer.id'); text(layer.name, 'layer.name');
    if (layerIds.has(layer.id)) fail(`duplicate layer id ${layer.id}`);
    layerIds.add(layer.id);
    if (!KINDS.includes(layer.kind)) fail(`unknown layer kind ${layer.kind}`);
    number(layer.start, 'layer.start', 0, project.duration);
    number(layer.end, 'layer.end', 0, project.duration);
    if (layer.end <= layer.start) fail(`layer ${layer.id} ends before it starts`);
    for (const key of ['x', 'y']) number(layer[key], `layer.${key}`, -10000, 10000);
    for (const key of ['width', 'height']) number(layer[key], `layer.${key}`, 0.1, 8192);
    if (layer.rotation !== undefined) number(layer.rotation, 'layer.rotation', -1000, 1000);
    if (layer.opacity !== undefined) number(layer.opacity, 'layer.opacity', 0, 1);
    if (layer.enabled !== undefined && typeof layer.enabled !== 'boolean') fail('layer.enabled must be boolean');
    if (layer.blend !== undefined && !['normal', 'add'].includes(layer.blend)) fail('blend must be normal or add');
    if (layer.color !== undefined && !/^#[0-9a-f]{6}$/i.test(layer.color)) fail('layer.color must be #rrggbb');
    for (const key of ['fadeIn', 'fadeOut']) if (layer[key] !== undefined) number(layer[key], `layer.${key}`, 0, 60);
    for (const [name, points] of Object.entries(layer.curves || {})) {
      if (!['scale', 'opacity', 'rotation', 'dissolve', 'width', 'height'].includes(name)) fail(`unknown curve ${name}`);
      if (!Array.isArray(points) || points.length < 2 || points.length > 128) fail(`invalid ${name} curve`);
      let last = -1;
      for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2) fail('curve points must be [time, value]');
        number(point[0], 'curve time', 0, 1); number(point[1], 'curve value', -100, 100);
        if (point[0] < last) fail('curve times must ascend');
        last = point[0];
      }
    }
    if (layer.kind === 'sprite' && !layer.assetId) fail('sprite requires an assetId');
    if (layer.kind === 'flipbook') {
      if (!Array.isArray(layer.frames) || !layer.frames.length || layer.frames.length > 256) fail('flipbook requires 1…256 frames');
      for (const frame of layer.frames) {
        text(frame.assetId, 'frame.assetId'); number(frame.duration, 'frame.duration', 0.001, 60);
        if (frame.pivot) { number(frame.pivot.x, 'frame.pivot.x', 0, 1); number(frame.pivot.y, 'frame.pivot.y', 0, 1); }
      }
    }
    if (layer.particle) {
      for (const [key, min, max] of [['count', 1, 256], ['speed', 0, 3000], ['spread', 0, Math.PI * 2], ['angle', -100, 100], ['gravity', -3000, 3000], ['drag', 0, 20], ['life', 0.03, 15], ['emitDuration', 0, 60], ['size', 0.5, 300], ['seedOffset', 0, 1000000]]) {
        if (layer.particle[key] !== undefined) number(layer.particle[key], `particle.${key}`, min, max);
      }
      if (layer.particle.count !== undefined && !Number.isInteger(layer.particle.count)) fail('particle count must be integer');
    }
    if (layer.ribbon) {
      for (const [key, min, max] of [['radius', 1, 2000], ['sweep', -Math.PI * 4, Math.PI * 4], ['thickness', 1, 1000], ['tilt', 0.05, 1], ['scroll', -10, 10], ['dissolve', 0, 1]]) {
        if (layer.ribbon[key] !== undefined) number(layer.ribbon[key], `ribbon.${key}`, min, max);
      }
    }
    if (layer.material) {
      for (const [key, min, max] of [['distortion', 0, 0.5], ['dissolve', 0, 1], ['glow', 0, 3], ['repeat', 0.1, 12]]) {
        if (layer.material[key] !== undefined) number(layer.material[key], `material.${key}`, min, max);
      }
      if (layer.material.scroll) {
        if (!Array.isArray(layer.material.scroll) || layer.material.scroll.length !== 2) fail('material.scroll must be [x,y]');
        layer.material.scroll.forEach(value => number(value, 'material.scroll', -10, 10));
      }
    }
  }
  for (const id of collectAssetIds(project)) if (!ids.has(id)) fail(`missing referenced asset ${id}`);
  return project;
}

export function curveAt(points, u, fallback = 1) {
  if (!points?.length) return fallback;
  if (u <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (u <= b[0]) return a[1] + (b[1] - a[1]) * ((u - a[0]) / (b[0] - a[0] || 1));
  }
  return points.at(-1)[1];
}

/** Stateless random numbers allow seeking and exports to reproduce exactly the same burst. */
export function randomAt(seed, index, channel = 0) {
  let x = (seed ^ Math.imul(index + 1, 374761393) ^ Math.imul(channel + 1, 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function layerHash(id) {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function sampleProject(project, time) {
  const t = Number.isFinite(time) ? clamp(time, 0, project.duration) : 0;
  const activeLayers = [];
  let particleCount = 0;
  for (const layer of project.layers) {
    if (layer.enabled === false || t < layer.start || t >= layer.end) continue;
    const age = t - layer.start, life = layer.end - layer.start, progress = age / life;
    const fade = Math.min(1, layer.fadeIn ? age / layer.fadeIn : 1, layer.fadeOut ? (life - age) / layer.fadeOut : 1);
    const result = {
      id: layer.id, kind: layer.kind, age, progress,
      opacity: clamp((layer.opacity ?? 1) * fade * curveAt(layer.curves?.opacity, progress)),
      scale: Math.max(0, curveAt(layer.curves?.scale, progress)),
      rotation: (layer.rotation || 0) + curveAt(layer.curves?.rotation, progress, 0),
      dissolve: clamp(curveAt(layer.curves?.dissolve, progress, layer.material?.dissolve || 0)),
      width: layer.width * curveAt(layer.curves?.width, progress),
      height: layer.height * curveAt(layer.curves?.height, progress),
      assetId: layer.assetId || null,
    };
    if (layer.kind === 'flipbook') {
      const total = layer.frames.reduce((sum, frame) => sum + frame.duration, 0);
      let frameTime = layer.loopFrames ? age % total : Math.min(age, total - 1e-8);
      result.frameIndex = 0;
      for (let i = 0; i < layer.frames.length; i++) {
        if (frameTime < layer.frames[i].duration || i === layer.frames.length - 1) { result.frameIndex = i; break; }
        frameTime -= layer.frames[i].duration;
      }
      result.assetId = layer.frames[result.frameIndex].assetId;
      result.pivot = layer.frames[result.frameIndex].pivot;
    }
    if (layer.kind === 'particles') {
      const config = layer.particle || {}, seed = (project.seed ^ layerHash(layer.id) ^ (config.seedOffset || 0)) >>> 0;
      const count = Math.min(256, Math.max(1, Math.round((config.count || 32) * project.controls.intensity))), duration = config.emitDuration || 0;
      result.particles = [];
      for (let i = 0; i < count; i++) {
        const birth = duration * randomAt(seed, i, 0), particleAge = age - birth;
        const particleLife = (config.life || 0.7) * (0.65 + randomAt(seed, i, 1) * 0.7);
        if (particleAge < 0 || particleAge >= particleLife) continue;
        const u = particleAge / particleLife, angle = (config.angle ?? -Math.PI / 2) + (randomAt(seed, i, 2) - 0.5) * (config.spread ?? Math.PI * 2);
        const speed = (config.speed ?? 300) * Math.sqrt(project.controls.intensity) * (0.35 + randomAt(seed, i, 3) * 0.8);
        const drag = config.drag || 0, travel = drag ? (1 - Math.exp(-drag * particleAge)) / drag : particleAge;
        result.particles.push({
          index: i, x: Math.cos(angle) * speed * travel,
          y: Math.sin(angle) * speed * travel + (config.gravity || 0) * particleAge * particleAge / 2,
          size: (config.size || 8) * (0.6 + randomAt(seed, i, 4) * 0.8) * (1 - u * 0.6),
          opacity: Math.min(1, particleAge / 0.025) * (1 - u) ** 0.7,
          rotation: angle, stretch: 1 + speed / 220 * (1 - u), progress: u,
        });
      }
      particleCount += result.particles.length;
    }
    activeLayers.push(result);
  }
  const size = project.controls.size;
  const visible = activeLayers.map(sample => ({ layer: project.layers.find(layer => layer.id === sample.id), sample }));
  const bounds = visible.reduce((b, { layer, sample }) => {
    const half = Math.max(sample.width, sample.height) * sample.scale * 0.65;
    b.minX = Math.min(b.minX, (layer.x - half) * size); b.maxX = Math.max(b.maxX, (layer.x + half) * size);
    b.minY = Math.min(b.minY, (layer.y - half) * size); b.maxY = Math.max(b.maxY, (layer.y + half) * size);
    for (const p of sample.particles || []) {
      b.minX = Math.min(b.minX, (layer.x + p.x - p.size) * size); b.maxX = Math.max(b.maxX, (layer.x + p.x + p.size) * size);
      b.minY = Math.min(b.minY, (layer.y + p.y - p.size) * size); b.maxY = Math.max(b.maxY, (layer.y + p.y + p.size) * size);
    }
    return b;
  }, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  return { time: t, activeLayers, particleCount, bounds };
}

export function retimeProject(project, duration) {
  number(duration, 'duration', 0.1, 60);
  const next = clone(project), ratio = duration / project.duration;
  next.duration = duration;
  for (const layer of next.layers) {
    layer.start *= ratio; layer.end *= ratio;
    if (layer.fadeIn) layer.fadeIn *= ratio;
    if (layer.fadeOut) layer.fadeOut *= ratio;
    for (const frame of layer.frames || []) frame.duration *= ratio;
    if (layer.particle?.life) layer.particle.life = clamp(layer.particle.life * ratio, 0.03, 15);
    if (layer.particle?.emitDuration) layer.particle.emitDuration *= ratio;
  }
  return assertProject(next);
}

export function duplicateLayer(project, id) {
  const next = clone(project), source = next.layers.find(layer => layer.id === id);
  if (!source) throw new Error(`Unknown layer: ${id}`);
  let suffix = 2;
  while (next.layers.some(layer => layer.id === `${id}-${suffix}`)) suffix++;
  const copy = { ...clone(source), id: `${id}-${suffix}`, name: `${source.name} copy` };
  next.layers.splice(next.layers.indexOf(source) + 1, 0, copy);
  return assertProject(next);
}

const curve = { scale: [[0, 0.2], [0.12, 1.15], [0.3, 1], [1, 1.35]], opacity: [[0, 0], [0.04, 1], [0.65, 1], [1, 0]] };
function layer(id, name, kind, start, end, width, height, extra = {}) {
  return { id, name, kind, enabled: true, start, end, x: 0, y: 0, width, height, rotation: 0, blend: 'add', opacity: 1, color: '#ffffff', fadeIn: 0.015, fadeOut: 0.1, ...extra };
}

export function createProject(presetId = 'impact', library = {}) {
  const allAssets = Array.isArray(library) ? library : library.assets || [];
  const clips = library.clips || [];
  const impact = clips.find?.(clip => clip.id === 'nightcamp.goods-boom') || clips['nightcamp.goods-boom'];
  const impactFrames = impact?.frames?.map(frame => ({ assetId: frame.assetId || frame.id, duration: frame.duration ?? (frame.durationMs ? frame.durationMs / 1000 : 0.06), ...(frame.pivot ? { pivot: frame.pivot } : {}) })) || allAssets.filter(asset => asset.id.startsWith('nightcamp.goods-boom.frame-')).map(asset => ({ assetId: asset.id, duration: asset.duration || 0.06, pivot: asset.pivot }));
  const project = { format: FORMAT, version: VERSION, id: `easyvfx-${presetId}`, name: { impact: 'Solar Impact', slash: 'Ember Crescent', pillar: 'Inferno Pillar' }[presetId] || 'Untitled effect', preset: presetId, seed: 92471, duration: 2.4, loop: true, controls: { color: '#ff9c36', size: 1, intensity: 1 }, assets: [], layers: [] };
  if (presetId === 'blank') {
    project.name = 'เอฟเฟกต์ใหม่';
  } else if (presetId === 'impact') {
    project.layers = [
      layer('impact-halo', 'Ground light', 'halo', 0, 1.25, 520, 180, { y: -4, opacity: 0.65, curves: curve }),
      layer('impact-ring', 'Expanding shockwave', 'ring', 0.04, 0.72, 460, 190, { y: -6, curves: { scale: [[0, 0.12], [0.3, 0.7], [1, 1.6]], opacity: [[0, 1], [0.55, 0.65], [1, 0]] } }),
      layer('impact-after-ring', 'Secondary shockwave', 'ring', 0.15, 1, 390, 150, { y: -5, opacity: 0.5, curves: { scale: [[0, 0.15], [1, 1.7]] } }),
      layer('impact-flash', 'White hot flash', 'halo', 0.03, 0.27, 360, 360, { y: -100, opacity: 0.9, color: '#fff6e5', curves: { scale: [[0, 0.3], [0.2, 1.3], [1, 0.6]] } }),
      ...(impactFrames.length ? [layer('impact-flipbook', 'Painted explosion · 12 frames', 'flipbook', 0.04, 0.04 + impactFrames.reduce((sum, frame) => sum + frame.duration, 0), 420, 420, { y: -50, frames: impactFrames, blend: impact?.source?.metadata?.solid ? 'normal' : 'add', fadeIn: 0, fadeOut: 0.08, opacity: 1, curves: { scale: [[0, 0.85], [0.2, 1], [1, 1.15]] } })] : []),
      layer('impact-sparks', 'Radial sparks', 'particles', 0.08, 1.9, 30, 30, { y: -90, particle: { count: 86, speed: 700, spread: Math.PI * 2, gravity: 340, drag: 2.1, life: 1.1, emitDuration: 0.06, size: 4 } }),
      layer('impact-embers', 'Rising embers', 'particles', 0.2, 2.3, 30, 30, { y: -45, particle: { count: 46, speed: 180, spread: 2, angle: -Math.PI / 2, gravity: -45, drag: 0.6, life: 1.5, emitDuration: 0.35, size: 3 } }),
    ];
  } else if (presetId === 'slash') {
    project.layers = [
      layer('slash-ground', 'Ground reflection', 'halo', 0.04, 1.1, 600, 140, { y: 0, opacity: 0.25, curves: curve }),
      layer('slash-arc', 'Textured crescent mesh', 'ribbon', 0.02, 0.95, 560, 340, { y: -105, assetId: 'nightcamp.strip-ember', ribbon: { radius: 225, sweep: 4.6, thickness: 88, tilt: 0.58, scroll: 0.35, dissolve: 0.7 }, curves: { opacity: [[0, 0], [0.05, 1], [0.6, 1], [1, 0]], dissolve: [[0, 0], [0.5, 0.04], [1, 1]] } }),
      layer('slash-echo', 'Delayed echo arc', 'ribbon', 0.12, 1.15, 510, 290, { y: -108, opacity: 0.32, rotation: -0.12, assetId: 'nightcamp.strip-ember', ribbon: { radius: 207, sweep: 4.6, thickness: 42, tilt: 0.58, scroll: -0.2, dissolve: 0.8 } }),
      layer('slash-hotspot', 'Strike flash', 'halo', 0.16, 0.47, 170, 170, { x: 180, y: -100, color: '#fff1d4', opacity: 0.75, curves: curve }),
      layer('slash-sparks', 'Cutting sparks', 'particles', 0.12, 1.7, 25, 25, { x: 80, y: -90, particle: { count: 64, speed: 570, spread: 1.8, angle: -0.45, gravity: 350, drag: 1.5, life: 0.9, emitDuration: 0.12, size: 3.5 } }),
      layer('slash-ring', 'Ground pressure', 'ring', 0.15, 0.85, 400, 140, { y: 0, opacity: 0.4, curves: { scale: [[0, 0.4], [1, 1.4]] } }),
    ];
  } else if (presetId === 'pillar') {
    const material = { mainAssetId: 'nightcamp.noise-b', noiseAssetId: 'nightcamp.noise-a', maskAssetId: 'nightcamp.column', rampAssetId: 'nightcamp.ramp-fire', scroll: [0.04, 1.8], distortion: 0.1, dissolve: 0, glow: 0.45, repeat: 1.4 };
    project.layers = [
      layer('pillar-ground', 'Lava ground glow', 'halo', 0, 2, 520, 180, { y: 0, opacity: 0.7, curves: curve }),
      layer('pillar-ring', 'Fire shockwave', 'ring', 0.04, 0.85, 450, 160, { y: -3, curves: { scale: [[0, 0.2], [0.4, 1], [1, 1.6]] } }),
      layer('pillar-body', 'Distorted fire body', 'material', 0.04, 1.85, 240, 520, { y: 0, material: { ...material, scroll: [-0.02, 1.25], distortion: 0.14 }, opacity: 0.7, curves: { scale: [[0, 0.15], [0.12, 1.1], [0.3, 1], [1, 0.95]], dissolve: [[0, 0], [0.5, 0.05], [1, 1]] } }),
      layer('pillar-core', 'White hot rising core', 'material', 0.02, 1.6, 150, 560, { y: 0, material, curves: { scale: [[0, 0.1], [0.15, 1.1], [0.32, 1], [1, 0.9]], dissolve: [[0, 0], [0.45, 0.02], [1, 1]] } }),
      layer('pillar-left', 'Left flame tongue', 'material', 0.16, 1.7, 110, 330, { x: -100, y: 0, rotation: -0.15, material: { ...material, maskAssetId: 'nightcamp.tongue', mainAssetId: 'nightcamp.noise-a', scroll: [0.1, 1.3] }, curves: { scale: [[0, 0.1], [0.2, 1], [1, 0.7]], dissolve: [[0, 0], [0.55, 0], [1, 1]] } }),
      layer('pillar-right', 'Right flame tongue', 'material', 0.23, 1.85, 100, 370, { x: 100, y: 0, rotation: 0.12, material: { ...material, maskAssetId: 'nightcamp.tongue', scroll: [-0.1, 1.7] }, curves: { scale: [[0, 0.1], [0.2, 1], [1, 0.7]], dissolve: [[0, 0], [0.5, 0], [1, 1]] } }),
      layer('pillar-flare', 'Ignition flash', 'halo', 0.02, 0.35, 360, 360, { y: -35, opacity: 0.8, color: '#fff6d9', curves: { scale: [[0, 0.2], [0.3, 1.1], [1, 1.5]] } }),
      layer('pillar-embers', 'Upward ember fountain', 'particles', 0.1, 2.35, 20, 20, { y: -25, particle: { count: 90, speed: 560, spread: 1.1, angle: -Math.PI / 2, gravity: -30, drag: 1.4, life: 1.4, emitDuration: 0.7, size: 3.5 } }),
    ];
  } else throw new Error(`Unknown EasyVFX preset: ${presetId}`);
  const used = new Set(collectAssetIds(project));
  project.assets = clone(allAssets.filter(asset => used.has(asset.id)));
  return assertProject(project);
}

/** Add editable accents around the user's main asset without replacing it. */
export function autoCompose(project, style = 'impact') {
  const next = clone(project), main = next.layers.find(item => ['sprite', 'flipbook', 'material', 'ribbon'].includes(item.kind));
  const start = main?.start || 0, life = Math.max(0.1, next.duration - start), end = start + Math.min(life, 1.5);
  const x = main?.x || 0, y = main?.y || 0;
  const scale = Math.min(2, Math.max(0.4, (main?.width || 320) / 320));
  const id = suffix => {
    let name = `compose-${suffix}`, i = 2;
    while (next.layers.some(item => item.id === name)) name = `compose-${suffix}-${i++}`;
    return name;
  };
  const accents = [
    layer(id('ground'), 'Composed ground light', 'halo', start, end, 430 * scale, 150 * scale, { x, y, opacity: 0.45, curves: curve }),
    layer(id('ring'), 'Composed shockwave', 'ring', start, start + Math.min(life, 0.8), 370 * scale, 150 * scale, { x, y, opacity: 0.7, curves: { scale: [[0, 0.2], [1, 1.5]] } }),
    layer(id('sparks'), 'Composed spark burst', 'particles', start, end, 20, 20, { x, y: y - 40 * scale, particle: { count: 48, speed: 430 * scale, spread: style === 'pillar' ? 1.2 : Math.PI * 2, angle: -Math.PI / 2, gravity: style === 'pillar' ? -30 : 260, drag: 1.7, life: Math.max(0.03, Math.min(life, 0.9)), emitDuration: Math.min(life * 0.1, 0.1), size: 3.5 * scale } }),
  ];
  next.layers = [accents[0], accents[1], ...next.layers, accents[2]];
  return assertProject(next);
}
