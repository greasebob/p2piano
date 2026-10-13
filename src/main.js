import './style.css';
import {
    createIcons, createElement, Link, Check, Maximize, Minimize, Settings, LogIn, Plus, Keyboard,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, Users,
    Crown, UserX, Ban, Volume2, VolumeX, MessageSquareOff, Lock, LockOpen, Undo2, LogOut, Merge, X, Tag,
} from 'lucide';
import { siDiscord, siRoblox } from 'simple-icons';
import { BANKS, loadBank, createPiano, Hand } from './audio.js';
import { connect, selfId, MAX_CHAT } from './net.js';
import { PianoView, STYLES, DEFAULT_SPEED } from './view.js';
import { keyAction, keyLabels, noteLabels, levelVelocity, SUSTAIN_CODE, SOSTENUTO_CODE } from './keys.js';
import { loadIdentity, importIdentity, roomCode, newSalt, chainOwner, handoverText } from './identity.js';
import { TAGS, GIVEN, ROOT_ID, TagBook, checkAtt, makeCert } from './certs.js';
import { Accounts, accountsOn, ACCOUNTS_KEY } from './accounts.js';

const ICONS = {
    Link, Check, Maximize, Minimize, Settings, LogIn, Plus, Keyboard,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, Users,
    Crown, UserX, Ban, Volume2, VolumeX, MessageSquareOff, Lock, LockOpen, Undo2, LogOut, Merge, X, Tag,
};
const COLORS = ['#f2b84b', '#5ec7e8', '#ef6f8e', '#8bd17c', '#b28cf2', '#f58d4e', '#4fd1b5', '#e8e15e'];
const PEER_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]; // 0 is ours, 9 is drums, 15 preloads
const MAX_TRANSPOSE = 24;
const BRANDS = { discord: siDiscord, roblox: siRoblox };
const MAX_SHOWN_TAGS = 3;
const MAX_SENT_UNTAGS = 50;
const MAX_BANS = 500;
const REFUSED_WAIT_MS = 4000;
const PASSWORD_WAIT_MS = 5000;
const TRANSPOSE_KEYS = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -12, ArrowUp: 12 };

