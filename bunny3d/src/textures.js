import * as THREE from 'three';

/**
 * Procedural facial expression CanvasTexture manager.
 * Renders oversized sparkling chibi eyes, lashes, soft brows, blush, nose dot, and mouth.
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

    // Clearer, warmer pastel cheek blush under the eyes
    const baseBlush = expr === 'kiss' ? 0.88 : 0.72;
    const blushAlpha = Math.min(0.98, baseBlush + blushBoost * 0.28);
    this.#drawCheekBlush(ctx, w * 0.20, h * 0.695, 72, 30, blushAlpha);
    this.#drawCheekBlush(ctx, w * 0.80, h * 0.695, 72, 30, blushAlpha);

    // Large tall chibi eyes placed low and slightly wide-set
    const eyeY = h * 0.545;
    const leftEyeX = w * 0.255;
    const rightEyeX = w * 0.745;

    // Gentle slightly-drooped friendly eyebrows (少し困り眉気味の優しい弧)
    this.#drawEyebrow(ctx, leftEyeX, h * 0.285, -1, expr);
    this.#drawEyebrow(ctx, rightEyeX, h * 0.285, 1, expr);

    if (expr === 'blink') {
      // にっこり閉じ目（∩の弧）
      this.#drawHappyClosedEye(ctx, leftEyeX, eyeY + 10, -1);
      this.#drawHappyClosedEye(ctx, rightEyeX, eyeY + 10, 1);
    } else if (expr === 'half') {
      this.#drawHalfEye(ctx, leftEyeX, eyeY, -1);
      this.#drawHalfEye(ctx, rightEyeX, eyeY, 1);
    } else if (expr === 'kiss') {
      // 片目ウインク（左目ウインク＋右目キラキラ開き目）
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1);
      this.#drawWinkEye(ctx, rightEyeX, eyeY + 8, 1);
    } else {
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1);
      this.#drawOpenEye(ctx, rightEyeX, eyeY, 1);
    }

    // Barely-there tiny nose dot
    ctx.save();
    ctx.fillStyle = 'rgba(255, 245, 238, 0.72)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.675, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mouth centered naturally in lower face
    this.#drawMouth(ctx, w * 0.5, h * 0.785, expr);

    this.texture.needsUpdate = true;
  }

  #drawCheekBlush(ctx, cx, cy, rx, ry, alpha) {
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, rx);
    grad.addColorStop(0, `rgba(246, 110, 106, ${alpha})`);
    grad.addColorStop(0.62, `rgba(246, 122, 118, ${alpha * 0.58})`);
    grad.addColorStop(1, 'rgba(246, 122, 118, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft diagonal blush strokes
    ctx.strokeStyle = `rgba(224, 86, 84, ${alpha * 0.42})`;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i * 15;
      ctx.beginPath();
      ctx.moveTo(ox - 5, cy + 6);
      ctx.lineTo(ox + 5, cy - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawEyebrow(ctx, cx, cy, side, expr) {
    ctx.save();
    ctx.strokeStyle = '#522814';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    const softDip = expr === 'half' || expr === 'kiss' ? 5 : 0;
    // Inner end gently lifted, outer end softly tapering down (優しい困り眉弧)
    ctx.beginPath();
    ctx.moveTo(cx - side * 38, cy + 1 + softDip);
    ctx.quadraticCurveTo(cx + side * 2, cy - 9 + softDip, cx + side * 42, cy + 10 + softDip);
    ctx.stroke();
    ctx.restore();
  }

  #drawSparklingIris(ctx, irisX, irisY, irisRx, irisRy) {
    // Deep chocolate top -> bright amber bottom gradient
    const irisGrad = ctx.createLinearGradient(irisX, irisY - irisRy, irisX, irisY + irisRy);
    irisGrad.addColorStop(0, '#2a1005');
    irisGrad.addColorStop(0.42, '#692d11');
    irisGrad.addColorStop(0.8, '#aa541f');
    irisGrad.addColorStop(1, '#d87f32');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, irisRx, irisRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright golden-amber reflection arc along the bottom rim
    ctx.strokeStyle = 'rgba(255, 224, 148, 0.78)';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(irisX, irisY + 4, irisRx * 0.72, irisRy * 0.74, 0, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();

    // Soft pupil
    ctx.fillStyle = '#1b0803';
    ctx.beginPath();
    ctx.ellipse(irisX, irisY - 4, irisRx * 0.44, irisRy * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp outer iris rim
    ctx.strokeStyle = '#250c05';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, irisRx, irisRy, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Specular highlights: 1 large upper-left + 2 small sparkles
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(irisX - irisRx * 0.36, irisY - irisRy * 0.36, 19, 17, -0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(irisX + irisRx * 0.34, irisY + irisRy * 0.38, 8.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(irisX + irisRx * 0.38, irisY - irisRy * 0.24, 5.2, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawOpenEye(ctx, cx, cy, side) {
    const rx = 82;
    const ry = 98;

    ctx.save();
    // Bright sclera
    ctx.fillStyle = '#fffefa';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx - 3, ry * 0.90, 0, 0, Math.PI * 2);
    ctx.clip();

    const irisX = cx - side * 4;
    const irisY = cy + 6;
    this.#drawSparklingIris(ctx, irisX, irisY, 61, 74);

    ctx.restore();

    // Thick curved upper lash + cute outward-flipped wing
    ctx.strokeStyle = '#240d06';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 2), cy - 8);
    ctx.quadraticCurveTo(cx, cy - ry - 12, cx + side * (rx + 10), cy - 14);
    ctx.stroke();

    // Outer lash wing flicking up
    ctx.lineWidth = 9.5;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 2), cy - 16);
    ctx.quadraticCurveTo(cx + side * (rx + 12), cy - 26, cx + side * (rx + 20), cy - 36);
    ctx.stroke();

    // Subtle delicate lower lash
    ctx.strokeStyle = 'rgba(72, 30, 18, 0.45)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, rx - 5, ry * 0.88, 0, Math.PI * 0.28, Math.PI * 0.72);
    ctx.stroke();

    ctx.restore();
  }

  #drawHalfEye(ctx, cx, cy, side) {
    const rx = 80;
    const ry = 94;
    const lidY = cy - 12;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - rx - 16, lidY);
    ctx.quadraticCurveTo(cx, lidY + 10, cx + rx + 16, lidY);
    ctx.lineTo(cx + rx + 16, cy + ry + 16);
    ctx.lineTo(cx - rx - 16, cy + ry + 16);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = '#fffefa';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, rx, ry * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    this.#drawSparklingIris(ctx, cx - side * 3, cy + 12, 57, 66);

    ctx.strokeStyle = 'rgba(72, 30, 18, 0.5)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, rx - 5, ry * 0.85, 0, Math.PI * 0.26, Math.PI * 0.74);
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#240d06';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 2), lidY + 2);
    ctx.quadraticCurveTo(cx, lidY + 14, cx + side * (rx + 12), lidY - 6);
    ctx.stroke();

    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 4), lidY - 6);
    ctx.lineTo(cx + side * (rx + 20), lidY - 22);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(140, 76, 52, 0.42)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx * 0.65), lidY - 22);
    ctx.quadraticCurveTo(cx, lidY - 29, cx + side * (rx * 0.75), lidY - 20);
    ctx.stroke();
    ctx.restore();
  }

  #drawHappyClosedEye(ctx, cx, cy, side) {
    // にっこり閉じ目（∩の弧）
    ctx.save();
    ctx.strokeStyle = '#240d06';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * 66, cy + 10);
    ctx.quadraticCurveTo(cx, cy - 34, cx + side * 68, cy + 12);
    ctx.stroke();

    // Cute outer eyelash flick
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx + side * 56, cy + 4);
    ctx.lineTo(cx + side * 76, cy - 10);
    ctx.stroke();
    ctx.restore();
  }

  #drawWinkEye(ctx, cx, cy, side) {
    // Cheerful playful wink curve for kiss expression
    ctx.save();
    ctx.strokeStyle = '#240d06';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * 58, cy + 14);
    ctx.quadraticCurveTo(cx - side * 4, cy - 28, cx + side * 62, cy + 6);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx + side * 52, cy + 2);
    ctx.lineTo(cx + side * 74, cy - 12);
    ctx.stroke();
    ctx.restore();
  }

  #drawMouth(ctx, cx, cy, expr) {
    ctx.save();
    if (expr === 'kiss') {
      // 口をすぼめた「ちゅ」の口（可愛らしい小さなチュー口）
      ctx.fillStyle = '#f28b88';
      ctx.strokeStyle = '#5c2118';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tiny glossy lip highlight
      ctx.fillStyle = 'rgba(255, 240, 240, 0.8)';
      ctx.beginPath();
      ctx.arc(cx - 3.5, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // より可愛くはっきり見える大きめD字形の笑顔（濃いピンク＋舌の明るいピンク）
    ctx.fillStyle = '#d45252';
    ctx.strokeStyle = '#5c231a';
    ctx.lineWidth = 4.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 48, cy - 14);
    ctx.quadraticCurveTo(cx, cy - 7, cx + 48, cy - 14);
    ctx.quadraticCurveTo(cx + 41, cy + 40, cx, cy + 40);
    ctx.quadraticCurveTo(cx - 41, cy + 40, cx - 48, cy - 14);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ff989a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 28, 36, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Procedural fishnet tights texture with larger ~1.5x diamonds so peachy skin shows clearly.
 */
