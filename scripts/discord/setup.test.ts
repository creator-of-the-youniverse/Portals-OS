import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DISCORD_SERVER_CONFIG,
  FORBIDDEN_NON_STAFF_PERMISSIONS,
  ROLE_COLORS,
  type RoleConfig,
} from './config.ts';
import {
  type AutoModRuleRecord,
  type ChannelRecord,
  type DiscordAdapter,
  type GuildSettingsRecord,
  type GuildSettingsUpdate,
  type NormalizedStarterPost,
  type OverwriteRecord,
  type ResolvedAutoModRule,
  type RoleRecord,
  type StarterPostRecord,
  runSetup,
  validateNoForbiddenPhrases,
  validateRolePermissions,
} from './setup.ts';

class FakeDiscordAdapter implements DiscordAdapter {
  private nextId = 1;
  public readonly guildId: string;
  public readonly guildName: string;
  public readonly everyoneRoleId = 'role-everyone';
  public botHighestRolePosition: number;
  public roles: RoleRecord[] = [];
  public channels: ChannelRecord[] = [];
  public guildSettings: GuildSettingsRecord;
  public starterPostsByChannel = new Map<string, StarterPostRecord[]>();
  public autoModRules: AutoModRuleRecord[] = [];
  public mutationCount = 0;

  constructor(options?: {
    guildId?: string;
    guildName?: string;
    botHighestRolePosition?: number;
    initialRoles?: RoleRecord[];
    initialChannels?: ChannelRecord[];
    initialGuildSettings?: Partial<GuildSettingsRecord>;
  }) {
    this.guildId = options?.guildId ?? '123456789012345678';
    this.guildName = options?.guildName ?? 'Test Youniverse Server';
    this.botHighestRolePosition = options?.botHighestRolePosition ?? 20;
    this.roles = [
      {
        id: this.everyoneRoleId,
        name: '@everyone',
        position: 0,
        permissions: 0n,
        color: 0,
        hoist: false,
        mentionable: false,
        managed: false,
      },
      ...(options?.initialRoles ?? []),
    ];
    this.channels = [...(options?.initialChannels ?? [])];
    this.guildSettings = {
      description: null,
      defaultMessageNotifications: 'allMessages',
      explicitContentFilter: 'disabled',
      verificationLevel: 'none',
      rulesChannelId: null,
      publicUpdatesChannelId: null,
      ...(options?.initialGuildSettings ?? {}),
    };
  }

  async getGuildInfo() {
    return {
      id: this.guildId,
      name: this.guildName,
      everyoneRoleId: this.everyoneRoleId,
    };
  }

  async getBotHighestRolePosition() {
    return this.botHighestRolePosition;
  }

  async listRoles() {
    return this.roles.map((r) => ({ ...r }));
  }

  async createRole(input: {
    name: string;
    permissions: bigint;
    color: number;
    hoist: boolean;
    mentionable: boolean;
  }): Promise<RoleRecord> {
    this.mutationCount++;
    const role: RoleRecord = {
      id: `role-${this.nextId++}`,
      name: input.name,
      position: 1,
      permissions: input.permissions,
      color: input.color,
      hoist: input.hoist,
      mentionable: input.mentionable,
      managed: false,
    };
    this.roles.push(role);
    this.botHighestRolePosition++;
    return { ...role };
  }

  async updateRole(
    roleId: string,
    input: { permissions: bigint; color: number; hoist: boolean; mentionable: boolean },
  ): Promise<RoleRecord> {
    this.mutationCount++;
    const role = this.roles.find((r) => r.id === roleId);
    if (!role) throw new Error(`Missing fake role ${roleId}`);
    role.permissions = input.permissions;
    role.color = input.color;
    role.hoist = input.hoist;
    role.mentionable = input.mentionable;
    return { ...role };
  }

  async setRolePositions(positions: Array<{ roleId: string; position: number }>) {
    this.mutationCount++;
    for (const update of positions) {
      const role = this.roles.find((r) => r.id === update.roleId);
      if (role) {
        role.position = update.position;
      }
    }
  }

  async listChannels() {
    return this.channels.map((c) => ({
      ...c,
      overwrites: c.overwrites.map((o) => ({ ...o })),
    }));
  }

  async createCategory(input: {
    name: string;
    overwrites: OverwriteRecord[];
  }): Promise<ChannelRecord> {
    this.mutationCount++;
    const category: ChannelRecord = {
      id: `cat-${this.nextId++}`,
      name: input.name,
      type: 'category',
      parentId: null,
      topic: null,
      rateLimitPerUser: 0,
      overwrites: input.overwrites.map((o) => ({ ...o })),
    };
    this.channels.push(category);
    return { ...category };
  }

