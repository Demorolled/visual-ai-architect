let streamQueue: string[] = [];
let streamPlaying = false;
let streamStopped = false;
let streamFinished = false;
let streamOnEnd: (() => void) | null = null;

// ── Speaking-events for UI indicators ──────────────────────────────
const SPEAKING_START_EVENT = 'vaia:speaking-start';
const SPEAKING_STOP_EVENT = 'vaia:speaking-stop';

function dispatchSpeakingStart() {
  window.dispatchEvent(new CustomEvent(SPEAKING_START_EVENT));
}
function dispatchSpeakingStop() {
  window.dispatchEvent(new CustomEvent(SPEAKING_STOP_EVENT));
}

// Re-export event names so components can listen
// (They can also just use 'vaia:speaking-start' / 'vaia:speaking-stop' directly)
export { SPEAKING_START_EVENT, SPEAKING_STOP_EVENT };

export function warmupAudio(): void {
  try {
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start();
  } catch {}
}

// ── Emoji → spoken-word expansion (kept — enhances speech) ────────────

const EMOJI_MAP: Record<string, string> = {
  // Smileys & Emotions
  '😀': ' grinning face ',
  '😁': ' beaming face ',
  '😂': ' face with tears of joy ',
  '🤣': ' rolling on the floor laughing ',
  '😃': ' grinning face with big eyes ',
  '😄': ' grinning face with smiling eyes ',
  '😅': ' grinning face with sweat ',
  '😆': ' grinning squinting face ',
  '😉': ' winking face ',
  '😊': ' smiling face with smiling eyes ',
  '😋': ' face savoring food ',
  '😌': ' relieved face ',
  '😍': ' smiling face with heart eyes ',
  '🥰': ' smiling face with hearts ',
  '😘': ' face blowing a kiss ',
  '😗': ' kissing face ',
  '😙': ' kissing face with smiling eyes ',
  '😚': ' kissing face with closed eyes ',
  '🙂': ' slightly smiling face ',
  '🤗': ' hugging face ',
  '🤩': ' star struck ',
  '🤔': ' thinking face ',
  '🤨': ' face with raised eyebrow ',
  '😐': ' neutral face ',
  '😑': ' expressionless face ',
  '😶': ' face without mouth ',
  '🙄': ' rolling eyes ',
  '😏': ' smirking face ',
  '😣': ' persevering face ',
  '😥': ' sad but relieved face ',
  '😮': ' face with open mouth ',
  '🤐': ' zipper mouth face ',
  '😯': ' hushed face ',
  '😪': ' sleepy face ',
  '😫': ' tired face ',
  '😴': ' sleeping face ',
  '😛': ' face with tongue ',
  '😜': ' winking face with tongue ',
  '😝': ' squinting face with tongue ',
  '🤤': ' drooling face ',
  '😒': ' unamused face ',
  '😓': ' downcast face with sweat ',
  '😔': ' pensive face ',
  '😕': ' confused face ',
  '🙃': ' upside down face ',
  '😷': ' face with medical mask ',
  '🤒': ' face with thermometer ',
  '🤕': ' face with head bandage ',
  '🤢': ' nauseated face ',
  '🤮': ' face vomiting ',
  '🤧': ' sneezing face ',
  '🥵': ' hot face ',
  '🥶': ' cold face ',
  '🥴': ' woozy face ',
  '🥳': ' partying face ',
  '🥺': ' pleading face ',
  '😢': ' crying face ',
  '😭': ' loudly crying face ',
  '😤': ' face with steam from nose ',
  '😠': ' angry face ',
  '😡': ' enraged face ',
  '🤬': ' face with symbols on mouth ',
  '💀': ' skull ',
  '☠️': ' skull and crossbones ',
  '💩': ' pile of poo ',
  '🤡': ' clown face ',
  '👹': ' ogre ',
  '👺': ' goblin ',
  '👻': ' ghost ',
  '👽': ' alien ',
  '👾': ' alien monster ',
  '🤖': ' robot face ',
  '😺': ' grinning cat ',
  '😸': ' grinning cat with smiling eyes ',
  '😹': ' cat with tears of joy ',
  '😻': ' smiling cat with heart eyes ',
  '😼': ' cat with wry smile ',
  '😽': ' kissing cat ',
  '🙀': ' weary cat ',
  '😿': ' crying cat ',
  '😾': ' pouting cat ',
  '🙈': ' see no evil monkey ',
  '🙉': ' hear no evil monkey ',
  '🙊': ' speak no evil monkey ',
  '💋': ' kiss mark ',
  '💌': ' love letter ',

  // Hearts
  '💘': ' heart with arrow ',
  '💝': ' heart with ribbon ',
  '💖': ' sparkling heart ',
  '💗': ' growing heart ',
  '💓': ' beating heart ',
  '💞': ' revolving hearts ',
  '💕': ' two hearts ',
  '💟': ' heart decoration ',
  '❣️': ' heart exclamation ',
  '💔': ' broken heart ',
  '❤️': ' red heart ',
  '🧡': ' orange heart ',
  '💛': ' yellow heart ',
  '💚': ' green heart ',
  '💙': ' blue heart ',
  '💜': ' purple heart ',
  '🖤': ' black heart ',
  '🤍': ' white heart ',
  '🤎': ' brown heart ',
  '💯': ' hundred points ',

  // Common Symbols used in chat
  '⚡': ' lightning ',
  '🔥': ' fire ',
  '💫': ' dizzy ',
  '🌟': ' glowing star ',
  '⭐': ' star ',
  '✨': ' sparkles ',
  '💥': ' collision ',
  '💦': ' sweat droplets ',
  '💨': ' dashing away ',
  '💬': ' speech balloon ',

  // Hand Gestures
  '👋': ' waving hand ',
  '🤚': ' raised back of hand ',
  '🖐️': ' hand with fingers splayed ',
  '✋': ' raised hand ',
  '🖖': ' vulcan salute ',
  '👌': ' OK hand ',
  '🤌': ' pinched fingers ',
  '🤏': ' pinching hand ',
  '✌️': ' victory hand ',
  '🤞': ' crossed fingers ',
  '🤟': ' love you gesture ',
  '🤘': ' sign of the horns ',
  '🤙': ' call me hand ',
  '👈': ' pointing left ',
  '👉': ' pointing right ',
  '👆': ' pointing up ',
  '👇': ' pointing down ',
  '☝️': ' index pointing up ',
  '👍': ' thumbs up ',
  '👎': ' thumbs down ',
  '✊': ' raised fist ',
  '👊': ' oncoming fist ',
  '🤛': ' left facing fist ',
  '🤜': ' right facing fist ',
  '👏': ' clapping hands ',
  '🙌': ' raising hands ',
  '👐': ' open hands ',
  '🤲': ' palms up together ',
  '🤝': ' handshake ',
  '🙏': ' folded hands ',
  '💅': ' nail polish ',
  '🤳': ' selfie ',
  '💪': ' flexed biceps ',
  '🦵': ' leg ',
  '🦶': ' foot ',
  '👂': ' ear ',
  '🦻': ' ear with hearing aid ',
  '👃': ' nose ',
  '🧠': ' brain ',
  '🦷': ' tooth ',
  '🦴': ' bone ',
  '👀': ' eyes ',
  '👁️': ' eye ',
  '👅': ' tongue ',
  '👄': ' mouth ',

  // Celebrations & Objects
  '🎉': ' party popper ',
  '🎊': ' confetti ball ',
  '🎈': ' balloon ',
  '🎁': ' wrapped gift ',
  '🏆': ' trophy ',
  '🥇': ' first place medal ',
  '🥈': ' second place medal ',
  '🥉': ' third place medal ',
  '👑': ' crown ',
  '💍': ' ring ',
  '🚀': ' rocket ',
  '✈️': ' airplane ',
  '🌈': ' rainbow ',
  '☀️': ' sun ',
  '🌙': ' crescent moon ',
  '💡': ' light bulb ',
  '📚': ' books ',
  '📖': ' open book ',
  '📝': ' memo ',
  '✏️': ' pencil ',
  '🔧': ' wrench ',
  '🔨': ' hammer ',
  '⚙️': ' gear ',
  '🔗': ' link ',
  '📎': ' paperclip ',
  '🔒': ' locked lock ',
  '🔓': ' unlocked lock ',
  '✅': ' check mark ',
  '❌': ' cross mark ',
  '❓': ' question mark ',
  '❗': ' exclamation mark ',
  '⚠️': ' warning ',
  '🚨': ' alert light ',
  '🚩': ' flag ',
  '🎯': ' bullseye ',
  '🎮': ' video game ',
  '🎵': ' musical note ',
  '🎶': ' musical notes ',
  '📢': ' loudspeaker ',
  '🔊': ' speaker high volume ',
  '🔔': ' bell ',
  '📌': ' pushpin ',
  '🎨': ' artist palette ',
  '🖥️': ' desktop computer ',
  '💻': ' laptop computer ',
  '📱': ' mobile phone ',
  '☕': ' hot beverage ',
  '🍕': ' pizza ',
  '🍔': ' hamburger ',
  '⏰': ' alarm clock ',
  '💾': ' floppy disk ',
  '💿': ' compact disc ',
  '🔍': ' magnifying glass ',
  '🔎': ' magnifying glass ',
  '🪄': ' magic wand ',
  '🤯': ' exploding head ',
  '🥹': ' face holding back tears ',
  '🫠': ' melting face ',
  '🥸': ' disguised face ',
  '🫣': ' face with peeking eye ',
  '🦄': ' unicorn ',
  '🦋': ' butterfly ',
  '🐶': ' dog face ',
  '🐱': ' cat face ',
  '🐼': ' panda ',
  '🐧': ' penguin ',
  '🐦': ' bird ',
  '🐟': ' fish ',
  '🐠': ' tropical fish ',
  '🐳': ' spouting whale ',
  '🐬': ' dolphin ',
  '🦈': ' shark ',
  '🌸': ' cherry blossom ',
  '🌻': ' sunflower ',
  '🌹': ' rose ',
  '🍀': ' four leaf clover ',
  '🌱': ' seedling ',
  '🧘': ' person in lotus position ',
  '🏃': ' person running ',
  '🎭': ' performing arts ',
  '🎤': ' microphone ',
  '🎧': ' headphone ',
  '🎼': ' musical score ',
  '🎹': ' musical keyboard ',
  '🥁': ' drum ',
  '🎬': ' clapper board ',
  '🎥': ' movie camera ',
  '📸': ' camera with flash ',
  '🕶️': ' sunglasses ',
  '👔': ' necktie ',
  '💼': ' briefcase ',
  '🔬': ' microscope ',
  '🔭': ' telescope ',
  '🧪': ' test tube ',
  '🧬': ' DNA ',
  '💊': ' pill ',
  '💰': ' money bag ',
  '💵': ' dollar banknote ',
  '💳': ' credit card ',
  '🛒': ' shopping cart ',
  '🎒': ' backpack ',
  '🏠': ' house ',
  '🏢': ' office building ',
  '🌳': ' tree ',
  '🌊': ' water wave ',
  '🎄': ' Christmas tree ',
  '🎃': ' jack o lantern ',
  '🎂': ' birthday cake ',
  '🎆': ' fireworks ',
  '🎇': ' sparkler ',
  '🐺': ' wolf ',
  '🦊': ' fox ',
  '🐻': ' bear ',
  '🦁': ' lion ',
  '🐯': ' tiger ',
  '🐮': ' cow ',
  '🐷': ' pig ',
  '🐸': ' frog ',
  '🐵': ' monkey face ',
  '🐒': ' monkey ',
  '🐔': ' chicken ',
  '🐤': ' baby chick ',
  '🐣': ' hatching chick ',
  '🦆': ' duck ',
  '🦉': ' owl ',
  '🦇': ' bat ',
  '🐝': ' honeybee ',
  '🐞': ' ladybug ',
  '🐜': ' ant ',
  '🐌': ' snail ',
  '🐢': ' turtle ',
  '🐍': ' snake ',
  '🐉': ' dragon ',
  '🐙': ' octopus ',
  '🌷': ' tulip ',
  '🌼': ' blossom ',
  '🥀': ' wilted flower ',
  '🌞': ' sun with face ',
  '🌕': ' full moon ',
  '☁️': ' cloud ',
  '❄️': ' snowflake ',
  '🌧️': ' rain ',
  '🌩️': ' lightning ',
  '🌪️': ' tornado ',
  '🍎': ' red apple ',
  '🍊': ' orange ',
  '🍋': ' lemon ',
  '🍌': ' banana ',
  '🍇': ' grapes ',
  '🍓': ' strawberry ',
  '🍑': ' peach ',
  '🍅': ' tomato ',
  '🥑': ' avocado ',
  '🥦': ' broccoli ',
  '🍞': ' bread ',
  '🧀': ' cheese ',
  '🍗': ' chicken leg ',
  '🍟': ' french fries ',
  '🍿': ' popcorn ',
  '🍦': ' ice cream ',
  '🍩': ' doughnut ',
  '🍪': ' cookie ',
  '🧁': ' cupcake ',
  '🍫': ' chocolate ',
  '🍬': ' candy ',
  '🍭': ' lollipop ',
  '🍺': ' beer ',
  '🍷': ' wine glass ',
  '🥂': ' clinking glasses ',
  '🥤': ' cup with straw ',
  '⚽': ' soccer ball ',
  '🏀': ' basketball ',
  '🏈': ' football ',
  '⚾': ' baseball ',
  '🎾': ' tennis ball ',
  '🏐': ' volleyball ',
  '🏓': ' ping pong ',
  '🥊': ' boxing glove ',
  '🎣': ' fishing ',
  '🎲': ' game die ',
  '🥋': ' martial arts uniform ',
  '🛹': ' skateboard ',
  '🛴': ' kick scooter ',
  '🚲': ' bicycle ',
  '🚗': ' car ',
  '🚕': ' taxi ',
  '🚌': ' bus ',
  '🚎': ' trolley ',
  '🚓': ' police car ',
  '🚑': ' ambulance ',
  '🚒': ' fire engine ',
  '🚚': ' delivery truck ',
  '🚜': ' tractor ',
  '🏍️': ' motorcycle ',
  '🛵': ' motor scooter ',
  '🚂': ' locomotive ',
  '🚃': ' railway car ',
  '🚟': ' suspension railway ',
  '🚠': ' mountain cableway ',
  '🚡': ' aerial tramway ',
  '🚢': ' ship ',
  '🚁': ' helicopter ',
  '🛩️': ' small airplane ',
  '🛰️': ' satellite ',
  '🛸': ' flying saucer ',
  '🌍': ' globe showing Europe Africa ',
  '🌎': ' globe showing Americas ',
  '🌏': ' globe showing Asia Australia ',

  // Common UI symbols
  '🔴': ' red circle ',
  '🟠': ' orange circle ',
  '🟡': ' yellow circle ',
  '🟢': ' green circle ',
  '🔵': ' blue circle ',
  '🟣': ' purple circle ',
  '⚪': ' white circle ',
  '⚫': ' black circle ',
  '⬛': ' black square ',
  '⬜': ' white square ',
  '🟥': ' red square ',
  '🟧': ' orange square ',
  '🟨': ' yellow square ',
  '🟩': ' green square ',
  '🟦': ' blue square ',
  '🟪': ' purple square ',
  '🟫': ' brown square ',
  '🔺': ' red triangle pointing up ',
  '🔻': ' red triangle pointing down ',
  '▶️': ' play button ',
  '⏩': ' fast forward ',
  '⏭️': ' next track ',
  '⏯️': ' play or pause ',
  '◀️': ' reverse button ',
  '⏪': ' fast reverse ',
  '⏮️': ' last track ',
  '⏸️': ' pause button ',
  '⏹️': ' stop button ',
  '⏺️': ' record button ',
  '♻️': ' recycling symbol ',
  '™️': ' trademark symbol ',
  '©️': ' copyright symbol ',
  '®️': ' registered symbol ',
  '🔞': ' eighteen plus ',

  // Directional arrows
  '⬆️': ' up arrow ',
  '⬇️': ' down arrow ',
  '➡️': ' right arrow ',
  '⬅️': ' left arrow ',
  '↗️': ' up right arrow ',
  '↘️': ' down right arrow ',
  '↙️': ' down left arrow ',
  '↖️': ' up left arrow ',
  '🔄': ' refresh ',
  '🔃': ' reload ',

  // Keycaps
  '0️⃣': ' keycap zero ',
  '1️⃣': ' keycap one ',
  '2️⃣': ' keycap two ',
  '3️⃣': ' keycap three ',
  '4️⃣': ' keycap four ',
  '5️⃣': ' keycap five ',
  '6️⃣': ' keycap six ',
  '7️⃣': ' keycap seven ',
  '8️⃣': ' keycap eight ',
  '9️⃣': ' keycap nine ',
  '🔟': ' keycap ten ',

  // Flags & Letters
  '🇺🇸': ' United States flag ',
  '🇬🇧': ' United Kingdom flag ',
  '🇨🇦': ' Canada flag ',
  '🇦🇺': ' Australia flag ',
  '🇩🇪': ' Germany flag ',
  '🇫🇷': ' France flag ',
  '🇯🇵': ' Japan flag ',
  '🇨🇳': ' China flag ',
  '🇮🇳': ' India flag ',
  '🇧🇷': ' Brazil flag ',
  '🇮🇹': ' Italy flag ',
  '🇪🇸': ' Spain flag ',
  '🇲🇽': ' Mexico flag ',
  '🇰🇷': ' South Korea flag ',
  '🇷🇺': ' Russia flag ',
  '🇿🇦': ' South Africa flag ',
  '🇳🇬': ' Nigeria flag ',
  '🏴󠁧󠁢󠁥󠁮󠁧󠀁': ' England flag ',
  '🏴󠁧󠁢󠁳󠁣󠁴󠀀': ' Scotland flag ',
  '🏴󠁧󠁢󠁷󠁬󠁳󠁀': ' Wales flag ',
};

