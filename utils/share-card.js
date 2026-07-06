function safeText(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  return text || fallback || '';
}

function getPixelRatio() {
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return info.pixelRatio || 1;
  } catch (error) {
    return 1;
  }
}

function getCanvasNode(page, selector) {
  return new Promise((resolve) => {
    const query = page && typeof page.createSelectorQuery === 'function'
      ? page.createSelectorQuery()
      : wx.createSelectorQuery();
    query.select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        const target = res && res[0];
        if (!target || !target.node) {
          resolve(null);
          return;
        }
        resolve(target);
      });
  });
}

function getImageInfo(src) {
  return new Promise((resolve) => {
    const imageSrc = safeText(src);
    if (!imageSrc || !wx.getImageInfo) {
      resolve(null);
      return;
    }
    wx.getImageInfo({
      src: imageSrc,
      success: resolve,
      fail: () => resolve(null)
    });
  });
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.createImage !== 'function' || !src) {
      resolve(null);
      return;
    }
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadDrawableImage(canvas, src) {
  const info = await getImageInfo(src);
  if (!info || !info.path) return null;
  const image = await loadCanvasImage(canvas, info.path);
  if (!image) return null;
  return {
    image,
    width: info.width || image.width || 1,
    height: info.height || image.height || 1
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, strokeStyle, lineWidth) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth || 1;
  ctx.stroke();
}

function drawImageCover(ctx, drawable, x, y, width, height) {
  if (!drawable || !drawable.image) return false;
  const imageWidth = drawable.width || 1;
  const imageHeight = drawable.height || 1;
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = imageWidth;
  let sh = imageHeight;

  if (imageRatio > targetRatio) {
    sw = imageHeight * targetRatio;
    sx = (imageWidth - sw) / 2;
  } else {
    sh = imageWidth / targetRatio;
    sy = (imageHeight - sh) / 2;
  }

  ctx.drawImage(drawable.image, sx, sy, sw, sh, x, y, width, height);
  return true;
}

function drawFallbackBackground(ctx, width, height, accentColor) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#17303a');
  bg.addColorStop(0.55, '#31534c');
  bg.addColorStop(1, '#f1dfc7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = accentColor || '#f3af36';
  ctx.beginPath();
  ctx.arc(width - 42, 58, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(38, height - 32, 116, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const source = Array.from(safeText(text));
  const lines = [];
  let line = '';

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const testLine = line + char;
    if (ctx.measureText(testLine).width <= maxWidth || !line) {
      line = testLine;
      continue;
    }
    lines.push(line);
    line = char;
    if (maxLines && lines.length >= maxLines) break;
  }
  if ((!maxLines || lines.length < maxLines) && line) {
    lines.push(line);
  }
  if (maxLines && source.length && lines.length >= maxLines) {
    const lastIndex = lines.length - 1;
    let last = lines[lastIndex] || '';
    while (last && ctx.measureText(last + '...').width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (source.join('').length > lines.join('').length) {
      lines[lastIndex] = `${last}...`;
    }
  }
  return lines;
}

function drawCenteredLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index * lineHeight));
  });
}

function drawLeftLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index * lineHeight));
  });
}

function normalizeShareWords(words, fallbackWords) {
  const source = Array.isArray(words) && words.length
    ? words
    : (Array.isArray(fallbackWords) ? fallbackWords : []);
  const seen = {};
  return source
    .map((item) => {
      const text = safeText(item && (item.text || item.word || item.t));
      const meaning = safeText(item && (item.meaning || item.cn || item.m));
      return text ? { text, meaning } : null;
    })
    .filter((item) => {
      if (!item || seen[item.text]) return false;
      seen[item.text] = true;
      return true;
    });
}

