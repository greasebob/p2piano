// Computer keyboard mapping, matching the Roblox piano layout QuartzMIDI uses:
// - 61 keys from C2, Shift for sharps
// - Ctrl for the remaining notes of the 88 keys
// - Alt + key for one of 32 velocity levels
// - Space for sustain, ] for sostenuto

const WHITE_CHARS = '1234567890qwertyuiopasdfghjklzxcvbnm';
const LOW_CHARS = '1234567890qwert'; // Ctrl: A0 to B1
const HIGH_CHARS = 'yuiopasdfghj'; // Ctrl: C#7 to C8
const VELOCITY_CHARS = '1234567890qwertyuiopasdfghjklzxc';
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const HAS_SHARP = [true, true, false, true, true, true, false];

const codeOf = c => (c >= '0' && c <= '9' ? 'Digit' : 'Key') + c.toUpperCase();
const indexBy = chars => Object.fromEntries([...chars].map((c, i) => [codeOf(c), i]));
const WHITE = indexBy(WHITE_CHARS);
const LOW = indexBy(LOW_CHARS);
const HIGH = indexBy(HIGH_CHARS);
const VELOCITY = indexBy(VELOCITY_CHARS);

export const SUSTAIN_CODE = 'Space';
export const SOSTENUTO_CODE = 'BracketRight';

/** Converts a velocity level (0-31) to a MIDI velocity. */
export const levelVelocity = level => Math.min(127, (level + 1) * 4);

/**
 * Maps a keydown to {note}, {level} or null.
 * @param {KeyboardEvent} e
 */
export function keyAction(e) {
    const code = e.code;
    if (e.altKey && !e.ctrlKey) {
        return code in VELOCITY ? { level: VELOCITY[code] } : null;
    }
    if (e.ctrlKey && !e.altKey) {
        if (code in LOW) return { note: 21 + LOW[code] };
        if (code in HIGH) return { note: 97 + HIGH[code] };
        return null;
    }
    if (e.ctrlKey || !(code in WHITE)) return null;
    const i = WHITE[code];
    const note = 36 + 12 * Math.floor(i / 7) + WHITE_STEPS[i % 7];
    if (!e.shiftKey) return { note };
    return HAS_SHARP[i % 7] && note < 96 ? { note: note + 1 } : null;
}

const SHIFTED_DIGITS = { 1: '!', 2: '@', 4: '$', 5: '%', 6: '^', 8: '*', 9: '(' };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Returns the note name for each of the 88 keys. C carries its octave, as in C4 for middle C. */
export function noteLabels() {
    const labels = {};
    for (let n = 21; n <= 108; n++) {
        const name = NOTE_NAMES[n % 12];
        labels[n] = { text: name === 'C' ? `C${Math.floor(n / 12) - 1}` : name };
    }
    return labels;
}

/**
 * Returns the key that plays each note, as written in sheets, with the notes shifted by
 * `transpose` semitones. Keys played with Ctrl are marked `ctrl`.
 */
export function keyLabels(transpose = 0) {
    const labels = {};
    const put = (note, text, ctrl = false) => {
        const n = note + transpose;
        if (n >= 21 && n <= 108) labels[n] = { text, ctrl };
    };
    [...WHITE_CHARS].forEach((c, i) => {
        const note = 36 + 12 * Math.floor(i / 7) + WHITE_STEPS[i % 7];
        put(note, c);
        if (HAS_SHARP[i % 7] && note < 96) put(note + 1, SHIFTED_DIGITS[c] ?? c.toUpperCase());
    });
    [...LOW_CHARS].forEach((c, i) => put(21 + i, c, true));
    [...HIGH_CHARS].forEach((c, i) => put(97 + i, c, true));
    return labels;
}
