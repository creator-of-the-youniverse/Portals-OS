export type RoleKind = 'staff' | 'badge' | 'paid' | 'citizen' | 'unverified';

export type PermissionName =
  | 'Administrator'
  | 'ManageGuild'
  | 'ManageRoles'
  | 'ManageChannels'
  | 'KickMembers'
  | 'BanMembers'
  | 'MentionEveryone'
  | 'ManageMessages'
  | 'ModerateMembers'
  | 'ViewChannel'
  | 'ReadMessageHistory'
  | 'SendMessages'
  | 'SendMessagesInThreads'
  | 'CreatePublicThreads'
  | 'CreatePrivateThreads'
  | 'Connect'
  | 'Speak';

export interface RoleConfig {
  name: string;
  kind: RoleKind;
  permissions: PermissionName[];
  /** Hex color number, e.g. 0xfde047 */
  color: number;
  hoist?: boolean;
  mentionable?: boolean;
}

export type ChannelKind = 'text' | 'voice' | 'stage';

export interface ChannelPermissionOverride {
  /** Role name, or '@everyone' for the server default role */
  target: string;
  allow?: PermissionName[];
  deny?: PermissionName[];
}

export interface ChannelConfig {
  name: string;
  type: ChannelKind;
  topic?: string;
  /** Slowmode in seconds for text channels (0 = off) */
  rateLimitPerUser?: number;
  /** Optional channel-specific overrides; if omitted, inherits category overrides */
  overwrites?: ChannelPermissionOverride[];
}

export interface CategoryConfig {
  name: string;
  overwrites: ChannelPermissionOverride[];
  channels: ChannelConfig[];
}

export interface GuildSettingsConfig {
  /** Server description (used when Community is enabled) */
  description: string;
  /** Default notifications: 'onlyMentions' prevents ping fatigue */
  defaultMessageNotifications: 'onlyMentions' | 'allMessages';
  /** Explicit media filter across the server */
  explicitContentFilter: 'allMembers' | 'membersWithoutRoles' | 'disabled';
  /** Verification level: 'medium' blocks brand-new throwaway raid accounts */
  verificationLevel: 'none' | 'low' | 'medium' | 'high' | 'veryHigh';
  /** Channel name to set as Discord's official Community Rules channel */
  rulesChannelName?: string;
  /** Channel name to set as Discord's official Community Updates channel */
  publicUpdatesChannelName?: string;
}

export interface EmbedFieldConfig {
  name: string;
  value: string;
  inline?: boolean;
}

export interface LinkButtonConfig {
  label: string;
  url: string;
}

export interface StarterPostConfig {
  /** Unique marker stored in embed footer so re-runs update in place with zero duplicates */
  key: string;
  channelName: string;
  title: string;
  description: string;
  color: number;
  fields?: EmbedFieldConfig[];
  footerNote?: string;
  buttons?: LinkButtonConfig[];
  pin?: boolean;
}

export interface AutoModRuleConfig {
  name: string;
  kind: 'preset' | 'spam' | 'mentionSpam' | 'keyword';
  keywords?: string[];
  mentionTotalLimit?: number;
  alertChannelName: string;
  exemptRoleNames: readonly string[];
}

export interface DiscordServerConfig {
  roles: RoleConfig[];
  categories: CategoryConfig[];
  guildSettings?: GuildSettingsConfig;
  starterPosts?: StarterPostConfig[];
  autoModRules?: AutoModRuleConfig[];
}

/**
 * Permissions that are NEVER allowed on paid ranks, Citizen, badges, or Unverified roles.
 */
export const FORBIDDEN_NON_STAFF_PERMISSIONS: readonly PermissionName[] = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'KickMembers',
  'BanMembers',
  'MentionEveryone',
  'ManageMessages',
];

export const STAFF_ROLE_NAMES = [
  'Seraphim',
  'Thrones',
  'Dominions',
  'Virtues',
  'Powers',
  'Principality',
] as const;

export const PAID_ROLE_NAMES = [
  'Founding Cherubim',
  'Founding Archangel',
  'Founding Angel',
] as const;

