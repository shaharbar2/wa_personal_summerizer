const TIMEOUT_MS = 120000;

export async function check(config) {
  if (!config.apiKey) {
    throw new Error(
      'Anthropic API key is required.\n\nSet it in ~/.wasumm/config.json:\n  "apiKey": "sk-ant-..."'
    );
  }
}

export async function summarize(formattedMessages, systemPrompt, config) {
  const model = config.model || 'claude-haiku-4-5-20251001';
  const apiKey = config.apiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Summarize this conversation:\n\n${formattedMessages}` }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Anthropic API error ${res.status}: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Anthropic timed out after ${TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