  async updateCategory(
    categoryId: string,
    input: { overwrites: OverwriteRecord[] },
  ): Promise<ChannelRecord> {
    this.mutationCount++;
    const category = this.channels.find((c) => c.id === categoryId);
    if (!category) throw new Error(`Missing fake category ${categoryId}`);
    category.overwrites = input.overwrites.map((o) => ({ ...o }));
    return { ...category };
  }

  async createChannel(input: {
    name: string;
    type: 'text' | 'voice' | 'stage';
    parentId: string;
    topic?: string;
    rateLimitPerUser?: number;
    overwrites: OverwriteRecord[];
  }): Promise<ChannelRecord> {
    this.mutationCount++;
    const channel: ChannelRecord = {
      id: `ch-${this.nextId++}`,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      topic: input.topic ?? null,
      rateLimitPerUser: input.rateLimitPerUser ?? 0,
      overwrites: input.overwrites.map((o) => ({ ...o })),
    };
    this.channels.push(channel);
    return { ...channel };
  }

  async updateChannel(
    channelId: string,
    input: {
      parentId: string;
      topic?: string;
      rateLimitPerUser?: number;
      overwrites: OverwriteRecord[];
    },
  ): Promise<ChannelRecord> {
    this.mutationCount++;
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error(`Missing fake channel ${channelId}`);
    channel.parentId = input.parentId;
    if (input.topic !== undefined) {
      channel.topic = input.topic;
    }
    if (input.rateLimitPerUser !== undefined) {
      channel.rateLimitPerUser = input.rateLimitPerUser;
    }
    channel.overwrites = input.overwrites.map((o) => ({ ...o }));
    return { ...channel };
  }

  async getGuildSettings(): Promise<GuildSettingsRecord> {
    return { ...this.guildSettings };
  }

  async updateGuildSettings(input: GuildSettingsUpdate): Promise<void> {
    this.mutationCount++;
    this.guildSettings = {
      description: input.description,
      defaultMessageNotifications: input.defaultMessageNotifications,
      explicitContentFilter: input.explicitContentFilter,
      verificationLevel: input.verificationLevel,
      rulesChannelId: input.rulesChannelId ?? this.guildSettings.rulesChannelId,
      publicUpdatesChannelId:
        input.publicUpdatesChannelId ?? this.guildSettings.publicUpdatesChannelId,
    };
  }

  async listStarterPosts(channelId: string): Promise<StarterPostRecord[]> {
    return (this.starterPostsByChannel.get(channelId) ?? []).map((p) => ({
      ...p,
      fields: p.fields.map((f) => ({ ...f })),
      buttons: p.buttons.map((b) => ({ ...b })),
    }));
  }

  async createStarterPost(
    channelId: string,
    post: NormalizedStarterPost,
  ): Promise<StarterPostRecord> {
    this.mutationCount++;
    const record: StarterPostRecord = {
      id: `msg-${this.nextId++}`,
      key: post.key,
      title: post.title,
      description: post.description,
      color: post.color,
      fields: post.fields.map((f) => ({ ...f })),
      footerText: post.footerText,
      buttons: post.buttons.map((b) => ({ ...b })),
      pinned: post.pin,
    };
    const list = this.starterPostsByChannel.get(channelId) ?? [];
    list.push(record);
    this.starterPostsByChannel.set(channelId, list);
    return { ...record };
  }

  async updateStarterPost(
    channelId: string,
    messageId: string,
    post: NormalizedStarterPost,
  ): Promise<StarterPostRecord> {
    this.mutationCount++;
    const list = this.starterPostsByChannel.get(channelId) ?? [];
    const existing = list.find((item) => item.id === messageId);
    if (!existing) throw new Error(`Missing fake starter post ${messageId}`);
    existing.title = post.title;
    existing.description = post.description;
    existing.color = post.color;
    existing.fields = post.fields.map((f) => ({ ...f }));
    existing.footerText = post.footerText;
    existing.buttons = post.buttons.map((b) => ({ ...b }));
    existing.pinned = post.pin;
    return { ...existing };
  }

  async listAutoModRules(): Promise<AutoModRuleRecord[]> {
    return this.autoModRules.map((r) => ({
      ...r,
      keywords: [...r.keywords],
      exemptRoleIds: [...r.exemptRoleIds],
    }));
  }

