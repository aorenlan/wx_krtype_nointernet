const fs = require('fs');
const path = require('path');

const DIR_TO_DATA_MAP = {
    'beginnerWords': 'beginnerWords.js',
    'commonSentences': 'commonSentences.js',
    'dramaLines': 'dramaLines.js',
    'popularSongs': 'popularSongs.js',
    'startNicknames': 'starNicknames.js',
    'supportWords': 'supportWords.js'
};

const PROJECT_ROOT = '/Users/makemoney/krtype3';
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const AUDIO_JSON_ROOT = path.join(PROJECT_ROOT, 'assets/audio');

Object.keys(DIR_TO_DATA_MAP).forEach(dirName => {
    const jsFileName = DIR_TO_DATA_MAP[dirName];
    const jsPath = path.join(DATA_ROOT, jsFileName);
    const jsonPath = path.join(AUDIO_JSON_ROOT, `${dirName}.json`);

    console.log(`\nChecking ${dirName} ...`);

    if (!fs.existsSync(jsPath)) {
        console.log(`  JS file missing: ${jsPath}`);
        return;
    }
    if (!fs.existsSync(jsonPath)) {
        console.log(`  JSON map missing: ${jsonPath}`);
        return;
    }

    // Read JS keys
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    const jsKeys = new Set();
    const regex = /(?:["']?korean["']?)\s*:\s*(["'])(.*?)\1/g;
    let match;
    while ((match = regex.exec(jsContent)) !== null) {
        jsKeys.add(match[2]);
    }
    console.log(`  Expected keys in JS: ${jsKeys.size}`);

    // Read JSON keys
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const jsonKeys = Object.keys(jsonContent);
    console.log(`  Actual keys in Audio JSON: ${jsonKeys.length}`);

    // Check overlap
    let matchedCount = 0;
    jsKeys.forEach(key => {
        if (jsonContent[key]) {
            matchedCount++;
        }
    });

    console.log(`  Matched: ${matchedCount} / ${jsKeys.size}`);
    
    if (matchedCount === 0 && jsKeys.size > 0) {
        console.log("  CRITICAL: No matches found!");
        // Print first few keys to compare
        console.log("  Sample JS keys:", Array.from(jsKeys).slice(0, 3));
        console.log("  Sample JSON keys:", jsonKeys.slice(0, 3));
    } else if (matchedCount < jsKeys.size) {
        console.log(`  Partial match. Missing ${jsKeys.size - matchedCount} keys.`);
    }
});
