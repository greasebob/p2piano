# Room protocol, version 3

Anything that speaks this can join a room as a player, the web page or a native client such as a QuartzMIDI add-on.

## Joining

Rooms use [Trystero](https://github.com/dmotz/trystero) with its Nostr strategy.
Peers find each other through public Nostr relays and then talk directly over WebRTC data channels.
STUN finds a direct path; when there is none (strict NATs, some school and work networks) the page relays through Metered's TURN servers, over port 443 too.

- App id: `quartzmidi-piano-room`
- Room id: the part of the link after `#`, 8 characters from `abcdefghjkmnpqrstuvwxyz23456789`
- A link ending in `/lock` (`#code/lock`) tells the page to ask for the room's password; the room id is the same.

A native client either runs Trystero itself or reimplements its Nostr signalling and its action framing.

## Keys

Each player has an ECDSA P-256 key, kept by the browser.

- `key`: the raw public key, base64url without padding.
- Key id: the first 16 characters of base64url(SHA-256(raw public key)). Bans, mutes and tags name players by it.
- Signatures are ECDSA with SHA-256 over the UTF-8 text, in the 64-byte r‖s form, base64url.

## Handshake

Trystero's `onPeerHandshake` runs before any action. Each side sends two messages and reads two.

1. Hello:
   `{ key, sig, since, chain, att, nonce }`
   - `sig` signs `p2piano|hello|<room>|<own peer id>|<their peer id>`.
   - `since` is when the player entered the room, in milliseconds since 1970.
   - `chain` is the room's ownership chain as the player knows it, or `null`.
   - `att` is the player's account attestation, or `null`.
   - `nonce` is 18 random bytes, base64url.
2. Verdict:
   `{ proof, refuse? }`
   - `proof` is base64url(SHA-256(`p2piano|pass|<room>|<their nonce>|<password>`)), with an empty password for a room without one. The password itself is never sent.
   - `refuse` is `"ban"` or `"kick"` when the sender will not let the other in.

A side whose hello does not verify, whose proof does not match its own password, or that refused or was refused, closes the connection.
It waits a second first, so its own verdict arrives.

The newer of two players with different passwords is the one with the wrong password, and the owner never is.
A player who is refused or has the wrong password, and is connected to nobody after a few seconds, leaves with a notice.
A refusal from the owner counts at once.

A locked room's WebRTC offers are not encrypted with the password; the password only decides who is let in.

## Ownership

A room's code comes from its creator's key: the code is 8 characters from SHA-256(raw public key ‖ salt), each byte taken modulo 31 into the alphabet above, with a random 9-byte salt.

The ownership chain is `{ key, salt, next: [{ to, sig }, ...] }`.

- `key` and `salt` must make the room's code.
- Each handover `next[i]` is signed by the owner before it over `p2piano|host|<room>|<i>|<to>`.
- The last `to`, or `key` with no handovers, is the owner.

A player takes a valid chain longer than its own.

The host is the owner while the owner is in the room.
Otherwise it is whoever has the oldest `since`, with the lower peer id first on a tie.
Every player works the host out for itself.

## Actions

### `hi`

`{ name, color, notes, glow, tags, certs, untags }`

Sent to each peer as it joins, and to everyone when anything in it changes.

- `name` is at most 24 characters.
- `color` is one of `#f2b84b #5ec7e8 #ef6f8e #8bd17c #b28cf2 #f58d4e #4fd1b5 #e8e15e`; a receiver shows another one when the color is taken.
- `notes` is how everyone shows the player's notes: `null` for their color, `{ mode: "rainbow" }`, or `{ mode: "custom", white, black }` with two `#rrggbb` colors for white and black keys.
- `glow` is how bright everyone shows those notes, `[white, black]` from 0 (black) through 0.5 (the color itself) to 1 (pale); missing or invalid is 0.5.
- `tags` are the tags the player shows, at most 3, from `dev`, `trusted`, `tester` and `mod`.
- `certs` are the tag certificates that give them; a receiver reads the first 20.
- `untags` are the newest untag certificates the player has seen, at most 50.

A receiver shows a tag only when the player shows it and a certificate gives it to the player's key or account.

### `room`

`{ chain, bans, names }`

Sent to each peer as it joins, and to everyone when the ownership, the bans or the names change.

- `bans` is `{ v, list: [{ id, acct?, name }, ...] }`, at most 500 bans. `id` is a key id and `acct` an account id.
- `names` is `{ v, map: { keyId: name } }`, the names the host gave players in this room, each at most 24 characters. Everyone shows a player by the name given to their key id in place of their own.
- A receiver takes a list only from the host, with a higher `v` than its own.
- A host who just arrived takes the list of whoever hosted before it.

A player whose key or account is on the list is refused in the handshake, except the owner.

### `mod`

A message from the host; a receiver ignores it from anyone else.

| Message | Meaning |
| --- | --- |
| `{ "out": "kick" }` or `{ "out": "ban" }` | The receiver is kicked or banned and leaves. |
| `{ "kick": peerId }` | Everyone stops talking to that peer. |
| `{ "pass": string }` | The room's password is now this, at most 64 characters; `""` clears it. Players already in stay. |

### `cert`

A tag certificate.
A tag certificate goes to its player; an untag goes to everyone.

### `troll`

`"jumpscare"`

A prank sent to one player. The receiver plays it only when the sender holds `dev` or `mod` (see Tags), and at most once every 5 s: a face fills the screen for 1.5 s with a scream.

### `chat`

`string`

A chat message to everyone, at most 300 characters; a receiver trims it and drops it when empty.

### `cur`

`[x, y, t]` or `null`

Where the player's pointer is, as fractions 0-1 of the room's width and height, sent at most every 15 ms while it moves; `null` once it leaves the room or the window.
`t` is when the pointer got there, on the clock `play` uses, and the receiver shows the move as late as it plays a note from that moment (see Timing), so a drag along the keys stays with its notes.
A receiver still shows `[x, y]` without `t` at once.
The receiver shows it in the player's colour with their name, and fades it after 6 s without a move.

### `play`

`[t, ago, status, a, b, ago, status, a, b, ...]`

`t` is the sender's monotonic clock in milliseconds when the message is sent, and each `ago, status, a, b` is one MIDI message played `ago` milliseconds before that.
Everything the sender played in the same moment goes as one message, and so does everything it plays within 10 ms of its last message, so a busy sender sends at most 100 a second.
The receiver plays each MIDI message at its own time, in the order they were played.
`[t]` alone is a heartbeat, sent every second so the receiver can keep measuring the delay.

Version 2 sent `ev`, `[t, status, a, b, ...]` with no `ago`; a receiver still plays it, all at once.

Messages a player sends:

| Message | Status | a | b |
| --- | --- | --- | --- |
| Note on | `0x90` | note 21-108 | velocity 1-127 |
| Note off | `0x80` | note | 0 |
| Sustain | `0xB0` | 64 | 0-127 |
| Sostenuto | `0xB0` | 66 | 0 or 127 |
| Soft | `0xB0` | 67 | 0 or 127 |

The channel nibble is ignored; the receiver gives each player a channel of its own.

## Tags

A tag certificate is `{ kind, tag, sub, n, by?, sig }`.

- `kind` is `"tag"` to give a tag or `"untag"` to take it back.
- `sub` is `k:<key id>` for a key or `a:<account id>` for an account.
- `n` is when it was made, in milliseconds since 1970.
- `sig` signs `p2piano|<kind>|<tag>|<sub>|<n>`.

The root key, the developer's, signs certificates itself:

```
BOmfIhE9ZOFHXAdm2wCn9iHrULtPf9qc20uLaXo2DV6XSTEIiafLMLQ1F6k82wnPzcTMtrQbAP2zhSnjPGaCD4A
```

The root key holds `dev` with no certificate.
Only the root gives `dev`, and only to accounts.

A player whose account holds `dev` signs `trusted`, `tester` and `mod` with their own key and sets `by` to `{ att, dev }`.
Here `att` is the accounts service's attestation of that key, which may have run out, and `dev` is the root's `dev` certificate for an account in it.

An untag takes back every certificate for the same tag and subject with an `n` no later than its own.
Taking back an account's `dev` also takes back every tag it gave.

## Accounts

The accounts service (`worker/`) signs players in with Discord or Roblox and vouches for their keys.
A page built without it has no accounts and tags go to keys alone.

An attestation is `{ ids, key, exp, sig }`.

- `ids` is the account's id, then the ids of accounts merged into it, at most 20.
- `key` is the player's public key and `exp` when the attestation runs out, a day after it was made.
- `sig` is the service's signature over `p2piano|att|<ids joined by ,>|<key>|<exp>`, checked with the service's public key built into the page.

A player sends their attestation in the hello; the other side takes `ids` as their account only when `key` is the key the hello proved and `exp` has not passed.

## Timing

A receiver records arrival minus `t` for each sender's last 48 messages.
That holds the network delay plus the offset between the two clocks, and the offset cancels out.
Each message is played once its lateness reaches the 90th percentile of those, held at most 80 ms, so the sender's rhythm survives jitter.

## Sound

The receiver plays every player on its own synth with the same bank.
The pedals are done by the receiver: sustain keeps released notes sounding until it lifts, sostenuto keeps the notes held when it went down sounding until it lifts, and soft scales velocity by 0.6.
A key struck again while a pedal holds it lets its old sound fade under the new one.
