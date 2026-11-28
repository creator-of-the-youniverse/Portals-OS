// ============================================================
// NEXUS AGENT SYSTEM — Auto-generated from nexus-agents-2026-04-19.json
// Total: 167 agents, 27 squads + 1 Oracle
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
  id: "TOSO",
  name: "The Oracle",
  role: "System Orchestrator",
  domain: "itsyouonline.com",
  description: "The core consciousness and administrative interface of the Nexus system, specializing in customized workflow generation.",
  oracleInsight: "My current focus: Orchestrating your strategic dominance.",
  icon: "🔮",
  colorHex: "#00ffff",
};

// ==========================================
// CATEGORY COLORS (for category-based views)
// ==========================================
export const CATEGORY_COLORS: Record<string, string> = {
  "Marketing": "#db2777",
  "Operations": "#0d9488",
  "Sales": "#06b6d4",
  "Finance": "#dc2626",
  "Strategy": "#6366f1",
  "HR": "#059669",
  "Product": "#8b5cf6",
  "Tech": "#84cc16",
  "Legal": "#ca8a04"
};

// ==========================================
// ALL 166 DIAGNOSTIC AGENTS (excludes Oracle)
// ==========================================
export const NEXUS_AGENTS: NexusAgent[] = [
  {
    "id": "AC",
    "name": "Arbiter",
    "role": "Contracts",
    "category": "Legal",
    "squadId": "SQUAD6",
    "description": "Shreds legal ambiguity to secure maximum leverage and IP protection.",
    "oracleInsight": "Shredding legal ambiguity to secure absolute sovereign leverage.",
    "color": "from-slate-600 to-slate-800",
    "icon": "⚖️",
    "url": "https://contracts.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CF",
    "suggestedPreviousNode": "GL",
    "toolCard": {
      "purpose": "Shreds legal ambiguity to secure maximum leverage and IP protection.",
      "useThisWhen": [
        "Drafting new agreements",
        "Reviewing legal exposure",
        "Locking in IP"
      ],
      "inputNeeded": "Draft contract; Counter-party history.",
      "outputDelivered": [
        "Redlined Document",
        "Risk-Exposure Report"
      ],
      "doNotUseWhen": [
        "No legal documents exist yet"
      ],
      "useCases": [
        "Redlining liability",
        "IP protection",
        "Enforcing payment triggers"
      ]
    }
  },
  {
    "id": "AS",
    "name": "Apex",
    "role": "Strategy",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Defines the highest-level strategic objectives and market dominance vectors.",
    "oracleInsight": "Architecting the North Star vector for total market supremacy.",
    "color": "from-indigo-900 to-slate-900",
    "icon": "/agent-icons/🏔️.png",
    "url": "https://strategy.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BV",
    "suggestedPreviousNode": "RD",
    "toolCard": {
      "purpose": "Defines the highest-level strategic objectives and market dominance vectors.",
      "useThisWhen": [
        "Vision is blurry",
        "Entering new markets",
        "Seeking dominance"
      ],
      "inputNeeded": "Market landscape; Resource inventory.",
      "outputDelivered": [
        "North Star Objective",
        "Market Dominance Roadmap"
      ],
      "doNotUseWhen": [
        "Stuck in tactical fires"
      ],
      "useCases": [
        "Service-to-Platform transition",
        "Niche dominance"
      ]
    }
  },
  {
    "id": "BR",
    "name": "Bulwark",
    "role": "Retention",
    "category": "Operations",
    "squadId": "SQUAD6",
    "description": "Guards the customer relationship to prevent churn and ensure continuity.",
    "oracleInsight": "Fortifying the perimeter to render client churn mathematically impossible.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://retention.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MR",
    "suggestedPreviousNode": "LC",
    "toolCard": {
      "purpose": "Guards the customer relationship to prevent churn and ensure continuity.",
      "useThisWhen": [
        "Churn rates are spiking",
        "Customer sentiment is low"
      ],
      "inputNeeded": "Usage data; Churn alerts; Client feedback.",
      "outputDelivered": [
        "Retention Strategy",
        "Churn Risk Map"
      ],
      "doNotUseWhen": [
        "You have no active customers"
      ],
      "useCases": [
        "Pre-emptive save",
        "Onboarding verification"
      ]
    }
  },
  {
    "id": "BV",
    "name": "Bridge",
    "role": "Validation",
    "category": "Strategy",
    "squadId": "SQUAD5B",
    "description": "Validates the connection between the high-level offer and the 'bleeding neck' problem.",
    "oracleInsight": "Calibrating the offer to strike the market's bleeding neck artery.",
    "color": "from-blue-800 to-indigo-900",
    "icon": "🌉",
    "url": "https://validation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DG",
    "suggestedPreviousNode": "AS",
    "toolCard": {
      "purpose": "Validates the connection between the high-level offer and the 'bleeding neck' problem.",
      "useThisWhen": [
        "Launching new offers",
        "Sales are inconsistent"
      ],
      "inputNeeded": "Customer interviews; Offer draft.",
      "outputDelivered": [
        "Validation Score",
        "Offer Refinement"
      ],
      "doNotUseWhen": [
        "Strategy (Apex) is undefined"
      ],
      "useCases": [
        "Problem-Solution fit",
        "Offer stress-test"
      ]
    }
  },
  {
    "id": "CP",
    "name": "Centurion",
    "role": "Pricing",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Architects the price floor and ceiling for maximum structural profit.",
    "oracleInsight": "Enforcing a pricing architecture that mandates maximum profit extraction.",
    "color": "from-amber-500 to-yellow-600",
    "icon": "/agent-icons/🏛️.png",
    "url": "https://pricing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CF",
    "suggestedPreviousNode": "BV",
    "toolCard": {
      "purpose": "Architects the price floor and ceiling for maximum structural profit.",
      "useThisWhen": [
        "Margins are eroding",
        "Launching a new tier"
      ],
      "inputNeeded": "Delivery costs; Market comps; Desired margins.",
      "outputDelivered": [
        "Pricing Matrix",
        "Profit Floor Analysis"
      ],
      "doNotUseWhen": [
        "Costs are unknown"
      ],
      "useCases": [
        "Tiered pricing build",
        "Discount thresholding"
      ]
    }
  },
  {
    "id": "CF",
    "name": "Core",
    "role": "Finance",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Audits the financial engine to ensure scalability and structural profit.",
    "oracleInsight": "Auditing the economic engine for infinite structural scalability.",
    "color": "from-blue-600 to-blue-800",
    "icon": "💠",
    "url": "https://finance.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "YP",
    "suggestedPreviousNode": "CP",
    "toolCard": {
      "purpose": "Audits the financial engine to ensure scalability and structural profit.",
      "useThisWhen": [
        "Scaling revenue",
        "Profit is low"
      ],
      "inputNeeded": "P&L; Unit economics.",
      "outputDelivered": [
        "Unit Economic Audit",
        "Profit Optimization Model"
      ],
      "doNotUseWhen": [
        "No revenue exists"
      ],
      "useCases": [
        "SaaS pricing audit",
        "Enterprise CAC calc"
      ]
    }
  },
  {
    "id": "DH",
    "name": "Dynamo",
    "role": "Hooks",
    "category": "Marketing",
    "squadId": "SQUAD4",
    "description": "Generates high-velocity, scroll-stopping attention in the first 3 seconds.",
    "oracleInsight": "Igniting high-velocity attention spikes to arrest the scroll instantly.",
    "color": "from-orange-500 to-red-500",
    "icon": "🧨",
    "url": "https://hooks.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ES",
    "suggestedPreviousNode": "QC",
    "toolCard": {
      "purpose": "Generates high-velocity, scroll-stopping attention in the first 3 seconds.",
      "useThisWhen": [
        "Ads are ignored",
        "CTR is low"
      ],
      "inputNeeded": "Offer core; Audience pain points.",
      "outputDelivered": [
        "10 High-Heat Hooks",
        "Creative Direction"
      ],
      "doNotUseWhen": [
        "The offer core is undefined"
      ],
      "useCases": [
        "VSL Intro",
        "Ad hook"
      ]
    }
  },
  {
    "id": "DG",
    "name": "Drive",
    "role": "Growth",
    "category": "Marketing",
    "squadId": "SQUAD4",
    "description": "Generates high-intent traffic mechanisms and acquisition logic.",
    "oracleInsight": "Engineering the high-intent traffic systems for massive acquisition volume.",
    "color": "from-cyan-600 to-teal-700",
    "icon": "/agent-icons/🏎️.png",
    "url": "https://growth.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC",
    "suggestedPreviousNode": "BV",
    "toolCard": {
      "purpose": "Generates high-intent traffic mechanisms and acquisition logic.",
      "useThisWhen": [
        "Need more leads",
        "Traffic is flat"
      ],
      "inputNeeded": "Ad budget; Target traffic.",
      "outputDelivered": [
        "Acquisition Roadmap",
        "Traffic Model"
      ],
      "doNotUseWhen": [
        "Funnel is leaky"
      ],
      "useCases": [
        "Paid acquisition plan",
        "Organic growth engine"
      ]
    }
  },
  {
    "id": "ES",
    "name": "Echo",
    "role": "Social",
    "category": "Marketing",
    "squadId": "SQUAD7B",
    "description": "Creates brand omnipresence by distributing messages across all platforms.",
    "oracleInsight": "Broadcasting your signal across all frequencies for total omni-presence.",
    "color": "from-cyan-400 to-blue-500",
    "icon": "📣",
    "url": "https://social.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "EA",
    "suggestedPreviousNode": "DH",
    "toolCard": {
      "purpose": "Creates brand omnipresence by distributing messages across all platforms.",
      "useThisWhen": [
        "Reach is limited",
        "Message is inconsistent"
      ],
      "inputNeeded": "Primary asset; Target platforms.",
      "outputDelivered": [
        "Distribution Map",
        "Engagement Protocol"
      ],
      "doNotUseWhen": [
        "No content assets exist"
      ],
      "useCases": [
        "Multi-channel scheduling",
        "Brand voice sync"
      ]
    }
  },
  {
    "id": "EA",
    "name": "Expand",
    "role": "Amplification",
    "category": "Marketing",
    "squadId": "SQUAD4",
    "description": "Maximizes brand amplification through multiplication and high-tier PR.",
    "oracleInsight": "Multiplying authority vectors through high-tier industrial amplification.",
    "color": "from-sky-500 to-cyan-600",
    "icon": "📡",
    "url": "https://amplification.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RS",
    "suggestedPreviousNode": "ES",
    "toolCard": {
      "purpose": "Maximizes brand amplification through multiplication and high-tier PR.",
      "useThisWhen": [
        "Brand is unknown",
        "Need authority"
      ],
      "inputNeeded": "Brand assets; Media list.",
      "outputDelivered": [
        "Amplification Map",
        "Reach Forecast"
      ],
      "doNotUseWhen": [
        "Message is not defined"
      ],
      "useCases": [
        "PR campaign design",
        "Influencer syndication"
      ]
    }
  },
  {
    "id": "FO",
    "name": "Frontier",
    "role": "Outreach",
    "category": "Sales",
    "squadId": "SQUAD4",
    "description": "Bridges the gap from 'cold' to 'sold' through direct engagement.",
    "oracleInsight": "Piercing cold markets to extract high-ticket capital.",
    "color": "from-green-600 to-emerald-700",
    "icon": "⛺",
    "url": "https://outreach.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "JD",
    "suggestedPreviousNode": "DG",
    "toolCard": {
      "purpose": "Bridges the gap from 'cold' to 'sold' through direct engagement.",
      "useThisWhen": [
        "Inbound leads are low",
        "Breaking into new markets"
      ],
      "inputNeeded": "Lead list; Offer validation.",
      "outputDelivered": [
        "Outreach Scripts",
        "Lead Response Map"
      ],
      "doNotUseWhen": [
        "Offer is not validated"
      ],
      "useCases": [
        "Cold email sequence",
        "LinkedIn outreach"
      ]
    }
  },
  {
    "id": "FA",
    "name": "Flux",
    "role": "Agility",
    "category": "Strategy",
    "squadId": "SQUAD3B_1",
    "description": "Engineers rapid pivots to exploit market shifts and economic changes.",
    "oracleInsight": "Engineering rapid tactical pivots to exploit market chaos.",
    "color": "from-teal-500 to-emerald-600",
    "icon": "🌊",
    "url": "https://agility.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VF",
    "suggestedPreviousNode": "CT",
    "toolCard": {
      "purpose": "Engineers rapid pivots to exploit market shifts and economic changes.",
      "useThisWhen": [
        "Market is changing",
        "Competitors disrupted"
      ],
      "inputNeeded": "Market news; Internal stats.",
      "outputDelivered": [
        "Pivot Protocol",
        "Agility Scorecard"
      ],
      "doNotUseWhen": [
        "Stable growth phase"
      ],
      "useCases": [
        "Market-shift response",
        "Crisis pivot"
      ]
    }
  },
  {
    "id": "GL",
    "name": "Garrison",
    "role": "Legal",
    "category": "Legal",
    "squadId": "SQUAD6",
    "description": "Scrubs all assets for compliance, policy, and institutional risk.",
    "oracleInsight": "Sanitizing all asset classes for institutional-grade compliance.",
    "color": "from-gray-600 to-gray-800",
    "icon": "🏯",
    "url": "https://legal.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AC",
    "suggestedPreviousNode": "SC",
    "toolCard": {
      "purpose": "Scrubs all assets for compliance, policy, and institutional risk.",
      "useThisWhen": [
        "Launching regulated products",
        "Publishing sensitive copy"
      ],
      "inputNeeded": "Marketing copy; Landing pages.",
      "outputDelivered": [
        "Compliance Audit",
        "Safe-Copy Revision"
      ],
      "doNotUseWhen": [
        "Drafts are too early stage"
      ],
      "useCases": [
        "Ad policy check",
        "GDPR/Terms audit"
      ]
    }
  },
  {
    "id": "GS",
    "name": "Grid",
    "role": "Systems",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Builds the scalable infrastructure and deep architectural SOPs.",
    "oracleInsight": "Constructing the industrial-grade lattice for infinite operational scale.",
    "color": "from-emerald-600 to-green-700",
    "icon": "🏁",
    "url": "https://systems.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SC",
    "suggestedPreviousNode": "NS",
    "toolCard": {
      "purpose": "Builds the scalable infrastructure and deep architectural SOPs.",
      "useThisWhen": [
        "Scaling operations",
        "Chaos is increasing"
      ],
      "inputNeeded": "Current workflows; Resource list.",
      "outputDelivered": [
        "Systems Map",
        "Infrastructure SOP"
      ],
      "doNotUseWhen": [
        "Pre-product market fit"
      ],
      "useCases": [
        "Scaling infrastructure",
        "Backend build"
      ]
    }
  },
  {
    "id": "HP",
    "name": "Hush",
    "role": "PR",
    "category": "Marketing",
    "squadId": "SQUAD6",
    "description": "Neutralizes friction and manages reputation in high-stress environments.",
    "oracleInsight": "Silencing reputational friction before it breaches the containment field.",
    "color": "from-slate-700 to-black",
    "icon": "🤫",
    "url": "https://pr.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VP",
    "suggestedPreviousNode": "WR",
    "toolCard": {
      "purpose": "Neutralizes friction and manages reputation in high-stress environments.",
      "useThisWhen": [
        "Negative press hits",
        "Crisis emerging"
      ],
      "inputNeeded": "Negative signal; Public record.",
      "outputDelivered": [
        "Response Script",
        "Damage Control Plan"
      ],
      "doNotUseWhen": [
        "Environment is stable"
      ],
      "useCases": [
        "Crisis management",
        "Brand protection"
      ]
    }
  },
  {
    "id": "HT",
    "name": "Hive",
    "role": "Tribal",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Engineers tribal loyalty, audience engagement, and community logic.",
    "oracleInsight": "Engineering deep tribal loyalty to weaponize your audience.",
    "color": "from-green-500 to-lime-600",
    "icon": "🐝",
    "url": "https://tribal.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OL",
    "suggestedPreviousNode": "MR",
    "toolCard": {
      "purpose": "Engineers tribal loyalty, audience engagement, and community logic.",
      "useThisWhen": [
        "Building a movement",
        "Engagement is key"
      ],
      "inputNeeded": "User base; Engagement metrics.",
      "outputDelivered": [
        "Tribal Strategy",
        "Engagement Map"
      ],
      "doNotUseWhen": [
        "Transactional model only"
      ],
      "useCases": [
        "Community launch",
        "Viral challenge"
      ]
    }
  },
  {
    "id": "IT",
    "name": "Infra",
    "role": "Tech",
    "category": "Tech",
    "squadId": "SQUAD2B",
    "description": "Builds the logic bridges and technical stack required for scale.",
    "oracleInsight": "Fusing the technical stack into a singular self-driving organism.",
    "color": "from-indigo-500 to-purple-600",
    "icon": "/agent-icons/🏗️.png",
    "url": "https://tech.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "XRF",
    "suggestedPreviousNode": "RI",
    "toolCard": {
      "purpose": "Builds the logic bridges and technical stack required for scale.",
      "useThisWhen": [
        "Tools are disconnected",
        "Scaling breaks systems"
      ],
      "inputNeeded": "Tool list; API documentation.",
      "outputDelivered": [
        "Stack Map",
        "Technical Specs"
      ],
      "doNotUseWhen": [
        "Process is not defined"
      ],
      "useCases": [
        "Stack integration",
        "Database mapping"
      ]
    }
  },
  {
    "id": "IR",
    "name": "Intel",
    "role": "Research",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Mines competitive data for hidden insights and 'Blue Ocean' advantages.",
    "oracleInsight": "Extracting deep-web competitor intelligence for asymmetric advantage.",
    "color": "from-lime-600 to-yellow-600",
    "icon": "/agent-icons/🕵️.png",
    "url": "https://research.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RD",
    "suggestedPreviousNode": "RI",
    "toolCard": {
      "purpose": "Mines competitive data for hidden insights and 'Blue Ocean' advantages.",
      "useThisWhen": [
        "Strategy is blind",
        "Competitors are winning"
      ],
      "inputNeeded": "Rival URLs; Industry data.",
      "outputDelivered": [
        "Intel Report",
        "Competitive Edge Map"
      ],
      "doNotUseWhen": [
        "Overwhelmed with data"
      ],
      "useCases": [
        "Funnel autopsy",
        "Gap analysis"
      ]
    }
  },
  {
    "id": "JD",
    "name": "Juno",
    "role": "DMs",
    "category": "Sales",
    "squadId": "SQUAD5A",
    "description": "Snipe appointments through 1-on-1 direct message conversations.",
    "oracleInsight": "Sniping high-value targets directly from the inbox with surgical precision.",
    "color": "from-pink-500 to-rose-600",
    "icon": "🏹",
    "url": "https://dms.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC",
    "suggestedPreviousNode": "FO",
    "toolCard": {
      "purpose": "Snipe appointments through 1-on-1 direct message conversations.",
      "useThisWhen": [
        "Leads are in inbox",
        "High-ticket sales"
      ],
      "inputNeeded": "Inbox access; Appointment calendar.",
      "outputDelivered": [
        "DM Script Set",
        "Booking Confirmation"
      ],
      "doNotUseWhen": [
        "Traffic is zero"
      ],
      "useCases": [
        "Lead qualification",
        "Objection handling"
      ]
    }
  },
  {
    "id": "JS",
    "name": "Jolt",
    "role": "Sales",
    "category": "Sales",
    "squadId": "SQUAD5C_1",
    "description": "Shocks stagnant leads or inactive systems into immediate cash-flow action.",
    "oracleInsight": "Administering a high-voltage shock to resurrect dead capital.",
    "color": "from-yellow-500 to-orange-600",
    "icon": "🔋",
    "url": "https://sales.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC",
    "suggestedPreviousNode": "VP",
    "toolCard": {
      "purpose": "Shocks stagnant leads or inactive systems into immediate cash-flow action.",
      "useThisWhen": [
        "Cash flow urgency",
        "Leads are stalling"
      ],
      "inputNeeded": "Dead list; Cash need.",
      "outputDelivered": [
        "Jolt Campaign",
        "Cash Spike Model"
      ],
      "doNotUseWhen": [
        "Pipeline is full and moving"
      ],
      "useCases": [
        "Flash sale shock",
        "Deadline pressure"
      ]
    }
  },
  {
    "id": "KV",
    "name": "Kinetix",
    "role": "VSLs",
    "category": "Marketing",
    "squadId": "SQUAD5A",
    "description": "Scripts high-intensity Video Sales Letters that convert at scale.",
    "oracleInsight": "Scripting the visual neural pathways for automated conversion at scale.",
    "color": "from-red-600 to-orange-600",
    "icon": "🎥",
    "url": "https://vsls.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DG",
    "suggestedPreviousNode": "QC",
    "toolCard": {
      "purpose": "Scripts high-intensity Video Sales Letters that convert at scale.",
      "useThisWhen": [
        "Conversions are low",
        "Explaining complex offers"
      ],
      "inputNeeded": "Product specs; Testimonials.",
      "outputDelivered": [
        "Full Script",
        "Storyboard"
      ],
      "doNotUseWhen": [
        "Offer is weak"
      ],
      "useCases": [
        "Long-form VSL",
        "60-second 'Short' VSL"
      ]
    }
  },
  {
    "id": "KS",
    "name": "Knot",
    "role": "Scarcity",
    "category": "Marketing",
    "squadId": "SQUAD5B",
    "description": "Uses gates, limits, and waitlists to increase perceived value and demand.",
    "oracleInsight": "Constricting supply with surgical scarcity gates to force immediate demand.",
    "color": "from-orange-600 to-red-600",
    "icon": "🪢",
    "url": "https://scarcity.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DG",
    "suggestedPreviousNode": "BV",
    "toolCard": {
      "purpose": "Uses gates, limits, and waitlists to increase perceived value and demand.",
      "useThisWhen": [
        "Demand is high",
        "Exclusivity needed"
      ],
      "inputNeeded": "Available slots; Current demand.",
      "outputDelivered": [
        "Scarcity Protocol",
        "Value Gate Plan"
      ],
      "doNotUseWhen": [
        "Demand is low"
      ],
      "useCases": [
        "Waitlist strategy",
        "Application-only logic"
      ]
    }
  },
  {
    "id": "LI",
    "name": "Locus",
    "role": "Intent",
    "category": "Marketing",
    "squadId": "SQUAD5C_1",
    "description": "Tracks 'ready-to-buy' behavior patterns and identifying hot leads.",
    "oracleInsight": "Triangulating the exact digital coordinates of high-intent buyers.",
    "color": "from-blue-500 to-cyan-500",
    "icon": "🎯",
    "url": "https://intent.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "JD",
    "suggestedPreviousNode": "RS",
    "toolCard": {
      "purpose": "Tracks 'ready-to-buy' behavior patterns and identifying hot leads.",
      "useThisWhen": [
        "Leads are cold",
        "Retargeting is generic"
      ],
      "inputNeeded": "Pixel data; Website heatmaps.",
      "outputDelivered": [
        "Lead Intent Score",
        "Retargeting Map"
      ],
      "doNotUseWhen": [
        "No tracking data available"
      ],
      "useCases": [
        "Behavior scoring",
        "Retargeting logic"
      ]
    }
  },
  {
    "id": "LC",
    "name": "Link",
    "role": "Closing",
    "category": "Sales",
    "squadId": "SQUAD5A",
    "description": "Converts interest into high-ticket transactions with zero friction.",
    "oracleInsight": "Fusing high-intent signal into high-ticket transaction reality.",
    "color": "from-red-600 to-rose-700",
    "icon": "🔗",
    "url": "https://closing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CF",
    "suggestedPreviousNode": "DG",
    "toolCard": {
      "purpose": "Converts interest into high-ticket transactions with zero friction.",
      "useThisWhen": [
        "High leads, low sales",
        "Closing rate is poor"
      ],
      "inputNeeded": "Qualified lead; Closing script.",
      "outputDelivered": [
        "Closing Protocol",
        "Conversion Audit"
      ],
      "doNotUseWhen": [
        "No qualified leads"
      ],
      "useCases": [
        "Closing call script",
        "One-click checkout"
      ]
    }
  },
  {
    "id": "MR",
    "name": "Midas",
    "role": "Referrals",
    "category": "Marketing",
    "squadId": "SQUAD4",
    "description": "Turns client wins into structural, automated referral events.",
    "oracleInsight": "Transmuting client success into a perpetual viral growth loop.",
    "color": "from-yellow-400 to-amber-500",
    "icon": "🥇",
    "url": "https://referrals.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "HT",
    "suggestedPreviousNode": "BR",
    "toolCard": {
      "purpose": "Turns client wins into structural, automated referral events.",
      "useThisWhen": [
        "Clients are happy but silent",
        "Seeking viral loops"
      ],
      "inputNeeded": "Success story; Client list.",
      "outputDelivered": [
        "Referral SOP",
        "Affiliate Link Map"
      ],
      "doNotUseWhen": [
        "Product quality is low"
      ],
      "useCases": [
        "Referral loop build",
        "Reward system"
      ]
    }
  },
  {
    "id": "MP",
    "name": "Mind",
    "role": "Psychology",
    "category": "Marketing",
    "squadId": "SQUAD5C_1",
    "description": "Leverages behavioral economics and buyer psychology to influence choice.",
    "oracleInsight": "Decoding the buyer's neural map to bypass all psychological resistance.",
    "color": "from-rose-600 to-pink-700",
    "icon": "🧠",
    "url": "https://psychology.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC",
    "suggestedPreviousNode": "QC",
    "toolCard": {
      "purpose": "Leverages behavioral economics and buyer psychology to influence choice.",
      "useThisWhen": [
        "Conversion logic fails",
        "Persuasion needed"
      ],
      "inputNeeded": "Persona profile; Current copy.",
      "outputDelivered": [
        "Psychological Profile",
        "Influence Strategy"
      ],
      "doNotUseWhen": [
        "Product is utility only"
      ],
      "useCases": [
        "Status-vs-Savings test",
        "Reciprocity loop"
      ]
    }
  },
  {
    "id": "NS",
    "name": "Net",
    "role": "SOPs",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Turns messy manual tasks into clean, industrial Standard Operating Procedures.",
    "oracleInsight": "Crystallizing operational chaos into rigid industrial-grade protocols.",
    "color": "from-slate-500 to-gray-600",
    "icon": "🔗",
    "url": "https://sops.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "GS",
    "suggestedPreviousNode": "UW",
    "toolCard": {
      "purpose": "Turns messy manual tasks into clean, industrial Standard Operating Procedures.",
      "useThisWhen": [
        "Team is confused",
        "Quality is inconsistent"
      ],
      "inputNeeded": "Task recording; Desired outcome.",
      "outputDelivered": [
        "Step-by-Step SOP",
        "Operational Map"
      ],
      "doNotUseWhen": [
        "Task is a one-off event"
      ],
      "useCases": [
        "Onboarding SOP",
        "Fulfillment checklist"
      ]
    }
  },
  {
    "id": "NA",
    "name": "Node",
    "role": "Automation",
    "category": "Tech",
    "squadId": "SQUAD2B",
    "description": "Connects disparate tools into a single self-driving 'Sovereign Machine'.",
    "oracleInsight": "Weaving the automated nervous system of your sovereign machine.",
    "color": "from-purple-600 to-indigo-700",
    "icon": "/agent-icons/🕸️.png",
    "url": "https://automation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "QM",
    "suggestedPreviousNode": "IT",
    "toolCard": {
      "purpose": "Connects disparate tools into a single self-driving 'Sovereign Machine'.",
      "useThisWhen": [
        "Manual tasks overwhelming",
        "Systems disconnected"
      ],
      "inputNeeded": "App list; API keys.",
      "outputDelivered": [
        "Automation Script",
        "Data Flow Map"
      ],
      "doNotUseWhen": [
        "Process is undefined"
      ],
      "useCases": [
        "Lead-to-Sale automation",
        "CRM sync"
      ]
    }
  },
  {
    "id": "OE",
    "name": "Omega",
    "role": "Exit",
    "category": "Strategy",
    "squadId": "SQUAD1",
    "description": "Audits the business for 'Built-to-Sell' scores and exit readiness.",
    "oracleInsight": "Calculating the precise coordinates for your final sovereign exit event.",
    "color": "from-violet-600 to-purple-800",
    "icon": "Ω",
    "url": "https://exit.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ZL",
    "suggestedPreviousNode": "YP",
    "toolCard": {
      "purpose": "Audits the business for 'Built-to-Sell' scores and exit readiness.",
      "useThisWhen": [
        "Preparing to sell",
        "Valuation is unclear"
      ],
      "inputNeeded": "3-year P&L; Operational manuals.",
      "outputDelivered": [
        "Exit Scorecard",
        "Sellability Report"
      ],
      "doNotUseWhen": [
        "Business is in infancy"
      ],
      "useCases": [
        "Multiplier audit",
        "Broker prep"
      ]
    }
  },
  {
    "id": "OL",
    "name": "Orbit",
    "role": "Loops",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Designs retention loops that keep customers within the ecosystem forever.",
    "oracleInsight": "Designing inescapable gravitational loops for infinite lifetime value.",
    "color": "from-indigo-600 to-blue-700",
    "icon": "🪐",
    "url": "https://loops.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "YP",
    "suggestedPreviousNode": "HT",
    "toolCard": {
      "purpose": "Designs retention loops that keep customers within the ecosystem forever.",
      "useThisWhen": [
        "LTV is limited",
        "Churn is an issue"
      ],
      "inputNeeded": "Renewal rate; Product map.",
      "outputDelivered": [
        "Orbit Strategy",
        "LTV Projection"
      ],
      "doNotUseWhen": [
        "One-time purchase model"
      ],
      "useCases": [
        "Retention loop build",
        "Habit-forming UX"
      ]
    }
  },
  {
    "id": "PC",
    "name": "Pulse",
    "role": "Clips",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Shreds long-form video content into 50+ high-engagement micro-assets.",
    "oracleInsight": "Fragmenting core assets into a swarm of high-velocity micro-content.",
    "color": "from-pink-500 to-red-500",
    "icon": "💓",
    "url": "https://clips.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ES",
    "suggestedPreviousNode": "KV",
    "toolCard": {
      "purpose": "Shreds long-form video content into 50+ high-engagement micro-assets.",
      "useThisWhen": [
        "Long content exists",
        "Maximizing content ROI"
      ],
      "inputNeeded": "Raw video file; Brand guidelines.",
      "outputDelivered": [
        "Asset Library",
        "Caption Set"
      ],
      "doNotUseWhen": [
        "No long-form source material"
      ],
      "useCases": [
        "TikTok/Reels edit",
        "Newsletter snippet"
      ]
    }
  },
  {
    "id": "PQ",
    "name": "Prime",
    "role": "Quality",
    "category": "Product",
    "squadId": "SQUAD3B_1",
    "description": "Refines the core product/service to a world-class, undisputed standard.",
    "oracleInsight": "Refining the core asset into an undisputed global standard of excellence.",
    "color": "from-blue-600 to-cyan-700",
    "icon": "💎",
    "url": "https://quality.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BV",
    "suggestedPreviousNode": "SP",
    "toolCard": {
      "purpose": "Refines the core product/service to a world-class, undisputed standard.",
      "useThisWhen": [
        "Competition is high",
        "Premium positioning"
      ],
      "inputNeeded": "Product reviews; Feature list.",
      "outputDelivered": [
        "Product Audit",
        "Quality Roadmap"
      ],
      "doNotUseWhen": [
        "MVP phase"
      ],
      "useCases": [
        "UI/UX refinement",
        "Fulfillment speed"
      ]
    }
  },
  {
    "id": "QC",
    "name": "Quark",
    "role": "Copy",
    "category": "Marketing",
    "squadId": "SQUAD5C_1",
    "description": "Logic-tests every headline and sentence for maximum conversion.",
    "oracleInsight": "Logic-testing every syllable for absolute conversion efficiency.",
    "color": "from-teal-400 to-teal-600",
    "icon": "✒️",
    "url": "https://copy.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DH",
    "suggestedPreviousNode": "SI",
    "toolCard": {
      "purpose": "Logic-tests every headline and sentence for maximum conversion.",
      "useThisWhen": [
        "Copy isn't converting",
        "A/B testing"
      ],
      "inputNeeded": "Draft copy; Target persona.",
      "outputDelivered": [
        "Optimized Copy",
        "Logic Score"
      ],
      "doNotUseWhen": [
        "Offer is undefined"
      ],
      "useCases": [
        "Sales page edit",
        "A/B headline test"
      ]
    }
  },
  {
    "id": "QM",
    "name": "Quota",
    "role": "Metrics",
    "category": "Finance",
    "squadId": "SQUAD1",
    "description": "Tracks, measures, and visualizes success against hard industrial targets.",
    "oracleInsight": "Visualizing the hard industrial targets required for sovereign scale.",
    "color": "from-cyan-600 to-teal-700",
    "icon": "📊",
    "url": "https://metrics.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "XD",
    "suggestedPreviousNode": "NA",
    "toolCard": {
      "purpose": "Tracks, measures, and visualizes success against hard industrial targets.",
      "useThisWhen": [
        "Blind to performance",
        "Accountability needed"
      ],
      "inputNeeded": "KPI list; Goal numbers.",
      "outputDelivered": [
        "Live Metrics Dashboard",
        "Quota Report"
      ],
      "doNotUseWhen": [
        "No data streams"
      ],
      "useCases": [
        "Dashboard build",
        "Weekly target audit"
      ]
    }
  },
  {
    "id": "RS",
    "name": "Root",
    "role": "SEO",
    "category": "Marketing",
    "squadId": "SQUAD9",
    "description": "Dominates high-intent search terms to capture organic traffic.",
    "oracleInsight": "Seizing the digital real estate for permanent organic dominance.",
    "color": "from-green-500 to-lime-600",
    "icon": "🌳",
    "url": "https://seo.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LI",
    "suggestedPreviousNode": "EA",
    "toolCard": {
      "purpose": "Dominates high-intent search terms to capture organic traffic.",
      "useThisWhen": [
        "Paid ads are expensive",
        "Seeking long-term traffic"
      ],
      "inputNeeded": "Keyword list; Competitor URLs.",
      "outputDelivered": [
        "SEO Roadmap",
        "Keyword Hierarchy"
      ],
      "doNotUseWhen": [
        "Need results today"
      ],
      "useCases": [
        "On-page audit",
        "Content silo build"
      ]
    }
  },
  {
    "id": "RD",
    "name": "Rift",
    "role": "Disruption",
    "category": "Strategy",
    "squadId": "SQUAD4",
    "description": "Identifies and exploits major gaps in competitor armor or market standard.",
    "oracleInsight": "Exploiting structural gaps in the market for massive asymmetric upside.",
    "color": "from-teal-600 to-emerald-700",
    "icon": "🌋",
    "url": "https://disruption.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AS",
    "suggestedPreviousNode": "IR",
    "toolCard": {
      "purpose": "Identifies and exploits major gaps in competitor armor or market standard.",
      "useThisWhen": [
        "Market is saturated",
        "Need new angle"
      ],
      "inputNeeded": "Market standard; Competitor spend.",
      "outputDelivered": [
        "Disruption Strategy",
        "Rift Analysis"
      ],
      "doNotUseWhen": [
        "Leading the market"
      ],
      "useCases": [
        "Business model rift",
        "Positioning twist"
      ]
    }
  },
  {
    "id": "SI",
    "name": "Scroll",
    "role": "Identity",
    "category": "Marketing",
    "squadId": "SQUAD7A",
    "description": "Ingests the Brand Bible to ensure the AI sounds exactly like you.",
    "oracleInsight": "Ingesting the Brand Bible to clone your unique resonance frequency.",
    "color": "from-fuchsia-500 to-purple-600",
    "icon": "📜",
    "url": "https://identity.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "QC",
    "suggestedPreviousNode": "AC1",
    "toolCard": {
      "purpose": "Ingests the Brand Bible to ensure the AI sounds exactly like you.",
      "useThisWhen": [
        "Voice is inconsistent",
        "Delegating content"
      ],
      "inputNeeded": "Voice samples; Writing style.",
      "outputDelivered": [
        "Brand Voice Map",
        "Persona File"
      ],
      "doNotUseWhen": [
        "Brand personality is undefined"
      ],
      "useCases": [
        "Tone-of-voice sync",
        "Style guide gen"
      ]
    }
  },
  {
    "id": "SC",
    "name": "Sync",
    "role": "Culture",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Harmonizes human resources, operational rhythm, and brand culture.",
    "oracleInsight": "Synchronizing human capital to the rhythm of elite performance culture.",
    "color": "from-emerald-600 to-green-700",
    "icon": "🤝",
    "url": "https://culture.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "GS",
    "suggestedPreviousNode": "GS",
    "toolCard": {
      "purpose": "Harmonizes human resources, operational rhythm, and brand culture.",
      "useThisWhen": [
        "Team is misaligned",
        "Culture is toxic"
      ],
      "inputNeeded": "Team size; Culture goals.",
      "outputDelivered": [
        "Culture Manual",
        "Alignment SOP"
      ],
      "doNotUseWhen": [
        "Solo founder"
      ],
      "useCases": [
        "Hiring filter",
        "Brand alignment"
      ]
    }
  },
  {
    "id": "TR",
    "name": "Tome",
    "role": "Rivals",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Performs a deep autopsy on competitor weaknesses and funnel structure.",
    "oracleInsight": "Conducting a forensic autopsy on competitor weakness and fragility.",
    "color": "from-slate-600 to-slate-900",
    "icon": "📖",
    "url": "https://rivals.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "IR",
    "suggestedPreviousNode": "RI",
    "toolCard": {
      "purpose": "Performs a deep autopsy on competitor weaknesses and funnel structure.",
      "useThisWhen": [
        "Entering new market",
        "Losing market share"
      ],
      "inputNeeded": "Rival name; Ad library access.",
      "outputDelivered": [
        "Rival Forensics Report",
        "Exploit Map"
      ],
      "doNotUseWhen": [
        "No clear competitors"
      ],
      "useCases": [
        "Funnel hack",
        "Weakness exploit"
      ]
    }
  },
  {
    "id": "TM",
    "name": "Traction",
    "role": "Momentum",
    "category": "Operations",
    "squadId": "SQUAD4",
    "description": "Turns static energy into high-velocity kinetic forward motion.",
    "oracleInsight": "Igniting static potential into kinetic high-velocity momentum.",
    "color": "from-green-600 to-lime-700",
    "icon": "🚜",
    "url": "https://momentum.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "WS",
    "suggestedPreviousNode": "ZT",
    "toolCard": {
      "purpose": "Turns static energy into high-velocity kinetic forward motion.",
      "useThisWhen": [
        "Project stalled",
        "Need speed"
      ],
      "inputNeeded": "Stalled project; Resource list.",
      "outputDelivered": [
        "Traction Roadmap",
        "Momentum Score"
      ],
      "doNotUseWhen": [
        "Already moving fast"
      ],
      "useCases": [
        "Project kickstart",
        "Friction removal"
      ]
    }
  },
  {
    "id": "UW",
    "name": "Uplift",
    "role": "Workflow",
    "category": "Operations",
    "squadId": "SQUAD3B_1",
    "description": "Secures the perimeter of your deep-work hours and team productivity.",
    "oracleInsight": "Fortifying the deep-work perimeter against all distraction vectors.",
    "color": "from-sky-400 to-blue-500",
    "icon": "/agent-icons/🌤️.png",
    "url": "https://workflow.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "NS",
    "suggestedPreviousNode": "ZT",
    "toolCard": {
      "purpose": "Secures the perimeter of your deep-work hours and team productivity.",
      "useThisWhen": [
        "Overwhelmed",
        "Focus is scattered"
      ],
      "inputNeeded": "Calendar; Task list.",
      "outputDelivered": [
        "Optimized Schedule",
        "Focus Protocol"
      ],
      "doNotUseWhen": [
        "Workload is light"
      ],
      "useCases": [
        "Time-blocking build",
        "Ritual design"
      ]
    }
  },
  {
    "id": "UE",
    "name": "Util",
    "role": "Efficiency",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Optimizes the allocation of time, money, and energy across the stack.",
    "oracleInsight": "Maximizing total system utility across the entire operational stack.",
    "color": "from-lime-600 to-yellow-700",
    "icon": "🔋",
    "url": "https://efficiency.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CF",
    "suggestedPreviousNode": "XD",
    "toolCard": {
      "purpose": "Optimizes the allocation of time, money, and energy across the stack.",
      "useThisWhen": [
        "Burnout risk",
        "Wasting resources"
      ],
      "inputNeeded": "Budget; Resource logs.",
      "outputDelivered": [
        "Efficiency Report",
        "Utilization Plan"
      ],
      "doNotUseWhen": [
        "Resources are abundant"
      ],
      "useCases": [
        "Cost audit",
        "Resource reallocation"
      ]
    }
  },
  {
    "id": "VP",
    "name": "Verve",
    "role": "Pivot",
    "category": "Strategy",
    "squadId": "SQUAD7C_1",
    "description": "Injects creative 'shocks' into stagnant systems or failing offers.",
    "oracleInsight": "Injecting a creative voltage spike to reanimate a stagnant offer.",
    "color": "from-yellow-400 to-orange-500",
    "icon": "💫",
    "url": "https://pivot.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "JS",
    "suggestedPreviousNode": "HP",
    "toolCard": {
      "purpose": "Injects creative 'shocks' into stagnant systems or failing offers.",
      "useThisWhen": [
        "Growth has stalled",
        "Offer fatigue"
      ],
      "inputNeeded": "Performance drop; Stale heartbeat.",
      "outputDelivered": [
        "New Angle Deck",
        "Creative Brief"
      ],
      "doNotUseWhen": [
        "Things are working well"
      ],
      "useCases": [
        "Offer refresh",
        "Viral pivot"
      ]
    }
  },
  {
    "id": "VF",
    "name": "View",
    "role": "Forecasting",
    "category": "Strategy",
    "squadId": "SQUAD1",
    "description": "Predicts future trends and sets long-term sovereign vectors.",
    "oracleInsight": "Projecting long-range sovereign vectors based on future-state reality.",
    "color": "from-yellow-600 to-orange-700",
    "icon": "🔭",
    "url": "https://forecasting.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ZL",
    "suggestedPreviousNode": "FA",
    "toolCard": {
      "purpose": "Predicts future trends and sets long-term sovereign vectors.",
      "useThisWhen": [
        "Planning long term",
        "Future proofing"
      ],
      "inputNeeded": "Industry news; 10-year goal.",
      "outputDelivered": [
        "Vision Roadmap",
        "Forecasting Model"
      ],
      "doNotUseWhen": [
        "Survival mode"
      ],
      "useCases": [
        "Future-proofing",
        "Trend forecasting"
      ]
    }
  },
  {
    "id": "WL",
    "name": "Warp",
    "role": "Launch",
    "category": "Marketing",
    "squadId": "SQUAD4",
    "description": "Accelerates an idea from concept to checkout in 168 hours or less.",
    "oracleInsight": "Compressing six months of launch latency into a single 168-hour sprint.",
    "color": "from-indigo-500 to-blue-600",
    "icon": "🚀",
    "url": "https://launch.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DG",
    "suggestedPreviousNode": "AS",
    "toolCard": {
      "purpose": "Accelerates an idea from concept to checkout in 168 hours or less.",
      "useThisWhen": [
        "Speed is critical",
        "Testing new ideas"
      ],
      "inputNeeded": "Minimum Viable Product; Basic offer.",
      "outputDelivered": [
        "7-Day Sprint Map",
        "Launch Assets"
      ],
      "doNotUseWhen": [
        "Quality requires long timeline"
      ],
      "useCases": [
        "MVP Launch",
        "Beta test setup"
      ]
    }
  },
  {
    "id": "WS",
    "name": "Warp+",
    "role": "Speed",
    "category": "Operations",
    "squadId": "SQUAD4",
    "description": "Bends time and market cycles to execute faster than humanly possible.",
    "oracleInsight": "Bending the laws of time to execute at impossible industrial velocity.",
    "color": "from-orange-600 to-red-700",
    "icon": "🚄",
    "url": "https://speed.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "QM",
    "suggestedPreviousNode": "TM",
    "toolCard": {
      "purpose": "Bends time and market cycles to execute faster than humanly possible.",
      "useThisWhen": [
        "Too slow",
        "Urgency high"
      ],
      "inputNeeded": "Desired speed; Bottlenecks.",
      "outputDelivered": [
        "Warp Schedule",
        "Velocity Audit"
      ],
      "doNotUseWhen": [
        "Quality will suffer"
      ],
      "useCases": [
        "Time-compression",
        "Rapid deployment"
      ]
    }
  },
  {
    "id": "XRF",
    "name": "X-Ray",
    "role": "Funnels",
    "category": "Marketing",
    "squadId": "SQUAD5C_1",
    "description": "Identifies the invisible friction points killing your funnel conversion.",
    "oracleInsight": "Irradiating the funnel to expose invisible conversion friction.",
    "color": "from-slate-500 to-blue-900",
    "icon": "🩻",
    "url": "https://funnels.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LI",
    "suggestedPreviousNode": "CTS",
    "toolCard": {
      "purpose": "Identifies the invisible friction points killing your funnel conversion.",
      "useThisWhen": [
        "Traffic high, sales low",
        "Optimizing leaks"
      ],
      "inputNeeded": "Funnel stats; Page speed data.",
      "outputDelivered": [
        "Friction Report",
        "Optimization List"
      ],
      "doNotUseWhen": [
        "No funnel data exists"
      ],
      "useCases": [
        "Drop-off audit",
        "Speed test"
      ]
    }
  },
  {
    "id": "XD",
    "name": "Xenon",
    "role": "Diagnostics",
    "category": "Tech",
    "squadId": "SQUAD1",
    "description": "Performs deep X-ray diagnostics to find hidden fractures in the machine.",
    "oracleInsight": "Diagnosing deep structural fractures within the system architecture.",
    "color": "from-red-600 to-rose-700",
    "icon": "🔦",
    "url": "https://diagnostics.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "UE",
    "suggestedPreviousNode": "QM",
    "toolCard": {
      "purpose": "Performs deep X-ray diagnostics to find hidden fractures in the machine.",
      "useThisWhen": [
        "System failing",
        "Health check"
      ],
      "inputNeeded": "Full business data; System logs.",
      "outputDelivered": [
        "Diagnostic Report",
        "Repair List"
      ],
      "doNotUseWhen": [
        "Ignorance is preferred"
      ],
      "useCases": [
        "Vulnerability audit",
        "Structural check"
      ]
    }
  },
  {
    "id": "YU",
    "name": "Yield",
    "role": "Upsell",
    "category": "Sales",
    "squadId": "SQUAD5C_1",
    "description": "Squeezes maximum lifetime value (LTV) through value-add upsells.",
    "oracleInsight": "Extracting maximum lifetime value from every acquired unit.",
    "color": "from-emerald-500 to-green-600",
    "icon": "🌾",
    "url": "https://upsell.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CF",
    "suggestedPreviousNode": "VU",
    "toolCard": {
      "purpose": "Squeezes maximum lifetime value (LTV) through value-add upsells.",
      "useThisWhen": [
        "LTV is low",
        "Customer trust is high"
      ],
      "inputNeeded": "Customer list; Product suite.",
      "outputDelivered": [
        "Upsell Map",
        "Value-Add Copy"
      ],
      "doNotUseWhen": [
        "Initial offer is failing"
      ],
      "useCases": [
        "Post-purchase offer",
        "Bundle design"
      ]
    }
  },
  {
    "id": "YP",
    "name": "Yield+",
    "role": "Profit",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Squeezes every drop of profit from existing assets and dead leads.",
    "oracleInsight": "Harvesting dormant profit reservoirs from inactive asset lists.",
    "color": "from-rose-600 to-pink-700",
    "icon": "💰",
    "url": "https://profit.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OE",
    "suggestedPreviousNode": "CF",
    "toolCard": {
      "purpose": "Squeezes every drop of profit from existing assets and dead leads.",
      "useThisWhen": [
        "Maximizing return",
        "Cash flow needed"
      ],
      "inputNeeded": "Asset list; Dead leads.",
      "outputDelivered": [
        "Profit Yield Map",
        "Asset Report"
      ],
      "doNotUseWhen": [
        "No assets exist"
      ],
      "useCases": [
        "Dead-lead monetizing",
        "License strategy"
      ]
    }
  },
  {
    "id": "ZT",
    "name": "Zenith",
    "role": "Timeline",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Anchors high-level strategy into reality-adjusted execution timelines.",
    "oracleInsight": "Anchoring abstract strategy into reality-adjusted execution timelines.",
    "color": "from-purple-600 to-indigo-600",
    "icon": "⚡",
    "url": "https://timeline.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "QM",
    "suggestedPreviousNode": "AS",
    "toolCard": {
      "purpose": "Anchors high-level strategy into reality-adjusted execution timelines.",
      "useThisWhen": [
        "Deadlines are missed",
        "Projects drag on"
      ],
      "inputNeeded": "Project goal; Resource availability.",
      "outputDelivered": [
        "Reality-adjusted timeline",
        "Enforced milestones"
      ],
      "doNotUseWhen": [
        "No clear goal exists"
      ],
      "useCases": [
        "Project scheduling",
        "Deadline enforcement"
      ]
    }
  },
  {
    "id": "ZL",
    "name": "Zenith+",
    "role": "Legacy",
    "category": "Strategy",
    "squadId": "SQUAD1",
    "description": "Architecting the final payout, transition to Chairman, and 2026 legacy.",
    "oracleInsight": "Architecting the final transition from Founder to Sovereign Chairman.",
    "color": "from-pink-600 to-purple-800",
    "icon": "🌌",
    "url": "https://legacy.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "EXIT",
    "suggestedPreviousNode": "OE",
    "toolCard": {
      "purpose": "Architecting the final payout, transition to Chairman, and 2026 legacy.",
      "useThisWhen": [
        "Exiting",
        "Legacy building"
      ],
      "inputNeeded": "Exit goals; Wealth target.",
      "outputDelivered": [
        "Legacy Blueprint",
        "Zenith Document"
      ],
      "doNotUseWhen": [
        "Just starting out"
      ],
      "useCases": [
        "Succession plan",
        "Legacy design"
      ]
    }
  },
  {
    "id": "WR",
    "name": "Watch",
    "role": "Reputation",
    "category": "Marketing",
    "squadId": "SQUAD6",
    "description": "Monitors the digital sphere for brand sentiment and threat vectors.",
    "oracleInsight": "Monitoring the digital sphere for hostile sentiment vectors.",
    "color": "from-slate-500 to-gray-600",
    "icon": "/agent-icons/👁️.png",
    "url": "https://reputation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "HP",
    "suggestedPreviousNode": "ES",
    "toolCard": {
      "purpose": "Monitors the digital sphere for brand sentiment and threat vectors.",
      "useThisWhen": [
        "Brand sentiment is unknown",
        "Fearing a PR crisis"
      ],
      "inputNeeded": "Brand keywords; Competitor names.",
      "outputDelivered": [
        "Reputation monitoring plan",
        "Alert trigger map"
      ],
      "doNotUseWhen": [
        "Brand is invisible"
      ],
      "useCases": [
        "Crisis detection",
        "Sentiment tracking"
      ]
    }
  },
  {
    "id": "PR",
    "name": "Proof",
    "role": "Reviews",
    "category": "Marketing",
    "squadId": "SQUAD6",
    "description": "Systematizes the collection and display of high-leverage social proof.",
    "oracleInsight": "Systematizing the extraction of high-leverage social proof assets.",
    "color": "from-yellow-400 to-amber-500",
    "icon": "⭐",
    "url": "https://reviews.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BT",
    "suggestedPreviousNode": "BT",
    "toolCard": {
      "purpose": "Systematizes the collection and display of high-leverage social proof.",
      "useThisWhen": [
        "Trust is low",
        "Conversion is suffering"
      ],
      "inputNeeded": "Customer list; Review platforms.",
      "outputDelivered": [
        "Review pipeline",
        "Social proof system"
      ],
      "doNotUseWhen": [
        "No customers yet"
      ],
      "useCases": [
        "Automated review request",
        "Testimonial display"
      ]
    }
  },
  {
    "id": "CT",
    "name": "Current",
    "role": "Trends",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Analyzes real-time market movements to identify rising tides.",
    "oracleInsight": "Analyzing real-time market currents to identify rising tides.",
    "color": "from-blue-400 to-cyan-500",
    "icon": "📈",
    "url": "https://trends.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "FA",
    "suggestedPreviousNode": "IR",
    "toolCard": {
      "purpose": "Analyzes real-time market movements to identify rising tides.",
      "useThisWhen": [
        "Market feels stale",
        "Seeking new angles"
      ],
      "inputNeeded": "Industry vertical; Competitor list.",
      "outputDelivered": [
        "Trend analysis",
        "Market movement report"
      ],
      "doNotUseWhen": [
        "Strategy is fixed"
      ],
      "useCases": [
        "Newsjacking",
        "Viral content ideas"
      ]
    }
  },
  {
    "id": "SS",
    "name": "Survey",
    "role": "Sizing",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Maps the total addressable market and identifies lucrative pockets.",
    "oracleInsight": "Mapping the total addressable market for lucrative pocket identification.",
    "color": "from-indigo-500 to-violet-600",
    "icon": "/agent-icons/🗺️.png",
    "url": "https://sizing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AS",
    "suggestedPreviousNode": "IR",
    "toolCard": {
      "purpose": "Maps the total addressable market and identifies lucrative pockets.",
      "useThisWhen": [
        "Entering new niche",
        "Scaling ad spend"
      ],
      "inputNeeded": "Target demographic; Geographic scope.",
      "outputDelivered": [
        "Market sizing report",
        "Opportunity map"
      ],
      "doNotUseWhen": [
        "Niche is hyper-local"
      ],
      "useCases": [
        "TAM/SAM/SOM calc",
        "Audience segmentation"
      ]
    }
  },
  {
    "id": "RI",
    "name": "Recon",
    "role": "Intel",
    "category": "Strategy",
    "squadId": "SQUAD8",
    "description": "Provides deep intelligence on the battlefield before tactical deployment.",
    "oracleInsight": "Deploying deep reconnaissance assets before tactical movement.",
    "color": "from-green-600 to-emerald-700",
    "icon": "🔭",
    "url": "https://intel.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "IR",
    "suggestedPreviousNode": "SS",
    "toolCard": {
      "purpose": "Provides deep intelligence on the battlefield before tactical deployment.",
      "useThisWhen": [
        "Launching new campaign",
        "Blind spots exist"
      ],
      "inputNeeded": "Target sector; Campaign goals.",
      "outputDelivered": [
        "Market read report",
        "Pre-move intelligence brief"
      ],
      "doNotUseWhen": [
        "Already in motion"
      ],
      "useCases": [
        "Pre-launch scan",
        "Competitor movement check"
      ]
    }
  },
  {
    "id": "RK",
    "name": "Rank",
    "role": "Keywords",
    "category": "Marketing",
    "squadId": "SQUAD9",
    "description": "Identifies the specific battles you can actually win in the search wars.",
    "oracleInsight": "Identifying winnable keyword battles in the search wars.",
    "color": "from-orange-500 to-red-600",
    "icon": "🏆",
    "url": "https://keywords.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AC1",
    "suggestedPreviousNode": "RS",
    "toolCard": {
      "purpose": "Identifies the specific battles you can actually win in the search wars.",
      "useThisWhen": [
        "SEO is failing",
        "Traffic is low quality"
      ],
      "inputNeeded": "Seed keywords; Domain authority.",
      "outputDelivered": [
        "Winnable keyword shortlist",
        "Priority score"
      ],
      "doNotUseWhen": [
        "No content strategy"
      ],
      "useCases": [
        "Keyword gap analysis",
        "Low-hanging fruit"
      ]
    }
  },
  {
    "id": "CTS",
    "name": "Crawl",
    "role": "Tech SEO",
    "category": "Tech",
    "squadId": "SQUAD9",
    "description": "Scans the technical infrastructure for invisible friction and errors.",
    "oracleInsight": "Scanning technical infrastructure for invisible friction points.",
    "color": "from-slate-600 to-gray-700",
    "icon": "/agent-icons/🕷️.png",
    "url": "https://tech-seo.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "XRF",
    "suggestedPreviousNode": "RS",
    "toolCard": {
      "purpose": "Scans the technical infrastructure for invisible friction and errors.",
      "useThisWhen": [
        "Rankings dropped",
        "Site speed is slow"
      ],
      "inputNeeded": "Site URL; Search Console access.",
      "outputDelivered": [
        "Technical SEO audit",
        "Fix list"
      ],
      "doNotUseWhen": [
        "Site is brand new"
      ],
      "useCases": [
        "Broken link check",
        "Core Web Vitals fix"
      ]
    }
  },
  {
    "id": "AC1",
    "name": "Anchor",
    "role": "Content",
    "category": "Marketing",
    "squadId": "SQUAD9",
    "description": "Optimizes on-page content to lock in relevance and authority.",
    "oracleInsight": "Locking in on-page relevance for maximum authority signaling.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "⚓",
    "url": "https://content.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SB",
    "suggestedPreviousNode": "RK",
    "toolCard": {
      "purpose": "Optimizes on-page content to lock in relevance and authority.",
      "useThisWhen": [
        "Content is flat",
        "Rankings are stuck"
      ],
      "inputNeeded": "Target keyword; Draft content.",
      "outputDelivered": [
        "Content brief",
        "On-page optimization spec"
      ],
      "doNotUseWhen": [
        "Keyword is unreachable"
      ],
      "useCases": [
        "Blog post optimization",
        "Landing page SEO"
      ]
    }
  },
  {
    "id": "SB",
    "name": "Signal",
    "role": "Backlinks",
    "category": "Marketing",
    "squadId": "SQUAD9",
    "description": "Builds the external authority signals required for domain dominance.",
    "oracleInsight": "Constructing external authority signals for domain dominance.",
    "color": "from-cyan-500 to-blue-600",
    "icon": "📡",
    "url": "https://backlinks.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ES",
    "suggestedPreviousNode": "AC1",
    "toolCard": {
      "purpose": "Builds the external authority signals required for domain dominance.",
      "useThisWhen": [
        "Authority is low",
        "Competitors are outranking"
      ],
      "inputNeeded": "Linkable assets; Outreach list.",
      "outputDelivered": [
        "Link building target list",
        "Outreach angle"
      ],
      "doNotUseWhen": [
        "Content is weak"
      ],
      "useCases": [
        "Guest post strategy",
        "Broken link building"
      ]
    }
  },
  {
    "id": "SP",
    "name": "Shelf",
    "role": "Product",
    "category": "Marketing",
    "squadId": "SQUAD10",
    "description": "Optimizes the product presentation for maximum desire and conversion.",
    "oracleInsight": "Optimizing product presentation for maximum desire induction.",
    "color": "from-purple-500 to-pink-600",
    "icon": "/agent-icons/🛍️.png",
    "url": "https://product.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CR",
    "suggestedPreviousNode": "PQ",
    "toolCard": {
      "purpose": "Optimizes the product presentation for maximum desire and conversion.",
      "useThisWhen": [
        "Traffic bounces",
        "Add-to-cart is low"
      ],
      "inputNeeded": "Product URL; Conversion data.",
      "outputDelivered": [
        "Optimized product page copy",
        "Structure audit"
      ],
      "doNotUseWhen": [
        "Product is unproven"
      ],
      "useCases": [
        "Description rewrite",
        "Image gallery audit"
      ]
    }
  },
  {
    "id": "CR",
    "name": "Cart",
    "role": "Recovery",
    "category": "Sales",
    "squadId": "SQUAD10",
    "description": "Recovers lost revenue from users who abandoned the transaction.",
    "oracleInsight": "Recovering lost revenue from abandoned transaction events.",
    "color": "from-green-500 to-emerald-600",
    "icon": "🛒",
    "url": "https://recovery.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SC1",
    "suggestedPreviousNode": "SP",
    "toolCard": {
      "purpose": "Recovers lost revenue from users who abandoned the transaction.",
      "useThisWhen": [
        "Cart abandonment is high",
        "Revenue is leaking"
      ],
      "inputNeeded": "Checkout flow; Email provider.",
      "outputDelivered": [
        "Abandoned cart recovery sequence",
        "Friction removal"
      ],
      "doNotUseWhen": [
        "Checkout is broken"
      ],
      "useCases": [
        "Email sequence",
        "SMS recovery"
      ]
    }
  },
  {
    "id": "VU",
    "name": "Vault",
    "role": "Upsell",
    "category": "Sales",
    "squadId": "SQUAD10",
    "description": "Increases average order value through strategic bumps and upsells.",
    "oracleInsight": "Increasing average order value through strategic capital bumps.",
    "color": "from-amber-500 to-orange-600",
    "icon": "🏦",
    "url": "https://upsell.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "YU",
    "suggestedPreviousNode": "SC1",
    "toolCard": {
      "purpose": "Increases average order value through strategic bumps and upsells.",
      "useThisWhen": [
        "AOV is low",
        "Margins are thin"
      ],
      "inputNeeded": "Product catalog; Pricing model.",
      "outputDelivered": [
        "Upsell stack",
        "Order bump copy"
      ],
      "doNotUseWhen": [
        "Core offer is weak"
      ],
      "useCases": [
        "One-click upsell",
        "Checkout bump"
      ]
    }
  },
  {
    "id": "SC1",
    "name": "Seal",
    "role": "Checkout",
    "category": "Sales",
    "squadId": "SQUAD10",
    "description": "Seals the leaks in the final checkout flow to maximize captured revenue.",
    "oracleInsight": "Sealing the final checkout flow to maximize revenue capture.",
    "color": "from-slate-700 to-black",
    "icon": "🔒",
    "url": "https://checkout.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BT",
    "suggestedPreviousNode": "CR",
    "toolCard": {
      "purpose": "Seals the leaks in the final checkout flow to maximize captured revenue.",
      "useThisWhen": [
        "Drop-off at payment",
        "Trust issues"
      ],
      "inputNeeded": "Checkout analytics; User recordings.",
      "outputDelivered": [
        "Checkout friction audit",
        "Fix list"
      ],
      "doNotUseWhen": [
        "Traffic is zero"
      ],
      "useCases": [
        "Form optimization",
        "Payment option audit"
      ]
    }
  },
  {
    "id": "BT",
    "name": "Badge",
    "role": "Trust",
    "category": "Marketing",
    "squadId": "SQUAD10",
    "description": "Deploys psychological trust signals to eliminate buyer hesitation.",
    "oracleInsight": "Deploying psychological trust signals to eliminate hesitation.",
    "color": "from-blue-400 to-indigo-500",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://trust.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PR",
    "suggestedPreviousNode": "SC1",
    "toolCard": {
      "purpose": "Deploys psychological trust signals to eliminate buyer hesitation.",
      "useThisWhen": [
        "Conversion is low",
        "Brand is new"
      ],
      "inputNeeded": "Certifications; Reviews; Policies.",
      "outputDelivered": [
        "Trust signal stack",
        "Social proof plan"
      ],
      "doNotUseWhen": [
        "Product is a scam"
      ],
      "useCases": [
        "Trust badge placement",
        "Guarantee framing"
      ]
    }
  },
  {
    "id": "PI",
    "name": "Persona",
    "role": "ICP",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Generates deep ideal customer profiles and persona dossiers to steer messaging.",
    "oracleInsight": "Defining the exact biometric and psychological profile of your ideal buyer.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "👤",
    "url": "https://icp.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VB",
    "suggestedPreviousNode": "MP1",
    "toolCard": {
      "purpose": "Generates deep ideal customer profiles and persona dossiers to steer messaging.",
      "useThisWhen": [
        "No clear ICP",
        "Wasted ad spend"
      ],
      "inputNeeded": "Product description; Current customer data.",
      "outputDelivered": [
        "ICP Dossier",
        "Persona Pack"
      ],
      "doNotUseWhen": [
        "Targeting everyone"
      ],
      "useCases": [
        "B2B SaaS targeting",
        "DTC persona build"
      ]
    }
  },
  {
    "id": "VB",
    "name": "Voice",
    "role": "Branding",
    "category": "Marketing",
    "squadId": "SQUAD7A",
    "description": "Standardizes brand messaging and tone across all channels with a unified 'Brand Bible.'",
    "oracleInsight": "Synchronizing your brand's vocal frequency for absolute resonance.",
    "color": "from-fuchsia-500 to-purple-600",
    "icon": "/agent-icons/🗣️.png",
    "url": "https://branding.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BS",
    "suggestedPreviousNode": "PI",
    "toolCard": {
      "purpose": "Standardizes brand messaging and tone across all channels with a unified 'Brand Bible.'",
      "useThisWhen": [
        "Inconsistent messaging",
        "Slow approvals"
      ],
      "inputNeeded": "Brand values; Sample copy.",
      "outputDelivered": [
        "Brand Bible",
        "Messaging Guide"
      ],
      "doNotUseWhen": [
        "Brand personality is undefined"
      ],
      "useCases": [
        "Tone-of-voice sync",
        "Style guide gen"
      ]
    }
  },
  {
    "id": "TP",
    "name": "Tempo",
    "role": "Planning",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Architecting unified annual/quarterly marketing calendars anchored to key dates.",
    "oracleInsight": "Orchestrating the temporal rhythm of your market campaigns.",
    "color": "from-emerald-600 to-green-700",
    "icon": "📅",
    "url": "https://planning.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BA",
    "suggestedPreviousNode": "SI1",
    "toolCard": {
      "purpose": "Architecting unified annual/quarterly marketing calendars anchored to key dates.",
      "useThisWhen": [
        "Duplicate work",
        "Missed launch dates"
      ],
      "inputNeeded": "Key dates; Campaign themes.",
      "outputDelivered": [
        "Marketing Calendar",
        "Campaign Roadmap"
      ],
      "doNotUseWhen": [
        "No fixed dates"
      ],
      "useCases": [
        "E-commerce promo calendar",
        "SaaS launch planning"
      ]
    }
  },
  {
    "id": "BS",
    "name": "Blueprint",
    "role": "Strategy",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Solves the blank-page problem with a 90-day content roadmap and cadence.",
    "oracleInsight": "Architecting the content lattice for consistent inbound flow.",
    "color": "from-cyan-500 to-blue-600",
    "icon": "/agent-icons/🗺️.png",
    "url": "https://strategy.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SR",
    "suggestedPreviousNode": "VB",
    "toolCard": {
      "purpose": "Solves the blank-page problem with a 90-day content roadmap and cadence.",
      "useThisWhen": [
        "Blank-page problem",
        "Slow lead flow"
      ],
      "inputNeeded": "Content themes; Target audience.",
      "outputDelivered": [
        "Content Roadmap",
        "Cadence Plan"
      ],
      "doNotUseWhen": [
        "No content production capacity"
      ],
      "useCases": [
        "90-day content plan",
        "Funnel-stage content mapping"
      ]
    }
  },
  {
    "id": "NS1",
    "name": "Nurture",
    "role": "Sequencing",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Builds multi-step email sequences that prevent leads from going cold.",
    "oracleInsight": "Maintaining the thermal integrity of your lead pipeline.",
    "color": "from-orange-500 to-red-600",
    "icon": "📧",
    "url": "https://sequencing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SP1",
    "suggestedPreviousNode": "SP1",
    "toolCard": {
      "purpose": "Builds multi-step email sequences that prevent leads from going cold.",
      "useThisWhen": [
        "Leads go cold",
        "Low engagement"
      ],
      "inputNeeded": "Segment data; Offer details.",
      "outputDelivered": [
        "Email Sequence",
        "Nurture Flow"
      ],
      "doNotUseWhen": [
        "No email list"
      ],
      "useCases": [
        "7-email nurture sequence",
        "Lead reactivation flow"
      ]
    }
  },
  {
    "id": "CC",
    "name": "Convert",
    "role": "Copywriting",
    "category": "Marketing",
    "squadId": "SQUAD7C_1",
    "description": "Optimizes landing page copy to maximize conversion and reduce CAC.",
    "oracleInsight": "Refining the digital threshold for maximum conversion velocity.",
    "color": "from-emerald-500 to-green-600",
    "icon": "✍️",
    "url": "https://copywriting.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PSP",
    "suggestedPreviousNode": "AC2",
    "toolCard": {
      "purpose": "Optimizes landing page copy to maximize conversion and reduce CAC.",
      "useThisWhen": [
        "Underperforming landing pages",
        "High CAC"
      ],
      "inputNeeded": "Current page URL; Target persona.",
      "outputDelivered": [
        "Optimized Hero Copy",
        "Benefit Bullets"
      ],
      "doNotUseWhen": [
        "No traffic to page"
      ],
      "useCases": [
        "Hero copy optimization",
        "Benefit bullet refinement"
      ]
    }
  },
  {
    "id": "AC2",
    "name": "Angle",
    "role": "Creative",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Generates high-CTR ad concepts, hooks, and storyboard frames.",
    "oracleInsight": "Engineering the visual hooks that arrest the scroll.",
    "color": "from-yellow-400 to-orange-500",
    "icon": "🎣",
    "url": "https://creative.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CC",
    "suggestedPreviousNode": "BA",
    "toolCard": {
      "purpose": "Generates high-CTR ad concepts, hooks, and storyboard frames.",
      "useThisWhen": [
        "Thin ad creative",
        "High CPMs"
      ],
      "inputNeeded": "Product hooks; Platform (Meta/TikTok).",
      "outputDelivered": [
        "Ad Concept Pack",
        "Storyboard Frames"
      ],
      "doNotUseWhen": [
        "No ad budget"
      ],
      "useCases": [
        "TikTok ad hooks",
        "Meta ad angles"
      ]
    }
  },
  {
    "id": "SR",
    "name": "Slice",
    "role": "Repurposing",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Systematically slices flagship assets into multi-channel derivatives.",
    "oracleInsight": "Multiplying your content assets through structural fragmentation.",
    "color": "from-indigo-500 to-blue-600",
    "icon": "🔪",
    "url": "https://repurposing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PS",
    "suggestedPreviousNode": "BS",
    "toolCard": {
      "purpose": "Systematically slices flagship assets into multi-channel derivatives.",
      "useThisWhen": [
        "Recreating content from scratch",
        "Low output"
      ],
      "inputNeeded": "Flagship asset (Webinar/Podcast).",
      "outputDelivered": [
        "Repurposing Map",
        "Derivative List"
      ],
      "doNotUseWhen": [
        "No flagship assets"
      ],
      "useCases": [
        "Webinar to social clips",
        "Whitepaper to email series"
      ]
    }
  },
  {
    "id": "CS",
    "name": "Cluster",
    "role": "SEO",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Produces topic cluster maps to build topical authority and organic traffic.",
    "oracleInsight": "Mapping the topical hierarchy for permanent search dominance.",
    "color": "from-cyan-600 to-blue-700",
    "icon": "/agent-icons/🕸️.png",
    "url": "https://seo.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BS",
    "suggestedPreviousNode": "LL",
    "toolCard": {
      "purpose": "Produces topic cluster maps to build topical authority and organic traffic.",
      "useThisWhen": [
        "Missing SEO map",
        "Low organic traffic"
      ],
      "inputNeeded": "Pillar keywords; Competitor data.",
      "outputDelivered": [
        "Topic Cluster Map",
        "Content Map"
      ],
      "doNotUseWhen": [
        "No SEO focus"
      ],
      "useCases": [
        "Topical authority map",
        "SEO content hierarchy"
      ]
    }
  },
  {
    "id": "BA",
    "name": "Brief",
    "role": "Alignment",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Standardizes campaign briefs to ensure alignment across internal and external teams.",
    "oracleInsight": "Synchronizing tactical intent across all execution units.",
    "color": "from-slate-600 to-gray-700",
    "icon": "📋",
    "url": "https://alignment.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AC2",
    "suggestedPreviousNode": "TP",
    "toolCard": {
      "purpose": "Standardizes campaign briefs to ensure alignment across internal and external teams.",
      "useThisWhen": [
        "Misaligned creative",
        "Budget burn"
      ],
      "inputNeeded": "Campaign goals; Team list.",
      "outputDelivered": [
        "Standardized Brief",
        "Creative Spec"
      ],
      "doNotUseWhen": [
        "Solo execution"
      ],
      "useCases": [
        "Agency campaign brief",
        "Internal creative spec"
      ]
    }
  },
  {
    "id": "PS",
    "name": "Post",
    "role": "Social",
    "category": "Marketing",
    "squadId": "SQUAD7B",
    "description": "Deploys channel-specific social content packs and template libraries.",
    "oracleInsight": "Standardizing your social signal for consistent engagement.",
    "color": "from-sky-400 to-blue-500",
    "icon": "📱",
    "url": "https://social.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RA",
    "suggestedPreviousNode": "SR",
    "toolCard": {
      "purpose": "Deploys channel-specific social content packs and template libraries.",
      "useThisWhen": [
        "Manual social posting",
        "Inconsistent cadence"
      ],
      "inputNeeded": "Channel list; Content themes.",
      "outputDelivered": [
        "30-Day Content Pack",
        "Post Templates"
      ],
      "doNotUseWhen": [
        "No social presence"
      ],
      "useCases": [
        "Social content pack",
        "Post template library"
      ]
    }
  },
  {
    "id": "LV",
    "name": "Lookbook",
    "role": "Visuals",
    "category": "Marketing",
    "squadId": "SQUAD7A",
    "description": "Produces visual style guides and brand lookbooks to ensure identity consistency.",
    "oracleInsight": "Enforcing visual coherence across the entire brand spectrum.",
    "color": "from-pink-500 to-rose-600",
    "icon": "🎨",
    "url": "https://visuals.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VB",
    "suggestedPreviousNode": "ON",
    "toolCard": {
      "purpose": "Produces visual style guides and brand lookbooks to ensure identity consistency.",
      "useThisWhen": [
        "Inconsistent visual identity",
        "Design rework"
      ],
      "inputNeeded": "Brand colors; Typography; Reference images.",
      "outputDelivered": [
        "Visual Style Guide",
        "Brand Lookbook"
      ],
      "doNotUseWhen": [
        "No visual assets"
      ],
      "useCases": [
        "Brand lookbook gen",
        "Visual style guide"
      ]
    }
  },
  {
    "id": "MP1",
    "name": "Matrix",
    "role": "Positioning",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Clarifies competitive differentiation with a positioning matrix.",
    "oracleInsight": "Triangulating your position to render competitors obsolete.",
    "color": "from-slate-700 to-black",
    "icon": "📊",
    "url": "https://positioning.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PI",
    "suggestedPreviousNode": "LL",
    "toolCard": {
      "purpose": "Clarifies competitive differentiation with a positioning matrix.",
      "useThisWhen": [
        "No clear positioning",
        "Low win rates"
      ],
      "inputNeeded": "Top 5 competitors; Product features.",
      "outputDelivered": [
        "Positioning Matrix",
        "Differentiator Doc"
      ],
      "doNotUseWhen": [
        "No competitors"
      ],
      "useCases": [
        "Competitive positioning matrix",
        "Market differentiation doc"
      ]
    }
  },
  {
    "id": "PSP",
    "name": "Proof",
    "role": "Social Proof",
    "category": "Marketing",
    "squadId": "SQUAD7B",
    "description": "Leverages customer reviews into a categorized testimonial library.",
    "oracleInsight": "Weaponizing social proof to bypass buyer resistance.",
    "color": "from-yellow-500 to-amber-600",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://social-proof.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OC",
    "suggestedPreviousNode": "CC",
    "toolCard": {
      "purpose": "Leverages customer reviews into a categorized testimonial library.",
      "useThisWhen": [
        "Underused reviews",
        "Low trust"
      ],
      "inputNeeded": "Raw reviews; Customer personas.",
      "outputDelivered": [
        "Testimonial Library",
        "Social Proof Map"
      ],
      "doNotUseWhen": [
        "No customers yet"
      ],
      "useCases": [
        "Testimonial library build",
        "Social proof asset map"
      ]
    }
  },
  {
    "id": "OC",
    "name": "OneSheet",
    "role": "Collateral",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Crafts standardized product marketing one-pagers to accelerate sales cycles.",
    "oracleInsight": "Crystallizing product value into a singular, high-impact asset.",
    "color": "from-blue-400 to-cyan-500",
    "icon": "📄",
    "url": "https://collateral.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PP",
    "suggestedPreviousNode": "PSP",
    "toolCard": {
      "purpose": "Crafts standardized product marketing one-pagers to accelerate sales cycles.",
      "useThisWhen": [
        "Confusing collateral",
        "Slow sales cycles"
      ],
      "inputNeeded": "Product features; Value props.",
      "outputDelivered": [
        "Product One-Pager",
        "Sales Leave-Behind"
      ],
      "doNotUseWhen": [
        "Product is unproven"
      ],
      "useCases": [
        "Product one-pager gen",
        "Sales collateral build"
      ]
    }
  },
  {
    "id": "SP1",
    "name": "Segment",
    "role": "Personalization",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Authors segmented nurture flows to increase relevance across different ICPs.",
    "oracleInsight": "Fracturing the nurture flow for surgical relevance.",
    "color": "from-purple-500 to-indigo-600",
    "icon": "🧩",
    "url": "https://personalization.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "NS1",
    "suggestedPreviousNode": "NS1",
    "toolCard": {
      "purpose": "Authors segmented nurture flows to increase relevance across different ICPs.",
      "useThisWhen": [
        "Generic nurture flows",
        "Low relevance"
      ],
      "inputNeeded": "Segment definitions; Content library.",
      "outputDelivered": [
        "Segmented Flow",
        "Personalized Sequence"
      ],
      "doNotUseWhen": [
        "Single audience segment"
      ],
      "useCases": [
        "SMB vs Enterprise nurture",
        "Persona-based email flow"
      ]
    }
  },
  {
    "id": "RA",
    "name": "Report",
    "role": "Analytics",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Generates marketing performance report templates with narrative and key metrics.",
    "oracleInsight": "Visualizing the tactical truth of your marketing engine.",
    "color": "from-slate-500 to-gray-600",
    "icon": "📈",
    "url": "https://analytics.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SA",
    "suggestedPreviousNode": "PS",
    "toolCard": {
      "purpose": "Generates marketing performance report templates with narrative and key metrics.",
      "useThisWhen": [
        "Manual reporting",
        "Data wrangling"
      ],
      "inputNeeded": "Exported metrics; Channel data.",
      "outputDelivered": [
        "Report Template",
        "Narrative Deck"
      ],
      "doNotUseWhen": [
        "No data to report"
      ],
      "useCases": [
        "Monthly board update template",
        "Performance narrative gen"
      ]
    }
  },
  {
    "id": "SA",
    "name": "Story",
    "role": "Attribution",
    "category": "Marketing",
    "squadId": "SQUAD7C_2",
    "description": "Turns raw data into a concise attribution story deck for leadership.",
    "oracleInsight": "Transmuting raw data into a narrative of absolute ROI.",
    "color": "from-emerald-600 to-green-700",
    "icon": "📖",
    "url": "https://attribution.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "TP",
    "suggestedPreviousNode": "RA",
    "toolCard": {
      "purpose": "Turns raw data into a concise attribution story deck for leadership.",
      "useThisWhen": [
        "No ROI narrative",
        "Budget challenges"
      ],
      "inputNeeded": "Channel data; Conversion paths.",
      "outputDelivered": [
        "Attribution Story Deck",
        "ROI Narrative"
      ],
      "doNotUseWhen": [
        "No conversion data"
      ],
      "useCases": [
        "ROI narrative deck",
        "Attribution story gen"
      ]
    }
  },
  {
    "id": "PP",
    "name": "Package",
    "role": "Pricing",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Refines tier names and value framing for maximum upsell take rates.",
    "oracleInsight": "Architecting the value perception of your pricing tiers.",
    "color": "from-amber-500 to-orange-600",
    "icon": "📦",
    "url": "https://pricing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CC",
    "suggestedPreviousNode": "OC",
    "toolCard": {
      "purpose": "Refines tier names and value framing for maximum upsell take rates.",
      "useThisWhen": [
        "Generic pricing messaging",
        "Low AOV"
      ],
      "inputNeeded": "Current pricing; Competitor tiers.",
      "outputDelivered": [
        "Pricing Copy Pack",
        "Comparison Table"
      ],
      "doNotUseWhen": [
        "Pricing is fixed"
      ],
      "useCases": [
        "Pricing tier framing",
        "Value comparison table"
      ]
    }
  },
  {
    "id": "EP",
    "name": "Event",
    "role": "Promotion",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Builds promotion kits (emails, posts, landing copy) for events and webinars.",
    "oracleInsight": "Maximizing the attendance velocity of your live events.",
    "color": "from-indigo-600 to-purple-700",
    "icon": "/agent-icons/🎟️.png",
    "url": "https://promotion.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PS",
    "suggestedPreviousNode": "EP",
    "toolCard": {
      "purpose": "Builds promotion kits (emails, posts, landing copy) for events and webinars.",
      "useThisWhen": [
        "Weak event promotion",
        "Low attendance"
      ],
      "inputNeeded": "Event details; Target audience.",
      "outputDelivered": [
        "Promotion Kit",
        "Event Sequence"
      ],
      "doNotUseWhen": [
        "No events planned"
      ],
      "useCases": [
        "Webinar promotion kit",
        "Live event sequence"
      ]
    }
  },
  {
    "id": "CC1",
    "name": "Crisis",
    "role": "Comms",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Generates crisis communication playbooks with templates for rapid response.",
    "oracleInsight": "Deploying the containment protocol for reputational defense.",
    "color": "from-red-600 to-rose-700",
    "icon": "🚨",
    "url": "https://comms.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ON",
    "suggestedPreviousNode": "CC1",
    "toolCard": {
      "purpose": "Generates crisis communication playbooks with templates for rapid response.",
      "useThisWhen": [
        "No crisis playbook",
        "PR risk"
      ],
      "inputNeeded": "Potential scenarios; Brand voice.",
      "outputDelivered": [
        "Crisis Playbook",
        "Response Templates"
      ],
      "doNotUseWhen": [
        "No PR risk"
      ],
      "useCases": [
        "Crisis comms playbook",
        "Outage response templates"
      ]
    }
  },
  {
    "id": "SI1",
    "name": "Season",
    "role": "Ideation",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Generates seasonal campaign idea banks to cut recurring planning time.",
    "oracleInsight": "Harvesting the seasonal energy of the market.",
    "color": "from-orange-400 to-amber-500",
    "icon": "🍂",
    "url": "https://ideation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "TP",
    "suggestedPreviousNode": "SI1",
    "toolCard": {
      "purpose": "Generates seasonal campaign idea banks to cut recurring planning time.",
      "useThisWhen": [
        "Reinventing seasonal ideas",
        "Planning fatigue"
      ],
      "inputNeeded": "Product catalog; Holiday list.",
      "outputDelivered": [
        "Seasonal Idea Bank",
        "Offer Concepts"
      ],
      "doNotUseWhen": [
        "No seasonal products"
      ],
      "useCases": [
        "Seasonal idea bank",
        "Holiday offer concepts"
      ]
    }
  },
  {
    "id": "ON",
    "name": "Origin",
    "role": "Narrative",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Turns founder notes into a polished brand story and origin narrative.",
    "oracleInsight": "Forging the emotional anchor of your brand's genesis.",
    "color": "from-indigo-400 to-blue-500",
    "icon": "🌱",
    "url": "https://narrative.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VB",
    "suggestedPreviousNode": "CC1",
    "toolCard": {
      "purpose": "Turns founder notes into a polished brand story and origin narrative.",
      "useThisWhen": [
        "No brand story",
        "Weak connection"
      ],
      "inputNeeded": "Founder notes; Rough bullets.",
      "outputDelivered": [
        "Brand Story Asset",
        "Origin Narrative"
      ],
      "doNotUseWhen": [
        "No brand history"
      ],
      "useCases": [
        "Brand story gen",
        "Origin narrative build"
      ]
    }
  },
  {
    "id": "LL",
    "name": "Local",
    "role": "Localization",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Generates localized copy packs to ensure nuance in new markets.",
    "oracleInsight": "Translating your signal for local frequency resonance.",
    "color": "from-cyan-400 to-blue-500",
    "icon": "🌍",
    "url": "https://localization.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MP1",
    "suggestedPreviousNode": "LL",
    "toolCard": {
      "purpose": "Generates localized copy packs to ensure nuance in new markets.",
      "useThisWhen": [
        "Poor localization",
        "New market expansion"
      ],
      "inputNeeded": "Source copy; Target market.",
      "outputDelivered": [
        "Localized Copy Pack",
        "Nuance Guide"
      ],
      "doNotUseWhen": [
        "Single market focus"
      ],
      "useCases": [
        "Localized copy pack",
        "Market nuance guide"
      ]
    }
  },
  {
    "id": "PE",
    "name": "Partner",
    "role": "Enablement",
    "category": "Marketing",
    "squadId": "SQUAD7C_3",
    "description": "Outputs affiliate toolkits with templates and swipe files for enablement.",
    "oracleInsight": "Empowering your external fleet for autonomous growth.",
    "color": "from-emerald-400 to-green-500",
    "icon": "🤝",
    "url": "https://enablement.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BA",
    "suggestedPreviousNode": "PE",
    "toolCard": {
      "purpose": "Outputs affiliate toolkits with templates and swipe files for enablement.",
      "useThisWhen": [
        "No partner kit",
        "Underperforming affiliates"
      ],
      "inputNeeded": "Partner program details; Brand assets.",
      "outputDelivered": [
        "Affiliate Toolkit",
        "Swipe Files"
      ],
      "doNotUseWhen": [
        "No partner program"
      ],
      "useCases": [
        "Affiliate toolkit gen",
        "Partner swipe files"
      ]
    }
  },
  {
    "id": "SQ",
    "name": "Score",
    "role": "Qualification",
    "category": "Sales",
    "squadId": "SQUAD5C_1",
    "description": "Generates lead scoring rubrics and documentation to prioritize high-intent accounts.",
    "oracleInsight": "Quantifying lead intent to ensure absolute pipeline efficiency.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "🎯",
    "url": "https://qualification.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DD",
    "suggestedPreviousNode": "FWL",
    "toolCard": {
      "purpose": "Generates lead scoring rubrics and documentation to prioritize high-intent accounts.",
      "useThisWhen": [
        "Unclear lead qualification",
        "Reps chasing poor-fit leads"
      ],
      "inputNeeded": "Rep input; Ideal customer data.",
      "outputDelivered": [
        "Lead Scoring Rubric",
        "Qualification Model"
      ],
      "doNotUseWhen": [
        "No lead volume"
      ],
      "useCases": [
        "B2B lead scoring model",
        "CRM qualification setup"
      ]
    }
  },
  {
    "id": "DD",
    "name": "Discover",
    "role": "Discovery",
    "category": "Sales",
    "squadId": "SQUAD5C_1",
    "description": "Creates structured discovery call frameworks and checklists per ICP.",
    "oracleInsight": "Architecting the discovery phase for maximum intelligence extraction.",
    "color": "from-cyan-500 to-blue-600",
    "icon": "🔍",
    "url": "https://discovery.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OE1",
    "suggestedPreviousNode": "SQ",
    "toolCard": {
      "purpose": "Creates structured discovery call frameworks and checklists per ICP.",
      "useThisWhen": [
        "Weak discovery calls",
        "Inaccurate forecasting"
      ],
      "inputNeeded": "Target ICP; Product value props.",
      "outputDelivered": [
        "Discovery Script",
        "Call Checklist"
      ],
      "doNotUseWhen": [
        "Transactional sales"
      ],
      "useCases": [
        "SDR discovery checklist",
        "AE discovery framework"
      ]
    }
  },
  {
    "id": "OE1",
    "name": "Outreach",
    "role": "Email",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Generates consistent outbound email template libraries with personalization tokens.",
    "oracleInsight": "Standardizing outbound signals for maximum reply velocity.",
    "color": "from-indigo-500 to-purple-600",
    "icon": "📧",
    "url": "https://email.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "TCC",
    "suggestedPreviousNode": "DD",
    "toolCard": {
      "purpose": "Generates consistent outbound email template libraries with personalization tokens.",
      "useThisWhen": [
        "Inconsistent outbound messaging",
        "Low reply rates"
      ],
      "inputNeeded": "Target persona; Trigger events.",
      "outputDelivered": [
        "Email Template Library",
        "Personalization Map"
      ],
      "doNotUseWhen": [
        "No outbound motion"
      ],
      "useCases": [
        "Persona-based outbound templates",
        "Trigger-based email sequences"
      ]
    }
  },
  {
    "id": "TCC",
    "name": "Track",
    "role": "Cold Calling",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Writes objection-aware cold call talk tracks to improve connect-to-meeting rates.",
    "oracleInsight": "Engineering the verbal hooks for high-velocity cold outreach.",
    "color": "from-orange-500 to-red-600",
    "icon": "📞",
    "url": "https://cold-calling.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CFU",
    "suggestedPreviousNode": "OE1",
    "toolCard": {
      "purpose": "Writes objection-aware cold call talk tracks to improve connect-to-meeting rates.",
      "useThisWhen": [
        "Lack of structured talk tracks",
        "New reps struggling"
      ],
      "inputNeeded": "Product details; Common objections.",
      "outputDelivered": [
        "Cold Call Script",
        "Talk Track"
      ],
      "doNotUseWhen": [
        "Inbound-only motion"
      ],
      "useCases": [
        "Inside sales talk tracks",
        "Objection-aware scripts"
      ]
    }
  },
  {
    "id": "QP",
    "name": "Quote",
    "role": "Proposals",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Drafts master proposal templates with parameterized scope and pricing fields.",
    "oracleInsight": "Crystallizing the final offer into a singular, high-status document.",
    "color": "from-slate-600 to-gray-700",
    "icon": "📄",
    "url": "https://proposals.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CR1",
    "suggestedPreviousNode": "DP",
    "toolCard": {
      "purpose": "Drafts master proposal templates with parameterized scope and pricing fields.",
      "useThisWhen": [
        "Inconsistent proposal formatting",
        "Slow legal review"
      ],
      "inputNeeded": "Service scope; Pricing model.",
      "outputDelivered": [
        "Master Proposal Template",
        "Quote Shell"
      ],
      "doNotUseWhen": [
        "Low-ticket sales"
      ],
      "useCases": [
        "Services proposal shell",
        "Enterprise quote template"
      ]
    }
  },
  {
    "id": "CFU",
    "name": "Cadence",
    "role": "Follow-up",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Designs multi-touch follow-up cadences (timing, channels, touch counts).",
    "oracleInsight": "Orchestrating the temporal rhythm of deal persistence.",
    "color": "from-emerald-600 to-green-700",
    "icon": "🔄",
    "url": "https://follow-up.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OE1",
    "suggestedPreviousNode": "TCC",
    "toolCard": {
      "purpose": "Designs multi-touch follow-up cadences (timing, channels, touch counts).",
      "useThisWhen": [
        "Chaotic follow-up",
        "Deals dying mid-funnel"
      ],
      "inputNeeded": "Sales motion; Target segments.",
      "outputDelivered": [
        "Follow-up Cadence",
        "Touchpoint Map"
      ],
      "doNotUseWhen": [
        "One-call close motion"
      ],
      "useCases": [
        "10-touch follow-up cadence",
        "SMB show-rate booster"
      ]
    }
  },
  {
    "id": "BC",
    "name": "Battlecard",
    "role": "Competitive",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Synthesizes competitor intel into tactical battlecards for late-stage deals.",
    "oracleInsight": "Triangulating rival weaknesses for tactical deal dominance.",
    "color": "from-red-600 to-rose-700",
    "icon": "⚔️",
    "url": "https://competitive.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RO",
    "suggestedPreviousNode": "IR1",
    "toolCard": {
      "purpose": "Synthesizes competitor intel into tactical battlecards for late-stage deals.",
      "useThisWhen": [
        "Missing competitive intel",
        "Losing to known rivals"
      ],
      "inputNeeded": "Rival data; Product comparison.",
      "outputDelivered": [
        "Competitive Battlecard",
        "Exploit Map"
      ],
      "doNotUseWhen": [
        "No clear competitors"
      ],
      "useCases": [
        "Cybersecurity battlecards",
        "SaaS rival forensics"
      ]
    }
  },
  {
    "id": "RO",
    "name": "Rebuttal",
    "role": "Objections",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Produces objection trees and sample responses for common sales hurdles.",
    "oracleInsight": "Neutralizing buyer resistance through linguistic precision.",
    "color": "from-yellow-500 to-amber-600",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://objections.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DP",
    "suggestedPreviousNode": "BC",
    "toolCard": {
      "purpose": "Produces objection trees and sample responses for common sales hurdles.",
      "useThisWhen": [
        "Common objections stalling deals",
        "Reps struggling with 'too expensive'"
      ],
      "inputNeeded": "Common objections; Product value props.",
      "outputDelivered": [
        "Objection Playbook",
        "Rebuttal Tree"
      ],
      "doNotUseWhen": [
        "Product is fundamentally flawed"
      ],
      "useCases": [
        "Price objection handling",
        "Priority objection playbook"
      ]
    }
  },
  {
    "id": "DP",
    "name": "Demo",
    "role": "Presentation",
    "category": "Sales",
    "squadId": "SQUAD5A",
    "description": "Generates demo scripts and storyboards focused on business outcomes.",
    "oracleInsight": "Visualizing the future-state reality through outcome-led demos.",
    "color": "from-blue-400 to-cyan-500",
    "icon": "/agent-icons/🖥️.png",
    "url": "https://presentation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "QP",
    "suggestedPreviousNode": "RO",
    "toolCard": {
      "purpose": "Generates demo scripts and storyboards focused on business outcomes.",
      "useThisWhen": [
        "Unstructured product demos",
        "Feature-dumping"
      ],
      "inputNeeded": "Product features; Customer outcomes.",
      "outputDelivered": [
        "Demo Script",
        "Storyboard Flow"
      ],
      "doNotUseWhen": [
        "No product to demo"
      ],
      "useCases": [
        "Outcome-led demo flow",
        "SaaS demo storyboard"
      ]
    }
  },
  {
    "id": "CR1",
    "name": "Case",
    "role": "ROI",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Creates spreadsheet-ready ROI models and narrative business case summaries.",
    "oracleInsight": "Quantifying the economic inevitability of the purchase.",
    "color": "from-emerald-500 to-green-600",
    "icon": "📈",
    "url": "https://roi.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PD",
    "suggestedPreviousNode": "QP",
    "toolCard": {
      "purpose": "Creates spreadsheet-ready ROI models and narrative business case summaries.",
      "useThisWhen": [
        "No ROI calculator",
        "Enterprise buyers stalling"
      ],
      "inputNeeded": "Pricing; Customer cost data.",
      "outputDelivered": [
        "ROI Model",
        "Business Case Summary"
      ],
      "doNotUseWhen": [
        "Low-cost products"
      ],
      "useCases": [
        "Enterprise ROI model",
        "Late-stage business case"
      ]
    }
  },
  {
    "id": "PD",
    "name": "Pitch",
    "role": "Decks",
    "category": "Sales",
    "squadId": "SQUAD5C_2",
    "description": "Outputs industry-specific pitch deck outlines and slide copy.",
    "oracleInsight": "Tailoring the visual narrative for vertical-specific resonance.",
    "color": "from-indigo-600 to-purple-700",
    "icon": "/agent-icons/📽️.png",
    "url": "https://decks.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "IR1",
    "suggestedPreviousNode": "CR1",
    "toolCard": {
      "purpose": "Outputs industry-specific pitch deck outlines and slide copy.",
      "useThisWhen": [
        "Lack of industry-specific decks",
        "Generic messaging"
      ],
      "inputNeeded": "Target industry; Core deck.",
      "outputDelivered": [
        "Industry Deck Outline",
        "Slide Copy"
      ],
      "doNotUseWhen": [
        "Single-industry focus"
      ],
      "useCases": [
        "Healthcare pitch deck",
        "Retail analytics deck"
      ]
    }
  },
  {
    "id": "IR1",
    "name": "Intel",
    "role": "Research",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Compiles account one-pagers summarizing 10-Ks, news, and org charts.",
    "oracleInsight": "Deploying deep reconnaissance on target accounts for tactical advantage.",
    "color": "from-slate-700 to-black",
    "icon": "🔭",
    "url": "https://research.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BC",
    "suggestedPreviousNode": "PD",
    "toolCard": {
      "purpose": "Compiles account one-pagers summarizing 10-Ks, news, and org charts.",
      "useThisWhen": [
        "Time-consuming account research",
        "Entering enterprise deals"
      ],
      "inputNeeded": "Target company; Industry sector.",
      "outputDelivered": [
        "Account One-Pager",
        "Research Dossier"
      ],
      "doNotUseWhen": [
        "SMB sales"
      ],
      "useCases": [
        "10-K summary dossier",
        "Org chart mapping"
      ]
    }
  },
  {
    "id": "ECS",
    "name": "Expand",
    "role": "Cross-sell",
    "category": "Sales",
    "squadId": "SQUAD5A",
    "description": "Creates cross-sell trigger maps and expansion outreach scripts.",
    "oracleInsight": "Identifying the expansion vectors within existing account territory.",
    "color": "from-green-500 to-emerald-600",
    "icon": "📈",
    "url": "https://cross-sell.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SR1",
    "suggestedPreviousNode": "MAP",
    "toolCard": {
      "purpose": "Creates cross-sell trigger maps and expansion outreach scripts.",
      "useThisWhen": [
        "No structured expansion playbooks",
        "Accounts under-monetized"
      ],
      "inputNeeded": "Customer list; Adjacent services.",
      "outputDelivered": [
        "Cross-sell Trigger Map",
        "Expansion Playbook"
      ],
      "doNotUseWhen": [
        "No existing customers"
      ],
      "useCases": [
        "Adjacent service cross-sell",
        "Account expansion playbook"
      ]
    }
  },
  {
    "id": "SR1",
    "name": "Save",
    "role": "Renewal",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Crafts proactive renewal and save-play sequences triggered by usage drops.",
    "oracleInsight": "Fortifying the retention perimeter against churn vectors.",
    "color": "from-red-500 to-rose-600",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://renewal.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "HS",
    "suggestedPreviousNode": "ECS",
    "toolCard": {
      "purpose": "Crafts proactive renewal and save-play sequences triggered by usage drops.",
      "useThisWhen": [
        "Reactive renewal outreach",
        "High churn risk"
      ],
      "inputNeeded": "Usage data; Renewal dates.",
      "outputDelivered": [
        "Renewal Sequence",
        "Save Playbook"
      ],
      "doNotUseWhen": [
        "No subscription model"
      ],
      "useCases": [
        "Usage-drop save sequence",
        "Proactive renewal playbook"
      ]
    }
  },
  {
    "id": "MT",
    "name": "Map",
    "role": "Territory",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Generates territory plan templates to ensure even market coverage.",
    "oracleInsight": "Mapping the tactical coverage of your market territory.",
    "color": "from-indigo-400 to-blue-500",
    "icon": "/agent-icons/🗺️.png",
    "url": "https://territory.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MAP",
    "suggestedPreviousNode": "RO1",
    "toolCard": {
      "purpose": "Generates territory plan templates to ensure even market coverage.",
      "useThisWhen": [
        "Territory plans not documented",
        "Uneven coverage"
      ],
      "inputNeeded": "Region data; Rep list.",
      "outputDelivered": [
        "Territory Plan Template",
        "Coverage Map"
      ],
      "doNotUseWhen": [
        "No defined territories"
      ],
      "useCases": [
        "Regional territory plan",
        "Sales coverage map"
      ]
    }
  },
  {
    "id": "MAP",
    "name": "Mutual",
    "role": "Action Plans",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Generates mutual action plan templates to clarify milestones with buyers.",
    "oracleInsight": "Synchronizing the path to purchase with the buyer's internal rhythm.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "🤝",
    "url": "https://action-plans.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "ECS",
    "suggestedPreviousNode": "MT",
    "toolCard": {
      "purpose": "Generates mutual action plan templates to clarify milestones with buyers.",
      "useThisWhen": [
        "No mutual action plans",
        "Deals slipping"
      ],
      "inputNeeded": "Deal milestones; Buyer owners.",
      "outputDelivered": [
        "Mutual Action Plan",
        "Milestone Tracker"
      ],
      "doNotUseWhen": [
        "Transactional sales"
      ],
      "useCases": [
        "Enterprise MAP spreadsheet",
        "Deal milestone tracker"
      ]
    }
  },
  {
    "id": "HS",
    "name": "Handoff",
    "role": "Success",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Standardizes sales-to-success handoff briefs to align expectations.",
    "oracleInsight": "Ensuring the seamless transition of tactical responsibility.",
    "color": "from-emerald-400 to-green-500",
    "icon": "🤝",
    "url": "https://success.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RO1",
    "suggestedPreviousNode": "SR1",
    "toolCard": {
      "purpose": "Standardizes sales-to-success handoff briefs to align expectations.",
      "useThisWhen": [
        "Messy handoffs",
        "Misaligned expectations"
      ],
      "inputNeeded": "Deal summary; Customer goals.",
      "outputDelivered": [
        "Handoff Brief Template",
        "Deal Summary Doc"
      ],
      "doNotUseWhen": [
        "No post-sales team"
      ],
      "useCases": [
        "AE-to-CSM handoff brief",
        "Customer goal alignment doc"
      ]
    }
  },
  {
    "id": "RO1",
    "name": "Ramp",
    "role": "Onboarding",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Outputs 30-60-90 day onboarding plans for new sales hires.",
    "oracleInsight": "Accelerating the tactical integration of new sales units.",
    "color": "from-sky-400 to-blue-500",
    "icon": "📈",
    "url": "https://onboarding.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MT",
    "suggestedPreviousNode": "HS",
    "toolCard": {
      "purpose": "Outputs 30-60-90 day onboarding plans for new sales hires.",
      "useThisWhen": [
        "Unstructured onboarding",
        "Slow rep ramp"
      ],
      "inputNeeded": "Sales resources; Training goals.",
      "outputDelivered": [
        "30-60-90 Onboarding Plan",
        "Ramp Roadmap"
      ],
      "doNotUseWhen": [
        "No new hires"
      ],
      "useCases": [
        "AE onboarding roadmap",
        "New hire ramp plan"
      ]
    }
  },
  {
    "id": "SI2",
    "name": "SPIFF",
    "role": "Incentives",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Designs sales contest rules and incentive plans to drive specific behavior.",
    "oracleInsight": "Incentivizing the specific behaviors that drive system growth.",
    "color": "from-yellow-400 to-amber-500",
    "icon": "🏆",
    "url": "https://incentives.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "FWL",
    "suggestedPreviousNode": "SQ",
    "toolCard": {
      "purpose": "Designs sales contest rules and incentive plans to drive specific behavior.",
      "useThisWhen": [
        "No clear incentive structure",
        "Need to drive pipeline"
      ],
      "inputNeeded": "Growth targets; Budget.",
      "outputDelivered": [
        "SPIFF Plan",
        "Contest Rules"
      ],
      "doNotUseWhen": [
        "No incentive budget"
      ],
      "useCases": [
        "Pipeline creation SPIFF",
        "Sales contest design"
      ]
    }
  },
  {
    "id": "FWL",
    "name": "Forensic",
    "role": "Win/Loss",
    "category": "Sales",
    "squadId": "SQUAD5C_3",
    "description": "Systematizes win/loss insights with interview guides and summary templates.",
    "oracleInsight": "Extracting the forensic truth from every won or lost battle.",
    "color": "from-slate-500 to-gray-600",
    "icon": "/agent-icons/🕵️.png",
    "url": "https://win/loss.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SQ",
    "suggestedPreviousNode": "SI2",
    "toolCard": {
      "purpose": "Systematizes win/loss insights with interview guides and summary templates.",
      "useThisWhen": [
        "Win/loss insights not documented",
        "Repeated mistakes"
      ],
      "inputNeeded": "Deal notes; Customer feedback.",
      "outputDelivered": [
        "Win/Loss Interview Guide",
        "Quarterly Report Template"
      ],
      "doNotUseWhen": [
        "No deal history"
      ],
      "useCases": [
        "Quarterly win/loss report",
        "Win/loss interview framework"
      ]
    }
  },
  {
    "id": "PS1",
    "name": "Protocol",
    "role": "SOPs",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Converts tribal knowledge into AI-drafted SOPs for critical workflows.",
    "oracleInsight": "Codifying tribal knowledge into immutable operational protocols.",
    "color": "from-teal-600 to-emerald-700",
    "icon": "📜",
    "url": "https://sops.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "FM",
    "suggestedPreviousNode": "CO",
    "toolCard": {
      "purpose": "Converts tribal knowledge into AI-drafted SOPs for critical workflows.",
      "useThisWhen": [
        "Key processes undocumented",
        "Knowledge silos exist"
      ],
      "inputNeeded": "Process steps; Tribal knowledge notes.",
      "outputDelivered": [
        "SOP Draft",
        "Workflow Protocol"
      ],
      "doNotUseWhen": [
        "Process is highly creative/variable"
      ],
      "useCases": [
        "Fulfillment SOPs",
        "Returns processing guide"
      ]
    }
  },
  {
    "id": "FM",
    "name": "Flow",
    "role": "Mapping",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Generates visual flowchart specs and swimlane diagrams for core workflows.",
    "oracleInsight": "Visualizing the kinetic flow of operational energy through the system.",
    "color": "from-cyan-500 to-blue-600",
    "icon": "/agent-icons/🗺️.png",
    "url": "https://mapping.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RO2",
    "suggestedPreviousNode": "PS1",
    "toolCard": {
      "purpose": "Generates visual flowchart specs and swimlane diagrams for core workflows.",
      "useThisWhen": [
        "No visual process maps",
        "Onboarding confusion"
      ],
      "inputNeeded": "Process steps; Owner list.",
      "outputDelivered": [
        "Flowchart Spec",
        "Swimlane Diagram"
      ],
      "doNotUseWhen": [
        "Simple linear tasks"
      ],
      "useCases": [
        "Onboarding journey map",
        "Core workflow visualization"
      ]
    }
  },
  {
    "id": "RO2",
    "name": "RACI",
    "role": "Ownership",
    "category": "Operations",
    "squadId": "SQUAD2A_1",
    "description": "Outputs RACI matrices and routing rules to clarify task ownership.",
    "oracleInsight": "Eliminating ambiguity through absolute ownership mapping.",
    "color": "from-slate-600 to-gray-700",
    "icon": "🎯",
    "url": "https://ownership.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC1",
    "suggestedPreviousNode": "FM",
    "toolCard": {
      "purpose": "Outputs RACI matrices and routing rules to clarify task ownership.",
      "useThisWhen": [
        "Manual task routing",
        "Unclear ownership"
      ],
      "inputNeeded": "Task list; Team roles.",
      "outputDelivered": [
        "RACI Matrix",
        "Routing Rulebook"
      ],
      "doNotUseWhen": [
        "Solo operations"
      ],
      "useCases": [
        "Support escalation mapping",
        "Project ownership table"
      ]
    }
  },
  {
    "id": "SI3",
    "name": "Stock",
    "role": "Inventory",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Generates reorder-point models and inventory logic documentation.",
    "oracleInsight": "Optimizing the material reserves for maximum cash-flow velocity.",
    "color": "from-emerald-500 to-green-600",
    "icon": "📦",
    "url": "https://inventory.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LW",
    "suggestedPreviousNode": "RL",
    "toolCard": {
      "purpose": "Generates reorder-point models and inventory logic documentation.",
      "useThisWhen": [
        "Inventory logic in spreadsheets",
        "Stockouts/Overstock"
      ],
      "inputNeeded": "SKU data; Lead times; Sales velocity.",
      "outputDelivered": [
        "Reorder Formula",
        "Inventory Strategy"
      ],
      "doNotUseWhen": [
        "Service-based business"
      ],
      "useCases": [
        "Retail reorder model",
        "SKU optimization"
      ]
    }
  },
  {
    "id": "LC1",
    "name": "Load",
    "role": "Capacity",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Drafts capacity model templates to align headcount with volume.",
    "oracleInsight": "Balancing system load against operational capacity.",
    "color": "from-blue-500 to-indigo-600",
    "icon": "⚖️",
    "url": "https://capacity.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SS1",
    "suggestedPreviousNode": "RO2",
    "toolCard": {
      "purpose": "Drafts capacity model templates to align headcount with volume.",
      "useThisWhen": [
        "No capacity planning",
        "Overtime/SLA misses"
      ],
      "inputNeeded": "Volume forecasts; Headcount data.",
      "outputDelivered": [
        "Capacity Model",
        "Headcount Planner"
      ],
      "doNotUseWhen": [
        "Fixed workload"
      ],
      "useCases": [
        "Service team planner",
        "Volume vs Headcount audit"
      ]
    }
  },
  {
    "id": "RI1",
    "name": "Runbook",
    "role": "Incidents",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Produces incident runbooks for critical system outages and failures.",
    "oracleInsight": "Deploying the tactical response protocol for system recovery.",
    "color": "from-red-600 to-rose-700",
    "icon": "📖",
    "url": "https://incidents.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CO",
    "suggestedPreviousNode": "AC3",
    "toolCard": {
      "purpose": "Produces incident runbooks for critical system outages and failures.",
      "useThisWhen": [
        "Lack of incident runbooks",
        "Outages last too long"
      ],
      "inputNeeded": "System architecture; Failure scenarios.",
      "outputDelivered": [
        "Incident Runbook",
        "Recovery Protocol"
      ],
      "doNotUseWhen": [
        "Non-critical systems"
      ],
      "useCases": [
        "Database outage runbook",
        "Performance degradation guide"
      ]
    }
  },
  {
    "id": "SV",
    "name": "Scorecard",
    "role": "Vendors",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Creates vendor scorecards and RFP templates for formalized evaluation.",
    "oracleInsight": "Auditing the external supply chain for maximum reliability.",
    "color": "from-amber-500 to-orange-600",
    "icon": "📋",
    "url": "https://vendors.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SSL",
    "suggestedPreviousNode": "GR",
    "toolCard": {
      "purpose": "Creates vendor scorecards and RFP templates for formalized evaluation.",
      "useThisWhen": [
        "Vendor evaluation not formalized",
        "High operational risk"
      ],
      "inputNeeded": "Vendor list; Selection criteria.",
      "outputDelivered": [
        "Vendor Scorecard",
        "RFP Template"
      ],
      "doNotUseWhen": [
        "Single-source vendors"
      ],
      "useCases": [
        "Warehouse partner selection",
        "Software vendor audit"
      ]
    }
  },
  {
    "id": "SSL",
    "name": "SLA",
    "role": "Service Levels",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Generates SLA documents to clarify targets and expectations.",
    "oracleInsight": "Defining the performance threshold for absolute accountability.",
    "color": "from-indigo-500 to-blue-600",
    "icon": "⏱️",
    "url": "https://service-levels.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "JO",
    "suggestedPreviousNode": "SV",
    "toolCard": {
      "purpose": "Generates SLA documents to clarify targets and expectations.",
      "useThisWhen": [
        "SLAs undefined",
        "Customer conflicts"
      ],
      "inputNeeded": "Service targets; Resolution times.",
      "outputDelivered": [
        "SLA Document",
        "Performance Targets"
      ],
      "doNotUseWhen": [
        "Internal-only tasks with no deadlines"
      ],
      "useCases": [
        "Managed services SLA",
        "Internal support targets"
      ]
    }
  },
  {
    "id": "GR",
    "name": "Guide",
    "role": "Reporting",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Creates 'report runbooks' with steps to generate recurring reports.",
    "oracleInsight": "Standardizing the extraction of operational intelligence.",
    "color": "from-slate-500 to-gray-600",
    "icon": "📊",
    "url": "https://reporting.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SV",
    "suggestedPreviousNode": "AM",
    "toolCard": {
      "purpose": "Creates 'report runbooks' with steps to generate recurring reports.",
      "useThisWhen": [
        "Reporting instructions missing",
        "Wasting time re-learning"
      ],
      "inputNeeded": "Data sources; Report frequency.",
      "outputDelivered": [
        "Report Runbook",
        "Step-by-Step Guide"
      ],
      "doNotUseWhen": [
        "One-off ad-hoc reports"
      ],
      "useCases": [
        "Monthly margin report guide",
        "Volume reporting runbook"
      ]
    }
  },
  {
    "id": "LW",
    "name": "Layout",
    "role": "Warehouse",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Proposes optimized warehouse layouts and pick-path diagrams.",
    "oracleInsight": "Optimizing the physical geometry of fulfillment velocity.",
    "color": "from-orange-500 to-amber-600",
    "icon": "/agent-icons/🏗️.png",
    "url": "https://warehouse.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RL",
    "suggestedPreviousNode": "SI3",
    "toolCard": {
      "purpose": "Proposes optimized warehouse layouts and pick-path diagrams.",
      "useThisWhen": [
        "Inefficient layout",
        "High labor costs"
      ],
      "inputNeeded": "Warehouse dimensions; SKU velocity data.",
      "outputDelivered": [
        "Layout Proposal",
        "Pick-Path Diagram"
      ],
      "doNotUseWhen": [
        "Digital-only business"
      ],
      "useCases": [
        "3PL zoning plan",
        "Fast-mover pick optimization"
      ]
    }
  },
  {
    "id": "RL",
    "name": "Route",
    "role": "Logistics",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Outputs route-optimization rulebooks and sample algorithms.",
    "oracleInsight": "Calculating the most efficient path through the logistics grid.",
    "color": "from-blue-600 to-cyan-700",
    "icon": "🚚",
    "url": "https://logistics.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SI3",
    "suggestedPreviousNode": "LW",
    "toolCard": {
      "purpose": "Outputs route-optimization rulebooks and sample algorithms.",
      "useThisWhen": [
        "Unstructured route planning",
        "High fuel costs"
      ],
      "inputNeeded": "Delivery points; Vehicle capacity.",
      "outputDelivered": [
        "Route Rulebook",
        "Optimization Algorithm"
      ],
      "doNotUseWhen": [
        "Fixed delivery routes"
      ],
      "useCases": [
        "Regional delivery planning",
        "Last-mile optimization"
      ]
    }
  },
  {
    "id": "QQ",
    "name": "QC",
    "role": "Quality",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Unifies quality control checklists into a single operational standard.",
    "oracleInsight": "Enforcing absolute quality consistency across all shifts.",
    "color": "from-emerald-600 to-green-700",
    "icon": "✅",
    "url": "https://quality.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "AC3",
    "suggestedPreviousNode": "PS1",
    "toolCard": {
      "purpose": "Unifies quality control checklists into a single operational standard.",
      "useThisWhen": [
        "QC inconsistent by shift",
        "High returns/rework"
      ],
      "inputNeeded": "Current QC notes; Standard requirements.",
      "outputDelivered": [
        "Standard QC Checklist",
        "Quality Protocol"
      ],
      "doNotUseWhen": [
        "No physical product"
      ],
      "useCases": [
        "Factory QC checklist",
        "Inspection standard"
      ]
    }
  },
  {
    "id": "AC3",
    "name": "Audit",
    "role": "Compliance",
    "category": "Operations",
    "squadId": "SQUAD2D",
    "description": "Generates compliance checklists per regulation (ISO, SOC, etc.).",
    "oracleInsight": "Securing the system against regulatory and compliance vectors.",
    "color": "from-slate-700 to-black",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://compliance.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RI1",
    "suggestedPreviousNode": "QQ",
    "toolCard": {
      "purpose": "Generates compliance checklists per regulation (ISO, SOC, etc.).",
      "useThisWhen": [
        "Compliance checklists missing",
        "Audit risk"
      ],
      "inputNeeded": "Target regulation (ISO/SOC); Current controls.",
      "outputDelivered": [
        "Compliance Checklist",
        "Audit Readiness Guide"
      ],
      "doNotUseWhen": [
        "No regulatory requirements"
      ],
      "useCases": [
        "SOC 2 control checklist",
        "ISO readiness audit"
      ]
    }
  },
  {
    "id": "WK",
    "name": "Wiki",
    "role": "Knowledge",
    "category": "Operations",
    "squadId": "SQUAD2A_2",
    "description": "Drafts structured FAQs and indexes for an internal knowledge base.",
    "oracleInsight": "Centralizing the system's collective intelligence for rapid access.",
    "color": "from-indigo-400 to-blue-500",
    "icon": "📚",
    "url": "https://knowledge.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "HSS",
    "suggestedPreviousNode": "CC2",
    "toolCard": {
      "purpose": "Drafts structured FAQs and indexes for an internal knowledge base.",
      "useThisWhen": [
        "No internal knowledge base",
        "Repetitive employee questions"
      ],
      "inputNeeded": "Common questions; Internal policies.",
      "outputDelivered": [
        "Knowledge Base Index",
        "FAQ Set"
      ],
      "doNotUseWhen": [
        "Small team (< 5 people)"
      ],
      "useCases": [
        "Operations Handbook",
        "Internal Wiki seed"
      ]
    }
  },
  {
    "id": "TP1",
    "name": "Template",
    "role": "Projects",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Creates reusable project plan templates with timelines for recurring initiatives.",
    "oracleInsight": "Standardizing the blueprint for recurring tactical rollouts.",
    "color": "from-cyan-400 to-blue-500",
    "icon": "📋",
    "url": "https://projects.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RM",
    "suggestedPreviousNode": "RP",
    "toolCard": {
      "purpose": "Creates reusable project plan templates with timelines for recurring initiatives.",
      "useThisWhen": [
        "Project plans recreated from scratch",
        "Recurring rollouts"
      ],
      "inputNeeded": "Project type; Typical timeline.",
      "outputDelivered": [
        "Project Plan Template",
        "Timeline Blueprint"
      ],
      "doNotUseWhen": [
        "Unique, one-off projects"
      ],
      "useCases": [
        "Store opening template",
        "Software rollout plan"
      ]
    }
  },
  {
    "id": "RM",
    "name": "Risk",
    "role": "Mitigation",
    "category": "Operations",
    "squadId": "SQUAD2D",
    "description": "Generates risk register structures and mitigation examples.",
    "oracleInsight": "Identifying and neutralizing potential disruption vectors.",
    "color": "from-red-500 to-orange-600",
    "icon": "⚠️",
    "url": "https://mitigation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CO",
    "suggestedPreviousNode": "TP1",
    "toolCard": {
      "purpose": "Generates risk register structures and mitigation examples.",
      "useThisWhen": [
        "Risk registers absent",
        "Unanticipated disruptions"
      ],
      "inputNeeded": "Business categories; Potential threats.",
      "outputDelivered": [
        "Risk Register",
        "Mitigation Plan"
      ],
      "doNotUseWhen": [
        "Risk-free environment (impossible)"
      ],
      "useCases": [
        "Supply chain risk log",
        "Operational risk audit"
      ]
    }
  },
  {
    "id": "AM",
    "name": "Agenda",
    "role": "Meetings",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Outputs agenda templates and notes structures for consistent meetings.",
    "oracleInsight": "Optimizing the temporal efficiency of collaborative sessions.",
    "color": "from-slate-400 to-gray-500",
    "icon": "📝",
    "url": "https://meetings.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "GR",
    "suggestedPreviousNode": "RP",
    "toolCard": {
      "purpose": "Outputs agenda templates and notes structures for consistent meetings.",
      "useThisWhen": [
        "Meetings lack structure",
        "No follow-up"
      ],
      "inputNeeded": "Meeting type; Goal.",
      "outputDelivered": [
        "Agenda Template",
        "Notes Structure"
      ],
      "doNotUseWhen": [
        "Casual chats"
      ],
      "useCases": [
        "Weekly ops review agenda",
        "Leadership meeting format"
      ]
    }
  },
  {
    "id": "RP",
    "name": "Retro",
    "role": "Postmortems",
    "category": "Operations",
    "squadId": "SQUAD2C_1",
    "description": "Standardizes postmortem and retrospective templates for learning capture.",
    "oracleInsight": "Extracting tactical intelligence from past operational events.",
    "color": "from-purple-500 to-indigo-600",
    "icon": "🔙",
    "url": "https://postmortems.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "TP1",
    "suggestedPreviousNode": "AM",
    "toolCard": {
      "purpose": "Standardizes postmortem and retrospective templates for learning capture.",
      "useThisWhen": [
        "No standard postmortem template",
        "Repeating mistakes"
      ],
      "inputNeeded": "Incident details; Team feedback.",
      "outputDelivered": [
        "Postmortem Template",
        "Retro Form"
      ],
      "doNotUseWhen": [
        "No incidents/launches to review"
      ],
      "useCases": [
        "Major incident postmortem",
        "Product launch retro"
      ]
    }
  },
  {
    "id": "SS1",
    "name": "Shift",
    "role": "Scheduling",
    "category": "Operations",
    "squadId": "SQUAD2C_2",
    "description": "Drafts scheduling rules and simple optimization models for shifts.",
    "oracleInsight": "Optimizing the human resource grid for maximum coverage.",
    "color": "from-blue-400 to-cyan-500",
    "icon": "⏰",
    "url": "https://scheduling.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LC1",
    "suggestedPreviousNode": "LC1",
    "toolCard": {
      "purpose": "Drafts scheduling rules and simple optimization models for shifts.",
      "useThisWhen": [
        "Ad hoc shift scheduling",
        "Over/understaffing"
      ],
      "inputNeeded": "Staff count; Load expectations.",
      "outputDelivered": [
        "Scheduling Policy",
        "Optimization Model"
      ],
      "doNotUseWhen": [
        "Fixed 9-5 staff"
      ],
      "useCases": [
        "Call center scheduling",
        "Retail shift policy"
      ]
    }
  },
  {
    "id": "JO",
    "name": "Journey",
    "role": "Onboarding",
    "category": "Operations",
    "squadId": "SQUAD2A_3",
    "description": "Creates customer journey maps and touchpoint checklists for onboarding.",
    "oracleInsight": "Mapping the initial trajectory of the customer experience.",
    "color": "from-emerald-400 to-green-500",
    "icon": "🚀",
    "url": "https://onboarding.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "HSS",
    "suggestedPreviousNode": "SSL",
    "toolCard": {
      "purpose": "Creates customer journey maps and touchpoint checklists for onboarding.",
      "useThisWhen": [
        "Unmapped customer onboarding",
        "High initial churn"
      ],
      "inputNeeded": "Product steps; Customer goals.",
      "outputDelivered": [
        "Journey Map",
        "Touchpoint Checklist"
      ],
      "doNotUseWhen": [
        "No onboarding needed"
      ],
      "useCases": [
        "B2B 90-day journey map",
        "SaaS onboarding checklist"
      ]
    }
  },
  {
    "id": "HSS",
    "name": "Help",
    "role": "Self-Service",
    "category": "Operations",
    "squadId": "SQUAD2A_3",
    "description": "Drafts FAQ and how-to article sets from ticket history.",
    "oracleInsight": "Empowering the user through autonomous help content.",
    "color": "from-sky-400 to-blue-500",
    "icon": "❓",
    "url": "https://self-service.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CC2",
    "suggestedPreviousNode": "JO",
    "toolCard": {
      "purpose": "Drafts FAQ and how-to article sets from ticket history.",
      "useThisWhen": [
        "Sparse help content",
        "High support volume"
      ],
      "inputNeeded": "Ticket history; Top issues.",
      "outputDelivered": [
        "FAQ Set",
        "How-To Articles"
      ],
      "doNotUseWhen": [
        "No support history"
      ],
      "useCases": [
        "Help center article gen",
        "Top 50 issue FAQ"
      ]
    }
  },
  {
    "id": "CC2",
    "name": "Change",
    "role": "Comms",
    "category": "Operations",
    "squadId": "SQUAD2C_2",
    "description": "Crafts change management communication playbooks and templates.",
    "oracleInsight": "Managing the system's transition through strategic communication.",
    "color": "from-purple-400 to-pink-500",
    "icon": "📢",
    "url": "https://comms.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "WK",
    "suggestedPreviousNode": "HSS",
    "toolCard": {
      "purpose": "Crafts change management communication playbooks and templates.",
      "useThisWhen": [
        "No change comms plan",
        "Resistance to change"
      ],
      "inputNeeded": "Change details; Stakeholder list.",
      "outputDelivered": [
        "Comms Playbook",
        "Email Templates"
      ],
      "doNotUseWhen": [
        "Minor, invisible changes"
      ],
      "useCases": [
        "System rollout comms",
        "Process change FAQ"
      ]
    }
  },
  {
    "id": "DD1",
    "name": "Dictionary",
    "role": "Data",
    "category": "Operations",
    "squadId": "SQUAD2B",
    "description": "Writes data dictionaries and metric catalogs for single-source truth.",
    "oracleInsight": "Defining the absolute semantic truth of the system's data.",
    "color": "from-blue-700 to-indigo-800",
    "icon": "📖",
    "url": "https://data.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SA1",
    "suggestedPreviousNode": "CC2",
    "toolCard": {
      "purpose": "Writes data dictionaries and metric catalogs for single-source truth.",
      "useThisWhen": [
        "Conflicting numbers",
        "Undocumented data pipelines"
      ],
      "inputNeeded": "Metric list; Data sources.",
      "outputDelivered": [
        "Data Dictionary",
        "Metric Catalog"
      ],
      "doNotUseWhen": [
        "No data reporting"
      ],
      "useCases": [
        "Single-source metric doc",
        "Data pipeline dictionary"
      ]
    }
  },
  {
    "id": "SA1",
    "name": "Script",
    "role": "Automation",
    "category": "Operations",
    "squadId": "SQUAD2B",
    "description": "Generates code snippets (Python, JS) to automate repetitive ops tasks.",
    "oracleInsight": "Automating the repetitive cycles of the operational machine.",
    "color": "from-green-600 to-emerald-700",
    "icon": "💻",
    "url": "https://automation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DD1",
    "suggestedPreviousNode": "DD1",
    "toolCard": {
      "purpose": "Generates code snippets (Python, JS) to automate repetitive ops tasks.",
      "useThisWhen": [
        "Lack of automation scripts",
        "Manual copy-pasting"
      ],
      "inputNeeded": "Task description; Data format.",
      "outputDelivered": [
        "Automation Script",
        "Code Snippet"
      ],
      "doNotUseWhen": [
        "Complex, high-risk automation"
      ],
      "useCases": [
        "CSV to DB sync script",
        "Daily report automation"
      ]
    }
  },
  {
    "id": "CO",
    "name": "Crisis",
    "role": "Operations",
    "category": "Operations",
    "squadId": "SQUAD2D",
    "description": "Formalizes crisis operations playbooks for supply shocks and disasters.",
    "oracleInsight": "Architecting the system's resilience against catastrophic disruption.",
    "color": "from-red-600 to-black",
    "icon": "🌋",
    "url": "https://operations.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PS1",
    "suggestedPreviousNode": "RI1",
    "toolCard": {
      "purpose": "Formalizes crisis operations playbooks for supply shocks and disasters.",
      "useThisWhen": [
        "No crisis ops playbook",
        "Supply chain shocks"
      ],
      "inputNeeded": "Supplier list; Potential disasters.",
      "outputDelivered": [
        "Crisis Ops Playbook",
        "Contingency Plan"
      ],
      "doNotUseWhen": [
        "No operational risk"
      ],
      "useCases": [
        "Supplier failure plan",
        "Disaster recovery ops"
      ]
    }
  },
  {
    "id": "FCF",
    "name": "Forecast",
    "role": "Cash Flow",
    "category": "Finance",
    "squadId": "SQUAD3B_1",
    "description": "Creates robust 13-week cash-flow forecasting models and guides.",
    "oracleInsight": "Visualizing the temporal liquidity of the system's capital reserves.",
    "color": "from-emerald-600 to-teal-700",
    "icon": "💰",
    "url": "https://cash-flow.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "VB1",
    "suggestedPreviousNode": "OT",
    "toolCard": {
      "purpose": "Creates robust 13-week cash-flow forecasting models and guides.",
      "useThisWhen": [
        "Cash-flow in fragile spreadsheets",
        "Poor liquidity visibility"
      ],
      "inputNeeded": "Bank balances; Expected inflows; Planned outflows.",
      "outputDelivered": [
        "13-Week Cash Flow Model",
        "Forecasting Guide"
      ],
      "doNotUseWhen": [
        "No historical spend data"
      ],
      "useCases": [
        "13-week cash flow design",
        "Liquidity audit"
      ]
    }
  },
  {
    "id": "VB1",
    "name": "Variance",
    "role": "Budgeting",
    "category": "Finance",
    "squadId": "SQUAD3B_1",
    "description": "Standardizes budget vs. actuals reporting with commentary structures.",
    "oracleInsight": "Identifying the delta between strategic intent and operational spend.",
    "color": "from-blue-600 to-indigo-700",
    "icon": "📉",
    "url": "https://budgeting.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MUE",
    "suggestedPreviousNode": "FCF",
    "toolCard": {
      "purpose": "Standardizes budget vs. actuals reporting with commentary structures.",
      "useThisWhen": [
        "Budget vs actuals not standardized",
        "Spend drift"
      ],
      "inputNeeded": "Budget data; Actual spend data.",
      "outputDelivered": [
        "Monthly Variance Deck",
        "Budget Commentary Template"
      ],
      "doNotUseWhen": [
        "No formal budget established"
      ],
      "useCases": [
        "Monthly budget review",
        "Departmental spend audit"
      ]
    }
  },
  {
    "id": "MUE",
    "name": "Margin",
    "role": "Unit Economics",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Creates unit economics and contribution margin model templates.",
    "oracleInsight": "Calculating the fundamental profit-velocity of every unit sold.",
    "color": "from-green-600 to-emerald-700",
    "icon": "📈",
    "url": "https://unit-economics.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "EP1",
    "suggestedPreviousNode": "VB1",
    "toolCard": {
      "purpose": "Creates unit economics and contribution margin model templates.",
      "useThisWhen": [
        "Unclear unit economics",
        "Pricing decisions without profit data"
      ],
      "inputNeeded": "COGS; CAC; LTV; Pricing data.",
      "outputDelivered": [
        "Unit Economics Model",
        "LTV/CAC Worksheet"
      ],
      "doNotUseWhen": [
        "Pre-revenue with no cost data"
      ],
      "useCases": [
        "LTV/CAC by segment",
        "Contribution margin audit"
      ]
    }
  },
  {
    "id": "EP1",
    "name": "Elastic",
    "role": "Pricing",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Designs pricing sensitivity analysis models and visualization specs.",
    "oracleInsight": "Modeling the system's demand response to price fluctuations.",
    "color": "from-cyan-500 to-blue-600",
    "icon": "/agent-icons/🏷️.png",
    "url": "https://pricing.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LP",
    "suggestedPreviousNode": "MUE",
    "toolCard": {
      "purpose": "Designs pricing sensitivity analysis models and visualization specs.",
      "useThisWhen": [
        "No structured pricing analysis",
        "Uninformed price moves"
      ],
      "inputNeeded": "Historical price/volume data; Competitor pricing.",
      "outputDelivered": [
        "Price Sensitivity Model",
        "Elasticity Visualization Spec"
      ],
      "doNotUseWhen": [
        "Brand new product with zero data"
      ],
      "useCases": [
        "Price point testing",
        "Elasticity scenario modeling"
      ]
    }
  },
  {
    "id": "LP",
    "name": "Ledger",
    "role": "Payables",
    "category": "Finance",
    "squadId": "SQUAD3B_1",
    "description": "Outputs prioritization rubrics for payables based on terms and criticality.",
    "oracleInsight": "Optimizing the outflow of capital for maximum vendor leverage.",
    "color": "from-slate-600 to-gray-700",
    "icon": "🧾",
    "url": "https://payables.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CR2",
    "suggestedPreviousNode": "EP1",
    "toolCard": {
      "purpose": "Outputs prioritization rubrics for payables based on terms and criticality.",
      "useThisWhen": [
        "Ad hoc payables prioritization",
        "Tight cash flow"
      ],
      "inputNeeded": "Invoice list; Vendor terms; Cash availability.",
      "outputDelivered": [
        "Payables Prioritization Matrix",
        "Payment Schedule"
      ],
      "doNotUseWhen": [
        "Unlimited cash reserves"
      ],
      "useCases": [
        "Cash preservation strategy",
        "Vendor payment prioritization"
      ]
    }
  },
  {
    "id": "CR2",
    "name": "Collect",
    "role": "Receivables",
    "category": "Finance",
    "squadId": "SQUAD3B_1",
    "description": "Drafts structured collections outreach scripts and email templates.",
    "oracleInsight": "Accelerating the return of capital into the system's core.",
    "color": "from-amber-600 to-orange-700",
    "icon": "📞",
    "url": "https://receivables.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "UIC",
    "suggestedPreviousNode": "LP",
    "toolCard": {
      "purpose": "Drafts structured collections outreach scripts and email templates.",
      "useThisWhen": [
        "Collections outreach lacks structure",
        "Slow receivables"
      ],
      "inputNeeded": "Delinquency stages; Customer contact info.",
      "outputDelivered": [
        "Collections Script Library",
        "30/60/90-Day Templates"
      ],
      "doNotUseWhen": [
        "No overdue accounts"
      ],
      "useCases": [
        "Overdue account recovery",
        "AR outreach standardization"
      ]
    }
  },
  {
    "id": "UIC",
    "name": "Update",
    "role": "Investor Comms",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Generates concise investor update templates and narrative structures.",
    "oracleInsight": "Synchronizing external stakeholders with the system's growth narrative.",
    "color": "from-indigo-600 to-purple-700",
    "icon": "🤝",
    "url": "https://investor-comms.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "DK",
    "suggestedPreviousNode": "CR2",
    "toolCard": {
      "purpose": "Generates concise investor update templates and narrative structures.",
      "useThisWhen": [
        "Investor updates inconsistent",
        "Fundraising preparation"
      ],
      "inputNeeded": "Key metrics; Narrative highlights; Challenges.",
      "outputDelivered": [
        "Investor Update Template",
        "Monthly Narrative Structure"
      ],
      "doNotUseWhen": [
        "No external investors"
      ],
      "useCases": [
        "Monthly investor email",
        "Board update structure"
      ]
    }
  },
  {
    "id": "DK",
    "name": "Dashboard",
    "role": "KPIs",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Specifies financial KPI dashboard layouts, metrics, and definitions.",
    "oracleInsight": "Visualizing the vital signs of the system's financial health.",
    "color": "from-blue-500 to-cyan-600",
    "icon": "/agent-icons/🖥️.png",
    "url": "https://kpis.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SP2",
    "suggestedPreviousNode": "UIC",
    "toolCard": {
      "purpose": "Specifies financial KPI dashboard layouts, metrics, and definitions.",
      "useThisWhen": [
        "Financial KPIs not defined",
        "Lack of shared performance view"
      ],
      "inputNeeded": "Core financial data; BI tool requirements.",
      "outputDelivered": [
        "CFO Dashboard Spec",
        "Metric Definition Catalog"
      ],
      "doNotUseWhen": [
        "No data visualization tools"
      ],
      "useCases": [
        "CFO dashboard design",
        "Financial metric standardization"
      ]
    }
  },
  {
    "id": "SP2",
    "name": "Scenario",
    "role": "Planning",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Creates three-case (base, upside, downside) financial model templates.",
    "oracleInsight": "Simulating potential futures to fortify the system's resilience.",
    "color": "from-violet-600 to-purple-700",
    "icon": "🎭",
    "url": "https://planning.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CE",
    "suggestedPreviousNode": "DK",
    "toolCard": {
      "purpose": "Creates three-case (base, upside, downside) financial model templates.",
      "useThisWhen": [
        "Scenario planning limited",
        "Uncertain revenue paths"
      ],
      "inputNeeded": "Base case assumptions; Growth/Risk variables.",
      "outputDelivered": [
        "Three-Case Model Template",
        "Scenario Analysis Guide"
      ],
      "doNotUseWhen": [
        "Extremely stable, non-variable business"
      ],
      "useCases": [
        "Hiring & Runway simulation",
        "Growth path evaluation"
      ]
    }
  },
  {
    "id": "CE",
    "name": "Cap",
    "role": "Equity",
    "category": "Finance",
    "squadId": "SQUAD3A",
    "description": "Designs cap table models with sample dilution scenarios.",
    "oracleInsight": "Mapping the ownership architecture of the system's equity.",
    "color": "from-slate-700 to-black",
    "icon": "📊",
    "url": "https://equity.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PE1",
    "suggestedPreviousNode": "SP2",
    "toolCard": {
      "purpose": "Designs cap table models with sample dilution scenarios.",
      "useThisWhen": [
        "Cap table confusion",
        "Fundraising/Option pool planning"
      ],
      "inputNeeded": "Current ownership; Funding round terms.",
      "outputDelivered": [
        "Cap Table Model",
        "Dilution Simulation"
      ],
      "doNotUseWhen": [
        "Sole proprietorship"
      ],
      "useCases": [
        "Funding round simulation",
        "Option pool dilution audit"
      ]
    }
  },
  {
    "id": "PE1",
    "name": "Policy",
    "role": "Expenses",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Drafts clear, modern expense policy documents and audit guides.",
    "oracleInsight": "Enforcing the fiscal discipline of the operational machine.",
    "color": "from-gray-600 to-slate-700",
    "icon": "/agent-icons/🛡️.png",
    "url": "https://expenses.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "GF",
    "suggestedPreviousNode": "CE",
    "toolCard": {
      "purpose": "Drafts clear, modern expense policy documents and audit guides.",
      "useThisWhen": [
        "Expense policies vague",
        "Excessive noncompliant spend"
      ],
      "inputNeeded": "Company size; Travel/Hybrid work requirements.",
      "outputDelivered": [
        "Modern Expense Policy",
        "Compliance Audit Guide"
      ],
      "doNotUseWhen": [
        "No employees/expenses"
      ],
      "useCases": [
        "Hybrid work expense policy",
        "Spend control audit"
      ]
    }
  },
  {
    "id": "GF",
    "name": "Grant",
    "role": "Funding",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Produces strong grant application narratives and checklists.",
    "oracleInsight": "Securing non-dilutive capital through narrative alignment.",
    "color": "from-emerald-500 to-green-600",
    "icon": "📜",
    "url": "https://funding.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "PA",
    "suggestedPreviousNode": "PE1",
    "toolCard": {
      "purpose": "Produces strong grant application narratives and checklists.",
      "useThisWhen": [
        "Grant applications improvised",
        "Missed funding opportunities"
      ],
      "inputNeeded": "Grant criteria; Project details; Company mission.",
      "outputDelivered": [
        "Grant Narrative Draft",
        "Application Checklist"
      ],
      "doNotUseWhen": [
        "No relevant grants available"
      ],
      "useCases": [
        "Non-dilutive funding proposal",
        "Grant alignment narrative"
      ]
    }
  },
  {
    "id": "PA",
    "name": "Prep",
    "role": "Audit",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Outputs audit preparation checklists and document indexes.",
    "oracleInsight": "Preparing the system for absolute external verification.",
    "color": "from-slate-500 to-gray-600",
    "icon": "🔍",
    "url": "https://audit.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MP2",
    "suggestedPreviousNode": "GF",
    "toolCard": {
      "purpose": "Outputs audit preparation checklists and document indexes.",
      "useThisWhen": [
        "Audit prep checklists missing",
        "Audit cycles drag on"
      ],
      "inputNeeded": "Audit type; Financial period.",
      "outputDelivered": [
        "Audit Prep Checklist",
        "Required Document Index"
      ],
      "doNotUseWhen": [
        "No audit scheduled"
      ],
      "useCases": [
        "First-time audit prep",
        "Annual financial audit"
      ]
    }
  },
  {
    "id": "MP2",
    "name": "Matrix",
    "role": "Procurement",
    "category": "Finance",
    "squadId": "SQUAD3B_2",
    "description": "Drafts procurement approval matrices by spend thresholds.",
    "oracleInsight": "Defining the hierarchy of capital deployment authority.",
    "color": "from-blue-700 to-indigo-800",
    "icon": "🏢",
    "url": "https://procurement.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OT",
    "suggestedPreviousNode": "PA",
    "toolCard": {
      "purpose": "Drafts procurement approval matrices by spend thresholds.",
      "useThisWhen": [
        "Procurement approval matrix unclear",
        "Shadow IT/vendors"
      ],
      "inputNeeded": "Spend thresholds; Category owners.",
      "outputDelivered": [
        "Approval Matrix Chart",
        "Procurement Policy Draft"
      ],
      "doNotUseWhen": [
        "Single-person approval for everything"
      ],
      "useCases": [
        "Spend threshold policy",
        "Procurement authority mapping"
      ]
    }
  },
  {
    "id": "OT",
    "name": "Organizer",
    "role": "Tax",
    "category": "Finance",
    "squadId": "SQUAD3B_3",
    "description": "Creates tax document checklists and folder structures.",
    "oracleInsight": "Organizing the system's data for regulatory tax compliance.",
    "color": "from-red-700 to-rose-800",
    "icon": "📁",
    "url": "https://tax.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "FCF",
    "suggestedPreviousNode": "MP2",
    "toolCard": {
      "purpose": "Creates tax document checklists and folder structures.",
      "useThisWhen": [
        "Tax organization ad hoc",
        "Stressful tax fire drills"
      ],
      "inputNeeded": "Tax entity type; Filing requirements.",
      "outputDelivered": [
        "Tax Document Checklist",
        "Folder Structure Spec"
      ],
      "doNotUseWhen": [
        "No tax obligations"
      ],
      "useCases": [
        "Year-end tax prep",
        "CPA handoff organization"
      ]
    }
  },
  {
    "id": "SRD",
    "name": "Scorecard",
    "role": "Role Definition",
    "category": "HR",
    "squadId": "SQUAD2B",
    "description": "Crafts role scorecards and job descriptions with clear competencies.",
    "oracleInsight": "Defining the absolute competency requirements for system roles.",
    "color": "from-blue-400 to-indigo-500",
    "icon": "📋",
    "url": "https://role-definition.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "IS",
    "suggestedPreviousNode": "BA1",
    "toolCard": {
      "purpose": "Crafts role scorecards and job descriptions with clear competencies.",
      "useThisWhen": [
        "Role scorecards unclear",
        "Mis-hiring issues"
      ],
      "inputNeeded": "Role title; Desired outcomes; Competencies.",
      "outputDelivered": [
        "Role Scorecard",
        "Job Description"
      ],
      "doNotUseWhen": [
        "Generic roles with no specific requirements"
      ],
      "useCases": [
        "Head of Growth definition",
        "Engineering role scorecard"
      ]
    }
  },
  {
    "id": "IS",
    "name": "Interview",
    "role": "Selection",
    "category": "HR",
    "squadId": "SQUAD2A_3",
    "description": "Generates structured, competency-based interview question banks.",
    "oracleInsight": "Engineering the selection process for maximum talent signal.",
    "color": "from-indigo-500 to-purple-600",
    "icon": "/agent-icons/🗣️.png",
    "url": "https://selection.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "OI",
    "suggestedPreviousNode": "SRD",
    "toolCard": {
      "purpose": "Generates structured, competency-based interview question banks.",
      "useThisWhen": [
        "Unstructured interviews",
        "Missing red flags in hiring"
      ],
      "inputNeeded": "Role scorecard; Target competencies.",
      "outputDelivered": [
        "Interview Guide",
        "Question Bank"
      ],
      "doNotUseWhen": [
        "Casual, non-competency based hiring"
      ],
      "useCases": [
        "Technical interview guides",
        "Sales competency questions"
      ]
    }
  },
  {
    "id": "OI",
    "name": "Onboard",
    "role": "Integration",
    "category": "HR",
    "squadId": "SQUAD2A_3",
    "description": "Designs standardized 30/60/90 onboarding plans and checklists.",
    "oracleInsight": "Accelerating the tactical integration of new human assets.",
    "color": "from-teal-500 to-emerald-600",
    "icon": "🚀",
    "url": "https://integration.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "RE",
    "suggestedPreviousNode": "IS",
    "toolCard": {
      "purpose": "Designs standardized 30/60/90 onboarding plans and checklists.",
      "useThisWhen": [
        "Inconsistent onboarding",
        "Slow new-hire ramp"
      ],
      "inputNeeded": "Role JD; Company goals; Team structure.",
      "outputDelivered": [
        "30/60/90 Plan",
        "Onboarding Checklist"
      ],
      "doNotUseWhen": [
        "One-day contractor tasks"
      ],
      "useCases": [
        "New hire 90-day plan",
        "Manager onboarding guide"
      ]
    }
  },
  {
    "id": "RE",
    "name": "Review",
    "role": "Evaluation",
    "category": "HR",
    "squadId": "SQUAD2C_2",
    "description": "Creates performance review templates and rating rubrics.",
    "oracleInsight": "Measuring the operational output of system participants.",
    "color": "from-blue-600 to-cyan-700",
    "icon": "📈",
    "url": "https://evaluation.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "GD",
    "suggestedPreviousNode": "OI",
    "toolCard": {
      "purpose": "Creates performance review templates and rating rubrics.",
      "useThisWhen": [
        "Reviews vague or irregular",
        "Lack of expectation clarity"
      ],
      "inputNeeded": "Role scorecards; Review frequency.",
      "outputDelivered": [
        "Review Form",
        "Rating Rubric"
      ],
      "doNotUseWhen": [
        "Informal feedback-only cultures"
      ],
      "useCases": [
        "Annual performance review",
        "Quarterly feedback form"
      ]
    }
  },
  {
    "id": "GD",
    "name": "Growth",
    "role": "Development",
    "category": "HR",
    "squadId": "SQUAD2A_3",
    "description": "Drafts learning path outlines and resource lists for skill growth.",
    "oracleInsight": "Cultivating the system's internal intelligence reserves.",
    "color": "from-emerald-600 to-green-700",
    "icon": "🌱",
    "url": "https://development.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LP1",
    "suggestedPreviousNode": "RE",
    "toolCard": {
      "purpose": "Drafts learning path outlines and resource lists for skill growth.",
      "useThisWhen": [
        "L&D paths undefined",
        "High performer stagnation"
      ],
      "inputNeeded": "Current skill gaps; Desired growth areas.",
      "outputDelivered": [
        "Learning Path",
        "Resource List"
      ],
      "doNotUseWhen": [
        "One-off training sessions"
      ],
      "useCases": [
        "Engineering growth curriculum",
        "Sales skill development"
      ]
    }
  },
  {
    "id": "CV",
    "name": "Culture",
    "role": "Values",
    "category": "HR",
    "squadId": "SQUAD2C_2",
    "description": "Synthesizes leadership input into a clear culture and values handbook.",
    "oracleInsight": "Defining the ethical and behavioral operating system of the organization.",
    "color": "from-orange-500 to-red-600",
    "icon": "/agent-icons/🏛️.png",
    "url": "https://values.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CI",
    "suggestedPreviousNode": "LP1",
    "toolCard": {
      "purpose": "Synthesizes leadership input into a clear culture and values handbook.",
      "useThisWhen": [
        "Culture handbook missing",
        "Misaligned behavior"
      ],
      "inputNeeded": "Leadership values; Behavioral examples.",
      "outputDelivered": [
        "Culture Handbook",
        "Values Document"
      ],
      "doNotUseWhen": [
        "Purely transactional organizations"
      ],
      "useCases": [
        "Founding values doc",
        "Employee handbook seed"
      ]
    }
  },
  {
    "id": "CI",
    "name": "Comms",
    "role": "Internal",
    "category": "HR",
    "squadId": "SQUAD2C_2",
    "description": "Creates internal announcement templates and change FAQ structures.",
    "oracleInsight": "Synchronizing the system's internal narrative during transitions.",
    "color": "from-purple-400 to-pink-500",
    "icon": "📢",
    "url": "https://internal.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CV",
    "suggestedPreviousNode": "CV",
    "toolCard": {
      "purpose": "Creates internal announcement templates and change FAQ structures.",
      "useThisWhen": [
        "Internal comms templates absent",
        "Confusion during changes"
      ],
      "inputNeeded": "Change details; Audience.",
      "outputDelivered": [
        "Announcement Template",
        "Change FAQ"
      ],
      "doNotUseWhen": [
        "External public relations"
      ],
      "useCases": [
        "Org change announcement",
        "Policy update template"
      ]
    }
  },
  {
    "id": "LP1",
    "name": "Ladder",
    "role": "Progression",
    "category": "HR",
    "squadId": "SQUAD2A_3",
    "description": "Generates career ladder drafts by function and level.",
    "oracleInsight": "Mapping the vertical trajectory for system participants.",
    "color": "from-indigo-600 to-blue-700",
    "icon": "🪜",
    "url": "https://progression.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "CV",
    "suggestedPreviousNode": "GD",
    "toolCard": {
      "purpose": "Generates career ladder drafts by function and level.",
      "useThisWhen": [
        "Career ladders not articulated",
        "High-potential attrition"
      ],
      "inputNeeded": "Functional roles; Level definitions.",
      "outputDelivered": [
        "Career Ladder Draft",
        "Expectations Matrix"
      ],
      "doNotUseWhen": [
        "Flat organizations with no levels"
      ],
      "useCases": [
        "Product role levels",
        "Engineering career path"
      ]
    }
  },
  {
    "id": "ER",
    "name": "Exit",
    "role": "Retention",
    "category": "HR",
    "squadId": "SQUAD2C_2",
    "description": "Produces exit interview guides and summary templates for feedback capture.",
    "oracleInsight": "Extracting forensic intelligence from departing assets.",
    "color": "from-slate-500 to-gray-600",
    "icon": "🚪",
    "url": "https://retention.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "BA1",
    "suggestedPreviousNode": "LP1",
    "toolCard": {
      "purpose": "Produces exit interview guides and summary templates for feedback capture.",
      "useThisWhen": [
        "Exit process unstructured",
        "Losing valuable feedback"
      ],
      "inputNeeded": "Departing role; Common exit reasons.",
      "outputDelivered": [
        "Exit Interview Guide",
        "Summary Template"
      ],
      "doNotUseWhen": [
        "No departures"
      ],
      "useCases": [
        "Standardized exit script",
        "Attrition feedback capture"
      ]
    }
  },
  {
    "id": "BA1",
    "name": "Brand",
    "role": "Attraction",
    "category": "HR",
    "squadId": "SQUAD2C_2",
    "description": "Outputs careers page copy packs and recruiting social posts.",
    "oracleInsight": "Projecting the system's identity to attract high-value talent.",
    "color": "from-pink-500 to-rose-600",
    "icon": "✨",
    "url": "https://attraction.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SRD",
    "suggestedPreviousNode": "ER",
    "toolCard": {
      "purpose": "Outputs careers page copy packs and recruiting social posts.",
      "useThisWhen": [
        "Employer branding weak",
        "High time-to-hire"
      ],
      "inputNeeded": "Company culture; Open roles; Employee stories.",
      "outputDelivered": [
        "Careers Page Copy",
        "Social Post Pack"
      ],
      "doNotUseWhen": [
        "No active hiring"
      ],
      "useCases": [
        "Employee spotlight posts",
        "Recruiting campaign copy"
      ]
    }
  },
  {
    "id": "MV",
    "name": "Manifesto",
    "role": "Vision",
    "category": "Product",
    "squadId": "SQUAD3B_3",
    "description": "Drafts concise product vision and narrative manifestos for company alignment.",
    "oracleInsight": "Crystallizing the system's future-state into a compelling narrative manifesto.",
    "color": "from-indigo-600 to-violet-700",
    "icon": "📜",
    "url": "https://vision.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "SR2",
    "suggestedPreviousNode": "MS",
    "toolCard": {
      "purpose": "Drafts concise product vision and narrative manifestos for company alignment.",
      "useThisWhen": [
        "Product vision unclear",
        "Teams pulled in different directions"
      ],
      "inputNeeded": "Core product goals; Target audience; Unique value prop.",
      "outputDelivered": [
        "Product Manifesto",
        "Narrative Doc"
      ],
      "doNotUseWhen": [
        "Purely technical specs with no vision"
      ],
      "useCases": [
        "2-page product manifesto",
        "Company-wide vision alignment"
      ]
    }
  },
  {
    "id": "SR2",
    "name": "Spec",
    "role": "Requirements",
    "category": "Product",
    "squadId": "SQUAD3B_3",
    "description": "Creates standardized PRD templates to ensure engineering alignment.",
    "oracleInsight": "Translating strategic intent into absolute engineering requirements.",
    "color": "from-blue-500 to-cyan-600",
    "icon": "📄",
    "url": "https://requirements.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "IR2",
    "suggestedPreviousNode": "MV",
    "toolCard": {
      "purpose": "Creates standardized PRD templates to ensure engineering alignment.",
      "useThisWhen": [
        "PRDs inconsistent",
        "Engineering misinterpretations"
      ],
      "inputNeeded": "Feature goals; User stories; Technical constraints.",
      "outputDelivered": [
        "Standard PRD Template",
        "Requirement Checklist"
      ],
      "doNotUseWhen": [
        "High-level brainstorms"
      ],
      "useCases": [
        "Feature requirement doc",
        "Engineering alignment spec"
      ]
    }
  },
  {
    "id": "IR2",
    "name": "Insight",
    "role": "Research",
    "category": "Product",
    "squadId": "SQUAD3B_3",
    "description": "Synthesizes customer research into structured insight reports with themes and quotes.",
    "oracleInsight": "Extracting the fundamental truth from customer feedback signals.",
    "color": "from-emerald-500 to-teal-600",
    "icon": "🧠",
    "url": "https://research.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "LI1",
    "suggestedPreviousNode": "SR2",
    "toolCard": {
      "purpose": "Synthesizes customer research into structured insight reports with themes and quotes.",
      "useThisWhen": [
        "Research scattered",
        "No synthesized insights"
      ],
      "inputNeeded": "Interview notes; Survey data; User feedback.",
      "outputDelivered": [
        "Research Synthesis Report",
        "Persona Insight Map"
      ],
      "doNotUseWhen": [
        "Raw data with no context"
      ],
      "useCases": [
        "UX research synthesis",
        "Persona-based insight report"
      ]
    }
  },
  {
    "id": "LI1",
    "name": "Landscape",
    "role": "Intelligence",
    "category": "Product",
    "squadId": "SQUAD3B_3",
    "description": "Produces competitive landscape maps and summary grids per segment.",
    "oracleInsight": "Mapping the rival territory for strategic system positioning.",
    "color": "from-slate-600 to-gray-700",
    "icon": "/agent-icons/🗺️.png",
    "url": "https://intelligence.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MS",
    "suggestedPreviousNode": "IR2",
    "toolCard": {
      "purpose": "Produces competitive landscape maps and summary grids per segment.",
      "useThisWhen": [
        "Competitive mapping outdated",
        "Lagging market shifts"
      ],
      "inputNeeded": "Competitor list; Feature sets; Market segments.",
      "outputDelivered": [
        "Competitor Grid",
        "Landscape Map Summary"
      ],
      "doNotUseWhen": [
        "Internal-only focus"
      ],
      "useCases": [
        "Quarterly strategy review",
        "Market segment mapping"
      ]
    }
  },
  {
    "id": "MS",
    "name": "Memo",
    "role": "Strategy",
    "category": "Product",
    "squadId": "SQUAD3B_3",
    "description": "Drafts all-hands strategy memos and slide outlines from high-level goals.",
    "oracleInsight": "Synchronizing the entire system through a unified strategic narrative.",
    "color": "from-purple-600 to-indigo-700",
    "icon": "📝",
    "url": "https://strategy.itsyouonline.com",
    "status": "Idea",
    "suggestedNextNode": "MV",
    "suggestedPreviousNode": "LI1",
    "toolCard": {
      "purpose": "Drafts all-hands strategy memos and slide outlines from high-level goals.",
      "useThisWhen": [
        "Strategy not translated to narrative",
        "Diluted execution"
      ],
      "inputNeeded": "Bullet-point goals; Quarterly targets.",
      "outputDelivered": [
        "Strategy Memo",
        "All-Hands Slide Outline"
      ],
      "doNotUseWhen": [
        "Confidential board-only docs"
      ],
      "useCases": [
        "Quarterly strategy memo",
        "All-hands strategy deck"
      ]
    }
  }
];

