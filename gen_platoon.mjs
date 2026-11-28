import { readFileSync, writeFileSync } from 'fs';

const agents = JSON.parse(readFileSync("D:\\CSV's\\nexus-agents-2026-04-19.json", 'utf8'));

// Old squad name mappings
const SQUAD_META = {
  'SQUAD1': { name: 'LEGACY VAULT: Exit Readiness', colorHex: '#6366f1', colorName: 'Indigo', description: 'Transforms founder-run companies into sellable, chairman-led assets.' },
  
  // OPS IRON SPLITS (SQUAD2)
  'SQUAD2A': { name: 'OPS IRON: Foundation', colorHex: '#0d9488', colorName: 'Teal', description: 'Core SOPs, playbooks, and organizational workflows.' },
  'SQUAD2B': { name: 'OPS IRON: Automation', colorHex: '#0891b2', colorName: 'Cyan', description: 'Technical stacks, automation scripts, and data dictionaries.' },
  'SQUAD2C': { name: 'OPS IRON: Team & HR', colorHex: '#059669', colorName: 'Emerald', description: 'Hiring, training, and cultural alignment systems.' },
  'SQUAD2D': { name: 'OPS IRON: Resilience', colorHex: '#b91c1c', colorName: 'Red', description: 'Risk mitigation, crisis management, and change protocols.' },

  // CAPITAL FLOOR SPLITS (SQUAD3)
  'SQUAD3A': { name: 'CAPITAL FLOOR: Unit Economics', colorHex: '#dc2626', colorName: 'Crimson', description: 'Pricing matrices, unit economics, and margin audits.' },
  'SQUAD3B': { name: 'CAPITAL FLOOR: Fiscal Control', colorHex: '#991b1b', colorName: 'Maroon', description: 'Forecasting, budgeting, and 13-week cash flow models.' },

  'SQUAD4': { name: 'GROWTH ENGINE: Acquisition', colorHex: '#2563eb', colorName: 'Royal Blue', description: 'Acquisition roadmaps, hooks, and launch schedules.' },

  // CASH VELOCITY SPLITS (SQUAD5)
  'SQUAD5A': { name: 'CASH VELOCITY: Conversion', colorHex: '#06b6d4', colorName: 'Cyan', description: 'VSLs, DM scripts, and high-intensity closing protocols.' },
  'SQUAD5B': { name: 'CASH VELOCITY: Offer Scoping', colorHex: '#0891b2', colorName: 'Dark Cyan', description: 'Validated offers, scarcity, and scoping logic.' },
  'SQUAD5C': { name: 'CASH VELOCITY: Follow-up', colorHex: '#0e7490', colorName: 'Ocean', description: 'Jolt campaigns and automated follow-up sequences.' },

  'SQUAD6': { name: 'TRUST SHIELD: Compliance', colorHex: '#059669', colorName: 'Emerald', description: 'Redlined contracts and retention maps.' },

  // BRAND ALIVE SPLITS (SQUAD7)
  'SQUAD7A': { name: 'BRAND ALIVE: Identity', colorHex: '#db2777', colorName: 'Magenta', description: 'Brand voice, vision, and core narrative assets.' },
  'SQUAD7B': { name: 'BRAND ALIVE: Distribution', colorHex: '#be185d', colorName: 'Rose', description: 'Multi-channel distribution and syndication frequency.' },
  'SQUAD7C': { name: 'BRAND ALIVE: Tribal', colorHex: '#9d174d', colorName: 'Wine', description: 'Community engagement and tribal loyalty loops.' },

  'SQUAD8': { name: 'INTEL CORE: Recon', colorHex: '#ca8a04', colorName: 'Gold', description: 'North star roadmaps and competitive intel reports.' },
  'SQUAD9': { name: 'SIGNAL: SEO', colorHex: '#84cc16', colorName: 'Olive', description: 'SEO roadmaps and winnable keyword briefs.' },
  'SQUAD10': { name: 'CONVERT: Cart', colorHex: '#b45309', colorName: 'Copper', description: 'Optimized checkout pages and recovery sequences.' },
};

// Separate COMMAND (Oracle) from the rest
const oracleAgent = agents.find(a => a.squadId === 'COMMAND');
// Strip createdAt/updatedAt — they aren't in the NexusAgent interface
const nonCommandAgents = agents
  .filter(a => a.squadId !== 'COMMAND')
  .map(({ createdAt, updatedAt, ...rest }) => rest);

// ==== SPLIT LARGE SQUADS (Max ~8-10 agents) ====
const NEW_SQUAD_META = {};
for (const [squadId, meta] of Object.entries(SQUAD_META)) {
  const squadAgents = nonCommandAgents.filter(a => a.squadId === squadId);
  
  if (squadAgents.length > 10) {
    const numChunks = Math.ceil(squadAgents.length / 9);
    const chunkSize = Math.ceil(squadAgents.length / numChunks);
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    
    for (let i = 0; i < numChunks; i++) {
      const chunkAgents = squadAgents.slice(i * chunkSize, (i + 1) * chunkSize);
      const newSquadId = squadId + '_' + (i + 1);
      
      NEW_SQUAD_META[newSquadId] = {
        name: meta.name + ' ' + roman[i],
        colorHex: meta.colorHex,
        colorName: meta.colorName,
        description: meta.description
      };
      
      // Update the squadId for these agents in memory
      chunkAgents.forEach(a => a.squadId = newSquadId);
    }
  } else {
    NEW_SQUAD_META[squadId] = meta;
  }
}

