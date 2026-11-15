import * as THREE from 'three';

/**
 * Procedural facial expression CanvasTexture manager.
 * Renders eyes, lashes, brows, blush, nose dot, and mouth onto a transparent 512x512 canvas.
 */
export class FaceTextureController {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.currentExpr = 'normal';
    this.currentBlush = 0;
    this.render('normal', 0);
  }

  /**
   * Redraw facial features if expression or blush intensity changed meaningfully.
   */
  update(expr, blushBoost = 0) {
    const quantizedBlush = Math.round(blushBoost * 20) / 20;
    if (expr === this.currentExpr && quantizedBlush === this.currentBlush) {
      return;
    }
    this.render(expr, quantizedBlush);
  }

  render(expr, blushBoost = 0) {
    this.currentExpr = expr;
    this.currentBlush = blushBoost;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle cheek blush under both eyes (stronger on kiss or tap reaction)
    const baseBlush = expr === 'kiss' ? 0.82 : 0.56;
    const blushAlpha = Math.min(0.96, baseBlush + blushBoost * 0.4);
    this.#drawCheekBlush(ctx, w * 0.215, h * 0.695, 56, 26, blushAlpha);
    this.#drawCheekBlush(ctx, w * 0.785, h * 0.695, 56, 26, blushAlpha);

    // Large chibi eyes & eyebrows
    const eyeY = h * 0.525;
    const leftEyeX = w * 0.275;
    const rightEyeX = w * 0.725;

    this.#drawEyebrow(ctx, leftEyeX, h * 0.30, -1, expr);
    this.#drawEyebrow(ctx, rightEyeX, h * 0.30, 1, expr);

    if (expr === 'blink') {
      this.#drawClosedEye(ctx, leftEyeX, eyeY + 14, -1);
      this.#drawClosedEye(ctx, rightEyeX, eyeY + 14, 1);
    } else if (expr === 'half' || expr === 'kiss') {
      this.#drawHalfEye(ctx, leftEyeX, eyeY, -1);
      this.#drawHalfEye(ctx, rightEyeX, eyeY, 1);
    } else {
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1);
      this.#drawOpenEye(ctx, rightEyeX, eyeY, 1);
    }

    // Tiny chibi nose highlight dot (matches bunny_01.png)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 248, 240, 0.92)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.655, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mouth
    this.#drawMouth(ctx, w * 0.5, h * 0.775, expr);

    this.texture.needsUpdate = true;
  }

  #drawCheekBlush(ctx, cx, cy, rx, ry, alpha) {
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, 3, cx, cy, rx);
    grad.addColorStop(0, `rgba(236, 114, 96, ${alpha})`);
    grad.addColorStop(0.65, `rgba(236, 120, 102, ${alpha * 0.52})`);
    grad.addColorStop(1, 'rgba(236, 120, 102, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft anime diagonal blush lines
    ctx.strokeStyle = `rgba(218, 86, 78, ${alpha * 0.55})`;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i * 13;
      ctx.beginPath();
      ctx.moveTo(ox - 5, cy + 6);
      ctx.lineTo(ox + 5, cy - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawEyebrow(ctx, cx, cy, side, expr) {
    ctx.save();
    ctx.strokeStyle = '#3d1909';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    const lift = expr === 'half' || expr === 'kiss' ? 5 : 0;
    ctx.beginPath();
    ctx.moveTo(cx - side * 38, cy + 7 + lift);
    ctx.quadraticCurveTo(cx + side * 4, cy - 12 + lift, cx + side * 42, cy + 6 + lift);
    ctx.stroke();
    ctx.restore();
  }

  #drawOpenEye(ctx, cx, cy, side) {
    const rx = 72;
    const ry = 76;

    ctx.save();
    // Sclera base
    ctx.fillStyle = '#fffdf9';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // Clip iris inside sclera
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx - 3, ry * 0.90, 0, 0, Math.PI * 2);
    ctx.clip();

    // Slightly inward gaze for cute chibi look
    const irisX = cx - side * 4;
    const irisY = cy + 7;
    const irisRx = 54;
    const irisRy = 60;

    const irisGrad = ctx.createLinearGradient(irisX, irisY - irisRy, irisX, irisY + irisRy);
    irisGrad.addColorStop(0, '#2a1006');
    irisGrad.addColorStop(0.45, '#59260f');
    irisGrad.addColorStop(1, '#984c1e');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, irisRx, irisRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Warm lower iris crescent
    ctx.fillStyle = 'rgba(218, 128, 56, 0.58)';
    ctx.beginPath();
    ctx.ellipse(irisX, irisY + 29, irisRx * 0.70, irisRy * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#180703';
    ctx.beginPath();
    ctx.ellipse(irisX, irisY - 3, 25, 29, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp outer iris ring
    ctx.strokeStyle = '#230c05';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, irisRx, irisRy, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Two specular highlights (matching bunny_01.png)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(irisX - 20, irisY - 24, 17, 14.5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(irisX + 18, irisY + 24, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Upper thick eyelash + outer wing
    ctx.strokeStyle = '#1f0b05';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 4), cy - 6);
    ctx.quadraticCurveTo(cx, cy - ry - 14, cx + side * (rx + 10), cy - 11);
    ctx.stroke();

    // Outer lash flick
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 2), cy - 14);
    ctx.lineTo(cx + side * (rx + 18), cy - 30);
    ctx.stroke();

    // Delicate lower lid line
    ctx.strokeStyle = 'rgba(48, 20, 12, 0.78)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 5, rx - 4, Math.PI * 0.22, Math.PI * 0.78);
    ctx.stroke();

    ctx.restore();
  }

  #drawHalfEye(ctx, cx, cy, side) {
    const rx = 70;
    const ry = 68;
    const lidY = cy - 6;

    ctx.save();
    // Clip to lower half below the drooped upper eyelid so 3D skin shows above cleanly
    ctx.beginPath();
    ctx.moveTo(cx - rx - 16, lidY);
    ctx.quadraticCurveTo(cx, lidY + 8, cx + rx + 16, lidY);
    ctx.lineTo(cx + rx + 16, cy + ry + 16);
    ctx.lineTo(cx - rx - 16, cy + ry + 16);
    ctx.closePath();
    ctx.clip();

    // Sclera
    ctx.fillStyle = '#fffdf9';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, rx, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris + pupil
    const irisX = cx - side * 3;
    const irisY = cy + 11;
    const irisGrad = ctx.createLinearGradient(irisX, irisY - 50, irisX, irisY + 50);
    irisGrad.addColorStop(0, '#331308');
    irisGrad.addColorStop(0.55, '#6b3013');
    irisGrad.addColorStop(1, '#a05323');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, 49, 51, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#180703';
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, 22, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlights peeking under half lid
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(irisX - 16, irisY + 2, 12, 9.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(irisX + 17, irisY + 22, 6.2, 0, Math.PI * 2);
    ctx.fill();

    // Lower lid line
    ctx.strokeStyle = 'rgba(48, 20, 12, 0.8)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 8, rx - 4, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();

    ctx.restore();

    // Heavy relaxed upper lash line + outer wing (outside clip)
    ctx.save();
    ctx.strokeStyle = '#1f0b05';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 2), lidY + 2);
    ctx.quadraticCurveTo(cx, lidY + 11, cx + side * (rx + 12), lidY - 6);
    ctx.stroke();

    ctx.lineWidth = 8.5;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 4), lidY - 5);
    ctx.lineTo(cx + side * (rx + 19), lidY - 19);
    ctx.stroke();

    // Subtle eyelid fold crease above
    ctx.strokeStyle = 'rgba(130, 72, 48, 0.45)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx * 0.68), lidY - 22);
    ctx.quadraticCurveTo(cx, lidY - 28, cx + side * (rx * 0.78), lidY - 20);
    ctx.stroke();
    ctx.restore();
  }

  #drawClosedEye(ctx, cx, cy, side) {
    ctx.save();
    ctx.strokeStyle = '#1f0b05';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * 62, cy - 3);
    ctx.quadraticCurveTo(cx, cy + 24, cx + side * 64, cy - 7);
    ctx.stroke();

    // Outer eyelash tips
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx + side * 52, cy + 3);
    ctx.lineTo(cx + side * 72, cy - 12);
    ctx.stroke();

    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx + side * 42, cy + 9);
    ctx.lineTo(cx + side * 61, cy + 17);
    ctx.stroke();
    ctx.restore();
  }

  #drawMouth(ctx, cx, cy, expr) {
    ctx.save();
    if (expr === 'kiss') {
      // Cute gentle curved smile matching bunnykisshalf.png
      ctx.strokeStyle = '#5a2218';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy - 2);
      ctx.quadraticCurveTo(cx, cy + 16, cx + 22, cy - 4);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Small open happy mouth (D-shape)
    ctx.fillStyle = '#cf5c55';
    ctx.strokeStyle = '#541f16';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy - 5);
    ctx.quadraticCurveTo(cx, cy - 2, cx + 22, cy - 5);
    ctx.quadraticCurveTo(cx + 18, cy + 23, cx, cy + 23);
    ctx.quadraticCurveTo(cx - 18, cy + 23, cx - 22, cy - 5);
    ctx.closePath();
    ctx.fill();

    // Soft pink tongue inside bottom of open mouth
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#f28b82';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 17, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Procedural fishnet tights texture: warm skin tone base + crisp diagonal diamond mesh.
 */
