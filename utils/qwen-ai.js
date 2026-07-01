const CLOUD_FUNCTION_TIMEOUT = 65000;
const TARGET_IMAGE_SIZE = 80 * 1024;
const MIN_AI_IMAGE_SIZE = 45 * 1024;
const DIRECT_BASE64_MAX_CHARS = 240 * 1024;
const COMPRESS_QUALITIES = [34, 28, 22, 16, 12, 8, 5, 3];

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function attachItemIds(record) {
  Object.keys(record.languages || {}).forEach((languageKey) => {
    const language = record.languages[languageKey] || {};
    ['words', 'sentences', 'oral', 'actions'].forEach((field) => {
      (language[field] || []).forEach((item, index) => {
        if (item && typeof item === 'object') {
          item.id = item.id || `${record.id}:${languageKey}:${field}:${item.key || index}`;
        }
      });
    });
  });
  return record;
}

function createSceneRecord(template, imagePath, source) {
  const now = new Date().toISOString();
  const record = {
    id: createId('photo_card'),
    imagePath,
    source,
    aiCategoryKey: template.categoryKey,
    userCategoryKey: '',
    categoryKey: template.categoryKey,
    createdAt: now,
    updatedAt: now,
    languages: JSON.parse(JSON.stringify(template.languages || {}))
  };

  return attachItemIds(record);
}

