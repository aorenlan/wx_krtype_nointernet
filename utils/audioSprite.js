import beginnerWordsMap from '../assets/audio_maps/beginnerWords.js';
import commonSentencesMap from '../assets/audio_maps/commonSentences.js';
import dramaLinesMap from '../assets/audio_maps/dramaLines.js';
import popularSongsMap from '../assets/audio_maps/popularSongs.js';
import startNicknamesMap from '../assets/audio_maps/startNicknames.js';
import supportWordsMap from '../assets/audio_maps/supportWords.js';

const CATEGORY_MAPS = {
  beginnerWords: beginnerWordsMap,
  commonSentences: commonSentencesMap,
  dramaLines: dramaLinesMap,
  popularSongs: popularSongsMap,
  startNicknames: startNicknamesMap,
  supportWords: supportWordsMap
};

const FILE_PATH_MAP = {
  'commonSentences_0.mp3': '/subpackages/audio_p1/static/commonSentences_0.mp3',
  'commonSentences_1.mp3': '/subpackages/audio_p2/static/commonSentences_1.mp3',
  'commonSentences_2.mp3': '/subpackages/audio_p5/static/commonSentences_2.mp3',
  'beginnerWords_0.mp3': '/subpackages/audio_p3/static/beginnerWords_0.mp3',
  'beginnerWords_1.mp3': '/subpackages/audio_p4/static/beginnerWords_1.mp3',
  'dramaLines_0.mp3': '/subpackages/audio_p4/static/dramaLines_0.mp3',
  'supportWords_0.mp3': '/subpackages/audio_p5/static/supportWords_0.mp3',
  'startNicknames_0.mp3': '/subpackages/audio_p6/static/startNicknames_0.mp3',
  'popularSongs_0.mp3': '/subpackages/audio_p6/static/popularSongs_0.mp3'
};

class AudioSpritePlayer {
  constructor() {
    // Use WebAudioContext for precise playback (fixes Seek/Timing issues on real devices)
    this.ctx = wx.createWebAudioContext();
    // InnerAudioContext helper ONLY for obeyMuteSwitch handling on iOS
    // WebAudio API does not have an "obeyMuteSwitch" property, but setting it on the global
    // InnerAudioContext sometimes affects the global AudioSession category on iOS.
    this.muteHelper = wx.createInnerAudioContext();
    if (wx.setInnerAudioOption) {
        wx.setInnerAudioOption({ 
            obeyMuteSwitch: false,  // Try to force playback even if silent switch is on
            mixWithOther: false     // Duck other audio
        });
    }

    this.currentCategory = null;
    this.audioMap = null;
    this.isReady = false;
    this.cachedPaths = {}; 
    this.audioBuffers = {}; // Store decoded AudioBuffers: { filename: AudioBuffer }
  }