export const ROLE_COLORS = {
  seraphim: 0xff4d6d, // Solar Crimson
  thrones: 0xf59e0b, // Sovereign Amber Gold
  dominions: 0xc084fc, // Imperial Amethyst
  virtues: 0x38bdf8, // Astral Sky
  powers: 0x34d399, // Emerald Sentinel
  principality: 0x94a3b8, // Silver Warden
  genesis001: 0xfde047, // Pure First-Light Gold
  cherubim: 0xe879f9, // Prismatic Orchid
  archangel: 0x60a5fa, // Celestial Sapphire
  angel: 0xfbbf24, // Halo Gold
  citizen: 0xe2e8f0, // Starlight White
  unverified: 0x64748b, // Quiet Slate
} as const;

const CITIZEN_AND_ABOVE = [
  'Citizen',
  ...PAID_ROLE_NAMES,
  'Genesis 001',
  ...STAFF_ROLE_NAMES,
];

const FOUNDING_AND_STAFF = [
  ...PAID_ROLE_NAMES,
  'Genesis 001',
  ...STAFF_ROLE_NAMES,
];

const ALL_PAID_AND_STAFF = [...PAID_ROLE_NAMES, ...STAFF_ROLE_NAMES];

const ARCHANGEL_AND_ABOVE = [
  'Founding Archangel',
  'Founding Cherubim',
  ...STAFF_ROLE_NAMES,
];

const CHERUBIM_AND_STAFF = ['Founding Cherubim', ...STAFF_ROLE_NAMES];

function allowViewAndChat(roleNames: readonly string[]): ChannelPermissionOverride[] {
  return [
    { target: '@everyone', deny: ['ViewChannel'] },
    ...roleNames.map((role) => ({
      target: role,
      allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] as PermissionName[],
    })),
  ];
}

function allowReadOnlyForRoles(
  viewerRoles: readonly string[],
  posterRoles: readonly string[],
): ChannelPermissionOverride[] {
  const posterSet = new Set(posterRoles);
  const viewerOnly = viewerRoles.filter((role) => !posterSet.has(role));

  return [
    { target: '@everyone', deny: ['ViewChannel'] },
    ...viewerOnly.map((role) => ({
      target: role,
      allow: ['ViewChannel', 'ReadMessageHistory'] as PermissionName[],
      deny: [
        'SendMessages',
        'SendMessagesInThreads',
        'CreatePublicThreads',
        'CreatePrivateThreads',
      ] as PermissionName[],
    })),
    ...posterRoles.map((role) => ({
      target: role,
      allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] as PermissionName[],
    })),
  ];
}

function allowVoiceForRoles(roleNames: readonly string[]): ChannelPermissionOverride[] {
  return [
    { target: '@everyone', deny: ['ViewChannel'] },
    ...roleNames.map((role) => ({
      target: role,
      allow: ['ViewChannel', 'Connect', 'Speak'] as PermissionName[],
    })),
  ];
}

function allowStageForRoles(roleNames: readonly string[]): ChannelPermissionOverride[] {
  return [
    { target: '@everyone', deny: ['ViewChannel'] },
    ...roleNames.map((role) => ({
      target: role,
      allow: ['ViewChannel', 'Connect'] as PermissionName[],
    })),
  ];
}

/**
 * Full Discord server blueprint for ItsYouOnline / Portals OS / The Youniverse.
 * Roles are listed from TOP to BOTTOM in Discord's hierarchy.
 */