function drawPhotoIllustration(ctx, x, y, width, height) {
  fillRoundedRect(ctx, x, y, width, height, 24, '#172026');

  const shine = ctx.createLinearGradient(x, y, x + width, y + height);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  shine.addColorStop(0.42, 'rgba(255, 255, 255, 0.04)');
  shine.addColorStop(1, 'rgba(66, 153, 225, 0.18)');
  ctx.save();
  roundedRect(ctx, x, y, width, height, 24);
  ctx.clip();
  ctx.fillStyle = shine;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(x + 28, y + 26, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + width - 24, y + 28, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + width - 46, y + height - 26, 10, 0, Math.PI * 2);
  ctx.fill();

  const cameraX = x + Math.round(width / 2) - 34;
  const cameraY = y + Math.round(height / 2) - 28;
  fillRoundedRect(ctx, cameraX, cameraY, 68, 58, 18, 'rgba(255, 255, 255, 0.13)');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeRect(cameraX + 17, cameraY + 21, 34, 22);
  ctx.beginPath();
  ctx.moveTo(cameraX + 25, cameraY + 21);
  ctx.lineTo(cameraX + 30, cameraY + 15);
  ctx.lineTo(cameraX + 42, cameraY + 15);
  ctx.lineTo(cameraX + 47, cameraY + 21);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cameraX + 34, cameraY + 32, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(80, 211, 194, 0.82)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 18, y + height - 22);
  ctx.lineTo(x + width - 18, y + height - 22);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('拍照识别', x + width / 2, y + height - 38);
  ctx.restore();
}

function drawWordChip(ctx, word, x, y, width, height, accentColor) {
  fillRoundedRect(ctx, x, y, width, height, 15, '#ffffff');
  strokeRoundedRect(ctx, x, y, width, height, 15, 'rgba(26, 31, 38, 0.06)', 1);

  ctx.fillStyle = accentColor;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const wordLines = wrapText(ctx, safeText(word && word.text), width - 20, 1);
  ctx.fillText(wordLines[0] || '', x + 12, y + 10);

  const meaning = safeText(word && word.meaning);
  if (meaning) {
    ctx.fillStyle = '#6e7681';
    ctx.font = 'bold 11px sans-serif';
    const meaningLines = wrapText(ctx, meaning, width - 20, 1);
    ctx.fillText(meaningLines[0] || '', x + 12, y + 34);
  }
}

async function drawPhotoLearnShareCard(page, options) {
  const opts = options || {};
  const target = await getCanvasNode(page, opts.selector || '#photoShareCanvas');
  if (!target) return '';

  const canvas = target.node;
  const ctx = canvas.getContext('2d');
  const width = Math.max(1, target.width || opts.width || 500);
  const height = Math.max(1, target.height || opts.height || 400);
  const dpr = getPixelRatio();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const accentColor = opts.accentColor || '#0f766e';
  const darkColor = '#17181d';
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#f7fbf8');
  background.addColorStop(0.58, '#eef6f3');
  background.addColorStop(1, '#f6f0e7');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#93c5b6';
  ctx.beginPath();
  ctx.arc(width - 38, 42, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5aa24';
  ctx.beginPath();
  ctx.arc(34, height - 16, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const brand = safeText(opts.brand, '韩语打字练习');
  fillRoundedRect(ctx, 28, 24, Math.min(168, Math.max(112, brand.length * 14 + 30)), 30, 15, '#ffffff');
  ctx.fillStyle = '#53635e';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand, 44, 39);

  drawPhotoIllustration(ctx, 330, 28, 138, 118);

  const title = safeText(opts.title, '拍照学韩语');
  ctx.fillStyle = darkColor;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleLines = wrapText(ctx, title, 276, 2);
  drawLeftLines(ctx, titleLines, 30, 72, 39);

  const subtitle = safeText(opts.subtitle, '拍一下身边的东西，马上得到韩语词卡');
  ctx.fillStyle = '#53635e';
  ctx.font = 'bold 15px sans-serif';
  const subtitleLines = wrapText(ctx, subtitle, 276, 2);
  drawLeftLines(ctx, subtitleLines, 31, 152, 21);

  const sceneName = safeText(opts.sceneName);
  const countText = opts.wordCount ? `${opts.wordCount} 个词` : '即拍即学';
  fillRoundedRect(ctx, 28, 190, width - 56, 34, 17, '#17181d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(safeText(opts.sectionTitle, '识别结果词卡'), 46, 207);
  ctx.fillStyle = '#f6c15a';
  ctx.textAlign = 'right';
  const metaLine = wrapText(ctx, sceneName ? `${sceneName}  ${countText}` : countText, 232, 1)[0] || '';
  ctx.fillText(metaLine, width - 46, 207);

  const fallbackWords = [
    { text: '사진', meaning: '照片' },
    { text: '단어', meaning: '单词' },
    { text: '연습', meaning: '练习' },
    { text: '발음', meaning: '发音' }
  ];
  const words = normalizeShareWords(opts.words, fallbackWords).slice(0, 6);
  const chipGap = 8;
  const chipW = Math.floor((width - 56 - chipGap * 2) / 3);
  const chipH = 48;
  const startX = 28;
  const startY = 238;
  words.forEach((word, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    drawWordChip(ctx, word, startX + col * (chipW + chipGap), startY + row * (chipH + 10), chipW, chipH, accentColor);
  });

  const footerY = height - 42;
  fillRoundedRect(ctx, 28, footerY, width - 56, 28, 14, 'rgba(255, 255, 255, 0.78)');
  ctx.fillStyle = darkColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const footerLine = wrapText(ctx, safeText(opts.footer, '打开小程序，拍一下就开始学'), 244, 1)[0] || '';
  ctx.fillText(footerLine, 44, footerY + 14);
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'right';
  ctx.fillText('跟读  记忆  练习', width - 44, footerY + 14);

  return canvasToTempFilePath(canvas, width, height);
}

function canvasToTempFilePath(canvas, width, height) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      destWidth: width * 2,
      destHeight: height * 2,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    });
  });
}

