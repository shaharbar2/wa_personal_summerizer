const MAX_TOKENS_ESTIMATE = 6000;
const CHARS_PER_TOKEN = 4;

export function formatMessages(messages, isGroup) {
  const lines = messages.map((msg) => {
    const time = formatTimestamp(msg.timestamp);
    const prefix = isGroup ? `[${time}] [${msg.senderName}]` : `[${time}]`;
    return `${prefix} ${msg.body}`;
  });

  const combined = lines.join('\n');
  const estimatedTokens = Math.ceil(combined.length / CHARS_PER_TOKEN);

  if (estimatedTokens > MAX_TOKENS_ESTIMATE) {
    const maxChars = MAX_TOKENS_ESTIMATE * CHARS_PER_TOKEN;
    // Keep the most recent messages (end of array)
    let truncated = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const candidate = lines[i] + '\n' + truncated;
      if (candidate.length > maxChars) break;
      truncated = candidate;
    }
    const droppedCount = messages.length - truncated.split('\n').filter(Boolean).length;
    console.warn(
      `\nWarning: Truncated ${droppedCount} oldest messages to fit model context window.`
    );
    return truncated.trim();
  }

  return combined;
}

function formatTimestamp(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