/**
 * Normalize text for natural speech — strip code, symbols, and jargon
 * so the TTS voice speaks naturally without reading out every symbol.
 *
 * By default (codeToWords: false), code is NEVER read aloud — fenced code
 * blocks are silenced entirely so the reply is simply displayed, not spoken.
 * Pass { codeToWords: true } when the user explicitly asked for the code
 * to be read to them, in which case the code text is kept and spoken with
 * symbols expanded to words.
 *
 * Examples (default):
 *   "Here it is:\n```py\nprint(1)\n```\nDone."  →  "Here it is: Done."
 *   "Run `npm start`"  →  "Run npm start"
 *   "foo/bar.tsx"      →  "foo bar dot tsx"
 *   "OK! 🚀"           →  "OK! rocket"
 */
export interface SpeechOptions {
  /** When true, code blocks are read aloud as words instead of being silenced. */
  codeToWords?: boolean;
}

export function normalizeForSpeech(text: string, opts?: SpeechOptions): string {
  let result = text;
  const codeToWords = !!opts?.codeToWords;

  // 1. Markdown code fences (``` ... ```)
  if (codeToWords) {
    // User asked for code to words — drop only the fence markers and let
    // the code text flow through the symbol-expansion rules below.
    result = result.replace(/```[a-zA-Z0-9_-]*\s*/g, ' ');
    result = result.replace(/```/g, ' ');
  } else {
    // Default: code is written to the terminal but never read aloud.
    // 1a. Complete fences (``` ... ```) — silence the whole block
    result = result.replace(/```[\s\S]*?```/g, ' ');
    // 1b. Unclosed fence opener (e.g. "```typescript" with no closing fence)
    //     — the rest of the text is likely code, silence from the opener on
    result = result.replace(/```[a-zA-Z0-9_-]*[\s\S]*$/g, ' ');
  }

  // 2. Remove inline code backticks — keep the inner text visible
  result = result.replace(/`([^`]+)`/g, ' $1 ');
  // 2b. Remove any remaining lone backticks (stray inline markers)
  result = result.replace(/`/g, ' ');

  // 3. Strip markdown bold/italic markers
  result = result.replace(/\*\*([^*]+)\*\*/g, ' $1 ');
  result = result.replace(/\*([^*]+)\*/g, ' $1 ');
  result = result.replace(/__([^_]+)__/g, ' $1 ');
  result = result.replace(/_([^_]+)_/g, ' $1 ');

  // 4. Handle common code patterns with natural speech equivalents
  //    Arrow functions and comparisons
  result = result.replace(/\s*=>\s*/g, ' becomes ');
  result = result.replace(/\s*===\s*/g, ' equals ');
  result = result.replace(/\s*==\s*/g, ' equals ');
  result = result.replace(/\s*!==\s*/g, ' does not equal ');
  result = result.replace(/\s*!=\s*/g, ' does not equal ');
  result = result.replace(/\s*>=\s*/g, ' greater than or equal to ');
  result = result.replace(/\s*<=\s*/g, ' less than or equal to ');
  result = result.replace(/\s*&&\s*/g, ' and ');
  result = result.replace(/\s*\|\|\s*/g, ' or ');

  // 5. Handle file paths and package names — replace / with space, .ext with "dot ext"
  //    Match patterns like word/word/word.extension
  result = result.replace(
    /([a-zA-Z0-9_\-.]+)(\/)([a-zA-Z0-9_\-.]+)/g,
    (match) => match.replace(/\//g, ' slash ')
  );

  // 6. Handle npm command patterns: "npm run x", "npx y", etc.
  result = result.replace(/\bnpm\s+(\w+)/g, 'npm $1');
  result = result.replace(/\bnpx\s+(\w+)/g, 'npx $1');

  // 7. Replace specific symbols with natural speech equivalents
  //    Keep = when used as assignment (not comparison — already handled above)
  //    Keep + for "plus" context, but remove most other symbols
  const speechSymbols: Record<string, string> = {
    '->': ' becomes ',
    '\n': ' ',   // newlines → spaces
  };
  for (const [symbol, replacement] of Object.entries(speechSymbols)) {
    result = result.split(symbol).join(replacement);
  }

  // 8. Strip standalone symbols that are annoying to hear
  //    But keep punctuation that aids natural speech flow
  result = result.replace(/(?<=^|[\s(])[*#@$%^&~`|\\_{}\[\]<>](?=[\s)]|$)/g, ' ');

  // 9. Handle trailing dots in file extensions like .ts, .js, .tsx etc.
  //    But keep periods in ellipsis and sentence endings
  result = result.replace(/\.([a-zA-Z]{2,4})(?=\s|$)/g, ' dot $1 ');

  // 10. Replace known emojis with spoken words
  for (const [emoji, replacement] of Object.entries(EMOJI_MAP)) {
    result = result.split(emoji).join(replacement);
  }

  // 11. Fallback: strip any remaining emoji characters we don't have mapped
  result = result.replace(
    /[\u{1F000}-\u{1FFFF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu,
    ''
  );

  // 12. Clean up: collapse multiple spaces, trim, limit length
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Detect whether the user explicitly asked for code to be read aloud
 * (e.g. "read the code to me", "code to words", "say the code out loud").
 */
export function wantsCodeToWords(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    'code to words',
    'code to word',
    'read the code',
    'read code',
    'read the code aloud',
    'read the code out loud',
    'read code aloud',
    'read code out loud',
    'read it aloud',
    'read it out loud',
    'read it to me',
    'read the code to me',
    'say the code',
    'say the code aloud',
    'say the code out loud',
    'speak the code',
    'speak the code aloud',
    'verbalize',
  ];
  return patterns.some(p => t.includes(p));
}

let ttsCtx: AudioContext | null = null;

function getTtsCtx(): AudioContext {
  if (!ttsCtx) ttsCtx = new AudioContext();
  if (ttsCtx.state === 'suspended') ttsCtx.resume();
  return ttsCtx;
}

function buildAudioGraph(ac: AudioContext, source: AudioBufferSourceNode): AudioNode {
  let tail: AudioNode = source;

  const bassVal = parseFloat(localStorage.getItem('tts-bass') || '0');
  const midVal = parseFloat(localStorage.getItem('tts-mid') || '0');
  const highVal = parseFloat(localStorage.getItem('tts-high') || '0');
  const echoVal = parseFloat(localStorage.getItem('tts-echo') || '0');
  const volumeVal = parseFloat(localStorage.getItem('tts-volume') || '1');

  if (bassVal !== 0) {
    const f = ac.createBiquadFilter();
    f.type = 'lowshelf';
    f.frequency.value = 300;
    f.Q.value = 1;
    f.gain.value = bassVal;
    tail.connect(f);
    tail = f;
  }

  if (midVal !== 0) {
    const f = ac.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = 1000;
    f.Q.value = 1;
    f.gain.value = midVal;
    tail.connect(f);
    tail = f;
  }

  if (highVal !== 0) {
    const f = ac.createBiquadFilter();
    f.type = 'highshelf';
    f.frequency.value = 4000;
    f.Q.value = 1;
    f.gain.value = highVal;
    tail.connect(f);
    tail = f;
  }

  if (echoVal > 0) {
    const delay = ac.createDelay(1);
    delay.delayTime.value = echoVal * 0.3;
    const feedback = ac.createGain();
    feedback.gain.value = echoVal * 0.4;
    const dryGain = ac.createGain();
    dryGain.gain.value = 1;
    const wetGain = ac.createGain();
    wetGain.gain.value = echoVal * 0.6;
    const merger = ac.createGain();

    tail.connect(dryGain);
    dryGain.connect(merger);

    tail.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(merger);

    tail = merger;
  }

  const vol = ac.createGain();
  vol.gain.value = Math.max(0, volumeVal);
  tail.connect(vol);
  return vol;
}

function playAudioBuffer(ac: AudioContext, buffer: AudioBuffer, onEnd?: () => void) {
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const pitchVal = parseFloat(localStorage.getItem('tts-pitch') || '1');
  source.playbackRate.value = Math.max(0.1, pitchVal);
  const output = buildAudioGraph(ac, source);
  output.connect(ac.destination);
  source.start();
  source.onended = onEnd || null;
  return source;
}

export async function speak(text: string, onEnd?: () => void, opts?: SpeechOptions) {
  text = normalizeForSpeech(text, opts);
  if (!text) { onEnd?.(); return; }
  stopSpeechStream();

  try {
    const speedVal = parseFloat(localStorage.getItem('tts-speed') || '1');
    const voice = localStorage.getItem('tts-voice') || 'en-US-JennyNeural';
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, pitch: 1, rate: speedVal, volume: 1 }),
    });
    if (!res.ok) throw new Error(`TTS request failed (${res.status})`);
    const ac = getTtsCtx();
    const buf = await res.arrayBuffer();
    const buffer = await ac.decodeAudioData(buf);
    dispatchSpeakingStart();
    playAudioBuffer(ac, buffer, () => {
      dispatchSpeakingStop();
      onEnd?.();
    });
  } catch (e) {
    console.warn('TTS failed:', e);
    dispatchSpeakingStop();
    onEnd?.();
  }
}

