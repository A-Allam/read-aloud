#!/usr/bin/env node
/**
 * read-aloud — Claude Code Stop hook that reads each finished reply aloud.
 *
 * Receives the hook JSON on stdin, takes `last_assistant_message`, strips
 * markdown so it sounds natural, then speaks it with the OS voice:
 *   macOS   -> say
 *   Linux   -> espeak-ng | espeak | spd-say
 *   Windows -> System.Speech via PowerShell
 *
 * Zero dependencies: Claude Code already ships with Node.
 *
 * Config (optional) — ~/.claude/read-aloud.json:
 *   { "rate": 200, "voice": "Samantha", "arabicVoice": "Majed", "maxChars": 1800 }
 * Env vars override the file: CLAUDE_SPEAK_RATE, CLAUDE_SPEAK_VOICE, CLAUDE_SPEAK_MAX
 *
 * Mute without restarting:  touch ~/.claude/read-aloud.mute
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MUTE_FILE = path.join(CLAUDE_DIR, 'read-aloud.mute');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'read-aloud.json');

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* no config */ }
  return {
    rate: Number(process.env.CLAUDE_SPEAK_RATE || cfg.rate || 200),
    voice: process.env.CLAUDE_SPEAK_VOICE || cfg.voice || null,
    arabicVoice: cfg.arabicVoice || 'Majed',
    maxChars: Number(process.env.CLAUDE_SPEAK_MAX || cfg.maxChars || 1800),
  };
}

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return {}; }
}

function clean(text, maxChars) {
  // fenced code blocks -> spoken placeholder
  text = text.replace(/```[\w+-]*\n[\s\S]*?```/g, ' (code block) ');
  // inline code
  text = text.replace(/`([^`]+)`/g, '$1');
  // links and bare urls
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/g, 'link');
  // headings, bullets, numbering, blockquotes
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  // bold / italic / strikethrough
  text = text.replace(/(\*\*|__|~~)([\s\S]*?)\1/g, '$2');
  text = text.replace(/(^|[^\w])[*_](.+?)[*_](?!\w)/g, '$1$2');
  // tables: drop separator rows, turn cells into a spoken list
  text = text.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '');
  text = text.replace(/^\s*\|\s*/gm, '').replace(/\s*\|\s*$/gm, '').replace(/\s*\|\s*/g, ', ');
  // file paths -> basename
  text = text.replace(/(?:[\w.-]+\/)+([\w.-]+)/g, '$1');
  // every non-empty line becomes a sentence so the voice pauses
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
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

function kill(name) {
  if (process.platform === 'win32') return;
  spawnSync('pkill', ['-x', name], { stdio: 'ignore' });
}

// Detached so Claude Code never waits on the audio.
function run(cmd, args, input) {
  const child = spawn(cmd, args, {
    detached: process.platform !== 'win32',
    stdio: [input ? 'pipe' : 'ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  if (input) child.stdin.end(input);
  child.unref();
}

function speak(text, cfg) {
  const arabic = isArabic(text);

  if (process.platform === 'darwin' && has('say')) {
    kill('say');
    const args = ['-r', String(cfg.rate)];
    const voice = cfg.voice || (arabic ? cfg.arabicVoice : null);
    if (voice) args.push('-v', voice);
    return run('say', args, text);
  }

  if (process.platform === 'linux') {
    if (has('espeak-ng')) {
      kill('espeak-ng');
      const args = ['-s', String(cfg.rate), '--stdin'];
      if (cfg.voice) args.push('-v', cfg.voice);
      else if (arabic) args.push('-v', 'ar');
      return run('espeak-ng', args, text);
    }
    if (has('espeak')) { kill('espeak'); return run('espeak', ['-s', String(cfg.rate), '--stdin'], text); }
    if (has('spd-say')) return run('spd-say', ['-e', text]);
  }

  if (process.platform === 'win32') {
    const ps = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      `$s.Rate = ${Math.max(-10, Math.min(10, Math.round((cfg.rate - 175) / 25)))};`,
      cfg.voice ? `try { $s.SelectVoice('${cfg.voice.replace(/'/g, "''")}') } catch {};` : '',
      '$s.Speak([Console]::In.ReadToEnd())',
    ].join(' ');
    return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], text);
  }

  process.stderr.write('read-aloud: no TTS engine found (Linux: sudo apt install espeak-ng)\n');
}

function main() {
  if (fs.existsSync(MUTE_FILE)) return;
  const data = readStdin();
  if (data.stop_hook_active) return; // don't re-speak a continued turn
  const text = clean(String(data.last_assistant_message || ''), loadConfig().maxChars);
  if (!text) return;
  speak(text, loadConfig());
}

if (require.main === module) main();
module.exports = { clean, isArabic };