  async init(category = 'beginnerWords') {
    if (this.isReady && this.currentCategory === category) {
       console.log(`AudioSprite already loaded: ${category}`);
       return;
    }

    try {
      console.log(`Loading AudioSprite (WebAudio Implementation): ${category}...`);
      
      // Fix for iOS: Ensure WebAudio Context is resumed
      // iOS suspends AudioContext if not created in a user gesture.
      // We must resume it explicitly.
      if (this.ctx.state === 'suspended') {
          console.log('[AudioSprite] Resuming suspended context (init phase)...');
          try {
             await this.ctx.resume();
             console.log('[AudioSprite] Context resumed.');
          } catch(e) {
             console.warn('[AudioSprite] Failed to resume context:', e);
          }
      }
      
      // 1. Load Map
      const map = CATEGORY_MAPS[category];
      if (!map) throw new Error(`No map found for category: ${category}`);
      this.audioMap = map;
      
      // 2. Identify files
      const filesToLoad = new Set();
      Object.values(map).forEach(entry => {
        filesToLoad.add(entry.file || `${category}.mp3`);
      });

      // 3. Load Subpackages & Copy Files (Keep existing logic)
      const subpackagesToLoad = new Set();
      filesToLoad.forEach(filename => {
        const path = FILE_PATH_MAP[filename];
        if (path && (path.includes('/subpackages/') || path.startsWith('subpackages/'))) {
          const parts = path.split('/');
          const subPkgIndex = parts.indexOf('subpackages');
          if (subPkgIndex !== -1 && parts.length > subPkgIndex + 1) {
             subpackagesToLoad.add(parts[subPkgIndex + 1]);
          }
        }
      });
      
      if (subpackagesToLoad.size > 0) {
        await Promise.all(Array.from(subpackagesToLoad).map(name => this.loadSubpackage(name)));
      }

      // 4. Cache & Decode Audio
      // We must read the file into an ArrayBuffer and decode it for WebAudio
      const fs = wx.getFileSystemManager();
      
      // Clear previous buffers to save memory if switching categories
      if (this.currentCategory !== category) {
          this.audioBuffers = {}; 
      }

      await Promise.all(Array.from(filesToLoad).map(async (filename) => {
        // If already decoded, skip
        if (this.audioBuffers[filename]) return;

        let targetPath = this.cachedPaths[filename];
        
        // If not in cache map, try to copy/find it
        if (!targetPath) {
             const srcPath = FILE_PATH_MAP[filename];
             if (!srcPath) return;

             targetPath = `${wx.env.USER_DATA_PATH}/${filename}`;
             
             // Try to copy if not exists
             try {
                fs.accessSync(targetPath);
                console.log(`[AudioSprite] Found local file: ${targetPath}`);
             } catch(e) {
                // Copy
                const absSrcPath = srcPath.startsWith('/') ? srcPath : `/${srcPath}`;
                console.log(`[AudioSprite] Copying ${absSrcPath} -> ${targetPath}`);
                await new Promise((resolve, fail) => {
                    fs.copyFile({
                        srcPath: absSrcPath,
                        destPath: targetPath,
                        success: resolve,
                        fail: (err) => {
                            console.error('Copy failed', err);
                            // If copy fails, we can't use WebAudio easily with simple paths
                            // But we'll try to read from pkg path (might fail if pkg is compressed)
                            targetPath = absSrcPath; 
                            resolve();
                        }
                    });
                });
             }
             this.cachedPaths[filename] = targetPath;
        }

        // Read & Decode
        console.log(`[AudioSprite] Reading & Decoding: ${filename}`);
        try {
            const fileContent = fs.readFileSync(targetPath); // Read as ArrayBuffer
            
            // Fix for iOS Decode Error:
            // iOS WebAudio decodeAudioData is strict. It might fail silently or produce empty buffer
            // if the ArrayBuffer is from a file read that contains extra metadata or format issues.
            // However, the logs show decode success.
            // BUT, iOS requires the context to be "ready" before decoding sometimes? No.
            
            // CRITICAL FIX FOR iOS SILENCE:
            // Use callback-based decodeAudioData which is more reliable on older/strict Webkits
            // AND ensure we clone the buffer if needed? No.
            // The issue is likely that we are decoding BEFORE the context is fully running/resumed?
            // Actually, you can decode in suspended state.
            
            // Suspect: Mono vs Stereo issue on iOS?
            // Log shows channels=1 (Mono). iOS sometimes has issues with Mono output to Stereo hardware?
            // Let's try to force destination connection logic change or just standard decode.
            
            const audioBuffer = await new Promise((resolve, reject) => {
                this.ctx.decodeAudioData(fileContent, (decoded) => {
                    resolve(decoded);
                }, (err) => {
                    reject(err);
                });
            });
            this.audioBuffers[filename] = audioBuffer;
            console.log(`[AudioSprite] Decoded successfully: ${filename} (Duration: ${audioBuffer.duration}s)`);
        } catch (err) {
            console.error(`[AudioSprite] Failed to decode ${filename}:`, err);
        }
      }));

      this.currentCategory = category;
      this.isReady = true;
      console.log(`AudioSprite loaded successfully: ${category}`);
    } catch (e) {
      console.error(`Failed to load AudioSprite for ${category}:`, e);
      this.isReady = false;
      throw e; 
    }
  }

