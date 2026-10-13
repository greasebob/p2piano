// Emoji for the chat: a picker opened from the button by the chat box, and Discord's :shortcodes:
// typed into the box, suggested after two letters and turned into the emoji by the closing colon.
// Each entry is the emoji and its names, Discord's name first and its aliases after.

const CATEGORIES = [
    ['😀', 'Smileys', `
😀 grinning | 😃 smiley | 😄 smile | 😁 grin | 😆 laughing satisfied | 😅 sweat_smile | 🤣 rofl rolling_on_the_floor_laughing |
😂 joy | 🙂 slight_smile slightly_smiling_face | 🙃 upside_down upside_down_face | 🫠 melting_face | 😉 wink | 😊 blush |
😇 innocent | 🥰 smiling_face_with_3_hearts smiling_face_with_hearts | 😍 heart_eyes | 🤩 star_struck | 😘 kissing_heart |
😗 kissing | ☺️ relaxed | 😚 kissing_closed_eyes | 😙 kissing_smiling_eyes | 🥲 smiling_face_with_tear | 😋 yum |
😛 stuck_out_tongue | 😜 stuck_out_tongue_winking_eye | 🤪 zany_face crazy_face | 😝 stuck_out_tongue_closed_eyes |
🤑 money_mouth money_mouth_face | 🤗 hugging hugging_face hug | 🤭 face_with_hand_over_mouth | 🫣 face_with_peeking_eye |
🤫 shushing_face | 🤔 thinking thinking_face | 🫡 saluting_face salute | 🤐 zipper_mouth zipper_mouth_face |
🤨 face_with_raised_eyebrow raised_eyebrow | 😐 neutral_face | 😑 expressionless | 😶 no_mouth | 🫥 dotted_line_face |
😏 smirk | 😒 unamused | 🙄 rolling_eyes face_with_rolling_eyes | 😬 grimacing | 🤥 lying_face liar | 😌 relieved |
😔 pensive | 😪 sleepy | 🤤 drooling_face drool | 😴 sleeping | 😷 mask | 🤒 thermometer_face | 🤕 head_bandage |
🤢 nauseated_face sick | 🤮 face_vomiting vomit | 🤧 sneezing_face sneeze | 🥵 hot_face | 🥶 cold_face | 🥴 woozy_face |
😵 dizzy_face | 🤯 exploding_head mind_blown | 🤠 cowboy face_with_cowboy_hat | 🥳 partying_face party |
🥸 disguised_face | 😎 sunglasses cool_face | 🤓 nerd nerd_face | 🧐 face_with_monocle monocle | 😕 confused |
😟 worried | 🙁 slight_frown slightly_frowning_face | ☹️ frowning2 white_frowning_face | 😮 open_mouth | 😯 hushed |
😲 astonished | 😳 flushed | 🥺 pleading_face pleading | 🥹 face_holding_back_tears | 😦 frowning | 😧 anguished |
😨 fearful | 😰 cold_sweat | 😥 disappointed_relieved | 😢 cry | 😭 sob | 😱 scream | 😖 confounded | 😣 persevere |
😞 disappointed | 😓 sweat | 😩 weary | 😫 tired_face | 🥱 yawning_face yawn | 😤 triumph | 😡 rage pout |
😠 angry | 🤬 face_with_symbols_over_mouth cursing | 😈 smiling_imp | 👿 imp | 💀 skull | ☠️ skull_crossbones |
💩 poop shit hankey poo | 🤡 clown clown_face | 👹 japanese_ogre | 👺 japanese_goblin | 👻 ghost | 👽 alien |
👾 space_invader | 🤖 robot robot_face | 😺 smiley_cat | 😸 smile_cat | 😹 joy_cat | 😻 heart_eyes_cat | 😼 smirk_cat |
😽 kissing_cat | 🙀 scream_cat | 😿 crying_cat_face | 😾 pouting_cat | 🙈 see_no_evil | 🙉 hear_no_evil | 🙊 speak_no_evil`],
    ['👋', 'People', `
👋 wave | 🤚 raised_back_of_hand back_of_hand | 🖐️ hand_splayed raised_hand_with_fingers_splayed | ✋ raised_hand |
🖖 vulcan | 👌 ok_hand | 🤌 pinched_fingers | 🤏 pinching_hand | ✌️ v | 🤞 fingers_crossed | 🫰 hand_with_index_finger_and_thumb_crossed |
🤟 love_you_gesture | 🤘 metal sign_of_the_horns | 🤙 call_me call_me_hand | 👈 point_left | 👉 point_right |
👆 point_up_2 | 👇 point_down | ☝️ point_up | 🫵 index_pointing_at_the_viewer | 👍 thumbsup +1 thumbup |
👎 thumbsdown -1 thumbdown | ✊ fist raised_fist | 👊 punch oncoming_fist | 🤛 left_facing_fist | 🤜 right_facing_fist |
👏 clap | 🙌 raised_hands | 🫶 heart_hands | 👐 open_hands | 🤲 palms_up_together | 🤝 handshake shaking_hands | 🙏 pray |
✍️ writing_hand | 💅 nail_care | 🤳 selfie | 💪 muscle flex | 🧠 brain | 👂 ear | 👃 nose | 👀 eyes | 👁️ eye |
👅 tongue | 👄 lips | 🫦 biting_lip | 👶 baby | 👦 boy | 👧 girl | 👨 man | 👩 woman | 👴 older_man | 👵 older_woman |
🤷 person_shrugging shrug | 🤦 person_facepalming face_palm facepalm | 🙇 person_bowing bow | 🙋 person_raising_hand raising_hand |
💁 person_tipping_hand information_desk_person | 🙅 person_gesturing_no no_good | 🙆 person_gesturing_ok ok_woman |
💃 dancer | 🕺 man_dancing male_dancer | 🥷 ninja | 🎅 santa | 👼 angel | 👸 princess | 🤴 prince | 🦸 superhero |
🧙 mage wizard | 🧚 fairy | 🧛 vampire | 🧟 zombie | 🧜 merperson | 🕵️ detective spy | 💂 guard | 👷 construction_worker |
🧑‍🎤 singer | 🏃 person_running runner | 🚶 person_walking walking | 🧘 person_in_lotus_position | 👣 footprints`],
    ['🐶', 'Nature', `
🐶 dog | 🐱 cat | 🐭 mouse | 🐹 hamster | 🐰 rabbit | 🦊 fox fox_face | 🐻 bear | 🐼 panda_face panda | 🐨 koala |
🐯 tiger | 🦁 lion_face lion | 🐮 cow | 🐷 pig | 🐸 frog | 🐵 monkey_face | 🐒 monkey | 🐔 chicken | 🐧 penguin |
🐦 bird | 🐤 baby_chick | 🦆 duck | 🦅 eagle | 🦉 owl | 🦇 bat | 🐺 wolf | 🐴 horse | 🦄 unicorn unicorn_face | 🐝 bee |
🐛 bug | 🦋 butterfly | 🐌 snail | 🐞 lady_beetle ladybug | 🐜 ant | 🕷️ spider | 🐢 turtle | 🐍 snake | 🦎 lizard |
🦖 t_rex | 🦕 sauropod | 🐙 octopus | 🦑 squid | 🦐 shrimp | 🦀 crab | 🐟 fish | 🐠 tropical_fish | 🐡 blowfish |
🐬 dolphin flipper | 🦈 shark | 🐳 whale | 🐊 crocodile | 🐘 elephant | 🦒 giraffe | 🦥 sloth | 🦦 otter | 🦔 hedgehog |
🐉 dragon | 🐲 dragon_face | 🌵 cactus | 🎄 christmas_tree | 🌲 evergreen_tree | 🌳 deciduous_tree | 🌴 palm_tree |
🌱 seedling | 🌿 herb | 🍀 four_leaf_clover | 🍁 maple_leaf | 🍂 fallen_leaf | 🍄 mushroom | 💐 bouquet | 🌹 rose |
🥀 wilted_rose | 🌺 hibiscus | 🌻 sunflower | 🌼 blossom | 🌷 tulip | 🌸 cherry_blossom | 🌎 earth_americas |
🌍 earth_africa | 🌏 earth_asia | 🌕 full_moon | 🌑 new_moon | 🌙 crescent_moon | 🌚 new_moon_with_face |
🌝 full_moon_with_face | 🌞 sun_with_face | ☀️ sunny | ⭐ star | 🌟 star2 | 💫 dizzy | ✨ sparkles | ☄️ comet | ⚡ zap |
🔥 fire flame | 💥 boom collision | ❄️ snowflake | ⛄ snowman | ☃️ snowman2 | ☁️ cloud | 🌧️ cloud_rain | 🌪️ cloud_tornado tornado |
🌈 rainbow | ☔ umbrella | 💧 droplet | 🌊 ocean`],
    ['🍕', 'Food', `
🍎 apple | 🍏 green_apple | 🍐 pear | 🍊 tangerine | 🍋 lemon | 🍌 banana | 🍉 watermelon | 🍇 grapes | 🍓 strawberry |
🫐 blueberries | 🍈 melon | 🍒 cherries | 🍑 peach | 🥭 mango | 🍍 pineapple | 🥥 coconut | 🥝 kiwi kiwifruit |
🍅 tomato | 🍆 eggplant | 🥑 avocado | 🥦 broccoli | 🥕 carrot | 🌽 corn | 🌶️ hot_pepper | 🥔 potato | 🍞 bread |
🥐 croissant | 🧀 cheese cheese_wedge | 🥚 egg | 🍳 cooking | 🥓 bacon | 🥞 pancakes | 🧇 waffle | 🍔 hamburger |
🍟 fries | 🍕 pizza | 🌭 hotdog hot_dog | 🥪 sandwich | 🌮 taco | 🌯 burrito | 🍿 popcorn | 🧂 salt | 🍝 spaghetti |
🍜 ramen | 🍣 sushi | 🍱 bento | 🍚 rice | 🍙 rice_ball | 🥟 dumpling | 🥠 fortune_cookie | 🍦 icecream |
🍨 ice_cream | 🍩 doughnut | 🍪 cookie | 🎂 birthday | 🍰 cake | 🧁 cupcake | 🥧 pie | 🍫 chocolate_bar | 🍬 candy |
🍭 lollipop | 🍯 honey_pot | 🥛 milk glass_of_milk | ☕ coffee | 🍵 tea | 🧋 bubble_tea | 🧃 beverage_box |
🥤 cup_with_straw | 🍺 beer | 🍻 beers | 🍷 wine_glass | 🍸 cocktail | 🍹 tropical_drink | 🍾 champagne |
🥂 champagne_glass clinking_glass | 🍴 fork_and_knife`],
    ['⚽', 'Activities', `
⚽ soccer | 🏀 basketball | 🏈 football | ⚾ baseball | 🎾 tennis | 🏐 volleyball | 🏉 rugby_football | 🎱 8ball |
🏓 ping_pong table_tennis | 🏸 badminton | 🏒 hockey | ⛳ golf | 🏹 bow_and_arrow | 🎣 fishing_pole_and_fish |
🥊 boxing_glove | 🥋 martial_arts_uniform | 🛹 skateboard | ⛸️ ice_skate | 🎿 ski | 🏆 trophy | 🏅 medal sports_medal |
🥇 first_place first_place_medal | 🥈 second_place second_place_medal | 🥉 third_place third_place_medal |
🎖️ military_medal | 🎫 ticket | 🎪 circus_tent | 🎭 performing_arts | 🎨 art | 🎬 clapper | 🎤 microphone |
🎧 headphones | 🎼 musical_score | 🎹 musical_keyboard piano | 🥁 drum drum_with_drumsticks | 🪘 long_drum |
🎷 saxophone | 🎺 trumpet | 🎸 guitar | 🪕 banjo | 🎻 violin | 🪗 accordion | 🎵 musical_note | 🎶 notes |
🎮 video_game | 🕹️ joystick | 🎲 game_die | ♟️ chess_pawn | 🎯 dart direct_hit | 🎳 bowling | 🧩 jigsaw puzzle_piece |
🎰 slot_machine | 🎉 tada | 🎊 confetti_ball | 🎈 balloon | 🎁 gift | 🎀 ribbon | 🎆 fireworks | 🎇 sparkler |
🎃 jack_o_lantern`],
    ['🚗', 'Travel', `
🚗 red_car car | 🚕 taxi | 🚙 blue_car | 🚌 bus | 🏎️ race_car racing_car | 🚓 police_car | 🚑 ambulance |
🚒 fire_engine | 🚚 truck | 🚜 tractor | 🚲 bike bicycle | 🏍️ motorcycle racing_motorcycle | 🛴 scooter |
🚆 train2 | 🚄 bullettrain_side | ✈️ airplane | 🚀 rocket | 🚁 helicopter | 🛸 flying_saucer | ⛵ sailboat | 🚢 ship |
⚓ anchor | ⛽ fuelpump | 🚧 construction | 🚦 vertical_traffic_light | 🗺️ map world_map | 🧭 compass | 🏠 house |
🏡 house_with_garden | 🏢 office | 🏥 hospital | 🏫 school | 🏟️ stadium | 🏰 european_castle castle |
🗼 tokyo_tower | 🗽 statue_of_liberty | 🗿 moyai | 🌋 volcano | 🏔️ mountain_snow | 🏖️ beach beach_with_umbrella |
🏝️ island desert_island | 🏕️ camping | ⛺ tent | 🎡 ferris_wheel | 🎢 roller_coaster | 🎠 carousel_horse |
🌃 night_with_stars | 🌇 city_sunset | 🌅 sunrise | 🌠 stars | 🌌 milky_way`],
    ['💡', 'Objects', `
⌚ watch | 📱 iphone mobile_phone | 💻 computer | ⌨️ keyboard | 🖥️ desktop desktop_computer | 🖱️ mouse_three_button |
💿 cd | 📀 dvd | 💾 floppy_disk | 📷 camera | 📸 camera_with_flash | 📹 video_camera | 🎥 movie_camera | 📺 tv |
📻 radio | 📞 telephone_receiver | ☎️ telephone | 🔋 battery | 🔌 electric_plug | 💡 bulb | 🔦 flashlight |
🕯️ candle | 💸 money_with_wings | 💵 dollar | 💰 moneybag | 💳 credit_card | 💎 gem | 🔧 wrench | 🔨 hammer |
🛠️ tools hammer_and_wrench | ⚙️ gear | 🧲 magnet | 💣 bomb | 🔪 knife hocho | ⚔️ crossed_swords | 🛡️ shield |
🔮 crystal_ball | 🔭 telescope | 🔬 microscope | 💊 pill | 💉 syringe | 🧬 dna | 🧹 broom | 🔑 key | 🔒 lock |
🔓 unlock | 🚪 door | 🛏️ bed | 🛋️ couch couch_and_lamp | 🚽 toilet | 🛁 bath bathtub | 🧸 teddy_bear |
✉️ envelope | 📧 e_mail email | 📫 mailbox | 📦 package | 📜 scroll | 📄 page_facing_up | 📅 date calendar |
📋 clipboard | 📌 pushpin | 📎 paperclip | ✂️ scissors | ✏️ pencil2 | 🖊️ pen_ballpoint | 🖍️ crayon |
📝 pencil memo | 🔍 mag | 📚 books | 📖 book open_book | 📰 newspaper | 🔖 bookmark | 🏷️ label | 🔔 bell |
🔕 no_bell | 📢 loudspeaker | 📣 mega | 🔈 speaker | 🔉 sound | 🔊 loud_sound | 🔇 mute | ⌛ hourglass |
⏰ alarm_clock | ⏱️ stopwatch | 👑 crown | 🎩 tophat | 👓 eyeglasses glasses | 🕶️ dark_sunglasses | 👕 shirt tshirt |
👖 jeans | 👗 dress | 👠 high_heel | 👟 athletic_shoe | 💄 lipstick | 💍 ring | 👜 handbag | 🎒 school_satchel backpack |
🪄 magic_wand`],
    ['❤️', 'Symbols', `
❤️ heart | 🧡 orange_heart | 💛 yellow_heart | 💚 green_heart | 💙 blue_heart | 💜 purple_heart | 🖤 black_heart |
🤍 white_heart | 🤎 brown_heart | 💔 broken_heart | ❣️ heart_exclamation | 💕 two_hearts | 💞 revolving_hearts |
💓 heartbeat | 💗 heartpulse | 💖 sparkling_heart | 💘 cupid | 💝 gift_heart | ${'❤️‍\u{1F525}'} heart_on_fire |
💋 kiss | 💯 100 | 💢 anger | 💦 sweat_drops | 💨 dash | 🕳️ hole | 💬 speech_balloon | 💭 thought_balloon | 💤 zzz |
✅ white_check_mark | ☑️ ballot_box_with_check | ✔️ heavy_check_mark check | ❌ x | ❎ negative_squared_cross_mark |
➕ heavy_plus_sign | ➖ heavy_minus_sign | ✖️ heavy_multiplication_x | ➗ heavy_division_sign | ❓ question |
❔ grey_question | ❗ exclamation | ❕ grey_exclamation | ‼️ bangbang | ⁉️ interrobang | ⚠️ warning | ⛔ no_entry |
🚫 no_entry_sign | 🛑 octagonal_sign stop_sign | 🆘 sos | 🆗 ok | 🆒 cool | 🆕 new | 🆓 free | 🆙 up | 🔝 top |
🔜 soon | ♻️ recycle | ♾️ infinity | ☮️ peace peace_symbol | ☯️ yin_yang | 🔴 red_circle | 🟠 orange_circle |
🟡 yellow_circle | 🟢 green_circle | 🔵 blue_circle | 🟣 purple_circle | ⚫ black_circle | ⚪ white_circle |
⬆️ arrow_up | ⬇️ arrow_down | ⬅️ arrow_left | ➡️ arrow_right | 🔄 arrows_counterclockwise | 🔁 repeat |
🔀 twisted_rightwards_arrows | ▶️ arrow_forward play | ⏸️ pause_button | ⏹️ stop_button | ⏺️ record_button |
⏩ fast_forward | ⏪ rewind | ©️ copyright | ®️ registered | ™️ tm | 🔟 keycap_ten | 🚩 triangular_flag_on_post |
🏁 checkered_flag | 🏳️ flag_white | ${'\u{1F3F3}️‍\u{1F308}'} rainbow_flag gay_pride_flag |
${'\u{1F3F4}‍☠️'} pirate_flag`],
];
const RECENT_ICON = '🕘';
const RECENT_KEY = 'pr-emoji-recent';
const MAX_RECENT = 24;
const MAX_SUGGEST = 8;
const MAX_FOUND = 160;
const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 340;
const GAP = 6;
const MARGIN = 8;

