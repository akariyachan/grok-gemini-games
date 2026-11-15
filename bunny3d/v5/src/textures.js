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
    this.currentLidClose = 0;
    this.render('normal', 0, 0);
  }

  update(expr, blushBoost = 0, lidClose = 0) {
    const quantizedBlush = Math.round(blushBoost * 20) / 20;
    const quantizedLid = Math.round(Math.max(0, Math.min(1, lidClose)) * 30) / 30;
    if (
      expr === this.currentExpr &&
      quantizedBlush === this.currentBlush &&
      quantizedLid === this.currentLidClose
    ) {
      return;
    }
    this.render(expr, quantizedBlush, quantizedLid);
  }

  render(expr, blushBoost = 0, lidClose = 0) {
    this.currentExpr = expr;
    this.currentBlush = blushBoost;
    this.currentLidClose = lidClose;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Warm translucent cheek blush (intensified for kiss, smile & especially shy) + delicate slash marks
    const baseBlush = expr === 'shy' ? 0.99 : expr === 'smile' ? 0.90 : expr === 'kiss' ? 0.88 : 0.76;
    const blushAlpha = Math.min(0.99, baseBlush + blushBoost * 0.25);
    const blushRx = expr === 'shy' ? 92 : 76;
    const blushRy = expr === 'shy' ? 39 : 31;
    this.#drawCheekBlush(ctx, w * 0.20, h * 0.695, blushRx, blushRy, blushAlpha, expr === 'shy');
    this.#drawCheekBlush(ctx, w * 0.80, h * 0.695, blushRx, blushRy, blushAlpha, expr === 'shy');

    // Large tall chibi eyes placed low and slightly wide-set
    const eyeY = h * 0.548;
    const leftEyeX = w * 0.255;
    const rightEyeX = w * 0.745;

    // Gentle kind arched eyebrows placed cleanly above the eyes
    this.#drawEyebrow(ctx, leftEyeX, h * 0.258, -1, expr);
    this.#drawEyebrow(ctx, rightEyeX, h * 0.258, 1, expr);

    const effectiveClose = lidClose;
    if (expr === 'blink' || expr === 'smile') {
      // まばたき = やさしい弧、にっこり = 高く弾む元気な ^ ^ 弧
      const smileAmp = expr === 'smile' ? 1.28 : 0.86;
      this.#drawHappyClosedEye(ctx, leftEyeX, eyeY + (expr === 'smile' ? 6 : 12), -1, smileAmp, expr === 'smile');
      this.#drawHappyClosedEye(ctx, rightEyeX, eyeY + (expr === 'smile' ? 6 : 12), 1, smileAmp, expr === 'smile');
    } else if (expr === 'half') {
      this.#drawHalfEye(ctx, leftEyeX, eyeY, -1, effectiveClose);
      this.#drawHalfEye(ctx, rightEyeX, eyeY, 1, effectiveClose);
    } else if (expr === 'kiss') {
      // 片目ウインク（左目ウインク＋右目キラキラ開き目）
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1, 0, effectiveClose);
      this.#drawWinkEye(ctx, rightEyeX, eyeY + 8, 1);
    } else if (expr === 'shy') {
      // 目をそらした照れ目＋左こめかみ（前髪と眉の間のオープン領域）に汗マーク
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1, -20, Math.max(0.10, effectiveClose));
      this.#drawOpenEye(ctx, rightEyeX, eyeY, 1, -20, Math.max(0.10, effectiveClose));
      this.#drawSweatDrop(ctx, w * 0.155, h * 0.355);
    } else {
      this.#drawOpenEye(ctx, leftEyeX, eyeY, -1, 0, effectiveClose);
      this.#drawOpenEye(ctx, rightEyeX, eyeY, 1, 0, effectiveClose);
    }

    // Barely-there tiny nose dot
    ctx.save();
    ctx.fillStyle = 'rgba(255, 245, 238, 0.72)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.675, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mouth centered naturally in lower face with per-expression shapes
    this.#drawMouth(ctx, w * 0.5, h * 0.785, expr);

    this.texture.needsUpdate = true;
  }

  #drawCheekBlush(ctx, cx, cy, rx, ry, alpha, extraShy = false) {
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, rx);
    const coreR = extraShy ? 250 : 246;
    const coreG = extraShy ? 72 : 104;
    const coreB = extraShy ? 82 : 102;
    grad.addColorStop(0, `rgba(${coreR}, ${coreG}, ${coreB}, ${alpha})`);
    grad.addColorStop(0.65, `rgba(${coreR}, ${coreG + 14}, ${coreB + 16}, ${alpha * (extraShy ? 0.78 : 0.60)})`);
    grad.addColorStop(1, `rgba(${coreR}, ${coreG + 14}, ${coreB + 14}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fine delicate diagonal blush strokes (4 thin strokes when extraShy)
    ctx.strokeStyle = `rgba(218, 62, 68, ${alpha * (extraShy ? 0.65 : 0.34)})`;
    ctx.lineWidth = extraShy ? 2.6 : 2.1;
    ctx.lineCap = 'round';
    const startIdx = extraShy ? -2 : -1;
    const endIdx = extraShy ? 1 : 1;
    for (let i = startIdx; i <= endIdx; i++) {
      const ox = cx + (extraShy ? (i + 0.5) * 14 : i * 16);
      ctx.beginPath();
      ctx.moveTo(ox - 4, cy + 5);
      ctx.lineTo(ox + 4, cy - 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawSweatDrop(ctx, cx, cy) {
    ctx.save();
    const grad = ctx.createLinearGradient(cx, cy - 26, cx, cy + 22);
    grad.addColorStop(0, '#eefbff');
    grad.addColorStop(0.45, '#92daf8');
    grad.addColorStop(1, '#4c9ed9');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#2b5f8f';
    ctx.lineWidth = 3.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 26);
    ctx.quadraticCurveTo(cx + 20, cy + 4, cx, cy + 22);
    ctx.quadraticCurveTo(cx - 20, cy + 4, cx, cy - 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.arc(cx - 5, cy + 3, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #drawEyebrow(ctx, cx, cy, side, expr) {
    ctx.save();
    ctx.strokeStyle = '#5c311b';
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    // Inner end (cx - side * 34) stays gently lifted relative to outer end for a soft kind look
    let innerY = cy - 4;
    let midY = cy - 15;
    let outerY = cy + 3;
    if (expr === 'smile') {
      innerY = cy - 13;
      midY = cy - 25;
      outerY = cy - 5;
    } else if (expr === 'shy') {
      innerY = cy - 11;
      midY = cy - 12;
      outerY = cy + 8;
    } else if (expr === 'half') {
      innerY = cy - 10;
      midY = cy - 15;
      outerY = cy + 7;
    } else if (expr === 'kiss') {
      innerY = cy - 4;
      midY = cy - 13;
      outerY = cy + 4;
    }
    ctx.beginPath();
    ctx.moveTo(cx - side * 34, innerY);
    ctx.quadraticCurveTo(cx + side * 4, midY, cx + side * 42, outerY);
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

  #drawOpenEye(ctx, cx, cy, side, irisShiftX = 0, lidClose = 0) {
    if (lidClose >= 0.9) {
      this.#drawClosingLineEye(ctx, cx, cy + 10, side);
      return;
    }

    const rx = 82;
    const ry = 98;
    const lidY = cy - ry + lidClose * (ry + 12);

    ctx.save();
    // Clip visible eye below smooth descending upper eyelid for 0.12s close/open transitions
    ctx.beginPath();
    ctx.moveTo(cx - rx - 18, lidY + 6);
    ctx.quadraticCurveTo(cx, lidY - (1 - lidClose) * 20 + lidClose * 8, cx + rx + 18, lidY + 12);
    ctx.lineTo(cx + rx + 18, cy + ry + 18);
    ctx.lineTo(cx - rx - 18, cy + ry + 18);
    ctx.closePath();
    ctx.clip();

    // Bright sclera
    ctx.fillStyle = '#fffefa';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx - 3, ry * 0.90, 0, 0, Math.PI * 2);
    ctx.clip();

    const irisX = cx - side * 4 + irisShiftX;
    const irisY = cy + 6;
    this.#drawSparklingIris(ctx, irisX, irisY, 61, 74);

    ctx.restore();

    // Subtle delicate lower lash
    ctx.strokeStyle = 'rgba(82, 36, 22, 0.36)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, rx - 5, ry * 0.88, 0, Math.PI * 0.28, Math.PI * 0.72);
    ctx.stroke();

    ctx.restore();

    // Gentle droopy-cute upper lash + toned-down soft outer flick (たれ目気味)
    const innerEndY = cy - 10 + lidClose * 20;
    const peakY = cy - ry - 8 + lidClose * (ry + 18);
    const outerEndY = cy - 4 + lidClose * 16;

    ctx.save();
    ctx.strokeStyle = '#260e07';
    ctx.lineWidth = 13.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 1), innerEndY);
    ctx.quadraticCurveTo(cx + side * 4, peakY, cx + side * (rx + 7), outerEndY);
    ctx.stroke();

    // Soft subtle outer lash flick
    ctx.lineWidth = 7.2;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 1), outerEndY - 2);
    ctx.quadraticCurveTo(cx + side * (rx + 9), outerEndY - 7, cx + side * (rx + 14), outerEndY - 12);
    ctx.stroke();
    ctx.restore();
  }

  #drawClosingLineEye(ctx, cx, cy, side) {
    ctx.save();
    ctx.strokeStyle = '#260e07';
    ctx.lineWidth = 12.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * 66, cy + 4);
    ctx.quadraticCurveTo(cx, cy + 15, cx + side * 68, cy + 6);
    ctx.stroke();
    ctx.restore();
  }

  #drawHalfEye(ctx, cx, cy, side, lidClose = 0) {
    if (lidClose >= 0.9) {
      this.#drawClosingLineEye(ctx, cx, cy + 10, side);
      return;
    }

    const rx = 80;
    const ry = 94;
    // Higher rounded upward-arched upper eyelid so sparkles remain visible & reads dreamy/sleepy
    const lidY = cy - 22 + lidClose * 34;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - rx - 16, lidY + 6);
    ctx.quadraticCurveTo(cx, lidY - 22, cx + rx + 16, lidY + 16);
    ctx.lineTo(cx + rx + 16, cy + ry + 16);
    ctx.lineTo(cx - rx - 16, cy + ry + 16);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = '#fffefa';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, rx, ry * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    this.#drawSparklingIris(ctx, cx - side * 3, cy + 10, 58, 68);

    ctx.strokeStyle = 'rgba(82, 36, 22, 0.36)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, rx - 5, ry * 0.85, 0, Math.PI * 0.26, Math.PI * 0.74);
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#260e07';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx + 1), lidY + 4);
    ctx.quadraticCurveTo(cx, lidY - 20, cx + side * (rx + 7), lidY + 14);
    ctx.stroke();

    ctx.lineWidth = 6.8;
    ctx.beginPath();
    ctx.moveTo(cx + side * (rx + 1), lidY + 12);
    ctx.lineTo(cx + side * (rx + 13), lidY + 6);
    ctx.stroke();

    // Soft sleepy eyelid crease above the curved lid
    ctx.strokeStyle = 'rgba(148, 84, 58, 0.34)';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(cx - side * (rx * 0.62), lidY - 14);
    ctx.quadraticCurveTo(cx, lidY - 30, cx + side * (rx * 0.68), lidY - 8);
    ctx.stroke();
    ctx.restore();
  }

  #drawHappyClosedEye(ctx, cx, cy, side, amp = 1.0, radiant = false) {
    // にっこり閉じ目（blink はやさしい弧、smile は元気な高い弧）
    ctx.save();
    ctx.strokeStyle = '#260e07';
    ctx.lineWidth = radiant ? 13.5 : 11.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * (62 * Math.min(1.08, amp)), cy + 12);
    ctx.quadraticCurveTo(cx, cy - 34 * amp, cx + side * (64 * Math.min(1.08, amp)), cy + 12);
    ctx.stroke();

    // Gentle outer joy flick
    ctx.lineWidth = radiant ? 7.5 : 6.0;
    ctx.beginPath();
    ctx.moveTo(cx + side * 56, cy + 7);
    ctx.lineTo(cx + side * (radiant ? 74 : 68), cy - (radiant ? 4 : 0));
    ctx.stroke();
    ctx.restore();
  }

  #drawWinkEye(ctx, cx, cy, side) {
    // Cheerful playful wink curve for kiss expression
    ctx.save();
    ctx.strokeStyle = '#260e07';
    ctx.lineWidth = 12.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - side * 58, cy + 14);
    ctx.quadraticCurveTo(cx - side * 4, cy - 28, cx + side * 62, cy + 8);
    ctx.stroke();

    ctx.lineWidth = 7.0;
    ctx.beginPath();
    ctx.moveTo(cx + side * 54, cy + 4);
    ctx.lineTo(cx + side * 70, cy - 4);
    ctx.stroke();
    ctx.restore();
  }

  #drawMouth(ctx, cx, cy, expr) {
    ctx.save();
    if (expr === 'kiss') {
      // 口をすぼめた「ちゅ」の口
      ctx.fillStyle = '#f28b88';
      ctx.strokeStyle = '#5c2118';
      ctx.lineWidth = 4.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 240, 240, 0.8)';
      ctx.beginPath();
      ctx.arc(cx - 3.5, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (expr === 'half') {
      // 小さくて可愛い ω 口
      ctx.strokeStyle = '#5c231a';
      ctx.lineWidth = 4.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy - 2);
      ctx.quadraticCurveTo(cx - 13, cy + 14, cx, cy + 1);
      ctx.quadraticCurveTo(cx + 13, cy + 14, cx + 26, cy - 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (expr === 'shy') {
      // てれ顔用の小さな波線口
      ctx.strokeStyle = '#5c231a';
      ctx.lineWidth = 4.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + 2);
      ctx.bezierCurveTo(cx - 16, cy - 9, cx - 8, cy + 12, cx, cy + 2);
      ctx.bezierCurveTo(cx + 8, cy - 9, cx + 16, cy + 12, cx + 30, cy + 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // D字形の笑顔（smile は大きく嬉しい笑顔、blink は控えめな可愛らしい微笑）
    const scale = expr === 'smile' ? 1.32 : expr === 'blink' ? 0.84 : 1.0;
    const hw = 48 * scale;
    const drop = 40 * scale;
    ctx.fillStyle = '#d45252';
    ctx.strokeStyle = '#5c231a';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy - 14);
    ctx.quadraticCurveTo(cx, cy - 7, cx + hw, cy - 14);
    ctx.quadraticCurveTo(cx + hw * 0.85, cy + drop, cx, cy + drop);
    ctx.quadraticCurveTo(cx - hw * 0.85, cy + drop, cx - hw, cy - 14);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ff989a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 28 * scale, 36 * scale, 20 * scale, 0, 0, Math.PI * 2);
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

  ctx.fillStyle = '#f0bfa0';
  ctx.fillRect(0, 0, size, size);

  const step = 64; // divides 512 cleanly into 8 larger diamonds
  ctx.strokeStyle = '#220d11';
  ctx.lineWidth = 5.0;
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
