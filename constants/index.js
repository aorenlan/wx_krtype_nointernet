export const KEYBOARD_LAYOUT = [
  // Row 1
  [
    { char: 'q', korChar: 'ㅂ', shiftChar: 'Q', shiftKorChar: 'ㅃ', row: 0 },
    { char: 'w', korChar: 'ㅈ', shiftChar: 'W', shiftKorChar: 'ㅉ', row: 0 },
    { char: 'e', korChar: 'ㄷ', shiftChar: 'E', shiftKorChar: 'ㄸ', row: 0 },
    { char: 'r', korChar: 'ㄱ', shiftChar: 'R', shiftKorChar: 'ㄲ', row: 0 },
    { char: 't', korChar: 'ㅅ', shiftChar: 'T', shiftKorChar: 'ㅆ', row: 0 },
    { char: 'y', korChar: 'ㅛ', row: 0 },
    { char: 'u', korChar: 'ㅕ', row: 0 },
    { char: 'i', korChar: 'ㅑ', row: 0 },
    { char: 'o', korChar: 'ㅐ', shiftChar: 'O', shiftKorChar: 'ㅒ', row: 0 },
    { char: 'p', korChar: 'ㅔ', shiftChar: 'P', shiftKorChar: 'ㅖ', row: 0 },
  ],
  // Row 2
  [
    { char: 'a', korChar: 'ㅁ', row: 1 },
    { char: 's', korChar: 'ㄴ', row: 1 },
    { char: 'd', korChar: 'ㅇ', row: 1 },
    { char: 'f', korChar: 'ㄹ', row: 1 },
    { char: 'g', korChar: 'ㅎ', row: 1 },
    { char: 'h', korChar: 'ㅗ', row: 1 },
    { char: 'j', korChar: 'ㅓ', row: 1 },
    { char: 'k', korChar: 'ㅏ', row: 1 },
    { char: 'l', korChar: 'ㅣ', row: 1 },
  ],
  // Row 3
  [
    { char: 'z', korChar: 'ㅋ', row: 2 },
    { char: 'x', korChar: 'ㅌ', row: 2 },
    { char: 'c', korChar: 'ㅊ', row: 2 },
    { char: 'v', korChar: 'ㅍ', row: 2 },
    { char: 'b', korChar: 'ㅠ', row: 2 },
    { char: 'n', korChar: 'ㅜ', row: 2 },
    { char: 'm', korChar: 'ㅡ', row: 2 },
  ],
];

// Complex Vowel Decompositions (Standard 2-Set)
// Maps the Unicode complex vowel to [First Key, Second Key]
export const COMPLEX_VOWELS = {
  'ㅘ': ['h', 'k'], // ㅗ + ㅏ
  'ㅙ': ['h', 'o'], // ㅗ + ㅐ
  'ㅚ': ['h', 'l'], // ㅗ + ㅣ
  'ㅝ': ['n', 'j'], // ㅜ + ㅓ
  'ㅞ': ['n', 'p'], // ㅜ + ㅔ
  'ㅟ': ['n', 'l'], // ㅜ + ㅣ
  'ㅢ': ['m', 'l'], // ㅡ + ㅣ
};