const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// A lone symbol such as ☀ shows as text without the emoji variation selector.
const asEmoji = e => ([...e].length === 1 && e.codePointAt(0) < 0x1f000 ? e + '️' : e);
const ALL = [];
const BY_NAME = new Map();
const BY_EMOJI = new Map();
const GROUPS = CATEGORIES.map(([icon, label, list]) => {
    const items = list.trim().split(/\s*\|\s*/).map(entry => {
        const [e, ...names] = entry.trim().split(/\s+/);
        return { e: asEmoji(e), names };
    });
    for (const item of items) {
        ALL.push(item);
        BY_EMOJI.set(item.e, item);
        for (const n of item.names) if (!BY_NAME.has(n)) BY_NAME.set(n, item);
    }
    return { icon: asEmoji(icon), label, items };
});

const normal = q => q.toLowerCase().trim().replace(/^:+|:+$/g, '').replace(/\s+/g, '_');

// Matches by name: an exact name first, then names starting with the query, then a word in a name, then anywhere.
function find(query, limit) {
    const q = normal(query);
    if (!q) return [];
    const hits = [];
    for (const item of ALL) {
        let best = Infinity, name = null;
        item.names.forEach((n, i) => {
            const at = n.indexOf(q);
            if (at < 0) return;
            const rank = (n === q ? 0 : at === 0 ? 1 : n.includes('_' + q) ? 2 : 3) * 10 + Math.min(i, 9);
            if (rank < best) { best = rank; name = n; }
        });
        if (name) hits.push({ item, name, rank: best });
    }
    hits.sort((a, b) => Math.floor(a.rank / 10) - Math.floor(b.rank / 10) || a.name.length - b.name.length || a.rank - b.rank);
    return hits.slice(0, limit);
}

