// src/main/telegram/commands.ts — bot command registration and dispatch.
//
// Wires grammy middleware (session/conversations) and routes each command to
// its handler. Handler implementations live in commandHandlers.ts; pairing
// flows live in pairing.ts.

import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { t } from '../i18n';
import {
  handleFlowCommand,
  handleOutputCommand,
  handleProviderCommand,
  handleStatusCommand,
  type TelegramCommandOptions,
  type TelegramContext,
} from './commandHandlers';
import { handleInitCommand, handleStartCommand, pairingConversation } from './pairing';

export type { TelegramCommandOptions, TelegramContext, TelegramTaskRequest } from './commandHandlers';

export function attachTelegramHandlers(bot: Bot<TelegramContext>, options: TelegramCommandOptions): void {
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(createConversation((conversation, ctx) => pairingConversation(conversation, ctx, options), 'pairing-init'));

  bot.command('start', async (ctx) => {
    await handleStartCommand(ctx, options);
  });

  bot.command('init', async (ctx) => {
    await handleInitCommand(ctx, options);
  });

  bot.command('gpt', async (ctx) => {
    await handleProviderCommand(ctx, 'gpt', options);
  });
  bot.command('gemini', async (ctx) => {
    await handleProviderCommand(ctx, 'gemini', options);
  });
  bot.command('pplx', async (ctx) => {
    await handleProviderCommand(ctx, 'pplx', options);
  });
  bot.command('status', async (ctx) => {
    await handleStatusCommand(ctx, options);
  });
  bot.command('output', async (ctx) => {
    await handleOutputCommand(ctx, options);
  });

  // Register bot.command() for each bot-trigger flow (snapshot taken at bot creation time)
  if (options.getFlowCommands && options.onFlowCommand) {
    for (const fc of options.getFlowCommands()) {
      if (!/^[a-z][a-z0-9_]*$/.test(fc.command)) continue;
      const cmd = fc.command;
      bot.command(cmd, async (ctx) => {
        await handleFlowCommand(ctx, options, cmd);
      });
    }
  }
}

export async function syncPrivateCommands(
  bot: Bot<TelegramContext>,
  allowGroupCommands: boolean,
  strings: Record<string, string> = {},
  flowCommands: Array<{ command: string; description: string }> = [],
): Promise<void> {
  const staticCommands = [
    { command: 'start', description: t(strings, 'telegram.commands.start') },
    { command: 'init', description: t(strings, 'telegram.commands.init') },
    { command: 'output', description: t(strings, 'telegram.commands.output') },
    { command: 'status', description: t(strings, 'telegram.commands.status') },
    { command: 'gpt', description: t(strings, 'telegram.commands.gpt') },
    { command: 'gemini', description: t(strings, 'telegram.commands.gemini') },
    { command: 'pplx', description: t(strings, 'telegram.commands.pplx') },
  ];
  const commands = [
    ...staticCommands,
    ...flowCommands
      .filter((fc) => /^[a-z0-9_]+$/.test(fc.command))
      .map((fc) => ({ command: fc.command, description: fc.description || fc.command })),
  ];
  await bot.api.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
  if (allowGroupCommands) {
    await bot.api.setMyCommands(commands, { scope: { type: 'all_group_chats' } });
    return;
  }
  await bot.api.setMyCommands([], { scope: { type: 'all_group_chats' } });
}