export function createFishnetTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Warm skin tone base harmonized with skin material
  ctx.fillStyle = '#ffdcc0';
  ctx.fillRect(0, 0, size, size);

  // Seamless repeating diagonal grid
  const step = 42.6667; // divides 512 into 12 clean repeats
  ctx.strokeStyle = '#241210';
  ctx.lineWidth = 5.8;
  ctx.lineCap = 'square';

  for (let offset = -size; offset <= size * 2; offset += step) {
    // Diagonal 1
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();

    // Diagonal 2
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }

  // Tiny knot accent at intersections for crisp clarity
  ctx.fillStyle = '#1b0d0b';
  for (let y = 0; y <= size; y += step * 0.5) {
    const rowShift = Math.round(y / (step * 0.5)) % 2 === 0 ? 0 : step * 0.5;
    for (let x = rowShift; x <= size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 4.2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft circular ground contact shadow texture for the pedestal.
 */
export function createShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 12, cx, cx, cx);
  grad.addColorStop(0, 'rgba(14, 6, 28, 0.65)');
  grad.addColorStop(0.55, 'rgba(18, 8, 34, 0.36)');
  grad.addColorStop(1, 'rgba(18, 8, 34, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Cute outlined pink heart texture for the blown-kiss particle effect.
 */
export function createHeartTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(size / 2, size / 2 + 6);
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.bezierCurveTo(-48, 4, -46, -34, -20, -34);
  ctx.bezierCurveTo(-6, -34, 0, -20, 0, -14);
  ctx.bezierCurveTo(0, -20, 6, -34, 20, -34);
  ctx.bezierCurveTo(46, -34, 48, 4, 0, 34);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -34, 0, 34);
  grad.addColorStop(0, '#ff9de2');
  grad.addColorStop(1, '#e84da8');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3b152a';
  ctx.stroke();

  // Tiny shine dot
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-16, -18, 7, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
