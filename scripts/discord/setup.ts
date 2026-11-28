import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Guild,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildVerificationLevel,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import dotenv from 'dotenv';
import {
  type AutoModRuleConfig,
  type ChannelKind,
  type ChannelPermissionOverride,
  DISCORD_SERVER_CONFIG,
  type DiscordServerConfig,
  FORBIDDEN_NON_STAFF_PERMISSIONS,
  type GuildSettingsConfig,
  type PermissionName,
  type RoleConfig,
  type StarterPostConfig,
} from './config.ts';

export interface RoleRecord {
  id: string;
  name: string;
  position: number;
  permissions: bigint;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  managed: boolean;
}

export interface OverwriteRecord {
  id: string;
  allow: bigint;
  deny: bigint;
}

export interface ChannelRecord {
  id: string;
  name: string;
  type: ChannelKind | 'category' | 'other';
  parentId: string | null;
  topic: string | null;
  rateLimitPerUser: number;
  overwrites: OverwriteRecord[];
}

export interface GuildSettingsRecord {
  description: string | null;
  defaultMessageNotifications: GuildSettingsConfig['defaultMessageNotifications'];
  explicitContentFilter: GuildSettingsConfig['explicitContentFilter'];
  verificationLevel: GuildSettingsConfig['verificationLevel'];
  rulesChannelId: string | null;
  publicUpdatesChannelId: string | null;
}

export interface GuildSettingsUpdate {
  description: string;
  defaultMessageNotifications: GuildSettingsConfig['defaultMessageNotifications'];
  explicitContentFilter: GuildSettingsConfig['explicitContentFilter'];
  verificationLevel: GuildSettingsConfig['verificationLevel'];
  rulesChannelId: string | null;
  publicUpdatesChannelId: string | null;
}

export interface NormalizedStarterPost {
  key: string;
  channelName: string;
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footerText: string;
  buttons: Array<{ label: string; url: string }>;
  pin: boolean;
}

export interface StarterPostRecord {
  id: string;
  key: string;
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footerText: string;
  buttons: Array<{ label: string; url: string }>;
  pinned: boolean;
}

export interface AutoModRuleRecord {
  id: string;
  name: string;
  kind: AutoModRuleConfig['kind'] | 'other';
  enabled: boolean;
  editable?: boolean;
  keywords: string[];
  mentionTotalLimit: number | null;
  alertChannelId: string | null;
  exemptRoleIds: string[];
}

export interface ResolvedAutoModRule {
  name: string;
  kind: AutoModRuleConfig['kind'];
  keywords: string[];
  mentionTotalLimit: number | null;
  alertChannelId: string;
  exemptRoleIds: string[];
}

export interface DiscordAdapter {
  getGuildInfo(): Promise<{ id: string; name: string; everyoneRoleId: string }>;
  getBotHighestRolePosition(): Promise<number>;
  listRoles(): Promise<RoleRecord[]>;
  createRole(input: {
    name: string;
    permissions: bigint;
    color: number;
    hoist: boolean;
    mentionable: boolean;
  }): Promise<RoleRecord>;
  updateRole(
    roleId: string,
    input: { permissions: bigint; color: number; hoist: boolean; mentionable: boolean },
  ): Promise<RoleRecord>;
  setRolePositions(positions: Array<{ roleId: string; position: number }>): Promise<void>;
  listChannels(): Promise<ChannelRecord[]>;
  createCategory(input: {
    name: string;
    overwrites: OverwriteRecord[];
  }): Promise<ChannelRecord>;
  updateCategory(
    categoryId: string,
    input: { overwrites: OverwriteRecord[] },
  ): Promise<ChannelRecord>;
  createChannel(input: {
    name: string;
    type: ChannelKind;
    parentId: string;
    topic?: string;
    rateLimitPerUser?: number;
    overwrites: OverwriteRecord[];
  }): Promise<ChannelRecord>;
  updateChannel(
    channelId: string,
    input: {
      parentId: string;
      topic?: string;
      rateLimitPerUser?: number;
      overwrites: OverwriteRecord[];
    },
  ): Promise<ChannelRecord>;
  getGuildSettings?(): Promise<GuildSettingsRecord>;
  updateGuildSettings?(input: GuildSettingsUpdate): Promise<void>;
  listStarterPosts?(channelId: string): Promise<StarterPostRecord[]>;
  createStarterPost?(
    channelId: string,
    post: NormalizedStarterPost,
  ): Promise<StarterPostRecord>;
  updateStarterPost?(
    channelId: string,
    messageId: string,
    post: NormalizedStarterPost,
  ): Promise<StarterPostRecord>;
  listAutoModRules?(): Promise<AutoModRuleRecord[]>;
  createAutoModRule?(input: ResolvedAutoModRule): Promise<AutoModRuleRecord>;
  updateAutoModRule?(
    ruleId: string,
    input: ResolvedAutoModRule,
  ): Promise<AutoModRuleRecord>;
}

export interface SetupOptions {
  apply: boolean;
  confirmGuildId?: string;
  idsOutputPath?: string;
  log?: (line: string) => void;
}

export interface SetupAction {
  kind:
    | 'role'
    | 'role-order'
    | 'category'
    | 'channel'
    | 'guild-settings'
    | 'starter-post'
    | 'automod';
  action: 'create' | 'update' | 'noop';
  name: string;
  details?: string;
}

export interface SetupResult {
  mode: 'practice' | 'apply';
  guildId: string;
  guildName: string;
  actions: SetupAction[];
  unmanagedRoles: string[];
  unmanagedCategories: string[];
  unmanagedChannels: string[];
  warnings: string[];
  idsWrittenTo: string | null;
  ids: {
    guildId: string;
    roles: Record<string, string>;
    categories: Record<string, string>;
    channels: Record<string, string>;
  };
}

export const PERMISSION_MAP: Record<PermissionName, bigint> = {
  Administrator: PermissionFlagsBits.Administrator,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  KickMembers: PermissionFlagsBits.KickMembers,
  BanMembers: PermissionFlagsBits.BanMembers,
  MentionEveryone: PermissionFlagsBits.MentionEveryone,
  ManageMessages: PermissionFlagsBits.ManageMessages,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  SendMessages: PermissionFlagsBits.SendMessages,
  SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
  CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
  CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
  Connect: PermissionFlagsBits.Connect,
  Speak: PermissionFlagsBits.Speak,
};

export function permissionsToBitfield(permissions: readonly PermissionName[] = []): bigint {
  let bits = 0n;
  for (const perm of permissions) {
    bits |= PERMISSION_MAP[perm];
  }
  return bits;
}

/**
 * Safety check: stops the program if any non-staff role (paid rank, Citizen, badge,
 * or Unverified) is ever given a dangerous or moderation permission.
 */
export function validateRolePermissions(roles: readonly RoleConfig[]): void {
  const forbiddenSet = new Set<PermissionName>(FORBIDDEN_NON_STAFF_PERMISSIONS);

  for (const role of roles) {
    if (role.kind === 'staff') {
      continue;
    }
    const badPerms = role.permissions.filter((perm) => forbiddenSet.has(perm));
    if (badPerms.length > 0) {
      throw new Error(
        `SAFETY STOP: Role "${role.name}" (${role.kind}) is not allowed to have: ${badPerms.join(', ')}. ` +
          'Paid ranks, Citizen, badges, and Unverified roles must never have admin or moderation powers.',
      );
    }
  }
}

