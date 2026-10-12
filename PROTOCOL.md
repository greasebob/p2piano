# Room protocol, version 1

Anything that speaks this can join a room as a player, the web page or a native client such as a QuartzMIDI add-on.

## Joining

Rooms use [Trystero](https://github.com/dmotz/trystero) with its Nostr strategy.
Peers find each other through public Nostr relays and then talk directly over WebRTC data channels, with STUN only.

- App id: `quartzmidi-piano-room`
- Room id: the part of the link after `#`, 8 characters from `abcdefghjkmnpqrstuvwxyz23456789`

A native client either runs Trystero itself or reimplements its Nostr signalling and its action framing.

## Actions

### `hi`

`{ "name": string, "color": string }`

Sent to each peer as it joins, and to everyone when the player renames.
The name is at most 24 characters.
The color is one of `#f2b84b #5ec7e8 #ef6f8e #8bd17c #b28cf2 #f58d4e #4fd1b5 #e8e15e`; a receiver shows another one when the color is taken.

### `chat`

`string`

A chat message to everyone, at most 300 characters; a receiver trims it and drops it when empty.

### `ev`

`[t, status, a, b, status, a, b, ...]`

`t` is the sender's monotonic clock in milliseconds, each triple one MIDI message.
Everything the sender played in the same moment goes as one message.
`[t]` alone is a heartbeat, sent every second so the receiver can keep measuring the delay.

Messages a player sends:

| Message | Status | a | b |
| --- | --- | --- | --- |
| Note on | `0x90` | note 21-108 | velocity 1-127 |
| Note off | `0x80` | note | 0 |
| Sustain | `0xB0` | 64 | 0-127 |
| Sostenuto | `0xB0` | 66 | 0 or 127 |
| Soft | `0xB0` | 67 | 0 or 127 |

The channel nibble is ignored; the receiver gives each player a channel of its own.

## Timing

A receiver records arrival minus `t` for each sender's last 48 messages.
That holds the network delay plus the offset between the two clocks, and the offset cancels out.
Each message is played once its lateness reaches the 90th percentile of those, held at most 80 ms, so the sender's rhythm survives jitter.

## Sound

The receiver plays every player on its own synth with the same bank.
Sustain is the synth's own CC64; sostenuto and soft are done by the receiver: sostenuto keeps the notes held when it went down sounding until it lifts, and soft scales velocity by 0.6.