  // loadSubpackage method remains the same... 
  loadSubpackage(subpackageName) {
    return new Promise((resolve, reject) => {
      console.log(`Loading subpackage via require.async: ${subpackageName}...`);
      if (require.async) {
        let loadPromise;
        switch (subpackageName) {
            case 'audio_p1': loadPromise = require.async('../subpackages/audio_p1/load.js'); break;
            case 'audio_p2': loadPromise = require.async('../subpackages/audio_p2/load.js'); break;
            case 'audio_p3': loadPromise = require.async('../subpackages/audio_p3/load.js'); break;
            case 'audio_p4': loadPromise = require.async('../subpackages/audio_p4/load.js'); break;
            case 'audio_p5': loadPromise = require.async('../subpackages/audio_p5/load.js'); break;
            case 'audio_p6': loadPromise = require.async('../subpackages/audio_p6/load.js'); break;
            default: resolve(); return;
        }
        loadPromise.then(resolve).catch(resolve);
      } else {
         resolve();
      }
    });
  }

  clearMemoryCache() {
      this.cachedPaths = {};
      this.audioBuffers = {};
      this.isReady = false;
      this.currentCategory = null;
      console.log('[AudioSprite] Memory cache cleared');
  }

  play(word) {
    const normalizedWord = word.normalize('NFC');
    if (!this.isReady || !this.audioMap || !this.audioMap[normalizedWord]) {
      console.warn('[AudioSprite] Word not found or not ready:', word);
      return;
    }

    try {
      // iOS WebAudio Fix:
      // WebAudio context MUST be resumed inside a user gesture event.
      // Even if we resumed it in init(), iOS might suspend it again or ignore the async resume.
      // The best place is right here, inside play() which is triggered by a tap.
      if (this.ctx.state === 'suspended') {
          console.warn('[AudioSprite] Context suspended on play. Resuming...');
          this.ctx.resume().then(() => {
              console.log('[AudioSprite] Context resumed successfully on play.');
          }).catch(e => console.error('[AudioSprite] Resume failed:', e));
      }

      const entry = this.audioMap[normalizedWord];
      const { start, duration, file } = entry;
      
      const filename = file || `${this.currentCategory}.mp3`;
      
      const buffer = this.audioBuffers[filename];
      if (!buffer) {
          console.error(`[AudioSprite] No audio buffer for ${filename}`);
          return;
      }

      // Stop previous source if any (optional, but good for fast switching)
      if (this.currentSource) {
          try { this.currentSource.stop(); } catch(e) {}
      }

      // Create BufferSource
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      
      // Detailed logging for debugging iOS silence
      console.log(`[AudioSprite] WebAudio State: ${this.ctx.state}, CurrentTime: ${this.ctx.currentTime}`);
      console.log(`[AudioSprite] Buffer Info: channels=${buffer.numberOfChannels}, rate=${buffer.sampleRate}, length=${buffer.length}`);
      
      // Start at 'start' for 'duration'
      console.log(`[AudioSprite] Playing WebAudio: ${word} (${start}s - ${duration}s)`);
      source.start(0, start, duration);
      
      this.currentSource = source;
      
      // Log when playback should theoretically end
      source.onended = () => {
          console.log(`[AudioSprite] Playback ended for ${word}`);
      };

    } catch (e) {
      console.error('[AudioSprite] Playback error:', e);
    }
  }

  has(word) {
    const normalizedWord = word.normalize('NFC');
    return this.isReady && this.audioMap && !!this.audioMap[normalizedWord];
  }
}

export const audioSprite = new AudioSpritePlayer();
