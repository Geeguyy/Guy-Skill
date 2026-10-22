/** Original EasyVFX material runtime: texture × mask + scrolling noise + dissolve + ramp. */
const VERTEX = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position.x,-position.y,0.,1.);}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D mainTex,maskTex,noiseTex,rampTex;
uniform float time,distortion,dissolve,repeatK,polar,hasRamp;
uniform vec2 scroll;
uniform vec3 tint;
out vec4 pixel;
void main(){
  vec2 p=uv;
  if(polar>.5){vec2 c=(uv-.5)*2.;p=vec2(atan(c.y,c.x)/6.2831853+.5,length(c));}
  vec2 nUv=p*1.6+vec2(time*.13,-time*.38);
  vec2 noise=vec2(texture(noiseTex,nUv).r,texture(noiseTex,nUv+vec2(.47,.31)).r)-.5;
  vec2 warp=noise*distortion*2.*(1.-uv.y);
  vec2 mainUV=p*repeatK+scroll*time+warp;
  float value=texture(mainTex,mainUV).r;
  vec2 mUV=clamp(uv+warp*.55,0.,1.);
  float mask=texture(maskTex,mUV).r*texture(maskTex,mUV).a;
  float erosion=texture(noiseTex,p*1.7+vec2(.2,time*.08)).r;
  float keep=erosion+uv.y*.2-dissolve*1.3;
  float alive=smoothstep(-.03,.07,keep);
  float edge=(alive-smoothstep(.07,.19,keep))*step(.005,dissolve);
  float density=clamp(pow(value,1.2)*1.8,0.,1.);
  float alpha=mask*alive*smoothstep(.05,.65,density);
  vec3 ramp=texture(rampTex,vec2(clamp(density*.9+edge*.3,0.,1.),.5)).rgb;
  vec3 color=mix(tint*vec3(.35,.35,.35),tint*1.4+vec3(.22),density);
  color=mix(color,mix(ramp,color,.55),hasRamp);
  color=mix(color,vec3(1.,.98,.9),smoothstep(.8,1.,density)*.6);
  color+=edge*(tint*1.6+vec3(.15));
  pixel=vec4(color,alpha);
}`;

export function colorRGB(hex = '#ff9c36') {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  return element;
}

/** WebGL returns bottom-up straight RGBA; ImageData consumes top-down straight RGBA. */
export function flipReadbackRows(bytes, width, height, output = new Uint8ClampedArray(bytes.length)) {
  const stride = width * 4;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || bytes.length !== stride * height || output.length !== bytes.length) throw new Error('Invalid material readback dimensions');
  for (let y = 0; y < height; y++) output.set(bytes.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
  return output;
}

export function rgbaFingerprint(bytes) {
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index++) hash = Math.imul(hash ^ bytes[index], 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createMaterialRenderer({ readback = false } = {}) {
  let surface = null, gl = null, program = null, buffer = null, uniforms = {}, backend = 'canvas2d-fallback';
  const textures = new Map(), masks = new Map();
  let fallback = null, pixelCanvas = null, pixelContext = null, rawPixels = null, topDownPixels = null, imageData = null, lastSample = null;
  function init() {
    try {
      surface = canvas(256, 512);
      gl = surface.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return;
      const compile = (type, source) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['mainTex', 'maskTex', 'noiseTex', 'rampTex', 'time', 'distortion', 'dissolve', 'repeatK', 'polar', 'hasRamp', 'scroll', 'tint']) uniforms[name] = gl.getUniformLocation(program, name);
      backend = 'webgl2';
    } catch (error) {
      console.warn('EasyVFX material fallback:', error.message);
      gl = null; backend = 'canvas2d-fallback';
    }
  }
  init();

  function texture(image, repeat = true) {
    let variants = textures.get(image);
    if (!variants) { variants = new Map(); textures.set(image, variants); }
    if (variants.has(repeat)) return variants.get(repeat);
    const value = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, value);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    variants.set(repeat, value);
    return value;
  }
  function alphaMask(image) {
    if (masks.has(image)) return masks.get(image);
    const mask = canvas(image.naturalWidth || image.width, image.naturalHeight || image.height), ctx = mask.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index + 3] *= pixels.data[index] / 255;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
    }
    ctx.putImageData(pixels, 0, 0); masks.set(image, mask);
    return mask;
  }
  function drawFallback(ctx, layer, frame, images, color) {
    const material = layer.material || {}, main = images.get(material.mainAssetId), mask = images.get(material.maskAssetId);
    if (!main || !mask) return false;
    if (!fallback) fallback = canvas(256, 512);
    const fc = fallback.getContext('2d'), width = fallback.width, height = fallback.height;
    fc.clearRect(0, 0, width, height);
    fc.globalCompositeOperation = 'source-over';
    const shiftX = ((frame.age * (material.scroll?.[0] || 0)) % 1) * width;
    const shiftY = ((frame.age * (material.scroll?.[1] || 1)) % 1) * height;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) fc.drawImage(main, shiftX + x * width, shiftY + y * height, width, height);
    fc.globalCompositeOperation = 'destination-in'; fc.drawImage(alphaMask(mask), 0, 0, width, height);
    fc.globalCompositeOperation = 'source-atop';
    const gradient = fc.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#fff9d0'); gradient.addColorStop(0.35, color); gradient.addColorStop(1, color);
    fc.globalAlpha = 0.8; fc.fillStyle = gradient; fc.fillRect(0, 0, width, height); fc.globalAlpha = 1;
    const dissolve = frame.dissolve;
    if (dissolve > 0) {
      fc.globalCompositeOperation = 'destination-out';
      fc.fillStyle = '#000'; fc.fillRect(0, 0, width, height * dissolve);
    }
    fc.globalCompositeOperation = 'source-over';
    const w = frame.width, h = frame.height;
    ctx.drawImage(fallback, -w / 2, -h, w, h);
    return true;
  }

  function readbackSurface(width, height, layer, frame) {
    if (!pixelCanvas) { pixelCanvas = canvas(width, height); pixelContext = pixelCanvas.getContext('2d', { alpha: true, willReadFrequently: true }); }
    if (pixelCanvas.width !== width || pixelCanvas.height !== height) { pixelCanvas.width = width; pixelCanvas.height = height; }
    if (!imageData || imageData.width !== width || imageData.height !== height) {
      rawPixels = new Uint8Array(width * height * 4); topDownPixels = new Uint8ClampedArray(rawPixels.length);
      imageData = new ImageData(topDownPixels, width, height);
    }
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rawPixels);
    flipReadbackRows(rawPixels, width, height, topDownPixels);
    pixelContext.putImageData(imageData, 0, 0);
    lastSample = { layerId: layer.id, width, height, age: frame.age, rawRGBAHash: rgbaFingerprint(rawPixels) };
    return pixelCanvas;
  }

  return {
    get backend() { return backend; },
    get bridge() { return backend === 'webgl2' ? readback ? 'rgba-readback' : 'direct-webgl' : 'canvas2d-fallback'; },
    get lastSample() { return lastSample; },
    draw(ctx, layer, frame, images, color) {
      lastSample = null;
      if (!gl || gl.isContextLost()) { backend = 'canvas2d-fallback'; return drawFallback(ctx, layer, frame, images, color); }
      const material = layer.material || {};
      const main = images.get(material.mainAssetId), mask = images.get(material.maskAssetId), noise = images.get(material.noiseAssetId) || main, ramp = images.get(material.rampAssetId) || main;
      if (!main || !mask || !noise) return false;
      const width = Math.min(1024, Math.max(64, Math.ceil(frame.width))), height = Math.min(1024, Math.max(64, Math.ceil(frame.height)));
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      [main, mask, noise, ramp].forEach((image, index) => { gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture(image, index === 0 || index === 2)); });
      ['mainTex', 'maskTex', 'noiseTex', 'rampTex'].forEach((key, index) => gl.uniform1i(uniforms[key], index));
      gl.uniform1f(uniforms.time, frame.age);
      gl.uniform1f(uniforms.distortion, material.distortion ?? 0.08);
      gl.uniform1f(uniforms.dissolve, frame.dissolve);
      gl.uniform1f(uniforms.repeatK, material.repeat || 1);
      gl.uniform1f(uniforms.polar, material.polar ? 1 : 0);
      gl.uniform1f(uniforms.hasRamp, material.rampAssetId ? 1 : 0);
      gl.uniform2f(uniforms.scroll, ...(material.scroll || [0, 1]));
      gl.uniform3f(uniforms.tint, ...colorRGB(color));
      gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 6);
      // Fixed PNG/readback mode avoids mixing a live GPU canvas with CPU Canvas2D accents.
      const source = readback ? readbackSurface(width, height, layer, frame) : surface;
      const w = frame.width, h = frame.height;
      if (material.glow > 0) {
        ctx.save(); ctx.globalAlpha *= material.glow * 0.36; ctx.filter = 'blur(13px)';
        ctx.drawImage(source, -w * 0.58, -h * 1.02, w * 1.16, h * 1.04); ctx.restore();
      }
      ctx.drawImage(source, -w / 2, -h, w, h);
      return true;
    },
    dispose() {
      if (gl) {
        for (const variants of textures.values()) for (const value of variants.values()) gl.deleteTexture(value);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      textures.clear(); masks.clear(); gl = null; surface = null; fallback = null;
      pixelCanvas = pixelContext = rawPixels = topDownPixels = imageData = lastSample = null;
    },
  };
}