/**
 * Wording safety check: ensures the forbidden phrase "not verified" never appears
 * anywhere in role names, channel topics, server description, starter posts, or AutoMod rules.
 */
export function validateNoForbiddenPhrases(config: DiscordServerConfig): void {
  const checkText = (location: string, text: string | undefined): void => {
    if (text && /\bnot\s+verified\b/i.test(text)) {
      throw new Error(
        `SAFETY STOP: Forbidden phrase "not verified" found in ${location}. Use "coming soon" or another neutral label instead.`,
      );
    }
  };

  for (const role of config.roles) {
    checkText(`role "${role.name}"`, role.name);
  }
  for (const cat of config.categories) {
    checkText(`category "${cat.name}"`, cat.name);
    for (const ch of cat.channels) {
      checkText(`channel "${ch.name}"`, ch.name);
      checkText(`channel "${ch.name}" topic`, ch.topic);
    }
  }
  if (config.guildSettings) {
    checkText('guildSettings.description', config.guildSettings.description);
  }
  for (const post of config.starterPosts ?? []) {
    checkText(`starterPost "${post.key}" title`, post.title);
    checkText(`starterPost "${post.key}" description`, post.description);
    checkText(`starterPost "${post.key}" footerNote`, post.footerNote);
    for (const field of post.fields ?? []) {
      checkText(`starterPost "${post.key}" field "${field.name}"`, field.name);
      checkText(`starterPost "${post.key}" field "${field.name}" value`, field.value);
    }
    for (const btn of post.buttons ?? []) {
      checkText(`starterPost "${post.key}" button "${btn.label}"`, btn.label);
    }
  }
  for (const rule of config.autoModRules ?? []) {
    checkText(`autoModRule "${rule.name}"`, rule.name);
    for (const kw of rule.keywords ?? []) {
      checkText(`autoModRule "${rule.name}" keyword`, kw);
    }
  }
}

export function normalizeStarterPost(post: StarterPostConfig): NormalizedStarterPost {
  return {
    key: post.key,
    channelName: post.channelName,
    title: post.title,
    description: post.description,
    color: post.color,
    fields: (post.fields ?? []).map((f) => ({
      name: f.name,
      value: f.value,
      inline: Boolean(f.inline),
    })),
    footerText: `${post.footerNote ?? 'ItsYouOnline'} · [${post.key}]`,
    buttons: (post.buttons ?? []).map((b) => ({
      label: b.label,
      url: b.url,
    })),
    pin: Boolean(post.pin),
  };
}

export function parseCliArgs(argv: readonly string[]): {
  apply: boolean;
  confirmGuildId?: string;
} {
  let apply = false;
  let confirmGuildId: string | undefined;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
    } else if (arg.startsWith('--confirm-guild=')) {
      confirmGuildId = arg.slice('--confirm-guild='.length).trim();
    }
  }

  return { apply, confirmGuildId };
}

