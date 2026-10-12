# Piano Room

An online piano room to play together from a link.
Players connect to each other directly, with no server of its own.

## Playing

Create a room and send the link; whoever opens it joins.
Play from a MIDI keyboard, the mouse, or the computer keyboard with the Roblox piano layout:

- `1`-`m` white keys C2-C7, Shift for sharps
- Ctrl+`1`-`t` A0-B1, Ctrl+`y`-`j` C#7-C8
- Alt+`1`-`c` velocity, 32 levels
- Space sustain, `]` sostenuto

Chrome keeps Ctrl+W and Ctrl+T for itself unless the room is full screen.

## Building

```
npm install
npm run dev
npm run build
```

The pianos are built from FreePats' `SalamanderGrandPiano-V3+20200602.sf2` with Python 3, numpy and ffmpeg:

```
python tools/build_bank.py SalamanderGrandPiano-V3+20200602.sf2 salamander-8.sf2 8
node tools/to_sf3.mjs salamander-8.sf2 public/soundfonts/salamander-grand-v1.sf3 8
python tools/build_bank.py SalamanderGrandPiano-V3+20200602.sf2 salamander-16.sf2 16
node tools/to_sf3.mjs salamander-16.sf2 public/soundfonts/salamander-grand-16-v1.sf3 8
```

The protocol is in [PROTOCOL.md](PROTOCOL.md).

## Credits

- Piano: [Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); SF2 by FreePats. Resampled to 44.1 kHz, as 8 or all 16 velocity layers, and compressed to SF3.
- Synth: [SpessaSynth](https://github.com/spessasus/SpessaSynth), Apache 2.0.
- Connections: [Trystero](https://github.com/dmotz/trystero), MIT.
- Icons: [Lucide](https://lucide.dev), ISC.
