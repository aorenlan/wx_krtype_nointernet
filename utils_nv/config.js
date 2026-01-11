// ==================== 环境配置 ====================
// 修改此处切换环境：'development' 为本地开发，'production' 为线上生产
const ENV = 'production'; // 'development' | 'production'

// ==================== API 配置 ====================
const API_CONFIG = {
    development: {
        baseUrl: 'http://10.35.36.54:33333/api',
        name: '本地开发环境'
    },
    production: {
        baseUrl: 'https://flashflow.aorenlan.fun/api',
        name: '生产环境'
    }
};

// ==================== OSS 配置（第三方资源，保持不变）====================
const OSS_CONFIG = {
    // 文章相关资源
    articleBase: 'https://enoss.aorenlan.fun/article',
    audioBase: 'https://enoss.aorenlan.fun/',

    // 有道词典发音（第三方服务）
    youdaoVoice: 'https://dict.youdao.com/dictvoice'
};

// ==================== 导出配置 ====================
export const API_BASE_URL = API_CONFIG[ENV].baseUrl;
export const ENV_NAME = API_CONFIG[ENV].name;
export const CURRENT_ENV = ENV;

// 导出 OSS 配置
export const OSS_ARTICLE_BASE = OSS_CONFIG.articleBase;
export const OSS_AUDIO_BASE = OSS_CONFIG.audioBase;
export const YOUDAO_VOICE_URL = OSS_CONFIG.youdaoVoice;

// ==================== OCR 专用配置（通过后台代理）====================
export const OCR_API_URL = `${API_BASE_URL}/proxy/ocr`;

// 打印当前环境信息（调试用）
console.log(`[Config] 当前环境: ${ENV_NAME} (${ENV})`);
console.log(`[Config] API地址: ${API_BASE_URL}`);