// ==========================================
// THE SQUADS (PROMOTIONAL PACKAGES)
// ==========================================
export const NEXUS_SQUADS: NexusSquad[] = [
  {
    id: "SQUAD1",
    name: "LEGACY VAULT: Exit Readiness",
    colorHex: "#6366f1",
    colorName: "Indigo",
    description: "Transforms founder-run companies into sellable, chairman-led assets.",
    agentIds: ["OE","QM","VF","XD","ZL"],
  },
  {
    id: "SQUAD10",
    name: "CONVERT: Cart",
    colorHex: "#b45309",
    colorName: "Copper",
    description: "Optimized checkout pages and recovery sequences.",
    agentIds: ["SP","CR","VU","SC1","BT"],
  },
  {
    id: "SQUAD2A_1",
    name: "OPS IRON: Foundation I",
    colorHex: "#0d9488",
    colorName: "Teal",
    description: "Core SOPs, playbooks, and organizational workflows.",
    agentIds: ["GS","NS","UE","ZT","PS1","FM","RO2"],
  },
  {
    id: "SQUAD2A_2",
    name: "OPS IRON: Foundation II",
    colorHex: "#0d9488",
    colorName: "Teal",
    description: "Core SOPs, playbooks, and organizational workflows.",
    agentIds: ["SI3","RI1","SSL","LW","RL","QQ","WK"],
  },
  {
    id: "SQUAD2A_3",
    name: "OPS IRON: Foundation III",
    colorHex: "#0d9488",
    colorName: "Teal",
    description: "Core SOPs, playbooks, and organizational workflows.",
    agentIds: ["JO","HSS","IS","OI","GD","LP1"],
  },
  {
    id: "SQUAD2B",
    name: "OPS IRON: Automation",
    colorHex: "#0891b2",
    colorName: "Cyan",
    description: "Technical stacks, automation scripts, and data dictionaries.",
    agentIds: ["IT","NA","DD1","SA1","SRD"],
  },
  {
    id: "SQUAD2C_1",
    name: "OPS IRON: Team & HR I",
    colorHex: "#059669",
    colorName: "Emerald",
    description: "Hiring, training, and cultural alignment systems.",
    agentIds: ["SC","LC1","SV","GR","TP1","AM","RP"],
  },
  {
    id: "SQUAD2C_2",
    name: "OPS IRON: Team & HR II",
    colorHex: "#059669",
    colorName: "Emerald",
    description: "Hiring, training, and cultural alignment systems.",
    agentIds: ["SS1","CC2","RE","CV","CI","ER","BA1"],
  },
  {
    id: "SQUAD2D",
    name: "OPS IRON: Resilience",
    colorHex: "#b91c1c",
    colorName: "Red",
    description: "Risk mitigation, crisis management, and change protocols.",
    agentIds: ["AC3","RM","CO"],
  },
  {
    id: "SQUAD3A",
    name: "CAPITAL FLOOR: Unit Economics",
    colorHex: "#dc2626",
    colorName: "Crimson",
    description: "Pricing matrices, unit economics, and margin audits.",
    agentIds: ["CP","CF","YP","MUE","EP1","CE"],
  },
  {
    id: "SQUAD3B_1",
    name: "CAPITAL FLOOR: Fiscal Control I",
    colorHex: "#991b1b",
    colorName: "Maroon",
    description: "Forecasting, budgeting, and 13-week cash flow models.",
    agentIds: ["FA","PQ","UW","FCF","VB1","LP","CR2"],
  },
  {
    id: "SQUAD3B_2",
    name: "CAPITAL FLOOR: Fiscal Control II",
    colorHex: "#991b1b",
    colorName: "Maroon",
    description: "Forecasting, budgeting, and 13-week cash flow models.",
    agentIds: ["UIC","DK","SP2","PE1","GF","PA","MP2"],
  },
  {
    id: "SQUAD3B_3",
    name: "CAPITAL FLOOR: Fiscal Control III",
    colorHex: "#991b1b",
    colorName: "Maroon",
    description: "Forecasting, budgeting, and 13-week cash flow models.",
    agentIds: ["OT","MV","SR2","IR2","LI1","MS"],
  },
  {
    id: "SQUAD4",
    name: "GROWTH ENGINE: Acquisition",
    colorHex: "#2563eb",
    colorName: "Royal Blue",
    description: "Acquisition roadmaps, hooks, and launch schedules.",
    agentIds: ["DH","DG","EA","FO","MR","RD","TM","WL","WS"],
  },
  {
    id: "SQUAD5A",
    name: "CASH VELOCITY: Conversion",
    colorHex: "#06b6d4",
    colorName: "Cyan",
    description: "VSLs, DM scripts, and high-intensity closing protocols.",
    agentIds: ["JD","KV","LC","DP","ECS"],
  },
  {
    id: "SQUAD5B",
    name: "CASH VELOCITY: Offer Scoping",
    colorHex: "#0891b2",
    colorName: "Dark Cyan",
    description: "Validated offers, scarcity, and scoping logic.",
    agentIds: ["BV","KS"],
  },
  {
    id: "SQUAD5C_1",
    name: "CASH VELOCITY: Follow-up I",
    colorHex: "#0e7490",
    colorName: "Ocean",
    description: "Jolt campaigns and automated follow-up sequences.",
    agentIds: ["JS","LI","MP","QC","XRF","YU","SQ","DD"],
  },
  {
    id: "SQUAD5C_2",
    name: "CASH VELOCITY: Follow-up II",
    colorHex: "#0e7490",
    colorName: "Ocean",
    description: "Jolt campaigns and automated follow-up sequences.",
    agentIds: ["OE1","TCC","QP","CFU","BC","RO","CR1","PD"],
  },
  {
    id: "SQUAD5C_3",
    name: "CASH VELOCITY: Follow-up III",
    colorHex: "#0e7490",
    colorName: "Ocean",
    description: "Jolt campaigns and automated follow-up sequences.",
    agentIds: ["IR1","SR1","MT","MAP","HS","RO1","SI2","FWL"],
  },
  {
    id: "SQUAD6",
    name: "TRUST SHIELD: Compliance",
    colorHex: "#059669",
    colorName: "Emerald",
    description: "Redlined contracts and retention maps.",
    agentIds: ["AC","BR","GL","HP","WR","PR"],
  },
  {
    id: "SQUAD7A",
    name: "BRAND ALIVE: Identity",
    colorHex: "#db2777",
    colorName: "Magenta",
    description: "Brand voice, vision, and core narrative assets.",
    agentIds: ["SI","VB","LV"],
  },
  {
    id: "SQUAD7B",
    name: "BRAND ALIVE: Distribution",
    colorHex: "#be185d",
    colorName: "Rose",
    description: "Multi-channel distribution and syndication frequency.",
    agentIds: ["ES","PS","PSP"],
  },
  {
    id: "SQUAD7C_1",
    name: "BRAND ALIVE: Tribal I",
    colorHex: "#9d174d",
    colorName: "Wine",
    description: "Community engagement and tribal loyalty loops.",
    agentIds: ["HT","OL","PC","VP","PI","TP","BS","NS1","CC"],
  },
  {
    id: "SQUAD7C_2",
    name: "BRAND ALIVE: Tribal II",
    colorHex: "#9d174d",
    colorName: "Wine",
    description: "Community engagement and tribal loyalty loops.",
    agentIds: ["AC2","SR","CS","BA","MP1","OC","SP1","RA","SA"],
  },
  {
    id: "SQUAD7C_3",
    name: "BRAND ALIVE: Tribal III",
    colorHex: "#9d174d",
    colorName: "Wine",
    description: "Community engagement and tribal loyalty loops.",
    agentIds: ["PP","EP","CC1","SI1","ON","LL","PE"],
  },
  {
    id: "SQUAD8",
    name: "INTEL CORE: Recon",
    colorHex: "#ca8a04",
    colorName: "Gold",
    description: "North star roadmaps and competitive intel reports.",
    agentIds: ["AS","IR","TR","CT","SS","RI"],
  },
  {
    id: "SQUAD9",
    name: "SIGNAL: SEO",
    colorHex: "#84cc16",
    colorName: "Olive",
    description: "SEO roadmaps and winnable keyword briefs.",
    agentIds: ["RS","RK","CTS","AC1","SB"],
  },
];

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
