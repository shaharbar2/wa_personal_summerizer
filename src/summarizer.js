import { Ollama } from 'ollama';

const SYSTEM_PROMPT = `You are a WhatsApp conversation summarizer. Summarize the following conversation as concise bullet points. For group chats, mention who said what when relevant. Focus on key topics, decisions, and action items. Respond in the same language as the majority of messages.`;

const TIMEOUT_MS = 60000;

export async function checkOllama(host, model) {
  // Check if Ollama is running
  try {
    const res = await fetch(host, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
  } catch {
    throw new Error(
      `Ollama is not running at ${host}.\n\n` +
      `Start it with: ollama serve\n` +
      `Or install from: https://ollama.com`
    );
  }

  // Check if model is available
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const models = data.models?.map((m) => m.name) || [];
    const hasModel = models.some((m) => m === model || m.startsWith(model + ':'));

    if (!hasModel) {
      throw new Error(
        `Model "${model}" is not available in Ollama.\n\n` +
        `Pull it with: ollama pull ${model}\n` +
        `Available models: ${models.join(', ') || '(none)'}`
      );
    }
  } catch (err) {
    if (err.message.includes('not available')) throw err;
    throw new Error(`Failed to check Ollama models: ${err.message}`);
  }
}

export async function summarize(formattedMessages, model, host) {
  const ollama = new Ollama({ host });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await ollama.chat({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this conversation:\n\n${formattedMessages}` }
      ],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 500
      }
    });

    clearTimeout(timeout);
    return response.message.content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${TIMEOUT_MS / 1000}s. The conversation may be too long, or the model may be slow. Try a smaller scope or a faster model.`);
    }
    throw new Error(`Summarization failed: ${err.message}`);
  }
}
