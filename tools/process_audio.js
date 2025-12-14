const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VOICE_ROOT = path.join(PROJECT_ROOT, 'data/voice');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'assets/audio');
const MAX_SIZE_BYTES = 1.6 * 1024 * 1024; // 1.6 MB safety limit
const BITRATE = 48000; // 48k bits/s
const BYTES_PER_SEC = BITRATE / 8; // 6000 bytes/s
const SILENCE_DURATION = 0.5;
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');

// Map directory names to data file names
const DIR_TO_DATA_MAP = {
    'beginnerWords': 'beginnerWords.js',
    'commonSentences': 'commonSentences.js',
    'dramaLines': 'dramaLines.js',
    'popularSongs': 'popularSongs.js',
    'startNicknames': 'starNicknames.js', // Note: dir is start..., file is star...
    'supportWords': 'supportWords.js'
};

function getExpectedKeys(dirName) {
    const dataFileName = DIR_TO_DATA_MAP[dirName];
    if (!dataFileName) {
        console.warn(`No data file mapped for directory ${dirName}`);
        return null;
    }

    const dataFilePath = path.join(DATA_ROOT, dataFileName);
    if (!fs.existsSync(dataFilePath)) {
        console.warn(`Data file not found: ${dataFilePath}`);
        return null;
    }

    const content = fs.readFileSync(dataFilePath, 'utf8');
    const keys = new Set();
    
    // Regex to match korean: "..." or "korean": "..."
    const regex = /(?:["']?korean["']?)\s*:\s*(["'])(.*?)\1/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        keys.add(match[2]);
    }
    
    console.log(`Loaded ${keys.size} expected keys from ${dataFileName}`);
    return keys;
}

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all subdirectories in data/voice
const subdirs = fs.readdirSync(VOICE_ROOT, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

console.log(`Found audio directories: ${subdirs.join(', ')}`);

subdirs.forEach(dirName => {
    processDirectory(dirName);
});

function processDirectory(dirName) {
    console.log(`\nProcessing ${dirName}...`);
    const sourceDir = path.join(VOICE_ROOT, dirName);
    const expectedKeys = getExpectedKeys(dirName);
    
    // Clean up old files for this dir
    const oldFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith(dirName) && (f.endsWith('.mp3') || f.endsWith('.json')));
    oldFiles.forEach(f => fs.unlinkSync(path.join(OUTPUT_DIR, f)));

    // Get all mp3 files
    const files = fs.readdirSync(sourceDir)
        .filter(f => f.endsWith('.mp3'))
        .sort((a, b) => a.localeCompare(b));
        
    if (files.length === 0) {
        console.log(`No mp3 files in ${dirName}, skipping.`);
        return;
    }

    const audioMap = {};
    let batchIndex = 0;
    let currentBatchFiles = [];
    let currentBatchDuration = 0;

    // Helper to process a batch
    const processBatch = (batchFiles, index) => {
        if (batchFiles.length === 0) return;
        
        const outputMp3Name = `${dirName}_${index}.mp3`;
        const outputMp3Path = path.join(OUTPUT_DIR, outputMp3Name);
        const tempTxt = path.join(__dirname, `files_${dirName}_${index}.txt`);
        
        // Write temp list with padding
        // ffmpeg concat protocol supports 'duration' directive for padding
        // Format:
        // file 'path/to/file.mp3'
        // duration 0.5 (this directive actually sets the duration of the *previous* file, not adding silence directly in simple concat demuxer without filters)
        // WAIT: The concat demuxer doesn't easily insert silence unless we have a silence file.
        // Alternative: Use anullsrc filter or generate a silence.mp3 and interleave it.
        // EASIER: Just generate a 0.5s silence mp3 once and insert it between every file.
        
        const silencePath = path.join(__dirname, 'silence.mp3');
        if (!fs.existsSync(silencePath)) {
             // Generate 0.5s silence
             console.log('Generating silence.mp3...');
             execSync(`ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 0.5 -q:a 9 -acodec libmp3lame "${silencePath}"`);
        }
        
        const silenceDuration = 0.5;
        let fileListContent = '';
        
        // We will reconstruct the timeline
        // currentBatchDuration needs to be recalculated with silence
        let currentOffset = 0;

        batchFiles.forEach((f, idx) => {
             // Add file
             fileListContent += `file '${path.join(sourceDir, f.file)}'\n`;
             
             // Update map immediately (we will recalculate offset)
             // But wait, we need to know the offset in the *final* file.
             // The concat will be: File1 + Silence + File2 + Silence ...
             
             // Update the entry in batchFiles to reflect the new offset
             // f.duration is the duration of the file itself.
             
             // Correct offset logic:
             // Item 0 starts at 0.
             // Item 1 starts at Duration0 + Silence.
             // Item 2 starts at Duration0 + Silence + Duration1 + Silence.
             
             f.finalOffset = currentOffset;
             currentOffset += f.duration;
             
             // Add silence (except after the very last file of the batch? No, adding at end is fine too, or just between)
             // Let's add between files.
             if (idx < batchFiles.length - 1) {
                 fileListContent += `file '${silencePath}'\n`;
                 currentOffset += silenceDuration;
             }
        });
        
        fs.writeFileSync(tempTxt, fileListContent);
        
        try {
            console.log(`Creating ${outputMp3Name} (${batchFiles.length} files with padding)...`);
            // ffmpeg concat with re-encode
            execSync(`ffmpeg -f concat -safe 0 -i "${tempTxt}" -c:a libmp3lame -b:a 48k -ac 1 -ar 22050 -y "${outputMp3Path}"`, { stdio: 'inherit' });
            
            // Update map with actual file reference and NEW offsets
            batchFiles.forEach(f => {
                audioMap[f.word] = {
                    start: Number(f.finalOffset.toFixed(3)),
                    duration: Number(f.duration.toFixed(3)),
                    file: outputMp3Name
                };
            });
            
        } catch (e) {
            console.error(`Failed to create ${outputMp3Name}:`, e.message);
        } finally {
            if (fs.existsSync(tempTxt)) fs.unlinkSync(tempTxt);
        }
    };

    for (const file of files) {
        const rawWord = path.basename(file, '.mp3');
        let word = rawWord.normalize('NFC');
        const filePath = path.join(sourceDir, file);

        // Try to match with expected keys if available
        if (expectedKeys) {
            if (expectedKeys.has(word)) {
                // Perfect match
            } else if (expectedKeys.has(word + '.')) {
                word = word + '.';
            } else if (expectedKeys.has(word.replace(/\.$/, ''))) {
                word = word.replace(/\.$/, '');
            } else {
                 // Try loose matching (ignoring punctuation/spaces) as fallback?
                 // For now just warn
                 // console.warn(`Warning: No match found for file "${file}" (key: "${word}") in data file.`);
            }
        }

        try {
            const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
            const durationStr = execSync(cmd).toString().trim();
            const duration = parseFloat(durationStr);

            if (!isNaN(duration)) {
                // Check if adding this file exceeds limit
                // Account for silence padding (approx 1 silence per file added)
                const currentSilenceDuration = Math.max(0, currentBatchFiles.length - 1) * SILENCE_DURATION;
                const newSilenceDuration = currentBatchFiles.length * SILENCE_DURATION;
                
                // Size if we add this file:
                // (currentAudio + newAudio + newSilence) * BPS
                const projectedDuration = currentBatchDuration + duration + newSilenceDuration;
                const projectedSize = projectedDuration * BYTES_PER_SEC;
                
                if (projectedSize > MAX_SIZE_BYTES && currentBatchFiles.length > 0) {
                    // Process current batch
                    processBatch(currentBatchFiles, batchIndex);
                    batchIndex++;
                    currentBatchFiles = [];
                    currentBatchDuration = 0;
                }
                
                // Add to current (or new) batch
                currentBatchFiles.push({
                    file: file,
                    word: word,
                    duration: duration,
                    offset: currentBatchDuration
                });
                currentBatchDuration += duration;
            }
        } catch (e) {
            console.error(`Error processing ${word}:`, e.message);
        }
    }

    // Process final batch
    if (currentBatchFiles.length > 0) {
        processBatch(currentBatchFiles, batchIndex);
    }

    // Write Map
    const outputJson = path.join(OUTPUT_DIR, `${dirName}.json`);
    fs.writeFileSync(outputJson, JSON.stringify(audioMap, null, 2));
    console.log(`Created Map: ${outputJson}`);
}

console.log('\nAll done.');
