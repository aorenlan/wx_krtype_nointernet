const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const AUDIO_SRC = path.join(PROJECT_ROOT, 'assets/audio');
const SUBPACKAGES_ROOT = path.join(PROJECT_ROOT, 'subpackages');
const MAPS_DEST = path.join(PROJECT_ROOT, 'assets/audio_maps');
const NEWVERSION_DIR = path.join(PROJECT_ROOT, 'data/newversion');

// Mapping config
const MP3_MAPPING = [
    // beginnerWords (Split into 2)
    { file: 'beginnerWords_0.mp3', dest: 'audio_p3/static' },
    { file: 'beginnerWords_1.mp3', dest: 'audio_p4/static' }, // Put remainder in p4
    
    // commonSentences (Split into 3)
    { file: 'commonSentences_0.mp3', dest: 'audio_p1/static' },
    { file: 'commonSentences_1.mp3', dest: 'audio_p2/static' },
    { file: 'commonSentences_2.mp3', dest: 'audio_p5/static' }, // Put remainder in p5
    
    // dramaLines
    { file: 'dramaLines_0.mp3', dest: 'audio_p4/static' },
    
    // supportWords
    { file: 'supportWords_0.mp3', dest: 'audio_p5/static' },
    
    // popularSongs & startNicknames
    { file: 'popularSongs_0.mp3', dest: 'audio_p6/static' },
    { file: 'startNicknames_0.mp3', dest: 'audio_p6/static' }
];

const JSON_FILES = [
    'beginnerWords.json',
    'commonSentences.json',
    'dramaLines.json',
    'popularSongs.json',
    'startNicknames.json',
    'supportWords.json'
];

const args = process.argv.slice(2);
const mode = args.includes('--newversion') ? 'newversion' : 'audio';

if (mode === 'newversion') {
    if (!fs.existsSync(NEWVERSION_DIR)) {
        console.error(`Directory not found: ${NEWVERSION_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(NEWVERSION_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        console.log('No JSON files found under data/newversion/');
        process.exit(0);
    }

    console.log('Regenerating newversion JS files from JSON...');
    files.forEach((jsonFile) => {
        const jsonPath = path.join(NEWVERSION_DIR, jsonFile);
        const jsFileName = jsonFile.replace(/\.json$/i, '.js');
        const jsPath = path.join(NEWVERSION_DIR, jsFileName);
        const raw = fs.readFileSync(jsonPath, 'utf8');
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            console.error(`Invalid JSON: ${jsonFile}`);
            throw e;
        }

        const body = JSON.stringify(data, null, 2);
        const content = `module.exports = ${body};\n`;
        fs.writeFileSync(jsPath, content);
        console.log(`Wrote ${path.relative(PROJECT_ROOT, jsPath)}`);
    });

    console.log('Newversion update complete.');
    process.exit(0);
}

console.log('Moving MP3 files...');
MP3_MAPPING.forEach(item => {
    const src = path.join(AUDIO_SRC, item.file);
    const destDir = path.join(SUBPACKAGES_ROOT, item.dest);
    const dest = path.join(destDir, item.file);

    if (fs.existsSync(src)) {
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
        console.log(`Copied ${item.file} -> ${item.dest}`);
        
        fs.unlinkSync(src);
        console.log(`Removed source ${item.file}`);
    } else {
        console.warn(`Source file not found: ${src}`);
    }
});

console.log('Converting JSON maps to JS...');
if (!fs.existsSync(MAPS_DEST)) {
    fs.mkdirSync(MAPS_DEST, { recursive: true });
}

JSON_FILES.forEach(jsonFile => {
    const src = path.join(AUDIO_SRC, jsonFile);
    if (fs.existsSync(src)) {
        const content = fs.readFileSync(src, 'utf8');
        const jsFileName = jsonFile.replace('.json', '.js');
        const dest = path.join(MAPS_DEST, jsFileName);
        
        const jsContent = `export default ${content};`;
        fs.writeFileSync(dest, jsContent);
        console.log(`Converted ${jsonFile} -> ${jsFileName}`);
    } else {
        console.warn(`Source JSON not found: ${src}`);
    }
});

console.log('Update complete.');
