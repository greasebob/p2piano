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

The protocol is in [PROTOCOL.md](PROTOCOL.md).

## Credits

- Piano: [Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); SF2 by FreePats. Reduced here to 8 velocity layers at 44.1 kHz and compressed to SF3.
- Synth: [SpessaSynth](https://github.com/spessasus/SpessaSynth), Apache 2.0.
- Connections: [Trystero](https://github.com/dmotz/trystero), MIT.
- Icons: [Lucide](https://lucide.dev), ISC.