function resolveOverwrites(
  overrides: readonly ChannelPermissionOverride[],
  roleIdsByName: ReadonlyMap<string, string>,
  everyoneRoleId: string,
): OverwriteRecord[] {
  const byId = new Map<string, OverwriteRecord>();

  for (const override of overrides) {
    const targetId =
      override.target === '@everyone'
        ? everyoneRoleId
        : (roleIdsByName.get(override.target) ?? `planned-role:${override.target}`);

    const allow = permissionsToBitfield(override.allow ?? []);
    const deny = permissionsToBitfield(override.deny ?? []);

    const existing = byId.get(targetId);
    if (existing) {
      byId.set(targetId, {
        id: targetId,
        allow: existing.allow | allow,
        deny: existing.deny | deny,
      });
    } else {
      byId.set(targetId, { id: targetId, allow, deny });
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function overwritesEqual(
  current: readonly OverwriteRecord[],
  desired: readonly OverwriteRecord[],
): boolean {
  if (current.length !== desired.length) {
    return false;
  }
  const currentMap = new Map(current.map((item) => [item.id, item]));
  for (const target of desired) {
    const existing = currentMap.get(target.id);
    if (!existing) {
      return false;
    }
    if (existing.allow !== target.allow || existing.deny !== target.deny) {
      return false;
    }
  }
  return true;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function starterPostEquals(
  existing: StarterPostRecord,
  desired: NormalizedStarterPost,
): boolean {
  if (
    existing.title !== desired.title ||
    existing.description !== desired.description ||
    existing.color !== desired.color ||
    existing.footerText !== desired.footerText ||
    existing.pinned !== desired.pin
  ) {
    return false;
  }
  if (existing.fields.length !== desired.fields.length) return false;
  for (let i = 0; i < desired.fields.length; i++) {
    const a = existing.fields[i];
    const b = desired.fields[i];
    if (a.name !== b.name || a.value !== b.value || a.inline !== b.inline) {
      return false;
    }
  }
  if (existing.buttons.length !== desired.buttons.length) return false;
  for (let i = 0; i < desired.buttons.length; i++) {
    const a = existing.buttons[i];
    const b = desired.buttons[i];
    if (a.label !== b.label || a.url !== b.url) {
      return false;
    }
  }
  return true;
}

function autoModRuleEquals(
  existing: AutoModRuleRecord,
  desired: ResolvedAutoModRule,
): boolean {
  if (
    !existing.enabled ||
    existing.name !== desired.name ||
    existing.kind !== desired.kind ||
    existing.alertChannelId !== desired.alertChannelId
  ) {
    return false;
  }
  const existingExempt = [...existing.exemptRoleIds].sort();
  const desiredExempt = [...desired.exemptRoleIds].sort();
  if (!arraysEqual(existingExempt, desiredExempt)) {
    return false;
  }
  if (desired.kind === 'keyword') {
    const existingKw = [...existing.keywords].sort();
    const desiredKw = [...desired.keywords].sort();
    if (!arraysEqual(existingKw, desiredKw)) {
      return false;
    }
  }
  if (desired.kind === 'mentionSpam') {
    if (existing.mentionTotalLimit !== desired.mentionTotalLimit) {
      return false;
    }
  }
  return true;
}

function rolesInDesiredOrder(
  desiredNamesTopToBottom: readonly string[],
  rolesByName: ReadonlyMap<string, RoleRecord>,
): boolean {
  const positions: number[] = [];
  for (const name of desiredNamesTopToBottom) {
    const role = rolesByName.get(name);
    if (!role) {
      return false;
    }
    positions.push(role.position);
  }
  for (let i = 0; i < positions.length - 1; i++) {
    if (positions[i] <= positions[i + 1]) {
      return false;
    }
  }
  return true;
}

export async function runSetup(
  adapter: DiscordAdapter,
  config: DiscordServerConfig,
  options: SetupOptions,
): Promise<SetupResult> {
  const log = options.log ?? ((line: string) => console.log(line));

  // 1. Always run safety checks first (before touching Discord).
  validateRolePermissions(config.roles);
  validateNoForbiddenPhrases(config);

  const guild = await adapter.getGuildInfo();

  // 2. Enforce strict apply safeguard.
  if (options.apply) {
    if (!options.confirmGuildId) {
      throw new Error(
        `SAFETY STOP: To make real changes, you must pass BOTH --apply AND --confirm-guild=${guild.id}. ` +
          'Nothing was changed.',
      );
    }
    if (options.confirmGuildId !== guild.id) {
      throw new Error(
        `SAFETY STOP: --confirm-guild=${options.confirmGuildId} does not match your server ID (${guild.id}). ` +
          'Nothing was changed.',
      );
    }
  }

  const mode: 'practice' | 'apply' = options.apply ? 'apply' : 'practice';
  const actions: SetupAction[] = [];
  const warnings: string[] = [];

  log('');
  if (mode === 'practice') {
    log('============================================================');
    log('PRACTICE MODE (DRY RUN) — Nothing in Discord will be changed');
    log('============================================================');
  } else {
    log('============================================================');
    log('REAL BUILD MODE (--apply) — Updating your Discord server');
    log('============================================================');
  }
  log(`Server: ${guild.name} (${guild.id})`);
  log('');

  // 3. Inspect existing roles and check bot role hierarchy.
  const existingRoles = await adapter.listRoles();
  const botHighestPosition = await adapter.getBotHighestRolePosition();
  const managedRoleNames = new Set(config.roles.map((r) => r.name));

  const rolesAboveBot = existingRoles.filter(
    (role) => managedRoleNames.has(role.name) && role.position >= botHighestPosition,
  );
  if (rolesAboveBot.length > 0) {
    const names = rolesAboveBot.map((r) => `"${r.name}"`).join(', ');
    throw new Error(
      `STOPPED: My bot's role is too low in your Discord server to manage: ${names}. ` +
        'Open Discord -> Server Settings -> Roles, drag the bot role ABOVE those roles, save, and run this again.',
    );
  }

  const unmanagedRoles = existingRoles
    .filter(
      (role) =>
        role.id !== guild.everyoneRoleId &&
        !role.managed &&
        !managedRoleNames.has(role.name),
    )
    .map((role) => role.name);

  const existingRoleByName = new Map<string, RoleRecord>();
  for (const role of existingRoles) {
    if (!existingRoleByName.has(role.name)) {
      existingRoleByName.set(role.name, role);
    }
  }

  // 4. Create or update roles (including celestial color palette).
  log('--- ROLES (top to bottom) ---');
  const roleIdsByName = new Map<string, string>();

  for (const roleCfg of config.roles) {
    const desiredPermissions = permissionsToBitfield(roleCfg.permissions);
    const desiredColor = roleCfg.color;
    const desiredHoist = roleCfg.hoist ?? false;
    const desiredMentionable = roleCfg.mentionable ?? false;
    const existing = existingRoleByName.get(roleCfg.name);

    if (!existing) {
      const permLabel =
        roleCfg.permissions.length > 0 ? roleCfg.permissions.join(', ') : 'no special permissions';
      actions.push({
        kind: 'role',
        action: 'create',
        name: roleCfg.name,
        details: permLabel,
      });

      if (mode === 'apply') {
        const created = await adapter.createRole({
          name: roleCfg.name,
          permissions: desiredPermissions,
          color: desiredColor,
          hoist: desiredHoist,
          mentionable: desiredMentionable,
        });
        existingRoleByName.set(created.name, created);
        roleIdsByName.set(created.name, created.id);
        log(`[CREATED] Role "${roleCfg.name}" (${permLabel})`);
      } else {
        roleIdsByName.set(roleCfg.name, `planned-role:${roleCfg.name}`);
        log(`[WOULD CREATE] Role "${roleCfg.name}" (${permLabel})`);
      }
      continue;
    }

    roleIdsByName.set(existing.name, existing.id);

    const needsUpdate =
      existing.permissions !== desiredPermissions ||
      existing.color !== desiredColor ||
      existing.hoist !== desiredHoist ||
      existing.mentionable !== desiredMentionable;

    if (needsUpdate) {
      const changes: string[] = [];
      if (existing.permissions !== desiredPermissions) changes.push('permissions');
      if (existing.color !== desiredColor) changes.push('color');
      if (existing.hoist !== desiredHoist) changes.push('display separately');
      if (existing.mentionable !== desiredMentionable) changes.push('mentionable');

      actions.push({
        kind: 'role',
        action: 'update',
        name: roleCfg.name,
        details: `update ${changes.join(', ')}`,
      });

      if (mode === 'apply') {
        const updated = await adapter.updateRole(existing.id, {
          permissions: desiredPermissions,
          color: desiredColor,
          hoist: desiredHoist,
          mentionable: desiredMentionable,
        });
        existingRoleByName.set(updated.name, updated);
        log(`[UPDATED] Role "${roleCfg.name}" (${changes.join(', ')})`);
      } else {
        log(`[WOULD UPDATE] Role "${roleCfg.name}" (${changes.join(', ')})`);
      }
    } else {
      actions.push({
        kind: 'role',
        action: 'noop',
        name: roleCfg.name,
      });
      log(`[OK] Role "${roleCfg.name}" already matches`);
    }
  }

  // 5. Ensure role order (top to bottom) if needed.
  const desiredOrder = config.roles.map((r) => r.name);
  const allRolesExist = desiredOrder.every((name) => existingRoleByName.has(name));

  if (mode === 'apply') {
    const refreshedRoles = await adapter.listRoles();
    const refreshedByName = new Map(refreshedRoles.map((r) => [r.name, r]));
    const refreshedBotPos = await adapter.getBotHighestRolePosition();

    if (!rolesInDesiredOrder(desiredOrder, refreshedByName)) {
      const topTarget = Math.max(desiredOrder.length, refreshedBotPos - 1);
      const positionUpdates = desiredOrder.map((name, index) => {
        const role = refreshedByName.get(name)!;
        return {
          roleId: role.id,
          position: Math.max(1, topTarget - index),
        };
      });
      await adapter.setRolePositions(positionUpdates);
      actions.push({
        kind: 'role-order',
        action: 'update',
        name: 'Role hierarchy',
        details: 'sorted top-to-bottom',
      });
      log('[UPDATED] Role order arranged top-to-bottom');
    }
  } else if (!allRolesExist || !rolesInDesiredOrder(desiredOrder, existingRoleByName)) {
    actions.push({
      kind: 'role-order',
      action: 'update',
      name: 'Role hierarchy',
      details: 'arrange top-to-bottom',
    });
    log('[WOULD UPDATE] Role order would be arranged top-to-bottom');
  }

  // 6. Create or update categories & channels (including topics & slowmode).
  log('');
  log('--- CATEGORIES & CHANNELS ---');
  const existingChannels = await adapter.listChannels();
  const existingCategories = existingChannels.filter((c) => c.type === 'category');
  const existingNonCategories = existingChannels.filter((c) => c.type !== 'category');

  const categoryIdsByName = new Map<string, string>();
  const channelIdsByName = new Map<string, string>();
  const matchedCategoryIds = new Set<string>();
  const matchedChannelIds = new Set<string>();

  for (const catCfg of config.categories) {
    const desiredCatOverwrites = resolveOverwrites(
      catCfg.overwrites,
      roleIdsByName,
      guild.everyoneRoleId,
    );

    const existingCat = existingCategories.find((c) => c.name === catCfg.name);
    let categoryId: string;

    if (!existingCat) {
      actions.push({
        kind: 'category',
        action: 'create',
        name: catCfg.name,
      });

      if (mode === 'apply') {
        const createdCat = await adapter.createCategory({
          name: catCfg.name,
          overwrites: desiredCatOverwrites,
        });
        categoryId = createdCat.id;
        matchedCategoryIds.add(createdCat.id);
        log(`[CREATED] Category "${catCfg.name}"`);
      } else {
        categoryId = `planned-category:${catCfg.name}`;
        log(`[WOULD CREATE] Category "${catCfg.name}"`);
      }
    } else {
      categoryId = existingCat.id;
      matchedCategoryIds.add(existingCat.id);

      const needsUpdate = !overwritesEqual(existingCat.overwrites, desiredCatOverwrites);
      if (needsUpdate) {
        actions.push({
          kind: 'category',
          action: 'update',
          name: catCfg.name,
          details: 'permissions',
        });
        if (mode === 'apply') {
          await adapter.updateCategory(existingCat.id, {
            overwrites: desiredCatOverwrites,
          });
          log(`[UPDATED] Category "${catCfg.name}" (permissions)`);
        } else {
          log(`[WOULD UPDATE] Category "${catCfg.name}" (permissions)`);
        }
      } else {
        actions.push({
          kind: 'category',
          action: 'noop',
          name: catCfg.name,
        });
        log(`[OK] Category "${catCfg.name}" already matches`);
      }
    }

    categoryIdsByName.set(catCfg.name, categoryId);

    for (const chCfg of catCfg.channels) {
      const desiredOverwrites = resolveOverwrites(
        chCfg.overwrites ?? catCfg.overwrites,
        roleIdsByName,
        guild.everyoneRoleId,
      );

      // Prefer a channel already inside this category; otherwise match by exact name & type
      // so we never create a duplicate.
      const existingChannel =
        existingNonCategories.find(
          (c) =>
            !matchedChannelIds.has(c.id) &&
            c.name === chCfg.name &&
            c.type === chCfg.type &&
            c.parentId === categoryId,
        ) ??
        existingNonCategories.find(
          (c) =>
            !matchedChannelIds.has(c.id) &&
            c.name === chCfg.name &&
            c.type === chCfg.type,
        );

      const channelLabel = `${catCfg.name} / #${chCfg.name} (${chCfg.type})`;

      if (!existingChannel) {
        actions.push({
          kind: 'channel',
          action: 'create',
          name: chCfg.name,
          details: `${catCfg.name} (${chCfg.type})`,
        });

        if (mode === 'apply') {
          try {
            const createdCh = await adapter.createChannel({
              name: chCfg.name,
              type: chCfg.type,
              parentId: categoryId,
              topic: chCfg.topic,
              rateLimitPerUser: chCfg.rateLimitPerUser,
              overwrites: desiredOverwrites,
            });
            matchedChannelIds.add(createdCh.id);
            channelIdsByName.set(chCfg.name, createdCh.id);
            log(`  [CREATED] ${channelLabel}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (chCfg.type === 'stage') {
              const warning =
                `Could not create stage channel "${chCfg.name}" (${msg}). ` +
                'Tip: Stage channels require Community to be enabled in Server Settings -> Enable Community.';
              warnings.push(warning);
              log(`  [WARNING] ${warning}`);
            } else {
              throw err;
            }
          }
        } else {
          channelIdsByName.set(chCfg.name, `planned-channel:${chCfg.name}`);
          const topicNote = chCfg.topic ? ` — topic: "${chCfg.topic}"` : '';
          log(`  [WOULD CREATE] ${channelLabel}${topicNote}`);
        }
        continue;
      }

      matchedChannelIds.add(existingChannel.id);
      channelIdsByName.set(chCfg.name, existingChannel.id);

      const parentChanged = existingChannel.parentId !== categoryId;
      const desiredTopic = chCfg.type === 'text' ? (chCfg.topic ?? null) : null;
      const currentTopic = chCfg.type === 'text' ? (existingChannel.topic ?? null) : null;
      const topicChanged = chCfg.topic !== undefined && currentTopic !== desiredTopic;
      const desiredSlowmode = chCfg.type === 'text' ? (chCfg.rateLimitPerUser ?? 0) : 0;
      const slowmodeChanged =
        chCfg.type === 'text' && existingChannel.rateLimitPerUser !== desiredSlowmode;
      const permsChanged = !overwritesEqual(existingChannel.overwrites, desiredOverwrites);

      if (parentChanged || topicChanged || slowmodeChanged || permsChanged) {
        const changes: string[] = [];
        if (parentChanged) changes.push('move to category');
        if (topicChanged) changes.push('topic');
        if (slowmodeChanged) changes.push(`slowmode ${desiredSlowmode}s`);
        if (permsChanged) changes.push('permissions');

        actions.push({
          kind: 'channel',
          action: 'update',
          name: chCfg.name,
          details: changes.join(', '),
        });

        if (mode === 'apply') {
          await adapter.updateChannel(existingChannel.id, {
            parentId: categoryId,
            topic: chCfg.topic,
            rateLimitPerUser: chCfg.type === 'text' ? desiredSlowmode : undefined,
            overwrites: desiredOverwrites,
          });
          log(`  [UPDATED] ${channelLabel} (${changes.join(', ')})`);
        } else {
          log(`  [WOULD UPDATE] ${channelLabel} (${changes.join(', ')})`);
        }
      } else {
        actions.push({
          kind: 'channel',
          action: 'noop',
          name: chCfg.name,
        });
        log(`  [OK] ${channelLabel} already matches`);
      }
    }
  }

  // 7. Server-wide safety & polish settings.
  if (config.guildSettings && adapter.getGuildSettings && adapter.updateGuildSettings) {
    log('');
    log('--- SERVER SETTINGS & SAFETY ---');
    const gs = config.guildSettings;
    const currentSettings = await adapter.getGuildSettings();
    const rulesChannelId = gs.rulesChannelName
      ? (channelIdsByName.get(gs.rulesChannelName) ?? null)
      : null;
    const publicUpdatesChannelId = gs.publicUpdatesChannelName
      ? (channelIdsByName.get(gs.publicUpdatesChannelName) ?? null)
      : null;

    const changes: string[] = [];
    if ((currentSettings.description ?? '') !== gs.description) changes.push('description');
    if (currentSettings.defaultMessageNotifications !== gs.defaultMessageNotifications) {
      changes.push('mentions-only notifications');
    }
    if (currentSettings.explicitContentFilter !== gs.explicitContentFilter) {
      changes.push('explicit media filter');
    }
    if (currentSettings.verificationLevel !== gs.verificationLevel) {
      changes.push(`verification (${gs.verificationLevel})`);
    }
    if (rulesChannelId && currentSettings.rulesChannelId !== rulesChannelId) {
      changes.push(`rules channel (#${gs.rulesChannelName})`);
    }
    if (
      publicUpdatesChannelId &&
      currentSettings.publicUpdatesChannelId !== publicUpdatesChannelId
    ) {
      changes.push(`updates channel (#${gs.publicUpdatesChannelName})`);
    }

    if (changes.length > 0) {
      actions.push({
        kind: 'guild-settings',
        action: 'update',
        name: 'Server settings',
        details: changes.join(', '),
      });
      if (mode === 'apply') {
        try {
          await adapter.updateGuildSettings({
            description: gs.description,
            defaultMessageNotifications: gs.defaultMessageNotifications,
            explicitContentFilter: gs.explicitContentFilter,
            verificationLevel: gs.verificationLevel,
            rulesChannelId: rulesChannelId?.startsWith('planned-') ? null : rulesChannelId,
            publicUpdatesChannelId: publicUpdatesChannelId?.startsWith('planned-')
              ? null
              : publicUpdatesChannelId,
          });
          log(`[UPDATED] Server settings (${changes.join(', ')})`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const warning = `Could not update some server settings (${msg}).`;
          warnings.push(warning);
          log(`[WARNING] ${warning}`);
        }
      } else {
        log(`[WOULD UPDATE] Server settings (${changes.join(', ')})`);
      }
    } else {
      actions.push({
        kind: 'guild-settings',
        action: 'noop',
        name: 'Server settings',
      });
      log('[OK] Server settings already match');
    }
  }

  // 8. Branded pinned starter embeds.
  if (
    config.starterPosts &&
    config.starterPosts.length > 0 &&
    adapter.listStarterPosts &&
    adapter.createStarterPost &&
    adapter.updateStarterPost
  ) {
    log('');
    log('--- BRANDED STARTER EMBEDS ---');
    const existingByChannel = new Map<string, StarterPostRecord[]>();

    for (const rawPost of config.starterPosts) {
      const post = normalizeStarterPost(rawPost);
      const channelId = channelIdsByName.get(post.channelName);
      if (!channelId) {
        const warning = `Starter post "${post.key}" skipped: channel #${post.channelName} not found.`;
        warnings.push(warning);
        log(`[WARNING] ${warning}`);
        continue;
      }

      if (channelId.startsWith('planned-channel:')) {
        actions.push({
          kind: 'starter-post',
          action: 'create',
          name: `${post.channelName} [${post.key}]`,
          details: post.title,
        });
        log(`[WOULD POST] #${post.channelName}: "${post.title}"`);
        continue;
      }

      let channelPosts = existingByChannel.get(channelId);
      if (!channelPosts) {
        try {
          channelPosts = await adapter.listStarterPosts(channelId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const warning = `Could not read #${post.channelName} for starter posts (${msg}).`;
          warnings.push(warning);
          log(`[WARNING] ${warning}`);
          continue;
        }
        existingByChannel.set(channelId, channelPosts);
      }

      const existing = channelPosts.find((item) => item.key === post.key);
      if (!existing) {
        actions.push({
          kind: 'starter-post',
          action: 'create',
          name: `${post.channelName} [${post.key}]`,
          details: post.title,
        });
        if (mode === 'apply') {
          try {
            const created = await adapter.createStarterPost(channelId, post);
            channelPosts.push(created);
            log(`[POSTED${post.pin ? ' & PINNED' : ''}] #${post.channelName}: "${post.title}"`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const warning = `Could not post starter card in #${post.channelName} (${msg}).`;
            warnings.push(warning);
            log(`[WARNING] ${warning}`);
          }
        } else {
          log(`[WOULD POST${post.pin ? ' & PIN' : ''}] #${post.channelName}: "${post.title}"`);
        }
      } else if (!starterPostEquals(existing, post)) {
        actions.push({
          kind: 'starter-post',
          action: 'update',
          name: `${post.channelName} [${post.key}]`,
          details: post.title,
        });
        if (mode === 'apply') {
          try {
            await adapter.updateStarterPost(channelId, existing.id, post);
            log(`[UPDATED] #${post.channelName}: "${post.title}"`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const warning = `Could not update starter card in #${post.channelName} (${msg}).`;
            warnings.push(warning);
            log(`[WARNING] ${warning}`);
          }
        } else {
          log(`[WOULD UPDATE] #${post.channelName}: "${post.title}"`);
        }
      } else {
        actions.push({
          kind: 'starter-post',
          action: 'noop',
          name: `${post.channelName} [${post.key}]`,
        });
        log(`[OK] #${post.channelName}: "${post.title}" already matches`);
      }
    }
  }

  // 9. Native 24/7 Discord AutoMod Shield.
  if (
    config.autoModRules &&
    config.autoModRules.length > 0 &&
    adapter.listAutoModRules &&
    adapter.createAutoModRule &&
    adapter.updateAutoModRule
  ) {
    log('');
    log('--- NATIVE AUTOMOD SHIELD ---');
    let existingRules: AutoModRuleRecord[] = [];
    let canReadAutoMod = true;
    try {
      existingRules = await adapter.listAutoModRules();
    } catch (err) {
      canReadAutoMod = false;
      const msg = err instanceof Error ? err.message : String(err);
      const warning = `Could not read AutoMod rules (${msg}).`;
      warnings.push(warning);
      log(`[WARNING] ${warning}`);
    }

    if (canReadAutoMod) {
      const matchedRuleIds = new Set<string>();

      for (const ruleCfg of config.autoModRules) {
        const alertChannelId = channelIdsByName.get(ruleCfg.alertChannelName);
        if (!alertChannelId) {
          const warning = `AutoMod rule "${ruleCfg.name}" skipped: #${ruleCfg.alertChannelName} not found.`;
          warnings.push(warning);
          log(`[WARNING] ${warning}`);
          continue;
        }

        const exemptRoleIds = ruleCfg.exemptRoleNames
          .map((roleName) => roleIdsByName.get(roleName))
          .filter((id): id is string => Boolean(id))
          .sort();

        const desired: ResolvedAutoModRule = {
          name: ruleCfg.name,
          kind: ruleCfg.kind,
          keywords: [...(ruleCfg.keywords ?? [])],
          mentionTotalLimit:
            ruleCfg.kind === 'mentionSpam' ? (ruleCfg.mentionTotalLimit ?? 5) : null,
          alertChannelId,
          exemptRoleIds,
        };

        const singletonKinds = new Set<AutoModRuleConfig['kind']>([
          'preset',
          'spam',
          'mentionSpam',
        ]);

        const existing =
          existingRules.find(
            (r) => !matchedRuleIds.has(r.id) && r.name === desired.name,
          ) ??
          (singletonKinds.has(desired.kind)
            ? existingRules.find(
                (r) =>
                  !matchedRuleIds.has(r.id) &&
                  r.kind === desired.kind &&
                  r.editable !== false,
              )
            : undefined);

        if (!existing) {
          actions.push({
            kind: 'automod',
            action: 'create',
            name: desired.name,
          });
          if (mode === 'apply') {
            try {
              const created = await adapter.createAutoModRule(desired);
              matchedRuleIds.add(created.id);
              log(`[CREATED] AutoMod "${desired.name}"`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              const warning = `Could not create AutoMod rule "${desired.name}" (${msg}).`;
              warnings.push(warning);
              log(`[WARNING] ${warning}`);
            }
          } else {
            log(`[WOULD CREATE] AutoMod "${desired.name}"`);
          }
        } else {
          matchedRuleIds.add(existing.id);
          if (!autoModRuleEquals(existing, desired)) {
            actions.push({
              kind: 'automod',
              action: 'update',
              name: desired.name,
            });
            if (mode === 'apply') {
              try {
                await adapter.updateAutoModRule(existing.id, desired);
                log(`[UPDATED] AutoMod "${desired.name}"`);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const warning = `Could not update AutoMod rule "${desired.name}" (${msg}).`;
                warnings.push(warning);
                log(`[WARNING] ${warning}`);
              }
            } else {
              log(`[WOULD UPDATE] AutoMod "${desired.name}"`);
            }
          } else {
            actions.push({
              kind: 'automod',
              action: 'noop',
              name: desired.name,
            });
            log(`[OK] AutoMod "${desired.name}" already matches`);
          }
        }
      }
    }
  }

  // 10. Report unmanaged items (never deleted).
  const unmanagedCategories = existingCategories
    .filter((c) => !matchedCategoryIds.has(c.id))
    .map((c) => c.name);
  const unmanagedChannels = existingNonCategories
    .filter((c) => !matchedChannelIds.has(c.id))
    .map((c) => c.name);

  log('');
  log('--- UNMANAGED ITEMS (left untouched, never deleted) ---');
  log(
    `Unmanaged roles: ${unmanagedRoles.length > 0 ? unmanagedRoles.join(', ') : 'none'}`,
  );
  log(
    `Unmanaged categories: ${unmanagedCategories.length > 0 ? unmanagedCategories.join(', ') : 'none'}`,
  );
  log(
    `Unmanaged channels: ${unmanagedChannels.length > 0 ? unmanagedChannels.join(', ') : 'none'}`,
  );

  // 11. Save IDs after a real run.
  const idsPayload = {
    guildId: guild.id,
    roles: Object.fromEntries(roleIdsByName.entries()),
    categories: Object.fromEntries(categoryIdsByName.entries()),
    channels: Object.fromEntries(channelIdsByName.entries()),
  };

  let idsWrittenTo: string | null = null;
  if (mode === 'apply') {
    const outputPath =
      options.idsOutputPath ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'discord-ids.json');
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          ...idsPayload,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    idsWrittenTo = outputPath;
    log('');
    log(`Saved role and channel IDs to: ${outputPath}`);
  }

  // 12. Plain-English summary.
  const createdCount = actions.filter((a) => a.action === 'create').length;
  const updatedCount = actions.filter((a) => a.action === 'update').length;
  const unchangedCount = actions.filter((a) => a.action === 'noop').length;

  log('');
  log('--- SUMMARY ---');
  if (mode === 'practice') {
    log(
      `Practice run finished: would create ${createdCount}, would update ${updatedCount}, already matching ${unchangedCount}.`,
    );
    log('No changes were made to Discord.');
  } else {
    log(
      `Real build finished: created ${createdCount}, updated ${updatedCount}, already matching ${unchangedCount}.`,
    );
  }

  return {
    mode,
    guildId: guild.id,
    guildName: guild.name,
    actions,
    unmanagedRoles,
    unmanagedCategories,
    unmanagedChannels,
    warnings,
    idsWrittenTo,
    ids: idsPayload,
  };
}

function toChannelKind(type: ChannelType): ChannelKind | 'category' | 'other' {
  switch (type) {
    case ChannelType.GuildCategory:
      return 'category';
    case ChannelType.GuildText:
      return 'text';
    case ChannelType.GuildVoice:
      return 'voice';
    case ChannelType.GuildStageVoice:
      return 'stage';
    default:
      return 'other';
  }
}

function fromChannelKind(
  kind: ChannelKind,
): ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildStageVoice {
  switch (kind) {
    case 'text':
      return ChannelType.GuildText;
    case 'voice':
      return ChannelType.GuildVoice;
    case 'stage':
      return ChannelType.GuildStageVoice;
  }
}

function mapNotifFromDiscord(
  val: GuildDefaultMessageNotifications,
): GuildSettingsConfig['defaultMessageNotifications'] {
  return val === GuildDefaultMessageNotifications.OnlyMentions
    ? 'onlyMentions'
    : 'allMessages';
}

function mapNotifToDiscord(
  val: GuildSettingsConfig['defaultMessageNotifications'],
): GuildDefaultMessageNotifications {
  return val === 'onlyMentions'
    ? GuildDefaultMessageNotifications.OnlyMentions
    : GuildDefaultMessageNotifications.AllMessages;
}

function mapExplicitFromDiscord(
  val: GuildExplicitContentFilter,
): GuildSettingsConfig['explicitContentFilter'] {
  switch (val) {
    case GuildExplicitContentFilter.AllMembers:
      return 'allMembers';
    case GuildExplicitContentFilter.MembersWithoutRoles:
      return 'membersWithoutRoles';
    default:
      return 'disabled';
  }
}

function mapExplicitToDiscord(
  val: GuildSettingsConfig['explicitContentFilter'],
): GuildExplicitContentFilter {
  switch (val) {
    case 'allMembers':
      return GuildExplicitContentFilter.AllMembers;
    case 'membersWithoutRoles':
      return GuildExplicitContentFilter.MembersWithoutRoles;
    case 'disabled':
      return GuildExplicitContentFilter.Disabled;
  }
}

function mapVerificationFromDiscord(
  val: GuildVerificationLevel,
): GuildSettingsConfig['verificationLevel'] {
  switch (val) {
    case GuildVerificationLevel.None:
      return 'none';
    case GuildVerificationLevel.Low:
      return 'low';
    case GuildVerificationLevel.Medium:
      return 'medium';
    case GuildVerificationLevel.High:
      return 'high';
    case GuildVerificationLevel.VeryHigh:
      return 'veryHigh';
  }
}

function mapVerificationToDiscord(
  val: GuildSettingsConfig['verificationLevel'],
): GuildVerificationLevel {
  switch (val) {
    case 'none':
      return GuildVerificationLevel.None;
    case 'low':
      return GuildVerificationLevel.Low;
    case 'medium':
      return GuildVerificationLevel.Medium;
    case 'high':
      return GuildVerificationLevel.High;
    case 'veryHigh':
      return GuildVerificationLevel.VeryHigh;
  }
}

function mapTriggerFromDiscord(
  triggerType: AutoModerationRuleTriggerType,
): AutoModRuleRecord['kind'] {
  switch (triggerType) {
    case AutoModerationRuleTriggerType.KeywordPreset:
      return 'preset';
    case AutoModerationRuleTriggerType.Spam:
      return 'spam';
    case AutoModerationRuleTriggerType.MentionSpam:
      return 'mentionSpam';
    case AutoModerationRuleTriggerType.Keyword:
      return 'keyword';
    default:
      return 'other';
  }
}

function buildStarterMessagePayload(post: NormalizedStarterPost) {
  const embed = new EmbedBuilder()
    .setTitle(post.title)
    .setDescription(post.description)
    .setColor(post.color)
    .setFooter({ text: post.footerText });

  if (post.fields.length > 0) {
    embed.addFields(
      post.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })),
    );
  }

  const components =
    post.buttons.length > 0
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...post.buttons.map((b) =>
              new ButtonBuilder()
                .setLabel(b.label)
                .setStyle(ButtonStyle.Link)
                .setURL(b.url),
            ),
          ),
        ]
      : [];

  return { embeds: [embed], components };
}

export function createRealDiscordAdapter(guild: Guild): DiscordAdapter {
  const mapOverwrites = (overwrites: OverwriteRecord[]) =>
    overwrites.map((item) => ({
      id: item.id,
      type: OverwriteType.Role,
      allow: new PermissionsBitField(item.allow),
      deny: new PermissionsBitField(item.deny),
    }));

  const parseStarterMessage = (msg: {
    id: string;
    pinned: boolean;
    embeds: Array<{
      title: string | null;
      description: string | null;
      color: number | null;
      fields: Array<{ name: string; value: string; inline?: boolean }>;
      footer: { text: string } | null;
    }>;
    components: Array<{
      components: Array<{
        type: ComponentType;
        style?: ButtonStyle;
        label?: string | null;
        url?: string | null;
      }>;
    }>;
  }): StarterPostRecord | null => {
    const embed = msg.embeds[0];
    if (!embed?.footer?.text) return null;
    const match = embed.footer.text.match(/\[([^\]]+)\]$/);
    if (!match) return null;

    const buttons: Array<{ label: string; url: string }> = [];
    for (const row of msg.components) {
      for (const comp of row.components) {
        if (
          comp.type === ComponentType.Button &&
          comp.style === ButtonStyle.Link &&
          comp.label &&
          comp.url
        ) {
          buttons.push({ label: comp.label, url: comp.url });
        }
      }
    }

    return {
      id: msg.id,
      key: match[1],
      title: embed.title ?? '',
      description: embed.description ?? '',
      color: embed.color ?? 0,
      fields: embed.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: Boolean(f.inline),
      })),
      footerText: embed.footer.text,
      buttons,
      pinned: msg.pinned,
    };
  };

  return {
    async getGuildInfo() {
      return {
        id: guild.id,
        name: guild.name,
        everyoneRoleId: guild.roles.everyone?.id ?? guild.id,
      };
    },

    async getBotHighestRolePosition() {
      const me = await guild.members.fetchMe();
      return me.roles.highest.position;
    },

    async listRoles() {
      const roles = await guild.roles.fetch();
      return Array.from(roles.values()).map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        permissions: role.permissions.bitfield,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        managed: role.managed,
      }));
    },

    async createRole(input) {
      const created = await guild.roles.create({
        name: input.name,
        permissions: new PermissionsBitField(input.permissions),
        colors: { primaryColor: input.color },
        hoist: input.hoist,
        mentionable: input.mentionable,
        reason: 'Portals OS Discord setup script',
      });
      return {
        id: created.id,
        name: created.name,
        position: created.position,
        permissions: created.permissions.bitfield,
        color: created.color,
        hoist: created.hoist,
        mentionable: created.mentionable,
        managed: created.managed,
      };
    },

    async updateRole(roleId, input) {
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        throw new Error(`Role ${roleId} not found.`);
      }
      const updated = await role.edit({
        permissions: new PermissionsBitField(input.permissions),
        colors: { primaryColor: input.color },
        hoist: input.hoist,
        mentionable: input.mentionable,
        reason: 'Portals OS Discord setup script',
      });
      return {
        id: updated.id,
        name: updated.name,
        position: updated.position,
        permissions: updated.permissions.bitfield,
        color: updated.color,
        hoist: updated.hoist,
        mentionable: updated.mentionable,
        managed: updated.managed,
      };
    },

    async setRolePositions(positions) {
      await guild.roles.setPositions(
        positions.map((p) => ({ role: p.roleId, position: p.position })),
      );
    },

    async listChannels() {
      const channels = await guild.channels.fetch();
      const result: ChannelRecord[] = [];
      for (const ch of channels.values()) {
        if (!ch) continue;
        result.push({
          id: ch.id,
          name: ch.name,
          type: toChannelKind(ch.type),
          parentId: ch.parentId ?? null,
          topic: 'topic' in ch && typeof ch.topic === 'string' ? ch.topic : null,
          rateLimitPerUser:
            'rateLimitPerUser' in ch && typeof ch.rateLimitPerUser === 'number'
              ? ch.rateLimitPerUser
              : 0,
          overwrites:
            'permissionOverwrites' in ch && ch.permissionOverwrites
              ? ch.permissionOverwrites.cache
                  .filter((ow) => ow.type === OverwriteType.Role)
                  .map((ow) => ({
                    id: ow.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                  }))
              : [],
        });
      }
      return result;
    },

    async createCategory(input) {
      const created = await guild.channels.create({
        name: input.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: mapOverwrites(input.overwrites),
        reason: 'Portals OS Discord setup script',
      });
      return {
        id: created.id,
        name: created.name,
        type: 'category',
        parentId: null,
        topic: null,
        rateLimitPerUser: 0,
        overwrites: input.overwrites,
      };
    },

    async updateCategory(categoryId, input) {
      const ch = await guild.channels.fetch(categoryId);
      if (!ch || ch.type !== ChannelType.GuildCategory) {
        throw new Error(`Category ${categoryId} not found.`);
      }
      await ch.permissionOverwrites.set(
        mapOverwrites(input.overwrites),
        'Portals OS Discord setup script',
      );
      return {
        id: ch.id,
        name: ch.name,
        type: 'category',
        parentId: null,
        topic: null,
        rateLimitPerUser: 0,
        overwrites: input.overwrites,
      };
    },

    async createChannel(input) {
      const created = await guild.channels.create({
        name: input.name,
        type: fromChannelKind(input.type),
        parent: input.parentId,
        topic: input.type === 'text' ? input.topic : undefined,
        rateLimitPerUser:
          input.type === 'text' ? (input.rateLimitPerUser ?? 0) : undefined,
        permissionOverwrites: mapOverwrites(input.overwrites),
        reason: 'Portals OS Discord setup script',
      });
      return {
        id: created.id,
        name: created.name,
        type: input.type,
        parentId: created.parentId ?? null,
        topic: 'topic' in created && typeof created.topic === 'string' ? created.topic : null,
        rateLimitPerUser:
          'rateLimitPerUser' in created && typeof created.rateLimitPerUser === 'number'
            ? created.rateLimitPerUser
            : 0,
        overwrites: input.overwrites,
      };
    },

    async updateChannel(channelId, input) {
      const ch = await guild.channels.fetch(channelId);
      if (!ch || ch.type === ChannelType.GuildCategory) {
        throw new Error(`Channel ${channelId} not found.`);
      }
      if ('edit' in ch) {
        await ch.edit({
          parent: input.parentId,
          ...(ch.type === ChannelType.GuildText && input.topic !== undefined
            ? { topic: input.topic }
            : {}),
          ...(ch.type === ChannelType.GuildText && input.rateLimitPerUser !== undefined
            ? { rateLimitPerUser: input.rateLimitPerUser }
            : {}),
          reason: 'Portals OS Discord setup script',
        });
      }
      await ch.permissionOverwrites.set(
        mapOverwrites(input.overwrites),
        'Portals OS Discord setup script',
      );
      return {
        id: ch.id,
        name: ch.name,
        type: toChannelKind(ch.type),
        parentId: input.parentId,
        topic: input.topic ?? null,
        rateLimitPerUser: input.rateLimitPerUser ?? 0,
        overwrites: input.overwrites,
      };
    },

    async getGuildSettings() {
      const fetched = await guild.fetch();
      return {
        description: fetched.description ?? null,
        defaultMessageNotifications: mapNotifFromDiscord(
          fetched.defaultMessageNotifications,
        ),
        explicitContentFilter: mapExplicitFromDiscord(fetched.explicitContentFilter),
        verificationLevel: mapVerificationFromDiscord(fetched.verificationLevel),
        rulesChannelId: fetched.rulesChannelId ?? null,
        publicUpdatesChannelId: fetched.publicUpdatesChannelId ?? null,
      };
    },

    async updateGuildSettings(input) {
      await guild.edit({
        description: input.description,
        defaultMessageNotifications: mapNotifToDiscord(
          input.defaultMessageNotifications,
        ),
        explicitContentFilter: mapExplicitToDiscord(input.explicitContentFilter),
        verificationLevel: mapVerificationToDiscord(input.verificationLevel),
        ...(input.rulesChannelId ? { rulesChannel: input.rulesChannelId } : {}),
        ...(input.publicUpdatesChannelId
          ? { publicUpdatesChannel: input.publicUpdatesChannelId }
          : {}),
        reason: 'Portals OS Discord setup script',
      });
    },

    async listStarterPosts(channelId) {
      const ch = await guild.channels.fetch(channelId);
      if (!ch || !ch.isTextBased() || ch.isDMBased()) {
        return [];
      }
      const botId = guild.client.user?.id;
      const messages = await ch.messages.fetch({ limit: 50 });
      const posts: StarterPostRecord[] = [];
      for (const msg of messages.values()) {
        if (botId && msg.author.id !== botId) continue;
        const parsed = parseStarterMessage(msg);
        if (parsed) {
          posts.push(parsed);
        }
      }
      return posts;
    },

    async createStarterPost(channelId, post) {
      const ch = await guild.channels.fetch(channelId);
      if (!ch || ch.type !== ChannelType.GuildText) {
        throw new Error(`Text channel ${channelId} not found for starter post.`);
      }
      const msg = await ch.send(buildStarterMessagePayload(post));
      if (post.pin && !msg.pinned) {
        await msg.pin('Portals OS Discord setup script');
      }
      return {
        id: msg.id,
        key: post.key,
        title: post.title,
        description: post.description,
        color: post.color,
        fields: post.fields,
        footerText: post.footerText,
        buttons: post.buttons,
        pinned: Boolean(post.pin),
      };
    },

    async updateStarterPost(channelId, messageId, post) {
      const ch = await guild.channels.fetch(channelId);
      if (!ch || ch.type !== ChannelType.GuildText) {
        throw new Error(`Text channel ${channelId} not found for starter post.`);
      }
      const msg = await ch.messages.fetch(messageId);
      await msg.edit(buildStarterMessagePayload(post));
      if (post.pin && !msg.pinned) {
        await msg.pin('Portals OS Discord setup script');
      }
      return {
        id: msg.id,
        key: post.key,
        title: post.title,
        description: post.description,
        color: post.color,
        fields: post.fields,
        footerText: post.footerText,
        buttons: post.buttons,
        pinned: Boolean(post.pin),
      };
    },

    async listAutoModRules() {
      const rules = await guild.autoModerationRules.fetch();
      return Array.from(rules.values()).map((rule) => {
        const alertAction = rule.actions.find(
          (a) => a.type === AutoModerationActionType.SendAlertMessage,
        );
        return {
          id: rule.id,
          name: rule.name,
          kind: mapTriggerFromDiscord(rule.triggerType),
          enabled: rule.enabled,
          editable:
            rule.id !== '1030554520465440818' &&
            !(
              rule.name === 'Block Mention Spam' &&
              rule.creatorId !== guild.client.user?.id
            ),
          keywords: [...(rule.triggerMetadata.keywordFilter ?? [])],
          mentionTotalLimit: rule.triggerMetadata.mentionTotalLimit ?? null,
          alertChannelId: alertAction?.metadata.channelId ?? null,
          exemptRoleIds: Array.from(rule.exemptRoles.keys()).sort(),
        };
      });
    },

    async createAutoModRule(input) {
      const triggerMetadata =
        input.kind === 'preset'
          ? {
              presets: [
                AutoModerationRuleKeywordPresetType.Profanity,
                AutoModerationRuleKeywordPresetType.SexualContent,
                AutoModerationRuleKeywordPresetType.Slurs,
              ],
            }
          : input.kind === 'mentionSpam'
            ? { mentionTotalLimit: input.mentionTotalLimit ?? 5 }
            : input.kind === 'keyword'
              ? { keywordFilter: input.keywords }
              : {};

      const triggerType =
        input.kind === 'preset'
          ? AutoModerationRuleTriggerType.KeywordPreset
          : input.kind === 'spam'
            ? AutoModerationRuleTriggerType.Spam
            : input.kind === 'mentionSpam'
              ? AutoModerationRuleTriggerType.MentionSpam
              : AutoModerationRuleTriggerType.Keyword;

      const created = await guild.autoModerationRules.create({
        name: input.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType,
        triggerMetadata,
        actions: [
          {
            type: AutoModerationActionType.BlockMessage,
            metadata: { customMessage: 'Blocked by ItsYouOnline AutoMod.' },
          },
          {
            type: AutoModerationActionType.SendAlertMessage,
            metadata: { channel: input.alertChannelId },
          },
        ],
        exemptRoles: input.exemptRoleIds,
        enabled: true,
        reason: 'Portals OS Discord setup script',
      });

      return {
        id: created.id,
        name: created.name,
        kind: input.kind,
        enabled: created.enabled,
        keywords: input.keywords,
        mentionTotalLimit: input.mentionTotalLimit,
        alertChannelId: input.alertChannelId,
        exemptRoleIds: [...input.exemptRoleIds].sort(),
      };
    },

    async updateAutoModRule(ruleId, input) {
      const triggerMetadata =
        input.kind === 'preset'
          ? {
              presets: [
                AutoModerationRuleKeywordPresetType.Profanity,
                AutoModerationRuleKeywordPresetType.SexualContent,
                AutoModerationRuleKeywordPresetType.Slurs,
              ],
            }
          : input.kind === 'mentionSpam'
            ? { mentionTotalLimit: input.mentionTotalLimit ?? 5 }
            : input.kind === 'keyword'
              ? { keywordFilter: input.keywords }
              : {};

      const updated = await guild.autoModerationRules.edit(ruleId, {
        name: input.name,
        triggerMetadata,
        actions: [
          {
            type: AutoModerationActionType.BlockMessage,
            metadata: { customMessage: 'Blocked by ItsYouOnline AutoMod.' },
          },
          {
            type: AutoModerationActionType.SendAlertMessage,
            metadata: { channel: input.alertChannelId },
          },
        ],
        exemptRoles: input.exemptRoleIds,
        enabled: true,
        reason: 'Portals OS Discord setup script',
      });

      return {
        id: updated.id,
        name: updated.name,
        kind: input.kind,
        enabled: updated.enabled,
        keywords: input.keywords,
        mentionTotalLimit: input.mentionTotalLimit,
        alertChannelId: input.alertChannelId,
        exemptRoleIds: [...input.exemptRoleIds].sort(),
      };
    },
  };
}

async function main(): Promise<void> {
  dotenv.config();

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (!token || !guildId) {
    console.error(
      'Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID in your .env file. ' +
        'Copy .env.example to .env and fill in both lines first.',
    );
    process.exitCode = 1;
    return;
  }

  // Run safety checks before even connecting to Discord.
  validateRolePermissions(DISCORD_SERVER_CONFIG.roles);
  validateNoForbiddenPhrases(DISCORD_SERVER_CONFIG);

  const cli = parseCliArgs(process.argv.slice(2));

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    const readyPromise = new Promise<void>((resolve) => {
      client.once(Events.ClientReady, () => resolve());
    });
    await client.login(token);
    await readyPromise;
    const guild = await client.guilds.fetch(guildId);
    const adapter = createRealDiscordAdapter(guild);
    await runSetup(adapter, DISCORD_SERVER_CONFIG, {
      apply: cli.apply,
      confirmGuildId: cli.confirmGuildId,
    });
  } finally {
    client.destroy();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: ${message}`);
    process.exitCode = 1;
  });
}
