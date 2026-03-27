import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export async function createWhatsAppClient() {
  return new Promise((resolve, reject) => {
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'wasumm',
        dataPath: './.wwebjs_auth/'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        protocolTimeout: 120000
      },
      qrMaxRetries: 3
    });

    const timeout = setTimeout(() => {
      reject(new Error('WhatsApp connection timed out after 120s. Try running: wasumm auth'));
    }, 120000);

    client.on('qr', (qr) => {
      console.log('\nScan this QR code with WhatsApp on your phone:\n');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
      // Session restored or QR scan succeeded
    });

    client.on('auth_failure', (msg) => {
      clearTimeout(timeout);
      reject(new Error(`WhatsApp authentication failed: ${msg}. Try running: wasumm auth`));
    });

    client.on('ready', () => {
      clearTimeout(timeout);
      resolve(client);
    });

    client.initialize().catch((err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to initialize WhatsApp client: ${err.message}`));
    });
  });
}

export async function getChats(client, limit = 20) {
  const chats = await client.getChats();
  return chats
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit)
    .map((chat) => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp
    }));
}

export async function findChat(client, name) {
  const chats = await client.getChats();
  const lower = name.toLowerCase();

  // Exact match first
  const exact = chats.find((c) => c.name.toLowerCase() === lower);
  if (exact) {
    return {
      id: exact.id._serialized,
      name: exact.name,
      isGroup: exact.isGroup,
      unreadCount: exact.unreadCount,
      _chat: exact
    };
  }

  // Substring match
  const matches = chats.filter((c) => c.name.toLowerCase().includes(lower));

  if (matches.length === 0) {
    // Suggest close matches
    const suggestions = chats
      .filter((c) => {
        const chatLower = c.name.toLowerCase();
        return lower.split('').some((char) => chatLower.includes(char));
      })
      .slice(0, 5)
      .map((c) => c.name);

    let msg = `Chat "${name}" not found.`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean one of these?\n${suggestions.map((s) => `  - ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "wasumm chats" to see all available chats.';
    throw new Error(msg);
  }

  if (matches.length > 1) {
    const matchNames = matches.slice(0, 10).map((c) => `  - ${c.name}`).join('\n');
    throw new Error(
      `Multiple chats match "${name}":\n${matchNames}\n\nPlease use a more specific name.`
    );
  }

  const match = matches[0];
  return {
    id: match.id._serialized,
    name: match.name,
    isGroup: match.isGroup,
    unreadCount: match.unreadCount,
    _chat: match
  };
}

export async function fetchMessages(client, chatInfo, scope) {
  const chat = chatInfo._chat;

  switch (scope.type) {
    case 'last': {
      const msgs = await chat.fetchMessages({ limit: scope.value });
      return filterAndEnrichMessages(msgs);
    }

    case 'since': {
      const ms = parseDuration(scope.value);
      const since = Date.now() - ms;
      const msgs = await chat.fetchMessages({ limit: 500 });
      const enriched = await filterAndEnrichMessages(msgs);
      return enriched.filter((m) => m.timestamp * 1000 >= since);
    }

    case 'from': {
      const fromDate = new Date(scope.value).getTime();
      if (isNaN(fromDate)) {
        throw new Error(`Invalid date format: "${scope.value}". Use YYYY-MM-DD.`);
      }
      const msgs = await chat.fetchMessages({ limit: 500 });
      const enriched = await filterAndEnrichMessages(msgs);
      return enriched.filter((m) => m.timestamp * 1000 >= fromDate);
    }

    case 'unread': {
      if (chatInfo.unreadCount === 0) {
        return [];
      }
      const msgs = await chat.fetchMessages({ limit: chatInfo.unreadCount });
      return filterAndEnrichMessages(msgs);
    }

    default:
      throw new Error(`Unknown scope type: ${scope.type}`);
  }
}

async function filterAndEnrichMessages(messages) {
  const textMessages = messages.filter((m) => m.type === 'chat' && m.body && m.body.trim().length > 0);

  // Resolve sender names via getContact()
  const enriched = await Promise.all(
    textMessages.map(async (m) => {
      let senderName = 'Unknown';
      try {
        const contact = await m.getContact();
        senderName = contact.pushname || contact.name || contact.number || 'Unknown';
      } catch {
        senderName = m._data?.notifyName || m.author?.split('@')[0] || m.from?.split('@')[0] || 'Unknown';
      }
      return {
        timestamp: m.timestamp,
        body: m.body,
        senderName,
        fromMe: m.fromMe
      };
    })
  );

  return enriched;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(h|d)$/i);
  if (!match) {
    throw new Error(`Invalid duration: "${str}". Use format like "2h" or "1d".`);
  }
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  throw new Error(`Unknown duration unit: ${unit}`);
}