const $ = id => document.getElementById(id);
const icons = () => createIcons({ icons: ICONS });
const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const session = {
    take(k) { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
// The accounts service comes back with #login=<code> (or #login-failed); the room link the player left from is put back.
const accounts = new Accounts(store, session);
const loginCode = /^#login=([\w-]+)$/.exec(location.hash)?.[1];
const loginFailed = location.hash === '#login-failed';
if (loginCode || loginFailed) history.replaceState(null, '', location.pathname + location.search + (session.take('pr-return') || ''));
const accountReady = loginCode ? accounts.redeem(loginCode).catch(() => showNotice('login')) : Promise.resolve();

// A room link is #code, or #code/lock when the room has a password.
const roomFromHash = () => (/^#([a-z0-9]{4,32})(\/lock)?$/.exec(location.hash) || [])[1] || null;
const lockedHash = () => /\/lock$/.test(location.hash);

// A dev link (#dev-key=d.x.y) puts the dev's key in this browser and is removed from the address at once.
const devKey = /^#dev-key=([\w.-]+)$/.exec(location.hash)?.[1];
if (devKey) history.replaceState(null, '', location.pathname + location.search);
const identReady = (devKey ? importIdentity(store, devKey).catch(() => {}) : Promise.resolve()).then(() => loadIdentity(store));

let roomId = roomFromHash();
// tags: the tags shown, certs: the certificates that give them, untags: some of the take-backs seen, to pass on
let me = { name: store.get('pr-name', ''), color: store.get('pr-color', COLORS[Math.floor(Math.random() * COLORS.length)]), tags: [], certs: [], untags: [] };
store.set('pr-color', me.color);

let ident = null; // this browser's key
let since = 0; // when this player entered the room, on its own clock
let password = '';
let room = {}; // this room as remembered here: { salt, pass, chain, bans: { v, list: [{ id, name }] } }
let ownerKey = null; // the room's owner, from its ownership chain
const mutes = loadMutes(); // key id -> { vol, play, chat }, this player's own
const book = new TagBook(store, ACCOUNTS_KEY);
let held = new Set(); // the tags this player holds
let ctx, net, view;
let piano = null;
let myHand = null;
let loadedPiano = null;
let transpose = 0;
let bankJob = Promise.resolve();
let keyboardVelocity = 100;
let sustain = 0; // this player's last sustain value
const peers = new Map(); // id -> { id, info, hand, ping }

// Start screen

const NOTICES = {
    kick: ['user-x', 'Kicked from the room'],
    ban: ['ban', 'Banned from the room'],
    password: ['lock', 'Wrong password'],
    login: ['log-in', 'Sign-in failed'],
};
function showNotice(why) {
    const n = NOTICES[why];
    if (!n) return null;
    $('notice').innerHTML = `<i data-lucide="${n[0]}"></i><span>${n[1]}</span>`;
    $('notice').hidden = false;
    icons();
    return n;
}
const notice = showNotice(loginFailed ? 'login' : session.take('pr-notice'));
$('name').value = me.name;
$('go').innerHTML = roomId
    ? '<i data-lucide="log-in"></i><span>Join room</span>'
    : '<i data-lucide="plus"></i><span>Create room</span>';
// Joining a room with a password asks for it; creating one offers the lock.
$('lock').hidden = Boolean(roomId);
if (roomId && (lockedHash() || notice?.[0] === 'lock')) {
    $('pass').hidden = false;
    $('pass').value = loadRoom(roomId).pass ?? '';
}
$('lock').addEventListener('click', () => {
    const on = $('lock').ariaPressed !== 'true';
    $('lock').ariaPressed = String(on);
    $('lock').innerHTML = `<i data-lucide="${on ? 'lock' : 'lock-open'}"></i>`;
    icons();
    $('pass').hidden = !on;
    if (on) $('pass').focus();
});
icons();
accountReady.then(() => renderAccount($('start-account')));

$('start-form').addEventListener('submit', async e => {
    e.preventDefault();
    me.name = $('name').value.trim() || 'Player';
    store.set('pr-name', me.name);
    $('go').disabled = true;
    ident = await identReady;
    await accountReady;
    password =$('pass').hidden ? '' : $('pass').value;
    if (roomId) {
        room = loadRoom(roomId);
        if ($('pass').hidden) password = room.pass ?? '';
    } else {
        // The code comes from the creator's key, which is how the room knows its owner.
        const salt = newSalt();
        roomId = await roomCode(ident.key, salt);
        room = { ...loadRoom(roomId), salt, chain: { key: ident.key, salt, next: [] } };
    }
    room.pass = password || undefined;
    saveRoom();
    showLock();
    enter().catch(showError);
});
window.addEventListener('hashchange', () => {
    if (roomFromHash() !== roomId || /^#dev-key=/.test(location.hash)) location.reload();
});

// Room

const keepOpen = e => { e.preventDefault(); e.returnValue = ''; };

async function enter() {
    $('start').hidden = true;
    $('room').hidden = false;
    $('room-name').textContent = roomId;
    window.addEventListener('beforeunload', keepOpen);
    since = Date.now();
    ownerKey = await chainOwner(room.chain, roomId);
    if (!ownerKey) room.chain = undefined;

    ctx = new AudioContext({ latencyHint: 'interactive' });
    $('labels').value = store.get('pr-labels', 'qwerty') === 'notes' ? 'notes' : 'qwerty';
    $('room').dataset.labels = $('labels').value;
    view = new PianoView($('keys'), $('rise'), labelsFor($('labels').value), (note, vel) => local(vel ? 0x90 : 0x80, note, vel), $('map'));
    await prepareTags();
    join();
    renderPeople();
    bindChat();
    bindKeyboard();
    bindMidi();
    bindControls();
    bindPlayerMenu();
    bindRoomSettings();
    $('settings').addEventListener('toggle', e => {
        if (e.newState === 'open' && accounts.signedIn) accounts.refresh().catch(() => {}).then(() => renderAccount($('account')));
    });
    renderAccount($('account'));
    start().catch(showError);
}

let refusedTimer = 0;
let passwordTimer = 0;

function join() {
    net = connect(roomId, me, ident, since, {
        async onPeer(id, info) {
            const p = peer(id);
            p.sent = info;
            p.info = { name: String(info?.name ?? 'Player').slice(0, 24), color: freeColor(id, info?.color), tags: p.info.tags };
            for (const c of Array.isArray(info?.untags) ? info.untags.slice(0, MAX_SENT_UNTAGS) : []) if (await book.add(c)) retag();
            await checkTags(p);
            renderPeople();
            wakeSidebar();
            if (sustain) net.send(0xb0, 64, sustain); // a held or inverted pedal, for someone who just joined
        },
        onLeave(id) {
            forget(id);
        },
        onMidi(id, status, a, b, holdMs) {
            const p = peer(id);
            if (muteOf(p).play) return; // a muted player is neither heard nor shown
            if (p.hand) {
                p.hand.midi(status, a, b, holdMs > 0 ? ctx.currentTime + holdMs / 1000 : 0, holdMs);
                return;
            }
            const type = status & 0xf0;
            if (type === 0x90 && b > 0) view.key(id, a, b, p.info.color);
            else if (type !== 0xb0) view.key(id, a, 0);
        },
        onPing(id, ms) {
            const p = peers.get(id);
            if (!p) return;
            p.ping = Math.round(ms);
            renderPeople();
        },
        onChat(id, text) {
            const p = peer(id);
            if (!muteOf(p).chat) addMessage(p.info, text);
        },
        state: () => ({ chain: room.chain ?? null, bans: bans() }),
        chain: () => room.chain ?? null,
        att: () => accounts.att,
        accountOf: (att, key) => checkAtt(att, ACCOUNTS_KEY, key),
        offerChain: adoptChain,
        refuse: (id, them) => (isBanned(them) ? 'ban' : null),
        onRefused(them, why) {
            if (why !== 'ban') return;
            if (them.key === ownerKey) return leaveWith('ban');
            // Refused by someone other than the owner: banned once nobody in the room lets this player in.
            refusedTimer ||= setTimeout(() => { refusedTimer = 0; if (!peers.size) leaveWith('ban'); }, REFUSED_WAIT_MS);
        },
        password: () => password,
        onWrongPassword(them) {
            // The newer of the two has the wrong one, and the owner never does.
            if (ownerKey === ident.key || peers.size || them.since >= since) return;
            passwordTimer ||= setTimeout(() => { passwordTimer = 0; if (!peers.size) leaveWith('password'); }, PASSWORD_WAIT_MS);
        },
        onRoom(id, data) {
            roomState(id, data).catch(() => {});
        },
        onMod(id, msg) {
            hostMessage(id, msg);
        },
        onCert(id, cert) {
            takeCert(cert).catch(() => {});
        },
    });
}

/** Takes `pass` as the room's password, as everyone in it does. */
function usePassword(pass) {
    password = pass;
    room.pass = pass || undefined;
    saveRoom();
    showLock();
    renderRoomSettings();
}

/** Shows whether the room has a password, in the header and in the link. */
function showLock() {
    $('room-lock').hidden = !password;
    history.replaceState(null, '', `#${roomId}${password ? '/lock' : ''}`);
}

/** Leaves the room for the start screen with a notice: 'kick', 'ban' or 'password'. */
function leaveWith(why) {
    session.set('pr-notice', why);
    window.removeEventListener('beforeunload', keepOpen);
    if (why === 'ban') history.replaceState(null, '', location.pathname + location.search);
    location.reload();
}

// Hosting. The owner is whoever the ownership chain names, at first the room's creator. While the owner
// is away the player who has been in the room longest hosts, and the owner takes it back on return.

function loadRoom(id) {
    try { return JSON.parse(store.get(`pr-room-${id}`, '{}')) || {}; } catch { return {}; }
}

function saveRoom() {
    store.set(`pr-room-${roomId}`, JSON.stringify(room));
}

const bans = () => room.bans ?? { v: 0, list: [] };
// A ban names the player's key and, when signed in, their account, so it holds in every browser of theirs.
const isBanned = them => them.key !== ownerKey && bans().list.some(b => b.id === them.id || (b.acct && them.ids?.includes(b.acct)));

/** Everyone in the room this player can see, itself included. */
function members() {
    const list = [{ peerId: selfId, key: ident.key, since }];
    for (const p of peers.values()) if (p.ident) list.push({ peerId: p.id, key: p.ident.key, since: p.ident.since });
    return list;
}

/** The host among `list`: the owner if present, else whoever came first. */
function hostOf(list) {
    const owners = ownerKey ? list.filter(m => m.key === ownerKey) : [];
    const pool = owners.length ? owners : list;
    return pool.reduce((a, b) => (b.since < a.since || (b.since === a.since && b.peerId < a.peerId) ? b : a)).peerId;
}

const hostId = () => hostOf(members());
const amHost = () => hostId() === selfId;

/** Takes a peer's ownership chain when it is valid and newer than this one. */
async function adoptChain(chain) {
    if (!chain || JSON.stringify(chain) === JSON.stringify(room.chain ?? null)) return;
    const owner = await chainOwner(chain, roomId);
    if (!owner) return;
    if (ownerKey && room.chain && chain.next.length <= room.chain.next.length) return;
    room.chain = chain;
    ownerKey = owner;
    saveRoom();
    renderPeople();
}

/** A peer's room state: the ownership chain from anyone, the ban list from the host only. */
async function roomState(id, data) {
    await adoptChain(data?.chain);
    const list = data?.bans;
    if (!list || !Number.isInteger(list.v) || !Array.isArray(list.list) || list.v <= bans().v) return;
    // The host's list is the room's. A host who just arrived takes the list of whoever hosted before it.
    const host = hostId();
    const others = members().filter(m => m.peerId !== selfId);
    const before = host === selfId && others.length ? hostOf(others) : null;
    if (id !== host && id !== before) return;
    setBans(list);
    if (host === selfId) net.shareState();
}

function setBans(list) {
    room.bans = {
        v: list.v,
        list: list.list.slice(0, MAX_BANS).map(b => ({
            id: String(b?.id ?? '').slice(0, 16),
            ...typeof b?.acct === 'string' && b.acct ? { acct: b.acct.slice(0, 32) } : {},
            name: String(b?.name ?? '').slice(0, 24),
        })),
    };
    saveRoom();
    for (const p of [...peers.values()]) if (p.ident && isBanned(p.ident)) drop(p.id);
    renderRoomSettings();
}

/** A message from the host; anyone else's is ignored. */
function hostMessage(id, msg) {
    if (id !== hostId() || !msg || typeof msg !== 'object') return;
    if (msg.out === 'kick' || msg.out === 'ban') return leaveWith(msg.out);
    if (typeof msg.kick === 'string' && msg.kick !== selfId) drop(msg.kick);
    if (typeof msg.pass === 'string') usePassword(msg.pass.slice(0, 64));
}

function kick(p) {
    if (!amHost() || p.ident?.key === ownerKey) return;
    net.mod({ out: 'kick' }, p.id);
    net.mod({ kick: p.id });
    drop(p.id);
}

function ban(p) {
    if (!amHost() || !p.ident || p.ident.key === ownerKey) return;
    net.mod({ out: 'ban' }, p.id);
    const acct = p.ident.ids?.[0];
    const list = bans().list.filter(b => b.id !== p.ident.id && (!acct || b.acct !== acct));
    setBans({ v: bans().v + 1, list: [...list, { id: p.ident.id, ...acct ? { acct } : {}, name: p.info.name }] });
    net.shareState();
}

function unban(id) {
    if (!amHost()) return;
    setBans({ v: bans().v + 1, list: bans().list.filter(b => b.id !== id) });
    net.shareState();
}

/** Hands the room to another player for good. Only the owner can. */
async function makeHost(p) {
    if (ownerKey !== ident.key || !p.ident || !room.chain) return;
    const n = room.chain.next.length;
    const sig = await ident.sign(handoverText(roomId, n, p.ident.key));
    await adoptChain({ ...room.chain, next: [...room.chain.next, { to: p.ident.key, sig }] });
    net.shareState();
}

/** Sets or clears the room's password. Everyone in the room stays and asks it of whoever joins next. */
function setRoomPassword(pass) {
    if (!amHost() || pass === password) return;
    net.mod({ pass });
    usePassword(pass);
}

async function start() {
    const id = $('piano').value;
    piano = await createPiano(ctx, await fetchBank(id), BANKS[id].strikes, preloadProgress);
    loadedPiano = id;
    piano.setVolume(+$('volume').value / 100);
    piano.setReverb(+$('reverb').value);
    myHand = new Hand(piano.synth, 0, (note, vel) => view.key(selfId, note, vel, me.color));
    if (sustain) myHand.midi(0xb0, 64, sustain, 0);
    for (const p of peers.values()) attachHand(p);
    setStatus(null);
    changePiano(); // applies a change made while loading
    if (ctx.state !== 'running') await ctx.resume();
}

function fetchBank(id) {
    setStatus('Piano', false, 0);
    return loadBank(BANKS[id].url, f => setStatus('Piano', false, f * 0.8));
}

function preloadProgress(f) {
    setStatus('Piano', false, 0.8 + f * 0.2);
}

/** Switches to the selected piano. Switches run one at a time. */
function changePiano() {
    bankJob = bankJob.then(async () => {
        const id = $('piano').value;
        if (!piano || id === loadedPiano) return;
        const bank = await fetchBank(id);
        if ($('piano').value === id) {
            await piano.setBank(bank, BANKS[id].strikes, preloadProgress);
            loadedPiano = id;
        }
        setStatus(null);
        changePiano(); // applies a change made while loading
    }).catch(showError);
}

/** Shifts the computer keyboard's notes by `value` semitones. */
function setTranspose(value) {
    transpose = Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, value));
    const text = transpose > 0 ? `+${transpose}` : String(transpose);
    $('transpose').textContent = text;
    $('transpose').setAttribute('aria-label', `Transpose ${text}, reset`);
    if ($('labels').value === 'qwerty') view.setLabels(keyLabels(transpose));
}

function labelsFor(mode) {
    return mode === 'notes' ? noteLabels() : keyLabels(transpose);
}

function peer(id) {
    if (!peers.has(id)) {
        const p = { id, ident: net.ident(id), info: { name: '…', color: '#888888', tags: [] }, held: new Set(), sent: null, hand: null, ping: null };
        peers.set(id, p);
        attachHand(p);
    }
    return peers.get(id);
}

/** Removes a player who left. */
function forget(id) {
    const p = peers.get(id);
    if (!p) return;
    p.hand?.release();
    view.clear(id);
    peers.delete(id);
    if (menuPeer === id) $('player-menu').hidePopover();
    renderPeople();
    wakeSidebar();
}

/** Removes a player and stops talking to them. */
function drop(id) {
    net.block(id);
    forget(id);
}

function attachHand(p) {
    if (!piano || p.hand) return;
    const used = new Set([...peers.values()].map(q => q.hand?.ch));
    const ch = PEER_CHANNELS.find(c => !used.has(c));
    if (ch === undefined) return; // no free channel: the player is shown but not heard
    p.hand = new Hand(piano.synth, ch, (note, vel, delayMs) => {
        const show = () => view.key(p.id, note, vel, p.info.color);
        if (delayMs > 0) setTimeout(show, delayMs);
        else show();
    });
    applyVolume(p);
}

// Each player's own mutes and volumes for others, kept by key so they last across visits.

function loadMutes() {
    try { return JSON.parse(store.get('pr-mutes', '{}')) || {}; } catch { return {}; }
}

const muteOf = p => (p.ident && mutes[p.ident.id]) || {};

function setMute(p, change) {
    if (!p.ident) return;
    const m = { vol: 100, play: false, chat: false, ...mutes[p.ident.id], ...change };
    if (m.vol === 100 && !m.play && !m.chat) delete mutes[p.ident.id];
    else mutes[p.ident.id] = m;
    store.set('pr-mutes', JSON.stringify(mutes));
    if ('play' in change && m.play) {
        p.hand?.release();
        view.clear(p.id);
    }
    applyVolume(p);
    renderPeople();
}

/** A player's volume is their channel's volume (CC 7, 100 by default). */
function applyVolume(p) {
    if (p.hand) piano.synth.controllerChange(p.hand.ch, 7, Math.round(muteOf(p).vol ?? 100));
}

/** Returns the wanted colour, or the next one no other player is shown in. */
function freeColor(id, wanted) {
    const taken = new Set([me.color, ...[...peers.values()].filter(p => p.id !== id).map(p => p.info.color)]);
    const start = Math.max(0, COLORS.indexOf(wanted));
    for (let i = 0; i < COLORS.length; i++) {
        const c = COLORS[(start + i) % COLORS.length];
        if (!taken.has(c)) return c;
    }
    return COLORS[start];
}

/** Plays a MIDI message from this player and sends it to the room. */
function local(status, a, b) {
    net.send(status, a, b);
    if (myHand) myHand.midi(status, a, b, 0);
    else if (status !== 0xb0) view.key(selfId, a, status === 0x90 ? b : 0, me.color);
    if (status === 0x90 && b > 0) $('vel-last').textContent = b;
    if (status === 0xb0) {
        if (a === 64) sustain = b;
        const chip = { 64: 'ped-sus', 66: 'ped-sos', 67: 'ped-soft' }[a];
        if (chip) $(chip).classList.toggle('on', a === 64 ? b > 0 : b >= 64);
    }
}

// Computer keyboard

function bindKeyboard() {
    const held = new Map(); // key code -> notes
    const pedals = new Set(); // key codes
    const isText = el => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text');
    const isAlt = code => code === 'AltLeft' || code === 'AltRight';
    // A control reached with Tab keeps the keys that operate it; Escape returns them to the piano.
    const CONTROL_KEYS = new Set(['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
    const isTabbed = el => el !== document.body && el.matches?.(':focus-visible');
    const pedalCC = code => (code === SUSTAIN_CODE ? 64 : 66);
    const inverted = code => code === SUSTAIN_CODE && $('sus-invert').ariaPressed === 'true';
    const pedal = (code, down) => local(0xb0, pedalCC(code), down !== inverted(code) ? 127 : 0);
    $('vel-key').textContent = keyboardVelocity;

    // Inverted sustain holds the pedal down while Space is up.
    const invert = $('sus-invert');
    invert.ariaPressed = String(store.get('pr-sus-invert', '0') === '1');
    invert.addEventListener('click', () => {
        invert.ariaPressed = String(invert.ariaPressed !== 'true');
        store.set('pr-sus-invert', invert.ariaPressed === 'true' ? '1' : '0');
        pedal(SUSTAIN_CODE, pedals.has(SUSTAIN_CODE));
    });
    if (inverted(SUSTAIN_CODE)) pedal(SUSTAIN_CODE, false);
    // A tap on Sustain holds the pedal until the next tap, for a touch screen
    $('ped-sus').addEventListener('click', () => local(0xb0, 64, sustain > 0 ? 0 : 127));

    window.addEventListener('keydown', e => {
        if (isText(e.target)) return;
        if (isTabbed(e.target)) {
            if (e.code === 'Escape' && !e.target.closest('[popover]')) e.target.blur();
            if (CONTROL_KEYS.has(e.code)) return;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            $('chat-input').focus();
            wakeSidebar();
            return;
        }
        if (isAlt(e.code)) {
            e.preventDefault(); // keeps the browser menu from taking focus
            return;
        }
        if (e.code === SUSTAIN_CODE || e.code === SOSTENUTO_CODE) {
            e.preventDefault();
            if (!pedals.has(e.code)) {
                pedals.add(e.code);
                pedal(e.code, true);
            }
            return;
        }
        if (e.code in TRANSPOSE_KEYS && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            setTranspose(transpose + TRANSPOSE_KEYS[e.code]);
            return;
        }
        const action = keyAction(e);
        if (!action) {
            if ((e.ctrlKey || e.altKey) && /^(Key|Digit)/.test(e.code)) e.preventDefault();
            return;
        }
        e.preventDefault();
        if ('level' in action) {
            keyboardVelocity = levelVelocity(action.level);
            $('vel-key').textContent = keyboardVelocity;
            return;
        }
        const note = action.note + transpose;
        if (note < 21 || note > 108) return;
        const notes = held.get(e.code) ?? [];
        if (notes.includes(note)) {
            if (e.repeat) return;
            local(0x80, note, 0); // pressed again without a release: restrike
        } else {
            notes.push(note);
        }
        held.set(e.code, notes);
        local(0x90, note, keyboardVelocity);
    });

    window.addEventListener('keyup', e => {
        if (isAlt(e.code)) {
            e.preventDefault();
            return;
        }
        if (pedals.delete(e.code)) {
            e.preventDefault();
            pedal(e.code, false);
            return;
        }
        const notes = held.get(e.code);
        if (!notes) return;
        held.delete(e.code);
        for (const n of notes) local(0x80, n, 0);
    });

    // Key releases are lost while the window is unfocused, so release everything.
    window.addEventListener('blur', () => {
        for (const notes of held.values()) for (const n of notes) local(0x80, n, 0);
        held.clear();
        for (const code of pedals) pedal(code, false);
        pedals.clear();
    });
}

// MIDI inputs

function bindMidi() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(access => {
        const off = new Set(JSON.parse(store.get('pr-midi-off', '[]')));
        const list = () => {
            const ul = $('midi-list');
            ul.replaceChildren();
            for (const input of access.inputs.values()) {
                input.onmidimessage = m => {
                    if (off.has(input.name)) return;
                    const [status, a = 0, b = 0] = m.data;
                    const type = status & 0xf0;
                    if (type === 0x90 && b > 0) local(0x90, a, b);
                    else if (type === 0x90 || type === 0x80) local(0x80, a, 0);
                    else if (type === 0xb0 && (a === 64 || a === 66 || a === 67)) local(0xb0, a, b);
                };
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = !off.has(input.name);
                box.onchange = () => {
                    if (box.checked) off.delete(input.name);
                    else off.add(input.name);
                    store.set('pr-midi-off', JSON.stringify([...off]));
                };
                const label = document.createElement('label');
                label.append(box, input.name);
                const li = document.createElement('li');
                li.append(label);
                ul.append(li);
            }
            $('midi-none').hidden = access.inputs.size > 0;
        };
        access.onstatechange = list;
        list();
    }, () => { $('midi-none').hidden = false; });
}

// Header and settings

function bindControls() {
    // A clicked button gives focus back, so Space and Enter do not press it again while playing.
    document.addEventListener('click', e => {
        if (e.detail > 0 && e.target.closest('button')) e.target.closest('button').blur();
    });
    $('invite').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href);
        } catch {
            prompt('Room link', location.href);
            return;
        }
        $('invite').innerHTML = '<i data-lucide="check"></i><span>Copied</span>';
        icons();
        setTimeout(() => {
            $('invite').innerHTML = '<i data-lucide="link"></i><span>Invite</span>';
            icons();
        }, 1500);
    });

    $('fullscreen').hidden = !document.fullscreenEnabled;
    $('fullscreen').addEventListener('click', async () => {
        if (document.fullscreenElement) return document.exitFullscreen();
        await document.documentElement.requestFullscreen();
        // Keyboard lock lets Ctrl+W and Ctrl+T through to the page as notes.
        try { await navigator.keyboard?.lock?.(); } catch { /* unsupported */ }
    });
    document.addEventListener('fullscreenchange', () => {
        $('fullscreen').innerHTML = `<i data-lucide="${document.fullscreenElement ? 'minimize' : 'maximize'}"></i>`;
        icons();
    });

    $('my-name').value = me.name;
    $('my-name').addEventListener('change', () => {
        me.name = $('my-name').value.trim() || 'Player';
        store.set('pr-name', me.name);
        net.setMe(me);
        renderPeople();
    });

    $('volume').value = store.get('pr-volume', '80');
    $('volume').addEventListener('input', () => {
        store.set('pr-volume', $('volume').value);
        piano?.setVolume(+$('volume').value / 100);
    });
    $('reverb').value = store.get('pr-reverb', '40');
    $('reverb').addEventListener('input', () => {
        store.set('pr-reverb', $('reverb').value);
        piano?.setReverb(+$('reverb').value);
    });
    $('brightness').value = store.get('pr-brightness', '50');
    $('speed').value = store.get('pr-speed', String(DEFAULT_SPEED));
    for (const id of ['volume', 'reverb', 'brightness', 'speed']) {
        const show = () => { $(`${id}-val`).value = $(id).value; };
        $(id).addEventListener('input', show);
        show();
    }
    $('style').value = STYLES.includes(store.get('pr-style', 'glow')) ? store.get('pr-style', 'glow') : 'glow';
    const savedColors = store.get('pr-colors', 'player');
    $('colors').value = ['rainbow', 'custom'].includes(savedColors) ? savedColors : 'player';
    for (const id of ['white-color', 'black-color']) $(id).value = store.get(`pr-${id}`, $(id).value);
    const showStyle = () => {
        const mode = $('colors').value;
        $('custom-colors').hidden = mode !== 'custom';
        view.setStyle($('style').value);
        view.setBrightness(+$('brightness').value / 100);
        view.setSpeed(+$('speed').value);
        view.setColors(mode, { white: $('white-color').value, black: $('black-color').value });
    };
    for (const id of ['style', 'colors', 'white-color', 'black-color', 'brightness', 'speed']) {
        $(id).addEventListener(id === 'style' || id === 'colors' ? 'change' : 'input', () => {
            store.set(`pr-${id}`, $(id).value);
            showStyle();
        });
    }
    showStyle();
    $('labels').addEventListener('change', () => {
        store.set('pr-labels', $('labels').value);
        $('room').dataset.labels = $('labels').value;
        view.setLabels(labelsFor($('labels').value));
    });
    for (const button of document.querySelectorAll('[data-transpose]')) {
        button.addEventListener('click', () => setTranspose(transpose + Number(button.dataset.transpose)));
    }
    $('transpose').addEventListener('click', () => setTranspose(0));

    const savedPiano = store.get('pr-piano', 'salamander-8');
    $('piano').value = savedPiano in BANKS ? savedPiano : 'salamander-8';
    $('piano').addEventListener('change', () => {
        store.set('pr-piano', $('piano').value);
        changePiano();
    });

    // Browsers may keep audio suspended until the user interacts with the page.
    const resume = () => { if (ctx.state !== 'running') ctx.resume(); };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
}

