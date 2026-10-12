// Compresses an SF2 bank to SF3 (Ogg Vorbis samples).
// usage: node to_sf3.mjs <in.sf2> <out.sf3> [vorbis quality, default 8]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const { SoundBankLoader } = await import('spessasynth_core');

const [, , src, dst, quality = '8'] = process.argv;

function encode(audio, rate) {
    const args = ['-v', 'error', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', '-',
        '-c:a', 'libvorbis', '-q:a', quality, '-f', 'ogg', '-'];
    const input = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
    return new Uint8Array(execFileSync('ffmpeg', args, { input, maxBuffer: 1 << 30 }));
}

const buf = readFileSync(src);
const bank = SoundBankLoader.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
let count = 0;
await bank.setSampleFormat({
    format: 'compressed',
    compressionFunction: async (audio, rate) => {
        const ogg = encode(audio, rate);
        if (++count % 60 === 0) console.log('encoded', count);
        return ogg;
    },
});
const out = bank.writeSF2({ software: 'Piano Room', writeDefaultModulators: true, writeExtendedLimits: true });
writeFileSync(dst, Buffer.from(out));
console.log('wrote', dst, (out.byteLength / 1048576).toFixed(1), 'MiB');
