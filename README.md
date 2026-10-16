# P2Piano

An online piano room to play together from a link.
Players connect to each other directly, with no server of its own.

## Playing

Create a room and send the link; whoever opens it joins.
Play from a MIDI keyboard, the mouse, or the computer keyboard with the Roblox piano layout:

- `1`-`m` white keys C2-C7, Shift for sharps
- Ctrl+`1`-`t` A0-B1, Ctrl+`y`-`j` C#7-C8
- Alt+`1`-`c` velocity, 32 levels
- Space sustain, `]` sostenuto; Invert beside the Sustain chip holds the pedal down until Space
- Arrow keys transpose: left and right by a semitone, down and up by an octave; the key labels move with it only with Labels follow transpose on in Settings
- / or Enter opens the chat, Enter sends, Escape goes back to the piano

Chrome keeps Ctrl+W and Ctrl+T for itself unless the room is full screen.

## Building

```
npm install
npm run dev
npm run build
```

The Salamander piano is built from FreePats' `SalamanderGrandPiano-V3+20200602.sf2` with Python 3, numpy and ffmpeg:

```
python tools/build_bank.py SalamanderGrandPiano-V3+20200602.sf2 salamander-16.sf2 16
node tools/to_sf3.mjs salamander-16.sf2 public/soundfonts/salamander-grand-16-v1.sf3 8
```

The Amethyst pianos are built from the [Amethyst Imperial Grand](https://github.com/MyBlackMIDIScore/AmethystImperialGrand) SFZ library:

```
python tools/build_amethyst.py AmethystImperialGrand-2.0 studio amethyst-studio.sf2
node tools/to_sf3.mjs amethyst-studio.sf2 public/soundfonts/amethyst-studio-v1.sf3
python tools/build_amethyst.py AmethystImperialGrand-2.0 hall amethyst-hall.sf2
node tools/to_sf3.mjs amethyst-hall.sf2 public/soundfonts/amethyst-hall-v1.sf3
```

The bitKlavier Grand is built from its [HouseORTF 44.1 kHz set](https://archive.org/details/bitKlavierGrand_HouseORTF_44k16b). It is too big for the site, so it lives in the accounts worker's private R2 bucket and the page fetches it from the worker's `/banks` route:

```
python tools/build_bitklavier.py bitKlavierGrand_HouseORTF_44k16b bitklavier-grand.sf2
node tools/to_sf3.mjs bitklavier-grand.sf2 bitklavier-grand-v2.sf3
cd worker && npx wrangler r2 object put p2piano-banks/bitklavier-grand-v2.sf3 --file ../bitklavier-grand-v2.sf3 --remote
```

The protocol is in [PROTOCOL.md](PROTOCOL.md).

## Credits

- Piano: [Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); SF2 by FreePats. Resampled to 44.1 kHz and compressed to SF3.
- Piano: [bitKlavier Grand](https://bitklavier.com/the-bitklavier-grand/) by Princeton University, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its HouseORTF set, mapped to SF2 by `tools/build_bitklavier.py`, levelled per layer and compressed to SF3.
- Piano: [Amethyst Imperial Grand](https://github.com/MyBlackMIDIScore/AmethystImperialGrand) by MBMS. Samples [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/), unmodified and converted to SF3; its SFZ settings, GPL-2.0, mapped to SF2 generators by `tools/build_amethyst.py`.
- Synth: [SpessaSynth](https://github.com/spessasus/SpessaSynth), Apache 2.0.
- Connections: [Trystero](https://github.com/dmotz/trystero), MIT.
- Icons: [Lucide](https://lucide.dev), ISC.
