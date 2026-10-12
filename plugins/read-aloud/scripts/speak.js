#!/usr/bin/env node
/**
 * read-aloud — reads Claude Code replies aloud with the OS voice.
 *   macOS -> say · Linux -> espeak-ng | espeak | spd-say · Windows -> System.Speech
 *
 * Modes (one script, zero dependencies — Claude Code already ships Node):
 *   (stdin hook JSON)  Stop hook: save the reply; speak it unless muted
 *   --read             speak the last saved reply (works while muted)
 *   --stop             stop speaking now
 *   --pause / --resume pause and continue the current reply (macOS/Linux)
 *   --mute / --unmute  turn automatic reading off / on
 *   --status           print current state
 *
 * State lives in ~/.claude/read-aloud/ :
 *   config.json  { "rate": 200, "voice": "Samantha", "arabicVoice": "Majed", "maxChars": 1800 }
 *   muted        exists = don't read automatically
 *   last.txt     last reply, already cleaned for speech
 *   speech.pid   pid of the voice process currently speaking
 * Env vars override config: READ_ALOUD_RATE, READ_ALOUD_VOICE, READ_ALOUD_MAX
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.claude', 'read-aloud');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const MUTE_FILE = path.join(STATE_DIR, 'muted');
const LAST_FILE = path.join(STATE_DIR, 'last.txt');
const PID_FILE = path.join(STATE_DIR, 'speech.pid');

// Replies to the plugin's own commands start with this; they are never saved or read.
const CONTROL_PREFIX = '[read-aloud]';

const IS_WIN = process.platform === 'win32';

function ensureDir() { fs.mkdirSync(STATE_DIR, { recursive: true }); }

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* defaults */ }
  return {
    // "auto" = Gemini when an API key is set, otherwise the system voice
    engine: process.env.READ_ALOUD_ENGINE || cfg.engine || 'auto',
    geminiApiKey: cfg.geminiApiKey || null,
    geminiModel: cfg.geminiModel || 'gemini-3.8-flash-tts',
    geminiVoice: process.env.READ_ALOUD_GEMINI_VOICE || cfg.geminiVoice || 'Kore',
    style: cfg.style ?? 'Natural and relaxed, like a colleague explaining their work',
    // system voice settings
    rate: Number(process.env.READ_ALOUD_RATE || cfg.rate || 200),
    voice: process.env.READ_ALOUD_VOICE || cfg.voice || null,
    arabicVoice: cfg.arabicVoice || 'Majed',
    maxChars: Number(process.env.READ_ALOUD_MAX || cfg.maxChars || 1800),
  };
}

function clean(text, maxChars) {
  text = text.replace(/```[\w+-]*\n[\s\S]*?```/g, ' (code block) ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/g, 'link');
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/(\*\*|__|~~)([\s\S]*?)\1/g, '$2');
  text = text.replace(/(^|[^\w])[*_](.+?)[*_](?!\w)/g, '$1$2');
  text = text.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '');
  text = text.replace(/^\s*\|\s*/gm, '').replace(/\s*\|\s*$/gm, '').replace(/\s*\|\s*/g, ', ');
  text = text.replace(/(?:[\w.-]+\/)+([\w.-]+)/g, '$1');
  const sentences = [];
  for (let line of text.split('\n')) {
    line = line.replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (!/[.!?:;,]$/.test(line)) line += '.';
    sentences.push(line);
  }
  text = sentences.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (text.length > maxChars) {
    let cut = text.slice(0, maxChars);
    const end = cut.lastIndexOf('. ');
    if (end > 0) cut = cut.slice(0, end + 1);
    text = cut + ' ... response truncated.';
  }
  return text;
}

function isArabic(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  const arabic = letters.filter((c) => c >= '؀' && c <= 'ۿ').length;
  return arabic / letters.length > 0.3;
}

