/**
 * Parse WhatsApp exported chat .txt files.
 *
 * WhatsApp supports two main export formats depending on OS and locale:
 *
 * iOS:     [DD/MM/YYYY, HH:MM:SS] Sender: Message
 *          [M/D/YY, H:MM:SS AM] Sender: Message
 *
 * Android: DD/MM/YY, HH:MM - Sender: Message
 *          M/D/YY, H:MM AM - Sender: Message
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

// Matches both iOS [date, time] and Android date, time - formats
const MSG_REGEX = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*[-\u2013]?\s*([^:]+):\s*([\s\S]*)/i;

// System messages to skip (WhatsApp metadata lines)
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /^null$/i,
  /changed the group/i,
  /added you/i,
  /left$/i,
  /was added$/i,
  /changed this group/i,
  /security code changed/i,
  /created group/i,
];

// Parse raw text content (used by web server when browser sends file content)
export function parseContent(content, fileName, scope) {
  content = content.replace(/^\uFEFF/, '');
  const messages = parseMessages(content);
  if (messages.length === 0) {
    throw new Error('No messages found. Make sure you exported "Without Media" from WhatsApp.');
  }
  return applyScope(messages, scope);
}

export function parseExport(filePath, scope) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.zip') {
    throw new Error(
      'ZIP files are not supported directly.\n\n' +
      'Please extract the ZIP and pass the "_chat.txt" file inside:\n' +
      '  wasumm parse "_chat.txt" --last 50'
    );
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Could not read file: ${filePath}`);
  }

  // Remove BOM if present
  content = content.replace(/^\uFEFF/, '');

  const messages = parseMessages(content);

  if (messages.length === 0) {
    throw new Error(
      'No messages found in the file.\n\n' +
      'Make sure you selected "Without Media" when exporting from WhatsApp.'
    );
  }

  return applyScope(messages, scope);
}

function parseMessages(content) {
  const lines = content.split(/\r?\n/);
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(MSG_REGEX);
    if (match) {
      // Save previous message
      if (current) messages.push(current);

      const [, datePart, timePart, sender, body] = match;
      const timestamp = parseTimestamp(datePart, timePart);

      if (!timestamp) continue;
      if (isSystemMessage(sender, body)) continue;

      current = {
        timestamp,
        senderName: sender.trim(),
        body: body.trim(),
        fromMe: false
      };
    } else if (current && line.trim()) {
      // Continuation of previous message
      current.body += '\n' + line.trim();
    }
  }

  if (current) messages.push(current);
  return messages;
}

function parseTimestamp(datePart, timePart) {
  try {
    // Normalize: DD/MM/YY or MM/DD/YY → try to detect by value
    const [a, b, c] = datePart.split('/').map(Number);
    const year = c < 100 ? 2000 + c : c;

    // Heuristic: if first part > 12, it must be day (DD/MM)
    // If second part > 12, it must be day (MM/DD)
    // Otherwise assume DD/MM (most common globally)
    let day, month;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else { day = a; month = b; } // default DD/MM

    // Normalize time: handle AM/PM
    let timeStr = timePart.trim();
    const isPM = /PM/i.test(timeStr);
    const isAM = /AM/i.test(timeStr);
    timeStr = timeStr.replace(/\s*[AP]M/i, '').trim();

    let [hours, minutes] = timeStr.split(':').map(Number);
    if (isPM && hours !== 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    const date = new Date(year, month - 1, day, hours, minutes || 0);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / 1000);
  } catch {
    return null;
  }
}

function isSystemMessage(sender, body) {
  const combined = `${sender}: ${body}`;
  return SYSTEM_PATTERNS.some(p => p.test(combined)) ||
    sender.trim() === '' ||
    body.trim() === '<Media omitted>' ||
    body.trim() === 'This message was deleted' ||
    body.trim() === 'You deleted this message';
}

function applyScope(messages, scope) {
  if (!scope || scope.type === 'all') return messages;

  switch (scope.type) {
    case 'last':
      return messages.slice(-scope.value);

    case 'since': {
      const ms = parseDuration(scope.value);
      const since = Date.now() - ms;
      return messages.filter(m => m.timestamp * 1000 >= since);
    }

    case 'from': {
      const fromDate = new Date(scope.value).getTime();
      if (isNaN(fromDate)) throw new Error(`Invalid date: "${scope.value}". Use YYYY-MM-DD.`);
      return messages.filter(m => m.timestamp * 1000 >= fromDate);
    }

    case 'unread':
      // Can't determine unread from export — return last 20 with a note
      console.warn('Note: Unread detection is not available for exported files. Showing last 20 messages.');
      return messages.slice(-20);

    default:
      return messages;
  }
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(h|d)$/i);
  if (!match) throw new Error(`Invalid duration: "${str}". Use format like "2h" or "1d".`);
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'h') return value * 3600 * 1000;
  if (unit === 'd') return value * 86400 * 1000;
}

export function detectChatName(filePath) {
  // WhatsApp names exports like "WhatsApp Chat with Family Group.txt"
  const base = filePath.replace(/\\/g, '/').split('/').pop();
  const match = base.match(/WhatsApp (?:Chat )?with (.+?)(?:\.txt|\.zip)?$/i);
  return match ? match[1] : base.replace(/\.txt$/i, '');
}