// Chat

const MAX_MESSAGES = 200;
const SIDEBAR_IDLE_MS = 6000;
let sidebarTimer = 0;

/** Shows the sidebar, which fades out once nobody has used it for a while. */
function wakeSidebar() {
    $('players').classList.remove('idle');
    clearTimeout(sidebarTimer);
    sidebarTimer = setTimeout(restSidebar, SIDEBAR_IDLE_MS);
}

function restSidebar() {
    const hovered = $('players').matches(':hover') && matchMedia('(hover: hover)').matches; // a touch leaves :hover stuck
    if ($('players').contains(document.activeElement) || hovered) wakeSidebar();
    else $('players').classList.add('idle');
}

function bindChat() {
    const input = $('chat-input');
    input.maxLength = MAX_CHAT;
    // Enter sends and Escape leaves, so the keys go back to the piano either way.
    $('chat').addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim().slice(0, MAX_CHAT);
        input.value = '';
        input.blur();
        if (!text) return;
        net.say(text);
        addMessage(me, text);
    });
    input.addEventListener('keydown', e => {
        if (e.code === 'Escape') input.blur();
    });
    // On a phone held sideways the players fold into their count, opened by a tap
    $('players-toggle').addEventListener('click', () => {
        const open = $('players').classList.toggle('open');
        $('players-toggle').ariaExpanded = String(open);
        $('players').classList.remove('unread');
    });
    $('players').addEventListener('pointerenter', wakeSidebar);
    $('players').addEventListener('pointerleave', wakeSidebar);
    $('players').addEventListener('focusin', wakeSidebar);
    $('players').addEventListener('focusout', wakeSidebar);
    wakeSidebar();
}