export function stopSpeaking() {
  stopSpeechStream();
  dispatchSpeakingStop();
  if (ttsCtx) {
    ttsCtx.close().catch(() => {});
    ttsCtx = null;
  }
}

export function startSpeechStream(onEnd?: () => void) {
  stopSpeechStream();
  streamQueue = [];
  streamPlaying = false;
  streamStopped = false;
  streamFinished = false;
  streamOnEnd = onEnd ?? null;
}

export function enqueueSpeech(text: string, opts?: SpeechOptions) {
  text = normalizeForSpeech(text, opts);
  if (streamStopped || streamFinished || !text) return;
  streamQueue.push(text);
  if (!streamPlaying) processSpeechQueue();
}

export function finishSpeechStream() {
  streamFinished = true;
  if (!streamPlaying && streamQueue.length === 0) {
    streamOnEnd?.();
    streamOnEnd = null;
  }
}

export function stopSpeechStream() {
  streamStopped = true;
  streamQueue = [];
  streamPlaying = false;
}

async function processSpeechQueue() {
  if (streamQueue.length > 0) dispatchSpeakingStart();
  while (!streamStopped && streamQueue.length > 0) {
    streamPlaying = true;
    const text = streamQueue.shift()!;
    try {
      const speedVal = parseFloat(localStorage.getItem('tts-speed') || '1');
      const voice = localStorage.getItem('tts-voice') || 'en-US-JennyNeural';
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, pitch: 1, rate: speedVal, volume: 1 }),
      });
      if (!res.ok) continue;
      const ac = getTtsCtx();
      const buf = await res.arrayBuffer();
      const buffer = await ac.decodeAudioData(buf);
      await new Promise<void>((resolve) => {
        playAudioBuffer(ac, buffer, resolve);
      });
    } catch {}
  }
  streamPlaying = false;
  dispatchSpeakingStop();
  if (streamFinished && streamQueue.length === 0) {
    streamOnEnd?.();
    streamOnEnd = null;
  }
}
