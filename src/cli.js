import { Command } from 'commander';
import { createWhatsAppClient, getChats, fetchMessages, findChat } from './whatsapp.js';
import { formatMessages } from './formatter.js';
import { checkProvider, summarize } from './summarizer.js';
import { printSummary, copyToClipboard } from './output.js';
import { loadConfig } from './config.js';
import { parseExport, detectChatName } from './parser.js';
import ora from 'ora';

const program = new Command();

program
  .name('wasumm')
  .description('WhatsApp conversation summarizer powered by local LLM')
  .version('1.0.0');

program
  .command('chats')
  .description('List available WhatsApp chats')
  .option('-n, --limit <number>', 'number of chats to show', '20')
  .action(async (options) => {
    const spinner = ora('Connecting to WhatsApp...').start();
    let client;
    try {
      client = await createWhatsAppClient();
      spinner.text = 'Fetching chats...';
      const chats = await getChats(client, parseInt(options.limit));

      spinner.stop();
      console.log(`\nYour WhatsApp chats (showing ${chats.length}):\n`);
      for (const chat of chats) {
        const unread = chat.unreadCount > 0 ? ` (${chat.unreadCount} unread)` : '';
        const type = chat.isGroup ? '[Group]' : '[Chat]';
        console.log(`  ${type} ${chat.name}${unread}`);
      }
      console.log(`\nUse: wasumm summarize "Chat Name" --last 50`);
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    } finally {
      if (client) await client.destroy();
    }
  });

program
  .command('summarize <chat>')
  .description('Summarize messages from a WhatsApp chat')
  .option('-l, --last <number>', 'last N messages')
  .option('-s, --since <duration>', 'messages from last Nh or Nd (e.g., 2h, 1d)')
  .option('-f, --from <date>', 'messages since date (YYYY-MM-DD)')
  .option('-u, --unread', 'unread messages only')
  .option('-m, --model <name>', 'override model from config')
  .option('-p, --provider <name>', 'override provider (ollama, openai, anthropic)')
  .action(async (chatName, options) => {
    const config = loadConfig();
    if (options.model) config.model = options.model;
    if (options.provider) config.provider = options.provider;

    // Validate: only one scope flag
    const scopeFlags = [options.last, options.since, options.from, options.unread].filter(Boolean);
    if (scopeFlags.length > 1) {
      console.error('Error: Please specify only one scope flag (--last, --since, --from, or --unread)');
      process.exit(1);
    }

    const spinner = ora(`Checking ${config.provider || 'ollama'} provider...`).start();
    let client;
    try {
      // Pre-flight: check provider
      await checkProvider(config);

      // Connect to WhatsApp
      spinner.text = 'Connecting to WhatsApp...';
      client = await createWhatsAppClient();

      // Find the chat
      spinner.text = `Finding chat "${chatName}"...`;
      const chat = await findChat(client, chatName);

      // Determine scope
      let scope;
      if (options.last) {
        scope = { type: 'last', value: parseInt(options.last) };
      } else if (options.since) {
        scope = { type: 'since', value: options.since };
      } else if (options.from) {
        scope = { type: 'from', value: options.from };
      } else if (options.unread) {
        scope = { type: 'unread' };
      } else {
        // Default: unread, fallback to last 20
        scope = chat.unreadCount > 0
          ? { type: 'unread' }
          : { type: 'last', value: 20 };
      }

      // Fetch messages
      spinner.text = 'Fetching messages...';
      const messages = await fetchMessages(client, chat, scope);

      if (messages.length === 0) {
        spinner.info('No messages found for the given scope.');
        return;
      }

      // Format messages
      const formatted = formatMessages(messages, chat.isGroup);

      // Summarize
      spinner.text = `Summarizing ${messages.length} messages with ${config.provider || 'ollama'}/${config.model}...`;
      const summary = await summarize(formatted, config);

      spinner.stop();

      // Output
      const scopeDesc = describeScopeForHeader(scope, messages.length);
      printSummary(chat.name, scopeDesc, summary);
      await copyToClipboard(summary);
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    } finally {
      if (client) await client.destroy();
    }
  });

program
  .command('parse <file>')
  .description('✅ RECOMMENDED (Legal) — Summarize an exported WhatsApp chat file')
  .option('-l, --last <number>', 'last N messages')
  .option('-s, --since <duration>', 'messages from last Nh or Nd (e.g., 2h, 1d)')
  .option('-f, --from <date>', 'messages since date (YYYY-MM-DD)')
  .option('-m, --model <name>', 'override model from config')
  .option('-p, --provider <name>', 'override provider (ollama, openai, anthropic)')
  .action(async (filePath, options) => {
    const config = loadConfig();
    if (options.model) config.model = options.model;
    if (options.provider) config.provider = options.provider;

    let scope;
    if (options.last) scope = { type: 'last', value: parseInt(options.last) };
    else if (options.since) scope = { type: 'since', value: options.since };
    else if (options.from) scope = { type: 'from', value: options.from };
    else scope = { type: 'all' };

    const spinner = ora(`Checking ${config.provider || 'ollama'} provider...`).start();
    try {
      await checkProvider(config);

      spinner.text = 'Parsing export file...';
      const messages = parseExport(filePath, scope);
      const chatName = detectChatName(filePath);

      if (messages.length === 0) {
        spinner.info('No messages found for the given scope.');
        return;
      }

      const isGroup = messages.some(
        (m, i, arr) => arr.findIndex(x => x.senderName !== m.senderName) !== -1
      );
      const formatted = formatMessages(messages, isGroup);

      spinner.text = `Summarizing ${messages.length} messages with ${config.provider || 'ollama'}/${config.model}...`;
      const summary = await summarize(formatted, config);

      spinner.stop();
      printSummary(chatName, `${messages.length} messages from export`, summary);
      await copyToClipboard(summary);
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

program
  .command('auth')
  .description('Re-authenticate with WhatsApp (re-scan QR code)')
  .action(async () => {
    const spinner = ora('Clearing session and reconnecting...').start();
    let client;
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const authDir = path.join(process.cwd(), '.wwebjs_auth');
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true });
      }
      spinner.stop();
      console.log('Session cleared. Scan the QR code below:\n');
      client = await createWhatsAppClient();
      console.log('\nAuthentication successful! You can now use wasumm commands.');
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    } finally {
      if (client) await client.destroy();
    }
  });

function describeScopeForHeader(scope, messageCount) {
  switch (scope.type) {
    case 'last': return `last ${messageCount} messages`;
    case 'since': return `messages from last ${scope.value}`;
    case 'from': return `messages since ${scope.value}`;
    case 'unread': return `${messageCount} unread messages`;
    default: return `${messageCount} messages`;
  }
}

program.parse();