function addMessage(info, text) {
    const list = $('messages');
    const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    const li = document.createElement('li');
    const name = document.createElement('b');
    name.textContent = info.name;
    name.style.setProperty('--c', info.color);
    li.append(name);
    for (const t of info.tags ?? []) li.append(' ', tagPill(t));
    li.append(' ', text);
    list.append(li);
    while (list.children.length > MAX_MESSAGES) list.firstChild.remove();
    if (atEnd) list.scrollTop = list.scrollHeight;
    if (info !== me && !$('players').classList.contains('open')) $('players').classList.add('unread');
    wakeSidebar();
}

const icon = (node, name, title) => {
    const svg = createElement(node, { class: `lucide lucide-${name}` });
    if (title) svg.setAttribute('aria-label', title);
    else svg.setAttribute('aria-hidden', 'true');
    return svg;
};

function tagPill(tag) {
    const pill = document.createElement('span');
    pill.className = `tag tag-${tag}`;
    pill.textContent = TAGS[tag].label;
    return pill;
}

function renderPeople() {
    if (!ident) return;
    const ul = $('people');
    ul.replaceChildren();
    const host = hostId();
    const row = (id, info, ping, p) => {
        const li = document.createElement('li');
        li.style.setProperty('--c', info.color);
        // Another player's row opens their menu: volume, mutes and, for the host, kick and ban.
        const body = document.createElement(p ? 'button' : 'div');
        body.className = 'person';
        if (p) {
            body.type = 'button';
            body.addEventListener('click', () => openPlayerMenu(p, body));
        } else {
            li.className = 'self';
        }
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = info.name;
        body.append(name);
        for (const t of info.tags ?? []) body.append(tagPill(t));
        if (id === host) body.append(icon(Crown, 'crown', 'Host'));
        const m = p ? muteOf(p) : {};
        if (m.play) body.append(icon(VolumeX, 'volume-x', 'Muted'));
        if (m.chat) body.append(icon(MessageSquareOff, 'message-square-off', 'Chat muted'));
        if (ping != null) {
            const ms = document.createElement('small');
            ms.textContent = `${ping} ms`;
            body.append(ms);
        }
        li.append(body);
        ul.append(li);
    };
    row(selfId, me, null, null);
    for (const p of peers.values()) row(p.id, p.info, p.ping, p);
    $('people-count').textContent = peers.size + 1;
    renderRoomSettings();
}

