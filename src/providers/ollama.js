const TIMEOUT_MS = 120000;

export async function check(config) {
  const host = config.ollamaHost || 'http://localhost:11434';
  const model = config.model || 'qwen3:8b';

  try {
    const res = await fetch(host, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
  } catch {
    throw new Error(
      `Ollama is not running at ${host}.\n\nStart it with: ollama serve\nOr install from: https://ollama.com`
    );
  }

  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const models = data.models?.map((m) => m.name) || [];
    const hasModel = models.some((m) => m === model || m.startsWith(model + ':'));
    if (!hasModel) {
      throw new Error(
        `Model "${model}" is not available in Ollama.\n\nPull it with: ollama pull ${model}\nAvailable models: ${models.join(', ') || '(none)'}`
      );
    }
  } catch (err) {
    if (err.message.includes('not available')) throw err;
    throw new Error(`Failed to check Ollama models: ${err.message}`);
  }
}

export async function summarize(formattedMessages, systemPrompt, config) {
  const host = config.ollamaHost || 'http://localhost:11434';
  const model = config.model || 'qwen3:8b';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Summarize this conversation:\n\n${formattedMessages}` }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 }
      })
    });

    if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${TIMEOUT_MS / 1000}s. Try a smaller scope or faster model.`);
    }
    throw new Error(`Ollama summarization failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}