function recent() {
    try {
        const list = JSON.parse(store.get(RECENT_KEY, '[]'));
        return Array.isArray(list) ? list.filter(e => typeof e === 'string' && BY_EMOJI.has(e)) : [];
    } catch {
        return [];
    }
}

function remember(e) {
    store.set(RECENT_KEY, JSON.stringify([e, ...recent().filter(r => r !== e)].slice(0, MAX_RECENT)));
}

function make(tag, attrs = {}, text) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
}

// Fixed in the viewport, above the anchor when there is room (or more room than below), else under it.
function place(pop, rect, width, height, alignRight) {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const w = Math.min(width, vw - 2 * MARGIN);
    const x = alignRight ? rect.right - w : rect.left;
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(MARGIN, Math.min(x, vw - w - MARGIN))}px`;
    const above = rect.top - GAP - MARGIN, below = vh - rect.bottom - GAP - MARGIN;
    if (above >= Math.min(height, 200) || above >= below) {
        pop.style.top = 'auto';
        pop.style.bottom = `${vh - rect.top + GAP}px`;
        pop.style.maxHeight = `${Math.max(0, above)}px`;
    } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${rect.bottom + GAP}px`;
        pop.style.maxHeight = `${Math.max(0, below)}px`;
    }
}

const isOpen = pop => pop.matches(':popover-open');