// Player menu

let menuPeer = null;

function bindPlayerMenu() {
    const menu = $('player-menu');
    const current = () => peers.get(menuPeer);
    menu.addEventListener('toggle', e => {
        if (e.newState === 'closed') {
            menuPeer = null;
            for (const b of menu.querySelectorAll('.armed')) disarm(b);
        }
    });
    $('pm-volume').addEventListener('input', () => {
        const p = current();
        if (p) setMute(p, { vol: +$('pm-volume').value });
        $('pm-volume-val').value = `${$('pm-volume').value}%`;
    });
    for (const [id, field] of [['pm-play', 'play'], ['pm-chat', 'chat']]) {
        $(id).addEventListener('click', () => {
            const p = current();
            if (!p) return;
            setMute(p, { [field]: !muteOf(p)[field] });
            $(id).ariaPressed = String(Boolean(muteOf(p)[field]));
        });
    }
    // Kick acts at once; Ban and Make host ask for a second click.
    $('pm-kick').addEventListener('click', () => {
        const p = current();
        menu.hidePopover();
        if (p) kick(p);
    });
    const confirmed = (id, act) => $(id).addEventListener('click', () => {
        const b = $(id);
        if (!b.classList.contains('armed')) {
            b.classList.add('armed');
            b.dataset.label = b.lastChild.textContent;
            b.lastChild.textContent = 'Confirm';
            return;
        }
        const p = current();
        menu.hidePopover();
        if (p) act(p);
    });
    confirmed('pm-ban', ban);
    confirmed('pm-host', makeHost);
}

