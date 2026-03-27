import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.wasumm', 'config.json');

const DEFAULTS = {
  model: 'qwen3:8b',
  ollamaHost: 'http://localhost:11434',
  defaultScope: 'unread'
};

export function loadConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
