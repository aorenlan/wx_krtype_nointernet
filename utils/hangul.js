import { COMPLEX_VOWELS } from '../constants/index';

// Hangul Unicode Constants
const BASE = 0xAC00; // '가'
const END = 0xD7A3; // '힣'
const INITIALS = [
  'r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'
];
// ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ

const VOWELS = [
  'k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'
];
// ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ

const FINALS = [
  '', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'
];
// (none) ㄱ ㄲ ㄳ ㄴ ㄵ ㄶ ㄷ ㄹ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅁ ㅂ ㅄ ㅅ ㅆ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ

// Supported keys on our virtual keyboard
const VALID_KEYS = new Set([
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',
  'z','x','c','v','b','n','m',
  'Q','W','E','R','T','Y','U','I','O','P',
  'A','S','D','F','G','H','J','K','L',
  'Z','X','C','V','B','N','M',
  'SPACE'
]);

// Mapping for Compatibility Jamo (U+3130 - U+318F)
const JAMO_MAP = {
  0x3131: ['r'], // ㄱ
  0x3132: ['R'], // ㄲ
  0x3133: ['r', 't'], // ㄳ
  0x3134: ['s'], // ㄴ
  0x3135: ['s', 'w'], // ㄵ
  0x3136: ['s', 'g'], // ㄶ
  0x3137: ['e'], // ㄷ
  0x3138: ['E'], // ㄸ
  0x3139: ['f'], // ㄹ
  0x313A: ['f', 'r'], // ㄺ
  0x313B: ['f', 'a'], // ㄻ
  0x313C: ['f', 'q'], // ㄼ
  0x313D: ['f', 't'], // ㄽ
  0x313E: ['f', 'x'], // ㄾ
  0x313F: ['f', 'v'], // ㄿ
  0x3140: ['f', 'g'], // ㅀ
  0x3141: ['a'], // ㅁ
  0x3142: ['q'], // ㅂ
  0x3143: ['Q'], // ㅃ
  0x3144: ['q', 't'], // ㅄ
  0x3145: ['t'], // ㅅ
  0x3146: ['T'], // ㅆ
  0x3147: ['d'], // ㅇ
  0x3148: ['w'], // ㅈ
  0x3149: ['W'], // ㅉ
  0x314A: ['c'], // ㅊ
  0x314B: ['z'], // ㅋ
  0x314C: ['x'], // ㅌ
  0x314D: ['v'], // ㅍ
  0x314E: ['g'], // ㅎ
  0x314F: ['k'], // ㅏ
  0x3150: ['o'], // ㅐ
  0x3151: ['i'], // ㅑ
  0x3152: ['O'], // ㅒ
  0x3153: ['j'], // ㅓ
  0x3154: ['p'], // ㅔ
  0x3155: ['u'], // ㅕ
  0x3156: ['P'], // ㅖ
  0x3157: ['h'], // ㅗ
  0x3158: ['h', 'k'], // ㅘ
  0x3159: ['h', 'o'], // ㅙ
  0x315A: ['h', 'l'], // ㅚ
  0x315B: ['y'], // ㅛ
  0x315C: ['n'], // ㅜ
  0x315D: ['n', 'j'], // ㅝ
  0x315E: ['n', 'p'], // ㅞ
  0x315F: ['n', 'l'], // ㅟ
  0x3160: ['b'], // ㅠ
  0x3161: ['m'], // ㅡ
  0x3162: ['m', 'l'], // ㅢ
  0x3163: ['l'], // ㅣ
};

/**
 * Helper to get keys for a vowel index, handling complex vowels.
 */
const getVowelKeys = (vowelIdx) => {
  const vowelChar = String.fromCharCode(0x314F + vowelIdx); // Map index back to compatibility Jamo for lookup if needed, or just use logic
  // Actually, our VOWELS array maps index to keys directly for simple vowels.
  // But VOWELS array in source code was keys? No, let's re-read source.
  // Source VOWELS array was: ['k', 'o', ...]. These are the keys!
  
  // Wait, the source code `getVowelKeys` function was missing in my read.
  // I missed reading `getVowelKeys` function definition in the previous Read tool call because of limit.
  // I need to infer it or re-read it.
  // Looking at VOWELS array: 'hk' is there. 'hk' means 'h' then 'k'.
  // So VOWELS array actually contains the key sequence strings.
  
  const keyStr = VOWELS[vowelIdx];
  if (keyStr.length > 1) {
      // It's a combination, split it.
      return keyStr.split('');
  }
  return [keyStr];
};

/**
 * Validates if the input text contains only supported characters (Korean, English, Space).
 * Numbers and symbols are strictly not allowed as they are not on the keyboard.
 */
export const validateInput = (text) => {
  // Allowed: Hangul Syllables, Jamo, Compatibility Jamo, ASCII (0x20-0x7E), General Punctuation (0x2000-0x206F), Whitespace
  const invalidRegex = /[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\u0020-\u007E\u2000-\u206F\s]/g;
  const invalidChars = text.match(invalidRegex);
  
  if (invalidChars) {
    return { valid: false, invalidChars: Array.from(new Set(invalidChars)) };
  }
  return { valid: true, invalidChars: [] };
};

/**
 * Decomposes a Korean string into a structure preserving character-to-keys mapping.
 */
export const decomposeKoreanStructure = (text) => {
  const result = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charCode = text.charCodeAt(i);
    const charKeys = [];

    // Check if it's a Hangul Syllable
    if (charCode >= BASE && charCode <= END) {
      const offset = charCode - BASE;
      
      const initialIdx = Math.floor(offset / 588);
      const medialIdx = Math.floor((offset % 588) / 28);
      const finalIdx = offset % 28;

      // 1. Initial Consonant
      charKeys.push(INITIALS[initialIdx]);

      // 2. Medial Vowel
      const vowelKeys = getVowelKeys(medialIdx);
      charKeys.push(...vowelKeys);

      // 3. Final Consonant (Batchim)
      if (finalIdx > 0) {
        const finalKeyString = FINALS[finalIdx];
        for (const k of finalKeyString) {
           charKeys.push(k);
        }
      }
    } 
    else if (charCode === 32) {
      charKeys.push('SPACE');
    }
    // Handle Compatibility Jamo
    else if (JAMO_MAP[charCode]) {
       const keys = JAMO_MAP[charCode];
       for (const k of keys) {
           charKeys.push(k);
       }
    }
    else {
      if (VALID_KEYS.has(char)) {
        charKeys.push(char);
      } else if (VALID_KEYS.has(char.toLowerCase())) {
         charKeys.push(char);
      }
    }

    result.push({
        char: char,
        keys: charKeys
    });
  }
  return result;
};