function disarm(b) {
    b.classList.remove('armed');
    if (b.dataset.label) b.lastChild.textContent = b.dataset.label;
}

/** A Dev's buttons for the tags they give. */
function renderMenuTags(p) {
    const box = $('pm-tags');
    box.replaceChildren();
    box.hidden = issuer() === undefined || !p.ident;
    if (box.hidden) return;
    for (const t of GIVEN) {
        const b = button([icon(Tag, 'tag'), text(TAGS[t].label)], TAGS[t].label, async () => {
            await giveTag(p, t);
            b.ariaPressed = String(p.held.has(t));
        }, 'toggle');
        b.dataset.tag = t;
        b.ariaPressed = String(p.held.has(t));
        box.append(b);
    }
}

function openPlayerMenu(p, anchor) {
    const menu = $('player-menu');
    menuPeer = p.id;
    $('pm-name').textContent = p.info.name;
    $('pm-name').style.setProperty('--c', p.info.color);
    const m = muteOf(p);
    $('pm-volume').value = m.vol ?? 100;
    $('pm-volume-val').value = `${$('pm-volume').value}%`;
    $('pm-play').ariaPressed = String(Boolean(m.play));
    $('pm-chat').ariaPressed = String(Boolean(m.chat));
    const owner = p.ident?.key === ownerKey;
    $('pm-hosting').hidden = !amHost() || owner;
    $('pm-host').hidden = ownerKey !== ident.key || !p.ident;
    $('pm-ban').hidden = !p.ident;
    renderMenuTags(p);
    menu.showPopover();
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = r.right + 8 + w <= innerWidth ? r.right + 8 : Math.max(8, r.left);
    const top = r.right + 8 + w <= innerWidth ? r.top : r.bottom + 6;
    menu.style.left = `${Math.min(left, innerWidth - w - 8)}px`;
    menu.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`;
}

// Room settings, for the host: the password and the ban list

function bindRoomSettings() {
    $('room-pass').addEventListener('change', () => setRoomPassword($('room-pass').value.trim().slice(0, 64)));
}

function renderRoomSettings() {
    if (!ident || !net) return;
    const host = amHost();
    $('room-settings').hidden = !host;
    if (!host) return;
    if (document.activeElement !== $('room-pass')) $('room-pass').value = password;
    const list = bans().list;
    $('bans-box').hidden = !list.length;
    const ul = $('ban-list');
    ul.replaceChildren();
    for (const b of list) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = b.name || b.id;
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'icon';
        undo.title = 'Unban';
        undo.setAttribute('aria-label', `Unban ${b.name}`);
        undo.append(icon(Undo2, 'undo-2'));
        undo.addEventListener('click', () => unban(b.id));
        li.append(name, undo);
        ul.append(li);
    }
}

// Tags. A player shows the tags their certificates give them and can hide any of them; a Dev gives
// and takes back the others from the player menu. See certs.js.

function localCerts() {
    try {
        const list = JSON.parse(store.get('pr-certs', '[]'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

const hiddenTags = () => new Set(store.get('pr-tags-hidden', store.get('pr-tag', '1') === '0' ? 'dev' : '').split(',').filter(Boolean));
const myIds = () => accounts.att?.ids ?? null;
const mySubs = () => [`k:${ident.id}`, ...(myIds() ?? []).map(a => `a:${a}`)];

/** Gets the account's attestation and certificates, then works out this player's tags. */
async function prepareTags() {
    if (accountsOn && accounts.signedIn) {
        await accounts.attest(ident).catch(() => {});
        for (const c of accounts.untags) await book.add(c);
        // The root key makes its account Dev, so the tag comes along wherever the dev signs in
        const ids = myIds();
        if (ident.id === ROOT_ID && ids && !accounts.certs.some(c => c.tag === 'dev' && c.sub === `a:${ids[0]}`)) {
            const dev = await makeCert(ident, 'tag', 'dev', `a:${ids[0]}`);
            accounts.certs.push(dev);
            accounts.putCert(dev);
        }
    }
    await myTags();
}

/** This player's certificates: kept in this browser for its key, from the accounts service for its account. */
function myCerts() {
    const best = new Map();
    for (const c of [...localCerts(), ...accounts.certs]) {
        const k = `${c?.tag}|${c?.sub}`;
        if (!best.has(k) || best.get(k).n < c.n) best.set(k, c);
    }
    return [...best.values()];
}

async function myTags() {
    const certs = myCerts();
    held = await book.holds(certs, ident.id, myIds());
    const hidden = hiddenTags();
    me.tags = Object.keys(TAGS).filter(t => held.has(t) && !hidden.has(t)).slice(0, MAX_SHOWN_TAGS);
    me.certs = [];
    for (const c of certs) if (await book.stands(c)) me.certs.push(c);
    me.untags = book.all().sort((a, b) => b.n - a.n).slice(0, MAX_SENT_UNTAGS);
    renderTagSettings();
}

/** Works out which of the tags a peer shows stand. */
async function checkTags(p) {
    if (!p.ident || !p.sent) return;
    p.held = await book.holds(p.sent.certs, p.ident.id, p.ident.ids);
    const shown = Array.isArray(p.sent.tags) ? p.sent.tags : [];
    p.info.tags = Object.keys(TAGS).filter(t => shown.includes(t) && p.held.has(t)).slice(0, MAX_SHOWN_TAGS);
}

/** Works everyone's tags out again, once a tag was given or taken back. */
let retagging = null;
function retag() {
    retagging ??= Promise.resolve().then(async () => {
        retagging = null;
        await myTags();
        net?.setMe(me);
        for (const p of peers.values()) await checkTags(p);
        renderPeople();
    });
    return retagging;
}

/** A certificate a peer sent: a tag given to this player, or one taken back from anyone. */
async function takeCert(cert) {
    if (cert?.kind === 'untag') {
        if (await book.add(cert)) retag();
        return;
    }
    if (cert?.kind !== 'tag' || !mySubs().includes(cert.sub) || !await book.stands(cert)) return;
    const others = list => list.filter(c => c.tag !== cert.tag || c.sub !== cert.sub);
    if (cert.sub.startsWith('k:')) store.set('pr-certs', JSON.stringify([...others(localCerts()), cert].slice(-20)));
    else accounts.certs = [...others(accounts.certs), cert];
    retag();
}

/** What a Dev signs with: null for the root key, its attestation and Dev certificate for a Dev's account, undefined for anyone else. */
function issuer() {
    if (ident.id === ROOT_ID) return null;
    const dev = me.certs.find(c => c.tag === 'dev' && c.sub.startsWith('a:') && !c.by);
    return dev && accounts.att ? { att: accounts.att, dev } : undefined;
}

/** Gives a player a tag, or takes it back from their key and every account of theirs. */
async function giveTag(p, tag) {
    const by = issuer();
    if (by === undefined || !p.ident) return;
    if (p.held.has(tag)) {
        p.held.delete(tag);
        for (const sub of [`k:${p.ident.id}`, ...(p.ident.ids ?? []).map(a => `a:${a}`)]) {
            const c = await makeCert(ident, 'untag', tag, sub, by);
            await book.add(c);
            net.cert(c);
            if (sub.startsWith('a:')) accounts.putCert(c);
        }
        retag();
        return;
    }
    p.held.add(tag);
    const sub = p.ident.ids ? `a:${p.ident.ids[0]}` : `k:${p.ident.id}`;
    const c = await makeCert(ident, 'tag', tag, sub, by);
    net.cert(c, p.id);
    if (sub.startsWith('a:')) accounts.putCert(c);
}

function renderTagSettings() {
    const box = $('tag-list');
    box.replaceChildren();
    box.hidden = !held.size;
    const hidden = hiddenTags();
    for (const t of Object.keys(TAGS).filter(t => held.has(t))) {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.tag = t;
        input.checked = !hidden.has(t);
        input.addEventListener('change', () => {
            const now = hiddenTags();
            if (input.checked) now.delete(t);
            else now.add(t);
            store.set('pr-tags-hidden', [...now].join(','));
            retag();
        });
        label.append(input, tagPill(t));
        box.append(label);
    }
}

// Account: Discord and Roblox sign-ins, more logins added any time, and merging with an account
// signed in from the same network (both accounts must ask).

const PROVIDER_NAMES = { discord: 'Discord', roblox: 'Roblox' };
const SVG = 'http://www.w3.org/2000/svg';

function brand(provider) {
    if (!BRANDS[provider]) return icon(LogIn, 'log-in');
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `brand brand-${provider}`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', BRANDS[provider].path);
    svg.append(path);
    return svg;
}

function button(parts, title, act, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    if (cls) b.className = cls;
    b.append(...parts);
    b.addEventListener('click', () => act(b));
    return b;
}

const text = t => Object.assign(document.createElement('span'), { textContent: t });

function leaveFor(provider) {
    window.removeEventListener('beforeunload', keepOpen);
    accounts.go(provider, location.hash).catch(err => {
        if (ident && !$('room').hidden) window.addEventListener('beforeunload', keepOpen);
        showError(err);
    });
}

/** After the account changed: its attestation and tags again, everywhere they are shown. */
async function accountChanged() {
    accounts.att = null;
    if (ident && net) {
        await prepareTags();
        net.setMe(me);
        renderPeople();
    }
    renderAccounts();
}

function renderAccounts() {
    renderAccount($('start-account'));
    renderAccount($('account'));
}

async function renderAccount(el) {
    el.hidden = !accountsOn;
    if (!accountsOn) return;
    if (accounts.signedIn && !accounts.info) await accounts.refresh().catch(() => {});
    const offered = await accounts.providers();
    el.replaceChildren();
    const info = accounts.info;
    if (!info) {
        el.hidden = !offered.length;
        for (const pr of offered) el.append(button([brand(pr), text(PROVIDER_NAMES[pr])], `Sign in with ${PROVIDER_NAMES[pr]}`, () => leaveFor(pr), 'sign-in'));
        return;
    }
    const list = document.createElement('ul');
    list.className = 'logins';
    for (const l of info.logins) {
        const li = document.createElement('li');
        li.append(brand(l.provider), text(l.name));
        if (info.logins.length > 1) {
            li.append(button([icon(X, 'x')], `Remove ${PROVIDER_NAMES[l.provider]} ${l.name}`, async () => {
                await accounts.unlink(l).catch(showError);
                renderAccounts();
            }, 'icon'));
        }
        list.append(li);
    }
    const actions = document.createElement('div');
    actions.className = 'account-actions';
    for (const pr of offered) actions.append(button([icon(Plus, 'plus'), brand(pr)], `Add ${PROVIDER_NAMES[pr]}`, () => leaveFor(pr), 'add-login'));
    actions.append(button([icon(LogOut, 'log-out')], 'Sign out', async () => {
        await accounts.logout();
        accountChanged();
    }, 'icon sign-out'));
    el.append(list, actions);
    for (const s of info.suggest) {
        const row = document.createElement('div');
        row.className = 'merge';
        row.dataset.acct = s.acct;
        row.append(icon(Merge, 'merge'));
        for (const l of s.logins) row.append(brand(l.provider), text(l.name));
        const ask = button([text(s.sent ? 'Asked' : 'Merge')], 'Merge accounts', async () => {
            await accounts.merge(s.acct).catch(showError);
            accountChanged();
        }, 'merge-yes');
        ask.disabled = s.sent && !s.asked;
        row.append(ask, button([icon(X, 'x')], 'Not mine', async () => {
            await accounts.merge(s.acct, true).catch(showError);
            renderAccounts();
        }, 'icon merge-no'));
        el.append(row);
    }
}

/** Shows loading progress (0-1) or an error in the header; null text hides it. */
function setStatus(text, error = false, progress = null) {
    const el = $('loading');
    el.hidden = text == null;
    if (text == null) return;
    el.classList.toggle('error', error);
    el.setAttribute('role', error ? 'alert' : 'status');
    $('loading-text').textContent = progress == null ? text : `${text} ${Math.round(progress * 100)}%`;
    $('loading-bar').style.width = `${(progress ?? 1) * 100}%`;
}

function showError(err) {
    setStatus(String(err?.message || err), true);
}
