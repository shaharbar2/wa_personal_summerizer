import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { getChats, fetchMessages, findChat } from './whatsapp.js';
import { formatMessages } from './formatter.js';
import { checkProvider, summarize } from './summarizer.js';
import { loadConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- WhatsApp singleton state ---
const state = {
  status: 'connecting', // connecting | qr_ready | ready | error
  qrDataUrl: null,
  client: null,
  error: null
};

async function initWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'wasumm', dataPath: './.wwebjs_auth/' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: 120000
    },
    qrMaxRetries: 5
  });

  client.on('qr', async (qr) => {
    state.status = 'qr_ready';
    state.qrDataUrl = await QRCode.toDataURL(qr);
    console.log('[wasumm] QR code ready — open http://localhost:3000 to scan');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    state.status = 'connecting';
    state.qrDataUrl = null;
  });

  client.on('ready', () => {
    state.status = 'ready';
    state.client = client;
    state.qrDataUrl = null;
    console.log('[wasumm] WhatsApp connected — web UI ready at http://localhost:3000');
  });

  client.on('auth_failure', (msg) => {
    state.status = 'error';
    state.error = `Authentication failed: ${msg}`;
    console.error('[wasumm]', state.error);
  });

  client.on('disconnected', () => {
    state.status = 'connecting';
    state.client = null;
    console.log('[wasumm] WhatsApp disconnected — reconnecting...');
    setTimeout(() => client.initialize(), 3000);
  });

  await client.initialize();
}

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.get('/api/status', (req, res) => {
  res.json({
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    error: state.error
  });
});

app.get('/api/chats', async (req, res) => {
  if (state.status !== 'ready') {
    return res.status(503).json({ error: 'WhatsApp not connected yet' });
  }
  try {
    const limit = parseInt(req.query.limit) || 30;
    const chats = await getChats(state.client, limit);
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/summarize', async (req, res) => {
  if (state.status !== 'ready') {
    return res.status(503).json({ error: 'WhatsApp not connected yet' });
  }

  const { chatName, scope, model, provider } = req.body;
  if (!chatName) return res.status(400).json({ error: 'chatName is required' });
  if (!scope?.type) return res.status(400).json({ error: 'scope.type is required' });

  const config = loadConfig();
  if (model) config.model = model;
  if (provider) config.provider = provider;

  try {
    await checkProvider(config);

    const chat = await findChat(state.client, chatName);
    const messages = await fetchMessages(state.client, chat, scope);

    if (messages.length === 0) {
      return res.json({ summary: null, messageCount: 0 });
    }

    const formatted = formatMessages(messages, chat.isGroup);
    const summary = await summarize(formatted, config);

    res.json({ summary, messageCount: messages.length, chatName: chat.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start ---
const PORT = process.env.PORT || 3000;
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`[wasumm] Web UI starting at http://localhost:${PORT}`);
  console.log('[wasumm] Connecting to WhatsApp...');
  initWhatsApp().catch((err) => {
    state.status = 'error';
    state.error = err.message;
    console.error('[wasumm] Failed to initialize WhatsApp:', err.message);
  });
});

process.on('SIGINT', async () => {
  console.log('\n[wasumm] Shutting down...');
  if (state.client) await state.client.destroy();
  process.exit(0);
});