function has(cmd) {
  return spawnSync(IS_WIN ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

function readPid() {
  try { return Number(fs.readFileSync(PID_FILE, 'utf8').trim()) || null; } catch { return null; }
}

function signal(sig) {
  const pid = readPid();
  if (!pid) return false;
  try {
    if (IS_WIN) {
      if (sig !== 'SIGTERM') return false; // Windows can't pause a process this way
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // negative pid = the whole detached process group
      try { process.kill(-pid, sig); } catch { process.kill(pid, sig); }
      // a paused process must be resumed before it can exit cleanly
      if (sig === 'SIGTERM') { try { process.kill(-pid, 'SIGCONT'); } catch { /* gone */ } }
    }
    return true;
  } catch { return false; }
}

function stop() {
  const stopped = signal('SIGTERM');
  try { fs.unlinkSync(PID_FILE); } catch { /* none */ }
  return stopped;
}

// ---------- engines ----------

function geminiKey(cfg) {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ||
    process.env.CLAUDE_PLUGIN_OPTION_GEMINI_API_KEY || cfg.geminiApiKey || null;
}

function useGemini(cfg) {
  if (cfg.engine === 'system') return false;
  return Boolean(geminiKey(cfg));
}

// Build the OS voice command for `text`: [cmd, args, stdinText]
function systemVoiceCommand(text, cfg) {
  const arabic = isArabic(text);
  if (process.platform === 'darwin' && has('say')) {
    const args = ['-r', String(cfg.rate)];
    const voice = cfg.voice || (arabic ? cfg.arabicVoice : null);
    if (voice) args.push('-v', voice);
    return ['say', args, text];
  }
  if (process.platform === 'linux') {
    if (has('espeak-ng')) {
      const args = ['-s', String(cfg.rate), '--stdin'];
      if (cfg.voice) args.push('-v', cfg.voice);
      else if (arabic) args.push('-v', 'ar');
      return ['espeak-ng', args, text];
    }
    if (has('espeak')) return ['espeak', ['-s', String(cfg.rate), '--stdin'], text];
    if (has('spd-say')) return ['spd-say', ['-w', '-e', text], null];
  }
  if (IS_WIN) {
    const ps = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      `$s.Rate = ${Math.max(-10, Math.min(10, Math.round((cfg.rate - 175) / 25)))};`,
      cfg.voice ? `try { $s.SelectVoice('${cfg.voice.replace(/'/g, "''")}') } catch {};` : '',
      '$s.Speak([Console]::In.ReadToEnd())',
    ].join(' ');
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], text];
  }
  return null;
}