async function drawLearningShareCard(page, options) {
  const opts = options || {};
  const target = await getCanvasNode(page, opts.selector || '#shareCanvas');
  if (!target) return '';

  const canvas = target.node;
  const ctx = canvas.getContext('2d');
  const width = Math.max(1, target.width || opts.width || 500);
  const height = Math.max(1, target.height || opts.height || 400);
  const dpr = getPixelRatio();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const accentColor = opts.accentColor || '#f3af36';
  const drawable = await loadDrawableImage(canvas, opts.background);
  if (!drawImageCover(ctx, drawable, 0, 0, width, height)) {
    drawFallbackBackground(ctx, width, height, accentColor);
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, 'rgba(8, 18, 24, 0.16)');
  overlay.addColorStop(0.45, 'rgba(8, 18, 24, 0.3)');
  overlay.addColorStop(1, 'rgba(8, 18, 24, 0.72)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  const brand = safeText(opts.brand, '韩语打字练习');
  const kicker = safeText(opts.kicker);
  fillRoundedRect(ctx, 24, 24, Math.min(220, Math.max(116, brand.length * 16 + 42)), 38, 19, 'rgba(255, 255, 255, 0.9)');
  ctx.fillStyle = '#17303a';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand, 44, 43);

  const panelX = 28;
  const panelY = height - 158;
  const panelW = width - 56;
  const panelH = 130;
  fillRoundedRect(ctx, panelX, panelY, panelW, panelH, 24, 'rgba(255, 255, 255, 0.88)');
  strokeRoundedRect(ctx, panelX, panelY, panelW, panelH, 24, 'rgba(255, 255, 255, 0.55)', 1);

  if (kicker) {
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(kicker, width / 2, panelY + 18);
  }

  const title = safeText(opts.title, '韩语词卡');
  ctx.fillStyle = '#17303a';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titleLines = wrapText(ctx, title, panelW - 48, 1);
  drawCenteredLines(ctx, titleLines, width / 2, panelY + (kicker ? 38 : 24), 42);

  const subtitles = (Array.isArray(opts.subtitles) ? opts.subtitles : [])
    .map((item) => safeText(item))
    .filter(Boolean);
  const subtitleText = subtitles.join(' · ');
  if (subtitleText) {
    ctx.fillStyle = '#4f665c';
    ctx.font = 'bold 18px sans-serif';
    const subtitleLines = wrapText(ctx, subtitleText, panelW - 56, 2);
    drawCenteredLines(ctx, subtitleLines, width / 2, panelY + 84, 23);
  }

  if (opts.footer) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(safeText(opts.footer), width - 28, height - 18);
  }

  return canvasToTempFilePath(canvas, width, height);
}

module.exports = {
  drawLearningShareCard,
  drawPhotoLearnShareCard,
  safeText
};