const FINAL_SQUAD_META = NEW_SQUAD_META;

const CATEGORY_COLORS = {
  'Marketing': '#db2777',
  'Operations': '#0d9488',
  'Sales': '#06b6d4',
  'Finance': '#dc2626',
  'Strategy': '#6366f1',
  'HR': '#059669',
  'Product': '#8b5cf6',
  'Tech': '#84cc16',
  'Legal': '#ca8a04',
};

let output = `// ============================================================
// NEXUS AGENT SYSTEM — Auto-generated from nexus-agents-2026-04-19.json
// Total: ${agents.length} agents, ${Object.keys(FINAL_SQUAD_META).length} squads + 1 Oracle
// ============================================================

export interface NexusAgent {
  id: string;
  name: string;
  role: string;
  category: string;
  squadId: string;
  description: string;
  oracleInsight: string;
  color: string;
  icon: string;
  url: string;
  status: string;
  suggestedNextNode: string;
  suggestedPreviousNode: string;
  toolCard: {
    purpose: string;
    useThisWhen: string[];
    inputNeeded: string;
    outputDelivered: string[];
    doNotUseWhen: string[];
    useCases: string[];
  };
}

export interface NexusSquad {
  id: string;
  name: string;
  colorHex: string;
  colorName: string;
  description: string;
  agentIds: string[];
}

// ==========================================
// THE ORACLE (COMMAND SQUAD)
// ==========================================
export const ORACLE_NODE = {
  id: "${oracleAgent.id}",
  name: "${oracleAgent.name}",
  role: "${oracleAgent.role}",
  domain: "itsyouonline.com",
  description: ${JSON.stringify(oracleAgent.description)},
  oracleInsight: ${JSON.stringify(oracleAgent.oracleInsight)},
  icon: "${oracleAgent.icon}",
  colorHex: "#00ffff",
};

// ==========================================
// CATEGORY COLORS (for category-based views)
// ==========================================
export const CATEGORY_COLORS: Record<string, string> = ${JSON.stringify(CATEGORY_COLORS, null, 2)};

// ==========================================
// ALL 166 DIAGNOSTIC AGENTS (excludes Oracle)
// ==========================================
export const NEXUS_AGENTS: NexusAgent[] = ${JSON.stringify(nonCommandAgents, null, 2)};

// ==========================================
// THE SQUADS (PROMOTIONAL PACKAGES)
// ==========================================
export const NEXUS_SQUADS: NexusSquad[] = [
`;

// Build squad data
for (const squadId of Object.keys(FINAL_SQUAD_META).sort()) {
  const meta = FINAL_SQUAD_META[squadId];
  const squadAgentIds = nonCommandAgents.filter(a => a.squadId === squadId).map(a => a.id);
  output += `  {
    id: "${squadId}",
    name: ${JSON.stringify(meta.name)},
    colorHex: "${meta.colorHex}",
    colorName: "${meta.colorName}",
    description: ${JSON.stringify(meta.description)},
    agentIds: ${JSON.stringify(squadAgentIds)},
  },
`;
}

output += `];

// ==========================================
// HELPERS
// ==========================================
export const getAgentById = (agentId: string): NexusAgent | undefined =>
  NEXUS_AGENTS.find(a => a.id === agentId);

export const getSquadById = (squadId: string): NexusSquad | undefined =>
  NEXUS_SQUADS.find(s => s.id === squadId);

export const getAgentsByCategory = (category: string): NexusAgent[] =>
  NEXUS_AGENTS.filter(a => a.category === category);

export const getAgentsBySquad = (squadId: string): NexusAgent[] =>
  NEXUS_AGENTS.filter(a => a.squadId === squadId);

export const ALL_CATEGORIES = [...new Set(NEXUS_AGENTS.map(a => a.category))].sort();

// ==========================================
// LEGACY COMPATIBILITY (for gradual migration)
// ==========================================
export interface PlatoonNode {
  id: string;
  name: string;
  role: string;
  pain: string;
  artifact: string;
  purpose: string;
  mission: string;
  preFlight: { deployWhen: string; abstainWhen: string; };
  inputs: string;
  deliverables: string[];
  oracleInsight: string;
  prevNode: string;
  nextNode: string;
}

export interface PlatoonDomain {
  id: string;
  name: string;
  url: string;
  colorName: string;
  colorHex: string;
  description: string;
  nodes: PlatoonNode[];
}

export interface PlatoonSquad {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

// Legacy empty arrays (all data now in NEXUS_AGENTS/NEXUS_SQUADS)
export const PLATOON_DOMAINS: PlatoonDomain[] = [];
export const PLATOON_SQUADS: PlatoonSquad[] = NEXUS_SQUADS.map(s => ({
  id: s.id,
  name: s.name,
  description: s.description,
  nodeIds: s.agentIds,
}));

export const getNodeById = (nodeId: string): PlatoonNode | undefined => undefined;
`;

writeFileSync('d:\\\\Portals OS\\\\portals-os\\\\constants\\\\platoon.ts', output, 'utf8');
console.log(`Generated platoon.ts with ${nonCommandAgents.length} agents and ${Object.keys(FINAL_SQUAD_META).length} squads`);
