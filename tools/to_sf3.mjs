// node to_sf3.mjs <in.sf2> <out.sf3> [vorbis quality]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const { SoundBankLoader } = await import('spessasynth_core');

const [, , src, dst, q = '8'] = process.argv;
const buf = readFileSync(src);
const bank = SoundBankLoader.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
let n = 0;
await bank.setSampleFormat({
    format: 'compressed',
    compressionFunction: async (audio, rate) => {
        const ogg = execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', '-',
            '-c:a', 'libvorbis', '-q:a', q, '-f', 'ogg', '-'], { input: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength), maxBuffer: 1 << 30 });
        if (++n % 60 === 0) console.log('encoded', n);
        return new Uint8Array(ogg);
    }
});
const out = bank.writeSF2({ software: 'Piano Room', writeDefaultModulators: true, writeExtendedLimits: true });
writeFileSync(dst, Buffer.from(out));
console.log('wrote', dst, (out.byteLength / 1048576).toFixed(1), 'MiB');