// Build the command that plays a WAV file
function wavPlayerCommand(file) {
  if (process.platform === 'darwin') return ['afplay', [file]];
  if (IS_WIN) {
    const f = file.replace(/'/g, "''");
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(New-Object Media.SoundPlayer '${f}').PlaySync()`]];
  }
  for (const [cmd, args] of [['paplay', [file]], ['aplay', ['-q', file]], ['pw-play', [file]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]]]) {
    if (has(cmd)) return [cmd, args];
  }
  return null;
}

// Run a command in the foreground (inside the worker) and wait for it.
function runAndWait(cmd, args, input) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: [input ? 'pipe' : 'ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    if (input) child.stdin.end(input);
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

// Find the base64 audio payload anywhere in the Interactions API response.
function findAudio(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.data === 'string' && node.data.length > 100 &&
      (!node.mime_type || /audio/.test(node.mime_type)) && (!node.type || node.type === 'audio')) {
    return node.data;
  }
  for (const v of Object.values(node)) {
    const found = findAudio(v);
    if (found) return found;
  }
  return null;
}

async function geminiSynthesize(text, cfg) {
  const body = {
    model: cfg.geminiModel,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text,
        ...(cfg.style ? { annotations: [{ type: 'speech_metadata', style: cfg.style }] } : {}),
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: cfg.geminiVoice }] },
  };
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey(cfg) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const raw = await res.text();
    let msg = raw;
    try { const j = JSON.parse(raw); msg = (Array.isArray(j) ? j[0] : j).error.message; } catch { /* raw */ }
    throw new Error(`Gemini ${res.status}: ${String(msg).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const b64 = findAudio(await res.json());
  if (!b64) throw new Error('Gemini response had no audio');
  let wav = Buffer.from(b64, 'base64');
  if (wav.slice(0, 4).toString() !== 'RIFF') wav = pcmToWav(wav, 24000); // raw PCM fallback
  return wav;
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const LAST_WAV = path.join(STATE_DIR, 'last.wav');
const LAST_WAV_KEY = path.join(STATE_DIR, 'last.wav.key');
const ERROR_LOG = path.join(STATE_DIR, 'error.log');

function audioKey(text, cfg) {
  return require('crypto').createHash('sha1')
    .update([text, cfg.geminiModel, cfg.geminiVoice, cfg.style].join('\u0000')).digest('hex');
}

function logError(msg) {
  try {
    ensureDir();
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} ${String(msg).replace(/\s+/g, ' ')}\n`);
  } catch { /* ignore */ }
}

// The worker runs detached in its own process group, so stop/pause can
// signal it together with whatever player it starts.
async function worker() {
  const text = fs.readFileSync(0, 'utf8');
  const cfg = loadConfig();

  if (useGemini(cfg)) {
    try {
      const key = audioKey(text, cfg);
      let cached = false;
      try { cached = fs.readFileSync(LAST_WAV_KEY, 'utf8') === key && fs.existsSync(LAST_WAV); } catch { /* none */ }
      if (!cached) {
        const wav = await geminiSynthesize(text, cfg);
        ensureDir();
        fs.writeFileSync(LAST_WAV, wav);
        fs.writeFileSync(LAST_WAV_KEY, key);
      }
      const player = wavPlayerCommand(LAST_WAV);
      if (!player) throw new Error('no audio player found (Linux: install pulseaudio-utils or alsa-utils)');
      if (await runAndWait(player[0], player[1])) return;
      throw new Error('audio player failed');
    } catch (e) {
      logError(`gemini: ${e.message} — falling back to system voice`);
    }
  }

  const sys = systemVoiceCommand(text, cfg);
  if (!sys) return logError('no voice engine found (Linux: sudo apt install espeak-ng)');
  await runAndWait(sys[0], sys[1], sys[2]);
}

function speak(text) {
  stop(); // a new reading always replaces the old one
  const child = spawn(process.execPath, [__filename, '--worker'], {
    detached: !IS_WIN,
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  child.stdin.end(text);
  ensureDir();
  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
}

// ---------- entry points ----------

function onStopHook() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* empty */ }
  if (data.stop_hook_active) return;
  const raw = String(data.last_assistant_message || '').trim();
  if (!raw || raw.startsWith(CONTROL_PREFIX)) return; // ignore our own command replies
  const text = clean(raw, loadConfig().maxChars);
  if (!text) return;
  ensureDir();
  fs.writeFileSync(LAST_FILE, text);
  if (!fs.existsSync(MUTE_FILE)) speak(text);
}

const say = (msg) => process.stdout.write(msg + '\n');

const commands = {
  '--read'() {
    let text = '';
    try { text = fs.readFileSync(LAST_FILE, 'utf8').trim(); } catch { /* none */ }
    if (!text) return say('No reply saved yet. Send a prompt first, then run /read-aloud:read.');
    speak(text);
    say('Reading the last reply aloud.');
  },
  '--stop'() { say(stop() ? 'Stopped.' : 'Nothing is being read right now.'); },
  '--pause'() {
    if (IS_WIN) return say('Pause is not supported on Windows. Use /read-aloud:stop, then /read-aloud:read to start over.');
    say(signal('SIGSTOP') ? 'Paused. Run /read-aloud:resume to continue.' : 'Nothing is being read right now.');
  },
  '--resume'() {
    if (IS_WIN) return say('Resume is not supported on Windows. Use /read-aloud:read to start over.');
    say(signal('SIGCONT') ? 'Resumed.' : 'Nothing is paused. Run /read-aloud:read to hear the last reply.');
  },
  '--mute'() { ensureDir(); fs.writeFileSync(MUTE_FILE, ''); stop(); say('Muted. Replies won\'t be read automatically; /read-aloud:read still works.'); },
  '--unmute'() { try { fs.unlinkSync(MUTE_FILE); } catch { /* not muted */ } say('Unmuted. Replies will be read automatically.'); },
  '--status'() {
    const cfg = loadConfig();
    const safe = { ...cfg, geminiApiKey: cfg.geminiApiKey ? '(set)' : null };
    say(`auto-read: ${fs.existsSync(MUTE_FILE) ? 'off (muted)' : 'on'}`);
    say(`voice engine: ${useGemini(cfg) ? `Gemini (${cfg.geminiVoice})` : 'system voice'}` +
      (cfg.engine !== 'system' && !geminiKey(cfg) ? ' — no Gemini API key found' : ''));
    say(`settings: ${JSON.stringify(safe)}`);
    say(`config file: ${CONFIG_FILE}`);
    try {
      const lines = fs.readFileSync(ERROR_LOG, 'utf8').trim().split('\n');
      say(`last error: ${lines[lines.length - 1]}`);
    } catch { /* no errors */ }
  },
  '--voices'() {
    say('Gemini voices: Zephyr (bright), Puck (upbeat), Charon (informative), Kore (firm), ' +
      'Fenrir (excitable), Leda (youthful), Orus (firm), Aoede (breezy), Callirrhoe (easy-going), ' +
      'Autonoe (bright), Enceladus (breathy), Iapetus (clear), Umbriel (easy-going), Algieba (smooth), ' +
      'Despina (smooth), Erinome (clear), Algenib (gravelly), Rasalgethi (informative), ' +
      'Laomedeia (upbeat), Achernar (soft), Alnilam (firm), Schedar (even), Gacrux (mature), ' +
      'Pulcherrima (forward), Achird (friendly), Zubenelgenubi (casual), Vindemiatrix (gentle), ' +
      'Sadachbia (lively), Sadaltager (knowledgeable), Sulafat (warm).');
  },
};

function main() {
  const flag = process.argv[2];
  if (flag === '--worker') {
    worker().catch((e) => logError(`worker: ${e.message}`)).finally(() => {
      try { if (readPid() === process.pid) fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    });
    return;
  }
  if (flag) {
    const fn = commands[flag];
    if (!fn) return say(`Unknown option ${flag}. Use one of: ${Object.keys(commands).join(' ')}`);
    try { fn(); } catch (e) { say(`read-aloud error: ${e.message}`); }
    return;
  }
  onStopHook();
}

if (require.main === module) main();
module.exports = { clean, isArabic, CONTROL_PREFIX };