/**
 * Binds the picker to `button` and the shortcodes to `input`; both popovers go into `host`.
 * Text never grows past `maxChat` or the input's own maxlength.
 */
export function bindEmoji(input, button, host, maxChat) {
    const limit = () => Math.min(maxChat, input.maxLength > 0 ? input.maxLength : Infinity);
    // Puts text over input[from, to) when it fits, leaving the caret after it.
    const put = (text, from, to) => {
        if (input.value.length - (to - from) + text.length > limit()) return false;
        input.setRangeText(text, from, to, 'end');
        return true;
    };

    // Shortcodes: a list over the box while a :name of two letters or more is being typed
    const list = make('ul', { id: 'emoji-suggest', popover: 'manual', role: 'listbox', 'aria-label': 'Emoji' });
    host.append(list);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    let hits = [], chosen = 0, colon = -1;

    const choose = i => {
        chosen = (i + hits.length) % hits.length;
        [...list.children].forEach((li, n) => {
            li.ariaSelected = String(n === chosen);
            if (n === chosen) li.scrollIntoView({ block: 'nearest' });
        });
        input.setAttribute('aria-activedescendant', `emoji-suggest-${chosen}`);
    };
    const hideList = () => {
        hits = [];
        colon = -1;
        input.removeAttribute('aria-activedescendant');
        input.setAttribute('aria-expanded', 'false');
        if (isOpen(list)) list.hidePopover();
    };
    const showList = () => {
        list.replaceChildren(...hits.map(({ item, name }, i) => {
            const li = make('li', { id: `emoji-suggest-${i}`, role: 'option', 'aria-selected': 'false' });
            li.append(make('span', { class: 'emoji-glyph' }, item.e), make('span', {}, `:${name}:`));
            return li;
        }));
        if (!isOpen(list)) list.showPopover();
        place(list, input.getBoundingClientRect(), Math.max(220, input.offsetWidth), 0, false);
        input.setAttribute('aria-expanded', 'true');
        choose(0);
    };
    const pick = i => {
        const { item } = hits[i];
        const to = input.selectionStart;
        const after = input.value.slice(to, to + 1);
        if (put(item.e + (after && /\s/.test(after) ? '' : ' '), colon, to) || put(item.e, colon, to)) remember(item.e);
        hideList();
    };
    const update = typed => {
        if (input.selectionStart !== input.selectionEnd) return hideList();
        const before = input.value.slice(0, input.selectionStart);
        // A whole :name: becomes its emoji as the closing colon is typed.
        if (typed?.endsWith(':')) {
            const whole = /:([\w+-]+):$/.exec(before);
            const item = whole && BY_NAME.get(whole[1].toLowerCase());
            if (item && put(item.e, before.length - whole[0].length, before.length)) {
                remember(item.e);
                return hideList();
            }
        }
        const part = /(?:^|\s):([\w+-]{2,})$/.exec(before);
        hits = part ? find(part[1], MAX_SUGGEST) : [];
        if (!hits.length) return hideList();
        colon = before.length - part[1].length - 1;
        showList();
    };

    input.addEventListener('input', e => {
        if (!e.isComposing) update(e.data);
    });
    input.addEventListener('click', () => update());
    input.addEventListener('keyup', e => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update();
    });
    input.addEventListener('blur', hideList);
    // Ahead of the chat's own keys: while the list is up, Enter and Tab pick and Escape only closes it;
    // with the picker open, Escape closes the picker and keeps the box.
    input.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (hits.length) {
            const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
            if (step) choose(chosen + step);
            else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) pick(chosen);
            else if (e.key === 'Escape') hideList();
            else return;
        } else if (e.key === 'Escape' && isOpen(pop)) {
            pop.hidePopover();
        } else {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
    list.addEventListener('mousedown', e => e.preventDefault()); // the box keeps focus
    list.addEventListener('click', e => {
        const li = e.target.closest('li');
        if (li) pick([...list.children].indexOf(li));
    });

    // The picker
    const pop = make('div', { id: 'emoji-picker', popover: 'auto', role: 'dialog', 'aria-label': 'Emoji' });
    const search = make('input', {
        type: 'text', class: 'emoji-search', placeholder: 'Search', 'aria-label': 'Search emoji',
        autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
    });
    const tabs = make('div', { class: 'emoji-tabs', role: 'toolbar', 'aria-label': 'Categories' });
    const grid = make('div', { class: 'emoji-grid' });
    const found = make('div', { class: 'emoji-cells emoji-found' });
    pop.append(search, tabs, grid);
    host.append(pop);
    button.setAttribute('popovertarget', pop.id);
    button.setAttribute('aria-haspopup', 'dialog');

    const cell = (item, name = item.names[0]) => {
        const b = make('button', { type: 'button', class: 'emoji-cell', title: `:${name}:`, 'aria-label': name.replaceAll('_', ' ') }, item.e);
        b.dataset.e = item.e;
        return b;
    };
    const groups = [{ icon: RECENT_ICON, label: 'Recent', items: [] }, ...GROUPS];
    const sections = groups.map(g => {
        const section = make('div', { class: 'emoji-cells', role: 'group', 'aria-label': g.label });
        section.append(...g.items.map(item => cell(item)));
        return section;
    });
    const tabButtons = groups.map((g, i) => {
        const t = make('button', { type: 'button', class: 'emoji-tab', title: g.label, 'aria-label': g.label }, g.icon);
        t.addEventListener('click', () => {
            if (search.value) {
                search.value = '';
                showFound();
            }
            grid.scrollTop = sections[i].offsetTop; // the grid is the sections' offset parent
            markTab();
        });
        return t;
    });
    tabs.append(...tabButtons);
    grid.append(...sections, found);

    const markTab = () => {
        let on = 0;
        if (!search.value) sections.forEach((s, i) => { if (!s.hidden && s.offsetTop <= grid.scrollTop + 4) on = i; });
        tabButtons.forEach((t, i) => t.ariaPressed = String(!search.value && i === on));
    };
    const showFound = () => {
        const q = search.value;
        found.replaceChildren(...find(q, MAX_FOUND).map(({ item, name }) => cell(item, name)));
        found.hidden = !q;
        sections.forEach((s, i) => { s.hidden = !!q || (i === 0 && !s.childElementCount); });
        tabButtons[0].hidden = !sections[0].childElementCount;
        grid.scrollTop = 0;
        markTab();
    };
    const insert = e => {
        if (put(e, input.selectionStart, input.selectionEnd)) remember(e);
        if (document.activeElement !== search) input.focus();
    };

    grid.addEventListener('scroll', markTab, { passive: true });
    grid.addEventListener('mousedown', e => { if (e.target.closest('.emoji-cell')) e.preventDefault(); }); // focus stays put
    grid.addEventListener('click', e => {
        const b = e.target.closest('.emoji-cell');
        if (b) insert(b.dataset.e);
    });
    button.addEventListener('mousedown', e => e.preventDefault()); // the box keeps its caret and focus
    search.addEventListener('input', showFound);
    search.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const first = found.querySelector('.emoji-cell');
            if (first) insert(first.dataset.e);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (isOpen(pop)) pop.hidePopover();
            input.focus();
        }
    });
    pop.addEventListener('beforetoggle', e => {
        if (e.newState !== 'open') return;
        hideList();
        sections[0].replaceChildren(...recent().map(r => cell(BY_EMOJI.get(r))));
        search.value = '';
        showFound();
        place(pop, button.getBoundingClientRect(), PICKER_WIDTH, PICKER_HEIGHT, true);
    });
    pop.addEventListener('toggle', e => {
        if (e.newState === 'open') {
            markTab();
            if (matchMedia('(pointer: fine)').matches) search.focus();
        } else if (pop.contains(document.activeElement)) {
            document.activeElement.blur(); // closed by a click elsewhere: the keys go back to the piano
        }
    });
    // A phone's keyboard coming up resizes the page, so the picker follows its button rather than closing.
    window.addEventListener('resize', () => {
        hideList();
        if (isOpen(pop)) place(pop, button.getBoundingClientRect(), PICKER_WIDTH, PICKER_HEIGHT, true);
    });
}