export function createFishnetTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffd9be';
  ctx.fillRect(0, 0, size, size);

  const step = 64; // divides 512 cleanly into 8 larger diamonds
  ctx.strokeStyle = '#2d161b';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'square';

  for (let offset = -size; offset <= size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }

  ctx.fillStyle = '#1f0e12';
  for (let y = 0; y <= size; y += step * 0.5) {
    const rowShift = Math.round(y / (step * 0.5)) % 2 === 0 ? 0 : step * 0.5;
    for (let x = rowShift; x <= size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 2.2);
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
  grad.addColorStop(0, 'rgba(38, 16, 66, 0.52)');
  grad.addColorStop(0.55, 'rgba(42, 18, 72, 0.28)');
  grad.addColorStop(1, 'rgba(42, 18, 72, 0)');
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
  grad.addColorStop(0, '#ffb5ec');
  grad.addColorStop(1, '#f25cb3');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineWidth = 5.5;
  ctx.strokeStyle = '#6b224c';
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(-16, -18, 7, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soft pastel bokeh/sparkle texture for gentle dreamy background ambience.
 */
export function createBokehTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 2, c, c, c);
  grad.addColorStop(0, 'rgba(255, 235, 255, 0.95)');
  grad.addColorStop(0.35, 'rgba(248, 196, 255, 0.45)');
  grad.addColorStop(1, 'rgba(248, 196, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