export const DISCORD_SERVER_CONFIG: DiscordServerConfig = {
  roles: [
    // Staff roles (top of hierarchy) — only Manage Messages and Timeout Members
    {
      name: 'Seraphim',
      kind: 'staff',
      color: ROLE_COLORS.seraphim,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },
    {
      name: 'Thrones',
      kind: 'staff',
      color: ROLE_COLORS.thrones,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },
    {
      name: 'Dominions',
      kind: 'staff',
      color: ROLE_COLORS.dominions,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },
    {
      name: 'Virtues',
      kind: 'staff',
      color: ROLE_COLORS.virtues,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },
    {
      name: 'Powers',
      kind: 'staff',
      color: ROLE_COLORS.powers,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },
    {
      name: 'Principality',
      kind: 'staff',
      color: ROLE_COLORS.principality,
      permissions: ['ManageMessages', 'ModerateMembers'],
      hoist: true,
    },

    // Badge — no special permissions
    {
      name: 'Genesis 001',
      kind: 'badge',
      color: ROLE_COLORS.genesis001,
      permissions: [],
      hoist: false,
    },

    // Paid ranks — no special permissions
    {
      name: 'Founding Cherubim',
      kind: 'paid',
      color: ROLE_COLORS.cherubim,
      permissions: [],
      hoist: true,
    },
    {
      name: 'Founding Archangel',
      kind: 'paid',
      color: ROLE_COLORS.archangel,
      permissions: [],
      hoist: true,
    },
    {
      name: 'Founding Angel',
      kind: 'paid',
      color: ROLE_COLORS.angel,
      permissions: [],
      hoist: true,
    },

    // General member roles — no special permissions
    {
      name: 'Citizen',
      kind: 'citizen',
      color: ROLE_COLORS.citizen,
      permissions: [],
      hoist: false,
    },
    {
      name: 'Unverified',
      kind: 'unverified',
      color: ROLE_COLORS.unverified,
      permissions: [],
      hoist: false,
    },
  ],

  categories: [
    {
      name: 'START HERE',
      overwrites: [
        {
          target: '@everyone',
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: [
            'SendMessages',
            'SendMessagesInThreads',
            'CreatePublicThreads',
            'CreatePrivateThreads',
          ],
        },
        ...STAFF_ROLE_NAMES.map((role) => ({
          target: role,
          allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] as PermissionName[],
        })),
      ],
      channels: [
        {
          name: 'welcome',
          type: 'text',
          topic: 'Welcome to ItsYouOnline & Portals OS — your sovereign home on the internet.',
        },
        {
          name: 'rules',
          type: 'text',
          topic: 'The Charter of The Youniverse. Respect the human, protect the signal.',
        },
        {
          name: 'link-your-youniverse',
          type: 'text',
          topic:
            'Connect your <handle>.itsyouonline.com Youniverse to unlock Citizen access. Automated linking: coming soon.',
        },
        {
          name: 'announcements',
          type: 'text',
          topic: 'Official transmissions from ItsYouOnline, Portals OS, and The Youniverse.',
        },
      ],
    },
    {
      name: 'COMMUNITY',
      overwrites: allowViewAndChat(CITIZEN_AND_ABOVE),
      channels: [
        {
          name: 'general',
          type: 'text',
          topic: 'The town square of The Youniverse — Portals OS, Atom, Oracle, Weaver & ideas.',
          rateLimitPerUser: 5,
        },
        {
          name: 'show-your-youniverse',
          type: 'text',
          topic: 'Share your <handle>.itsyouonline.com, Weaver widgets, themes, and builds.',
          rateLimitPerUser: 10,
        },
        {
          name: 'homeverse-showcase',
          type: 'text',
          topic:
            'Tour live Homeverses (<handle>.itsyouonline.com) — share your public face, desktop setup, and themes.',
          rateLimitPerUser: 10,
        },
        {
          name: 'weaver-widget-showcase',
          type: 'text',
          topic:
            'Show off custom Weaver widgets, generative UI applets, and sandbox creations built in Portals OS.',
          rateLimitPerUser: 10,
        },
        {
          name: 'help',
          type: 'text',
          topic: 'Questions about Portals OS, Atom, or your Youniverse? Ask here.',
          rateLimitPerUser: 0,
        },
        {
          name: 'feedback',
          type: 'text',
          topic: 'Shape the 80-year arc — ideas, friction reports, and upgrades for Portals OS.',
          rateLimitPerUser: 10,
        },
      ],
    },
    {
      name: 'FOUNDING',
      overwrites: allowViewAndChat(FOUNDING_AND_STAFF),
      channels: [
        {
          name: 'founders-lounge',
          type: 'text',
          topic: 'Private hall for Genesis 001 and Founding members shaping the earliest era.',
        },
      ],
    },
    {
      name: 'TIER LOUNGES',
      overwrites: allowViewAndChat(ALL_PAID_AND_STAFF),
      channels: [
        {
          name: 'angel-lounge',
          type: 'text',
          topic: 'Founding Angel, Archangel & Cherubim sanctuary — previews and founder chat.',
        },
      ],
    },
    {
      name: 'ARCHANGEL',
      overwrites: allowViewAndChat(ARCHANGEL_AND_ABOVE),
      channels: [
        {
          name: 'archangel-lounge',
          type: 'text',
          topic: 'Founding Archangel & Cherubim chamber — deeper builds and priority previews.',
        },
      ],
    },
    {
      name: 'CHERUBIM',
      overwrites: allowViewAndChat(CHERUBIM_AND_STAFF),
      channels: [
        {
          name: 'cherubim-lounge',
          type: 'text',
          topic: 'Founding Cherubim sanctum — closest circle to the evolution of Portals OS.',
        },
      ],
    },
    {
      name: 'CLUB YOUNIVERSE',
      overwrites: allowViewAndChat(CITIZEN_AND_ABOVE),
      channels: [
        {
          name: 'club-announcements',
          type: 'text',
          topic: 'Club Youniverse: coming soon',
          overwrites: allowReadOnlyForRoles(CITIZEN_AND_ABOVE, STAFF_ROLE_NAMES),
        },
        {
          name: 'club-lounge',
          type: 'voice',
          overwrites: allowVoiceForRoles(CITIZEN_AND_ABOVE),
        },
        {
          name: 'club-stage',
          type: 'stage',
          overwrites: allowStageForRoles(CITIZEN_AND_ABOVE),
        },
      ],
    },
    {
      name: 'STAFF',
      overwrites: allowViewAndChat(STAFF_ROLE_NAMES),
      channels: [
        {
          name: 'staff-chat',
          type: 'text',
          topic: 'Private coordination room for the Six Orders (Seraphim through Principality).',
        },
        {
          name: 'mod-log',
          type: 'text',
          topic: 'Audit trail for AutoMod alerts, moderation actions, and server changes.',
        },
      ],
    },
  ],

  guildSettings: {
    description:
      'ItsYouOnline & Portals OS — your sovereign personal operating system and home in The Youniverse.',
    defaultMessageNotifications: 'onlyMentions',
    explicitContentFilter: 'allMembers',
    verificationLevel: 'medium',
    rulesChannelName: 'rules',
    publicUpdatesChannelName: 'mod-log',
  },

  starterPosts: [
    {
      key: 'welcome-v1',
      channelName: 'welcome',
      title: 'Welcome to ItsYouOnline — The Youniverse',
      description:
        '*“Hey. I’m Atom. First friend, till the end.”*\n\n' +
        'You have arrived at the official home of **ItsYouOnline** and **Portals OS** — the sovereign personal operating system built for an 80-year arc.\n\n' +
        'Every human deserves a permanent corner of the internet that belongs to them (`<handle>.itsyouonline.com`): your identity, your workspace, your memory, and your personal intelligence.',
      color: ROLE_COLORS.genesis001,
      fields: [
        {
          name: '1. Read the Charter',
          value: 'Check **#rules** to keep the signal clean and welcoming for everyone.',
          inline: true,
        },
        {
          name: '2. Link Your Youniverse',
          value:
            'Visit **#link-your-youniverse** to see how Citizen access works *(automated linking: coming soon)*.',
          inline: true,
        },
        {
          name: '3. Watch the Signal',
          value:
            'Follow **#announcements** for Portals OS releases, Founding drops, and **Club Youniverse** *(coming soon)*.',
          inline: false,
        },
      ],
      footerNote: 'ItsYouOnline · Portals OS',
      buttons: [{ label: 'Visit ItsYouOnline', url: 'https://itsyouonline.com' }],
      pin: true,
    },
    {
      key: 'rules-v1',
      channelName: 'rules',
      title: 'The Charter of The Youniverse',
      description:
        'Portals OS is built around one principle: **the human being is the continuity root.** Keep this space worthy of an 80-year community.',
      color: ROLE_COLORS.thrones,
      fields: [
        {
          name: '01 · Respect the Human',
          value:
            'No harassment, hate speech, personal attacks, or hostility. Debate ideas sharply; treat people with dignity.',
        },
        {
          name: '02 · Protect the Signal',
          value:
            'No spam, unsolicited promotions, mass pings, or low-effort flooding. Share your builds in **#show-your-youniverse**.',
        },
        {
          name: '03 · Zero Scams or Impersonation',
          value:
            'Never impersonate Staff, Founding members, or Atom. Phishing links and scam DMs result in immediate removal.',
        },
        {
          name: '04 · Respect Sovereign Work & Privacy',
          value:
            'Do not share private information, tokens, or another person’s unpublished work without explicit permission.',
        },
        {
          name: '05 · Keep Channels in Their Lane',
          value:
            'Use **#general** for conversation, **#help** for support, **#feedback** for product ideas, and **#show-your-youniverse** for demos.',
        },
        {
          name: '06 · Security Reminder',
          value:
            'Staff (**Seraphim** through **Principality**) will **never** DM you asking for passwords, login codes, payment details, or private keys.',
        },
      ],
      footerNote: 'Charter · ItsYouOnline Community',
      pin: true,
    },
    {
      key: 'link-youniverse-v1',
      channelName: 'link-your-youniverse',
      title: 'Link Your Youniverse',
      description:
        'Connect your `<handle>.itsyouonline.com` identity to unlock the **Citizen** role and step into **COMMUNITY** and **CLUB YOUNIVERSE**.\n\n' +
        '**Status:** Automated Discord linking is **coming soon**. Stay tuned to **#announcements** — as soon as the bridge opens, you will be able to verify in one click without ever sharing a password.',
      color: ROLE_COLORS.archangel,
      fields: [
        {
          name: 'Citizen Access',
          value:
            'Unlocks **#general**, **#show-your-youniverse**, **#help**, **#feedback**, and **CLUB YOUNIVERSE**.',
          inline: true,
        },
        {
          name: 'Founding & Genesis 001',
          value:
            'Founding Angels, Archangels, Cherubim, and **Genesis 001** holders automatically receive their badges and private lounges once linking launches.',
          inline: true,
        },
      ],
      footerNote: 'Identity Bridge · Coming Soon',
      buttons: [{ label: 'Claim Your Handle at ItsYouOnline', url: 'https://itsyouonline.com' }],
      pin: true,
    },
    {
      key: 'announcements-v1',
      channelName: 'announcements',
      title: 'Official Transmissions',
      description:
        'This is the read-only broadcast channel for **ItsYouOnline** and **Portals OS**.\n\n' +
        'Major releases, Founding milestones, identity bridge launches, and **Club Youniverse** live schedules will always land here first.',
      color: ROLE_COLORS.angel,
      footerNote: 'Broadcast Channel · Read-Only',
      pin: true,
    },
    {
      key: 'show-youniverse-v1',
      channelName: 'show-your-youniverse',
      title: 'Show Your Youniverse',
      description:
        'Built something awesome with **Portals OS**, **Weaver**, or your **Oracle** squad? Drop it here so the whole Youniverse can see.',
      color: ROLE_COLORS.virtues,
      fields: [
        {
          name: 'Great Showcase Format',
          value:
            '• **Your handle / link:** `<handle>.itsyouonline.com`\n' +
            '• **What you built:** custom theme, Weaver widget, workflow, or deliverable\n' +
            '• **Screenshot or clip:** show it in action!',
        },
      ],
      footerNote: 'Community Showcase',
      pin: true,
    },
    {
      key: 'homeverse-showcase-v1',
      channelName: 'homeverse-showcase',
      title: 'Homeverse Showcase',
      description:
        'Every human gets a sovereign **Homeverse** at `<handle>.itsyouonline.com`. Share yours here so Citizens can tour your public face, desktop layout, custom themes, and personal space.',
      color: ROLE_COLORS.powers,
      fields: [
        {
          name: 'How to Share Your Homeverse',
          value:
            '• **Your Homeverse URL:** `<handle>.itsyouonline.com`\n' +
            '• **The vibe:** what your Homeverse is about (portfolio, studio, archive, hangout)\n' +
            '• **Screenshot:** drop a preview of your public face or Portals OS desktop!',
        },
      ],
      footerNote: 'Homeverse Gallery · ItsYouOnline',
      pin: true,
    },
    {
      key: 'weaver-widget-showcase-v1',
      channelName: 'weaver-widget-showcase',
      title: 'Weaver Widget Showcase',
      description:
        'Built a custom widget or generative UI applet inside **Weaver Studio**? Drop it here so Citizens can see what you forged in the sandbox.',
      color: ROLE_COLORS.dominions,
      fields: [
        {
          name: 'Widget Showcase Format',
          value:
            '• **Widget name & purpose:** what problem it solves or what it turns your desktop into\n' +
            '• **Prompt / concept:** the idea or prompt behind it\n' +
            '• **Screenshot or clip:** show your Weaver applet live in Portals OS!',
        },
      ],
      footerNote: 'Weaver Studio · Portals OS',
      pin: true,
    },
    {
      key: 'founders-lounge-v1',
      channelName: 'founders-lounge',
      title: 'Welcome to the Founders Lounge',
      description:
        'A quiet hall for **Genesis 001** and all **Founding** members — the earliest citizens helping shape ItsYouOnline and Portals OS from the ground floor.',
      color: ROLE_COLORS.genesis001,
      footerNote: 'Founding Hall · Genesis 001 & Founding Tiers',
      pin: true,
    },
    {
      key: 'angel-lounge-v1',
      channelName: 'angel-lounge',
      title: 'Founding Angel Sanctuary',
      description:
        'Welcome, Founding Angels, Archangels, and Cherubim. Early previews, release discussions, and direct founder conversation live here.',
      color: ROLE_COLORS.angel,
      footerNote: 'Tier Lounge · Founding Angel & Above',
      pin: true,
    },
    {
      key: 'archangel-lounge-v1',
      channelName: 'archangel-lounge',
      title: 'Archangel Inner Chamber',
      description:
        'Reserved for **Founding Archangels** and **Founding Cherubim**. Deeper architecture sessions, early experiments, and high-signal feedback.',
      color: ROLE_COLORS.archangel,
      footerNote: 'Tier Lounge · Founding Archangel & Above',
      pin: true,
    },
    {
      key: 'cherubim-lounge-v1',
      channelName: 'cherubim-lounge',
      title: 'Cherubim Sanctum',
      description:
        'The innermost lounge of The Youniverse, reserved for **Founding Cherubim** and Staff. Closest seat to the evolution of Portals OS.',
      color: ROLE_COLORS.cherubim,
      footerNote: 'Tier Lounge · Founding Cherubim',
      pin: true,
    },
    {
      key: 'club-announcements-v1',
      channelName: 'club-announcements',
      title: 'Club Youniverse — Coming Soon',
      description:
        'Sovereign radio, live stage sessions, builder showcases, and late-night transmissions across The Youniverse.\n\n' +
        'Settle into **club-lounge** or tune in to **club-stage** when live programming launches — **coming soon**.',
      color: ROLE_COLORS.dominions,
      footerNote: 'Club Youniverse · Coming Soon',
      pin: true,
    },
    {
      key: 'staff-handbook-v1',
      channelName: 'staff-chat',
      title: 'The Six Orders — Staff Coordination',
      description:
        'Private room for **Seraphim, Thrones, Dominions, Virtues, Powers, and Principality**.\n\n' +
        'All six staff roles carry focused moderation powers (**Manage Messages** and **Timeout Members**) to keep The Youniverse safe without unnecessary blast radius.',
      color: ROLE_COLORS.seraphim,
      fields: [
        {
          name: 'AutoMod & Audit Trail',
          value: 'Automated spam, mention-flood, and scam blocks post directly to **#mod-log**.',
        },
        {
          name: 'Safety Principle',
          value:
            'Paid ranks, Citizen, Genesis 001, and Unverified roles are locked at zero admin/mod powers.',
        },
      ],
      footerNote: 'Staff Operations · Six Orders',
      pin: true,
    },
  ],

  autoModRules: [
    {
      name: 'ItsYouOnline — Profanity & Slur Shield',
      kind: 'preset',
      alertChannelName: 'mod-log',
      exemptRoleNames: STAFF_ROLE_NAMES,
    },
    {
      name: 'ItsYouOnline — Anti-Spam Shield',
      kind: 'spam',
      alertChannelName: 'mod-log',
      exemptRoleNames: STAFF_ROLE_NAMES,
    },
    {
      name: 'ItsYouOnline — Mention Flood Shield',
      kind: 'mentionSpam',
      mentionTotalLimit: 5,
      alertChannelName: 'mod-log',
      exemptRoleNames: STAFF_ROLE_NAMES,
    },
    {
      name: 'ItsYouOnline — Scam & Phishing Guard',
      kind: 'keyword',
      keywords: [
        '*free nitro*',
        '*discord-nitro*',
        '*steamcommunlty*',
        '*claim your airdrop*',
        '*validate your wallet*',
        '*seed phrase*',
      ],
      alertChannelName: 'mod-log',
      exemptRoleNames: STAFF_ROLE_NAMES,
    },
  ],
};