  async createAutoModRule(input: ResolvedAutoModRule): Promise<AutoModRuleRecord> {
    this.mutationCount++;
    const record: AutoModRuleRecord = {
      id: `automod-${this.nextId++}`,
      name: input.name,
      kind: input.kind,
      enabled: true,
      keywords: [...input.keywords],
      mentionTotalLimit: input.mentionTotalLimit,
      alertChannelId: input.alertChannelId,
      exemptRoleIds: [...input.exemptRoleIds].sort(),
    };
    this.autoModRules.push(record);
    return { ...record };
  }

  async updateAutoModRule(
    ruleId: string,
    input: ResolvedAutoModRule,
  ): Promise<AutoModRuleRecord> {
    this.mutationCount++;
    const existing = this.autoModRules.find((r) => r.id === ruleId);
    if (!existing) throw new Error(`Missing fake AutoMod rule ${ruleId}`);
    existing.name = input.name;
    existing.kind = input.kind;
    existing.enabled = true;
    existing.keywords = [...input.keywords];
    existing.mentionTotalLimit = input.mentionTotalLimit;
    existing.alertChannelId = input.alertChannelId;
    existing.exemptRoleIds = [...input.exemptRoleIds].sort();
    return { ...existing };
  }
}

test('practice mode (dry run) changes nothing and writes no IDs file', async () => {
  const fake = new FakeDiscordAdapter();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-setup-test-'));
  const idsPath = path.join(tmpDir, 'discord-ids.json');

  const result = await runSetup(fake, DISCORD_SERVER_CONFIG, {
    apply: false,
    idsOutputPath: idsPath,
    log: () => {},
  });

  assert.equal(result.mode, 'practice');
  assert.equal(fake.mutationCount, 0);
  assert.equal(fake.roles.length, 1); // only @everyone
  assert.equal(fake.channels.length, 0);
  assert.equal(fake.starterPostsByChannel.size, 0);
  assert.equal(fake.autoModRules.length, 0);
  assert.equal(result.idsWrittenTo, null);
  assert.ok(result.actions.some((a) => a.kind === 'starter-post' && a.action === 'create'));
  assert.ok(result.actions.some((a) => a.kind === 'automod' && a.action === 'create'));
  assert.ok(result.actions.some((a) => a.kind === 'guild-settings' && a.action === 'update'));

  await assert.rejects(() => fs.access(idsPath));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('first real run creates roles, channels, settings, embeds, and AutoMod; second run changes nothing', async () => {
  const fake = new FakeDiscordAdapter({
    initialRoles: [
      {
        id: 'role-custom',
        name: 'Custom Friend Role',
        position: 2,
        permissions: 0n,
        color: 0,
        hoist: false,
        mentionable: false,
        managed: false,
      },
    ],
  });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-setup-test-'));
  const idsPath = path.join(tmpDir, 'discord-ids.json');

  // First run: creates all roles, categories, channels, guild settings, starter posts, and AutoMod rules
  const first = await runSetup(fake, DISCORD_SERVER_CONFIG, {
    apply: true,
    confirmGuildId: fake.guildId,
    idsOutputPath: idsPath,
    log: () => {},
  });

  assert.equal(first.mode, 'apply');
  assert.equal(Object.keys(first.ids.roles).length, DISCORD_SERVER_CONFIG.roles.length);
  assert.equal(
    Object.keys(first.ids.categories).length,
    DISCORD_SERVER_CONFIG.categories.length,
  );
  const expectedChannelCount = DISCORD_SERVER_CONFIG.categories.reduce(
    (sum, cat) => sum + cat.channels.length,
    0,
  );
  assert.equal(Object.keys(first.ids.channels).length, expectedChannelCount);
  assert.deepEqual(first.unmanagedRoles, ['Custom Friend Role']);
  assert.equal(first.idsWrittenTo, idsPath);

  // Verify role colors, slowmode, guild settings, starter posts, and AutoMod
  const seraphim = fake.roles.find((r) => r.name === 'Seraphim');
  assert.equal(seraphim?.color, ROLE_COLORS.seraphim);
  const general = fake.channels.find((c) => c.name === 'general');
  assert.equal(general?.rateLimitPerUser, 5);
  assert.equal(fake.guildSettings.defaultMessageNotifications, 'onlyMentions');
  assert.equal(fake.guildSettings.verificationLevel, 'medium');

  const totalStarterPosts = Array.from(fake.starterPostsByChannel.values()).reduce(
    (sum, list) => sum + list.length,
    0,
  );
  assert.equal(totalStarterPosts, DISCORD_SERVER_CONFIG.starterPosts?.length);
  assert.equal(fake.autoModRules.length, DISCORD_SERVER_CONFIG.autoModRules?.length);

  // Confirm discord-ids.json was written cleanly
  const savedJson = JSON.parse(await fs.readFile(idsPath, 'utf8'));
  assert.equal(savedJson.guildId, fake.guildId);
  assert.equal(Object.keys(savedJson.roles).length, DISCORD_SERVER_CONFIG.roles.length);

  // Second run: changes nothing, creates no duplicates
  const mutationsBeforeSecond = fake.mutationCount;
  const second = await runSetup(fake, DISCORD_SERVER_CONFIG, {
    apply: true,
    confirmGuildId: fake.guildId,
    idsOutputPath: idsPath,
    log: () => {},
  });

  assert.equal(fake.mutationCount, mutationsBeforeSecond);
  assert.equal(
    second.actions.filter((a) => a.action !== 'noop').length,
    0,
  );
  assert.ok(fake.roles.some((r) => r.name === 'Custom Friend Role'));

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('safety check blocks forbidden permissions on paid, Citizen, badge, and Unverified roles', async () => {
  const nonStaffKinds: Array<RoleConfig['kind']> = ['paid', 'citizen', 'badge', 'unverified'];

  for (const kind of nonStaffKinds) {
    for (const badPerm of FORBIDDEN_NON_STAFF_PERMISSIONS) {
      assert.throws(
        () =>
          validateRolePermissions([
            {
              name: `Bad ${kind} Role`,
              kind,
              color: 0,
              permissions: [badPerm],
            },
          ]),
        /SAFETY STOP/,
      );
    }
  }

  // Also verify runSetup refuses to touch Discord if a bad config is passed
  const fake = new FakeDiscordAdapter();
  const badConfig = {
    ...DISCORD_SERVER_CONFIG,
    roles: DISCORD_SERVER_CONFIG.roles.map((r) =>
      r.name === 'Founding Angel'
        ? { ...r, permissions: ['Administrator' as const] }
        : r,
    ),
  };

  await assert.rejects(
    () =>
      runSetup(fake, badConfig, {
        apply: true,
        confirmGuildId: fake.guildId,
        log: () => {},
      }),
    /SAFETY STOP/,
  );
  assert.equal(fake.mutationCount, 0);
});

test('wording safety check blocks "not verified" and config + bot stay clean', async () => {
  validateNoForbiddenPhrases(DISCORD_SERVER_CONFIG);

  const botSource = await fs.readFile(
    new URL('./bot.ts', import.meta.url),
    'utf8',
  );
  assert.equal(/\bnot\s+verified\b/i.test(botSource), false);

  const badWordingConfig = {
    ...DISCORD_SERVER_CONFIG,
    starterPosts: [
      {
        key: 'bad',
        channelName: 'welcome',
        title: 'Bad',
        description: 'You are not verified yet.',
        color: 0,
      },
    ],
  };

  assert.throws(() => validateNoForbiddenPhrases(badWordingConfig), /SAFETY STOP/);
});

test('apply mode stops if --confirm-guild is missing or wrong', async () => {
  const fake = new FakeDiscordAdapter();

  await assert.rejects(
    () =>
      runSetup(fake, DISCORD_SERVER_CONFIG, {
        apply: true,
        log: () => {},
      }),
    /SAFETY STOP/,
  );

  await assert.rejects(
    () =>
      runSetup(fake, DISCORD_SERVER_CONFIG, {
        apply: true,
        confirmGuildId: '999999999999999999',
        log: () => {},
      }),
    /SAFETY STOP/,
  );

  assert.equal(fake.mutationCount, 0);
});

test('stops with plain-English error if bot role is below a managed role', async () => {
  const fake = new FakeDiscordAdapter({
    botHighestRolePosition: 5,
    initialRoles: [
      {
        id: 'role-seraphim',
        name: 'Seraphim',
        position: 10,
        permissions: 0n,
        color: ROLE_COLORS.seraphim,
        hoist: true,
        mentionable: false,
        managed: false,
      },
    ],
  });

  await assert.rejects(
    () =>
      runSetup(fake, DISCORD_SERVER_CONFIG, {
        apply: false,
        log: () => {},
      }),
    /bot's role is too low/i,
  );
  assert.equal(fake.mutationCount, 0);
});
