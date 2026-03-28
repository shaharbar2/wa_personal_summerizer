import * as ollama from './providers/ollama.js';
import * as openai from './providers/openai.js';
import * as anthropic from './providers/anthropic.js';

const SYSTEM_PROMPT = `/no_think
You are a WhatsApp conversation summarizer. Summarize the following conversation as concise bullet points. For group chats, mention who said what when relevant. Focus on key topics, decisions, and action items. Respond in the same language as the majority of messages.`;

const PROVIDERS = { ollama, openai, anthropic };

function getProvider(config) {
  const name = (config.provider || 'ollama').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Unknown provider "${name}". Valid options: ollama, openai, anthropic\n\nSet it in ~/.wasumm/config.json:\n  "provider": "ollama"`
    );
  }
  return provider;
}

export async function checkProvider(config) {
  const provider = getProvider(config);
  await provider.check(config);
}

export async function summarize(formattedMessages, config) {
  const provider = getProvider(config);
  let content = await provider.summarize(formattedMessages, SYSTEM_PROMPT, config);
  // Strip <think>...</think> tags (qwen3 and other reasoning models)
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return content;
}