function createTraceId() {
  return `qwen_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function logQwen(stage, detail) {
  console.info(`[qwen-ai] ${stage}`, detail || '');
}

function warnQwen(stage, detail) {
  console.warn(`[qwen-ai] ${stage}`, detail || '');
}

function formatBytes(bytes) {
  if (!bytes) {
    return 'unknown';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

function inferMimeType(filePath) {
  const lowerPath = String(filePath || '').toLowerCase();
  if (lowerPath.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerPath.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function getImageExtension(imageMime, filePath) {
  const lowerPath = String(filePath || '').toLowerCase();
  if (imageMime === 'image/png' || lowerPath.endsWith('.png')) {
    return 'png';
  }
  if (imageMime === 'image/webp' || lowerPath.endsWith('.webp')) {
    return 'webp';
  }
  return 'jpg';
}

function getFileInfo(filePath) {
  return new Promise((resolve) => {
    if (!wx.getFileInfo) {
      resolve({ size: 0 });
      return;
    }

    wx.getFileInfo({
      filePath,
      success(res) {
        resolve({ size: res.size || 0 });
      },
      fail(error) {
        warnQwen('get file size failed', error);
        resolve({ size: 0 });
      }
    });
  });
}

function getImageInfo(filePath) {
  return new Promise((resolve) => {
    if (!wx.getImageInfo) {
      resolve({ width: 0, height: 0, type: '' });
      return;
    }

    wx.getImageInfo({
      src: filePath,
      success(res) {
        resolve({
          width: res.width || 0,
          height: res.height || 0,
          type: res.type || ''
        });
      },
      fail(error) {
        warnQwen('get image info failed', error);
        resolve({ width: 0, height: 0, type: '' });
      }
    });
  });
}

function getImageMeta(filePath) {
  return Promise.all([
    getFileInfo(filePath),
    getImageInfo(filePath)
  ]).then(([fileInfo, imageInfo]) => ({
    filePath,
    size: fileInfo.size,
    sizeLabel: formatBytes(fileInfo.size),
    width: imageInfo.width,
    height: imageInfo.height,
    type: imageInfo.type
  }));
}

function compressAtQuality(filePath, quality) {
  return new Promise((resolve) => {
    if (!wx.compressImage) {
      resolve(filePath);
      return;
    }

    wx.compressImage({
      src: filePath,
      quality,
      success(res) {
        resolve(res.tempFilePath || filePath);
      },
      fail(error) {
        warnQwen(`compress failed at quality ${quality}`, error);
        resolve(filePath);
      }
    });
  });
}

async function compressImageForAI(filePath, traceId) {
  const originalMeta = await getImageMeta(filePath);
  logQwen('image original', {
    traceId,
    size: originalMeta.sizeLabel,
    width: originalMeta.width,
    height: originalMeta.height,
    type: originalMeta.type
  });

  if (originalMeta.size > 0 && originalMeta.size <= MIN_AI_IMAGE_SIZE) {
    logQwen('image already under target, keep original', {
      traceId,
      size: originalMeta.sizeLabel,
      target: formatBytes(TARGET_IMAGE_SIZE),
      minSafeSize: formatBytes(MIN_AI_IMAGE_SIZE)
    });
    return {
      imagePath: filePath,
      originalMeta,
      compressedMeta: originalMeta,
      quality: 100
    };
  }

  let aiImagePath = filePath;
  let compressedMeta = originalMeta;
  let bestResult = {
    imagePath: filePath,
    meta: originalMeta,
    quality: 100
  };

  for (let index = 0; index < COMPRESS_QUALITIES.length; index += 1) {
    const quality = COMPRESS_QUALITIES[index];
    aiImagePath = await compressAtQuality(filePath, quality);
    compressedMeta = await getImageMeta(aiImagePath);
    logQwen('image compress attempt', {
      traceId,
      quality,
      size: compressedMeta.sizeLabel,
      target: formatBytes(TARGET_IMAGE_SIZE),
      minSafeSize: formatBytes(MIN_AI_IMAGE_SIZE),
      width: compressedMeta.width,
      height: compressedMeta.height,
      passed: compressedMeta.size > 0 && compressedMeta.size <= TARGET_IMAGE_SIZE
    });

    if (!bestResult.meta.size || (compressedMeta.size && compressedMeta.size < bestResult.meta.size)) {
      bestResult = {
        imagePath: aiImagePath,
        meta: compressedMeta,
        quality
      };
    }

    if (compressedMeta.size > 0 && compressedMeta.size <= TARGET_IMAGE_SIZE) {
      break;
    }
  }

  if (bestResult.meta.size > TARGET_IMAGE_SIZE) {
    warnQwen('image still above target after max compression', {
      traceId,
      size: bestResult.meta.sizeLabel,
      target: formatBytes(TARGET_IMAGE_SIZE),
      quality: bestResult.quality
    });
  }

  logQwen('image selected for upload', {
    traceId,
    quality: bestResult.quality,
    size: bestResult.meta.sizeLabel,
    originalSize: originalMeta.sizeLabel,
    saved: originalMeta.size && bestResult.meta.size
      ? formatBytes(Math.max(originalMeta.size - bestResult.meta.size, 0))
      : 'unknown'
  });

  return {
    imagePath: bestResult.imagePath,
    originalMeta,
    compressedMeta: bestResult.meta,
    quality: bestResult.quality
  };
}

function readImageBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(res.data);
      },
      fail: reject
    });
  });
}

function uploadImageForCloud(filePath, imageMime, traceId) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.uploadFile) {
      reject(new Error('wx.cloud.uploadFile is not available'));
      return;
    }

    const ext = getImageExtension(imageMime, filePath);
    const cloudPath = `qwen-scene/${traceId}.${ext}`;
    logQwen('upload image start', {
      traceId,
      cloudPath,
      imageMime
    });

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success(res) {
        logQwen('upload image success', {
          traceId,
          cloudPath,
          fileID: res.fileID
        });
        resolve({
          fileID: res.fileID,
          cloudPath
        });
      },
      fail(error) {
        warnQwen('upload image failed', {
          traceId,
          cloudPath,
          message: error && (error.errMsg || error.message) ? (error.errMsg || error.message) : String(error)
        });
        reject(error);
      }
    });
  });
}

function cleanupCloudImage(fileID, traceId) {
  if (!fileID || !wx.cloud || !wx.cloud.deleteFile) {
    return;
  }

  wx.cloud.deleteFile({
    fileList: [fileID],
    success() {
      logQwen('cleanup cloud image success', { traceId });
    },
    fail(error) {
      warnQwen('cleanup cloud image failed', {
        traceId,
        message: error && (error.errMsg || error.message) ? (error.errMsg || error.message) : String(error)
      });
    }
  });
}

function getCurrentLanguageKey(languageKey) {
  return languageKey || 'ko';
}

function ensureSceneAnalyzeQuota(traceId, meta) {
  logQwen('quota skipped', {
    traceId,
    ...(meta || {})
  });
  return Promise.resolve({ ok: true });
}

function callQwenScene({ imagePath, source, languageKey }) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud is not available'));
  }

  const traceId = createTraceId();
  const requestedLanguage = getCurrentLanguageKey(languageKey);
  const startedAt = Date.now();
  logQwen('start', {
    traceId,
    source,
    requestedLanguage,
    timeout: CLOUD_FUNCTION_TIMEOUT
  });

  return ensureSceneAnalyzeQuota(traceId, {
    source,
    languageKey: requestedLanguage
  })
    .then(() => compressImageForAI(imagePath, traceId))
    .then(async (compressResult) => {
      const imageMime = inferMimeType(compressResult.imagePath);
      const imageBase64 = await readImageBase64(compressResult.imagePath);
      if (imageBase64.length <= DIRECT_BASE64_MAX_CHARS) {
        return {
          imageMime,
          compressResult,
          uploadedFileID: '',
          data: {
            traceId,
            imageBase64,
            imageMime,
            imageSize: compressResult.compressedMeta.size,
            source,
            languageKey: requestedLanguage
          }
        };
      }

      if (wx.cloud && wx.cloud.uploadFile) {
        const uploaded = await uploadImageForCloud(compressResult.imagePath, imageMime, traceId);
        return {
          imageMime,
          compressResult,
          uploadedFileID: uploaded.fileID,
          data: {
            traceId,
            imageFileID: uploaded.fileID,
            imageMime,
            imageSize: compressResult.compressedMeta.size,
            source,
            languageKey: requestedLanguage
          }
        };
      }

      throw new Error(`[${traceId}] 图片仍然过大，且当前环境不能上传云存储。请检查 wx.cloud.uploadFile。`);
    })
    .then((payload) => new Promise((resolve, reject) => {
      const hasCloudFile = Boolean(payload.data.imageFileID);
      logQwen('payload ready', {
        traceId,
        mode: hasCloudFile ? 'cloud-file' : 'inline-base64',
        imageMime: payload.imageMime,
        imageFileID: payload.data.imageFileID || '',
        base64Chars: payload.data.imageBase64 ? payload.data.imageBase64.length : 0,
        approxPayload: payload.data.imageBase64
          ? formatBytes(Math.round(payload.data.imageBase64.length * 0.75))
          : 'fileID',
        finalImageSize: payload.compressResult.compressedMeta.sizeLabel,
        finalQuality: payload.compressResult.quality
      });

      wx.cloud.callFunction({
        name: 'qwenScene',
        timeout: CLOUD_FUNCTION_TIMEOUT,
        data: payload.data,
        success(res) {
          cleanupCloudImage(payload.uploadedFileID, traceId);
          const durationMs = Date.now() - startedAt;
          const result = res.result || {};
          logQwen('cloud success', {
            traceId,
            durationMs,
            ok: result.ok,
            code: result.code || '',
            model: result.model,
            cloudDurationMs: result.durationMs,
            error: result.error || '',
            usage: result.usage || null
          });

          if (!result.ok || !result.template) {
            const error = new Error(`[${traceId}] ${result.error || 'Invalid Qwen response'}`);
            error.code = result.code || '';
            error.detail = result.detail || '';
            reject(error);
            return;
          }

          const record = createSceneRecord(result.template, imagePath, source);
          record.aiProvider = 'qwen';
          record.aiTraceId = traceId;
          resolve(record);
        },
        fail(error) {
          cleanupCloudImage(payload.uploadedFileID, traceId);
          const durationMs = Date.now() - startedAt;
          const message = error && (error.errMsg || error.message)
            ? (error.errMsg || error.message)
            : 'wx.cloud.callFunction timeout';
          warnQwen('cloud fail', {
            traceId,
            durationMs,
            message
          });
          reject(new Error(`[${traceId}] ${message}`));
        }
      });
    }));
}

function analyzeImageToLearningCard(params) {
  return callQwenScene(params);
}

module.exports = {
  analyzeImageToLearningCard
};
