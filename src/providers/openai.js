// Compatible with OpenAI and any OpenAI-compatible API (LM Studio, Groq, Together, etc.)
const TIMEOUT_MS = 120000;

export async function check(config) {
  if (!config.apiKey) {
    throw new Error(
      'OpenAI API key is required.\n\nSet it in ~/.wasumm/config.json:\n  "apiKey": "sk-..."'
    );
  }
}

export async function summarize(formattedMessages, systemPrompt, config) {
  const baseUrl = config.openaiBaseUrl || 'https://api.openai.com/v1';
  const model = config.model || 'gpt-4o-mini';
  const apiKey = config.apiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Summarize this conversation:\n\n${formattedMessages}` }
        ],
        temperature: 0.3,
        max_tokens: 2048
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`OpenAI API error ${res.status}: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI timed out after ${TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
