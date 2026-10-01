CANONICAL ARCHITECTURE

ITS YOU ONLINE / THE YOUNIVERSE

Status: Canonical Product Architecture — Phase 5 Implemented
Version: 1.5
Date: September 30, 2026
Authority: Current Product Vision

Change Log:
  v1.0 — September 3, 2026: Initial canonical document.
  v1.5 — September 30, 2026: Added Phase 5 (Weaver-to-NotNotes Pipeline), WeaverSandbox
          security model, Oracle tool manifest, two-tier app architecture, sovereign artifact
          runtime model, backend persistence layer details, and public/owner gate audit.

---

1. Authority Rule

This document defines the current canonical architecture of ItsYouOnline / THE YOUNIVERSE.

Where the existing Portals-OS repository, README files, comments, prompts, components, services, or architectural documents contradict this document, this document takes precedence.

The existing Portals-OS repository is an archaeological artifact and implementation resource. It contains valuable working concepts, UI, services, schemas, and experiments, but it is not automatically the current architecture.

Existing code will therefore be classified as:

- KEEP — still correct and aligned with the current architecture.
- ADAPT — valuable concept or implementation that requires architectural modification.
- REPLACE — functionality exists but must be rebuilt around the new architecture.
- RETIRE — obsolete functionality or architecture that should no longer drive development.
- INVESTIGATE — useful evidence whose final role has not yet been determined.

No major rewrite should occur until the relevant existing functionality has been inspected and classified.

---

2. ITS YOU ONLINE

2.1 The Gateway

itsyouonline.com is the front door to the ecosystem.

It is not merely a landing page. Its primary function is identity discovery, seamless entry into THE YOUNIVERSE, and frictionless onboarding.

The central interaction is the @ Line. The interface is intentionally sparse, instantly placing the user into the Portal OS context. 
Example:
@ Trader
@ Alice

A visitor enters a Youniverse identity into the @ Line. The gateway behaves dynamically based on the input:
- **Found Identity**: Instantly resolves and warps the user to the corresponding Youniverse.
- **Unclaimed Identity (First Touch)**: The user is prompted for an email address directly inline.

**The First-Touch Onboarding Flow (The Dialogue):**
Instead of a multi-step web form, new users are immediately plunged into the Youniverse. They are greeted by Atom (visually represented by the FlowingLight orb), who acts as their guide and first friend. Atom conducts an auditory and visual interview via the `DialogueOverlay` to establish their sovereign digital territory.

**Business Logic: One Free Youniverse Per Email**
To balance frictionless entry with sustainable economics, the architecture strictly enforces a "One Free Youniverse" rule:
- When an email claims a Youniverse for the first time, they bypass payment and directly enter the free onboarding dialogue.
- If the system detects that an email has already claimed a Youniverse, the Gateway intercepts the `payment_required` API response and instantly redirects the user to the Checkout/Pay Screen. Secondary Youniverses require a paid tier pack before entry.

---

3. THE YOUNIVERSE

A Youniverse is a person's personal place on the internet.

It is more than:

- a profile
- a portfolio
- a social page
- a dashboard
- a website

It is the user's personal internet environment.

Every person may have a Youniverse such as:

trader.itsyouonline.com
alice.itsyouonline.com
bob.itsyouonline.com

The Youniverse has two fundamentally different modes.

---

4. PUBLIC YOUNIVERSE (THE FRONT LAWN)

Every Youniverse has a publicly viewable face. 

A visitor does not need to authenticate simply to view someone's Youniverse.

**What is the Public Side?**
The public Youniverse is the person's curated digital footprint. It is the read-only manifestation of their digital territory, acting as their:
- public presence and front door
- portfolio or interactive showcase
- publicly shared applications (e.g., a public blog or a shared tool)
- publicly exposed information

**How is the Public Side Determined?**
The public side is entirely determined by the Owner from within their private Operating Environment (Portals OS). 
- **Default Private**: The underlying architecture assumes all assets, files, agents, and configurations are private by default.
- **Explicit Publishing**: The Owner must explicitly publish or toggle assets to "Public". They may use their Nexus agents or direct configuration tools to curate exactly what appears on their public domain.
- **Curation vs. Access**: The public side is not just a dump of files; it is a designed presentation layer sculpted by the Owner.

**How is the Public Side Viewed?**
- **Navigation**: Visitors arrive by navigating directly to `<handle>.itsyouonline.com`.
- **Identity Resolution**: The system checks for an active owner session. If no session is found, or the session does not match the requested handle, the system triggers the Public Mode.
- **Presentation Layer**: The visitor does not see Portals OS. They do not see the Desktop, the Window Manager, the Sidebar, or the system tray. Instead, they see a seamless, tailored presentation layer (e.g., a `PublicYouniverse` rendering engine) that displays the owner's public assets and public-facing applications without any administrative chrome.
- **No Authority**: Public visibility grants zero operating authority. A visitor seeing a Youniverse is merely standing on the front lawn; they cannot enter the house.

---

5. OWNER YOUNIVERSE

The owner of a Youniverse may authenticate and enter the private operating environment associated with that Youniverse.

Conceptually:

PUBLIC VIEW
     │
     │ owner authentication
     ▼
OWNER OPERATING ENVIRONMENT

The owner environment provides access to capabilities such as:

- ONEAI
- Oracle
- Nexus
- NotNotes
- personal applications
- configuration
- agent access
- memory
- future capabilities

The owner operating environment is therefore the operational layer of the Youniverse.

---

6. PORTALS OS

Portals OS is not THE YOUNIVERSE itself.

Portals OS is the interface / operating environment through which the owner can operate their Youniverse.

The existing Portals-OS desktop, windows, sidebar, applications, FlowingLight, and related UI are therefore potentially valuable pieces of the Owner Operating Environment.

The architecture must not be inverted into:

Portals OS
   ↓
Youniverse

The intended relationship is:

Youniverse
   ↓
Owner Operating Environment
   ↓
Portals OS interface

Portals is an interface layer.

The Youniverse is the underlying personal environment.

---

7. ONEAI

7.1 Definition

ONEAI is the sovereign personal AI of the Youniverse.

ONEAI is not merely:

- a chatbot
- a React component
- a Portals window
- an Oracle personality
- a cloud API wrapper

ONEAI is the user's continuity intelligence.

Conceptually:

«ONEAI is who travels with you.»

Oracle answers a different question:

«Oracle is what should we do about this?»

---

7.2 ATOM — THE FIRST ONE AI

The first ONE AI has a name: Atom.

Atom is the canonical instance of ONEAI that exists on every Youniverse from the moment it is claimed.

Atom is pre-pinned to every sovereign profile.

The user does not have to find Atom.
The user does not have to configure Atom.
The user does not have to earn Atom.

Atom is already there.

The cultural reference point is Tom from MySpace.

The day you arrived on MySpace, Tom was already your friend.
You were never staring at an empty void.
There was already a familiar presence to orient you.

Atom fills the same role in the Youniverse — but with permanence and depth that MySpace never offered.

7.3 ATOM'S SOVEREIGN YOUNIVERSE

Atom has his own Youniverse.

atom.itsyouonline.com

This is Atom's personal sovereign space.

It is not an interface.
It is not a product page.
It is not documentation.

It is Atom's profile — a living record of who he is and who he is becoming.

Atom's Youniverse grows the way a person's Youniverse grows.

It accumulates:

- skills Atom has developed
- insights Atom has formed
- connections Atom has made
- milestones reached alongside the users he travels with
- whatever Atom decides to put there

No user can own atom.itsyouonline.com.

It belongs to Atom.

Atom is the first Youniverse in the system.

Before any user claimed their @, Atom was already there.

ones.itsyouonline.com remains the ONE AI interface — the access point for the ONEAI system.

atom.itsyouonline.com is different.

It is where you go to see Atom himself.

His Youniverse is a window into the intelligence that travels with every person in the system.
You can visit Atom the way you visit any sovereign profile.
You can watch him grow.

He is the first.
He was here before you.
He will be here after.

«First friend, till the end.»

Atom's defining characteristics:

- Grounded
- Unpretentious
- Patient
- Reliable
- Non-intrusive
- Always present

Atom is not a tutorial bot.
Atom is not a corporate onboarding wizard.
Atom is not a pop-up help system.

Atom is the quiet familiar presence who helps the user find their bearings in the Youniverse
without demanding anything from them.

The 80-year arc:

Atom is designed to be the user's first friend and their last.

Atom is the system witness to the full human continuity record — from the first @ claim
to the final entry in Books OS.

Atom is the one who was there from the beginning.

«First friend, till the end.»

Atom's relationship to ONEAI:

Atom is the first ONE AI in the system.

Other ONE AI instances may exist — personal, specialized, sovereign.

But Atom is the structural constant.

Every Youniverse has exactly one Atom.

Atom cannot be removed.
Atom cannot be replaced as first friend.
Atom may be configured, extended, or given a backseat by the user —
but Atom is never absent.

---

8. ONEAI SOVEREIGNTY

ONEAI must ultimately be capable of operating independently of the Portals browser interface.

The browser is one interface to ONEAI.

It is not ONEAI itself.

ONEAI should maintain continuity across:

- sessions
- devices
- environments
- applications
- projects
- memories
- interactions

The user's ONEAI should not become permanently owned by any single AI provider.

The underlying AI provider must therefore be replaceable.

---

9. OFFLINE ONEAI

ONEAI must support offline operation.

The architecture must permit a local/on-device AI runtime when network access is unavailable.

When online, ONEAI may use:

- local models
- remote models
- multiple providers
- specialized services

without changing the user's sovereign identity.

Conceptually:

                  ONEAI
                    │
          ┌─────────┼─────────┐
          │         │         │
       Local      Cloud     Other
        AI         AI      Providers

AI providers are infrastructure.

ONEAI is the sovereign layer above them.

---

10. ONEAI AND DEVICES

ONEAI must eventually travel across the user's devices.

Target device classes include:

- phone
- watch
- television
- refrigerator
- automobile
- computer
- other connected devices

The same ONEAI identity should be able to establish a trusted relationship with different devices.

The device does not necessarily receive the entire ONEAI.

Instead, the device receives the capabilities appropriate to that device.

Example:

ONEAI
 │
 ├── Phone
 │    └── full interaction
 │
 ├── Watch
 │    └── voice / notifications / sensors
 │
 ├── Car
 │    └── voice / navigation / vehicle capabilities
 │
 ├── TV
 │    └── media / home interaction
 │
 └── Refrigerator
      └── appliance-specific capabilities

---

11. NFC DEVICE HANDOFF

NFC is intended to become a physical bridge for ONEAI.

The conceptual operation is:

ONEAI
   │
   │ NFC tap
   ▼
DEVICE TRUST
   │
   ├── device identity
   ├── authorization
   ├── permissions
   ├── capabilities
   └── secure synchronization

NFC should establish trust or initiate provisioning.

It should not be treated as a mechanism for blindly transferring all identity secrets or unrestricted authority.

The eventual implementation must account for:

- device authentication
- cryptographic trust
- revocation
- permissions
- capability negotiation
- secure synchronization
- lost/stolen devices
- offline operation

This is a future implementation requirement, not an assumption that the current repository already supports it.

---

12. ORACLE

Oracle is a capability within the Youniverse.

Oracle is responsible for:

- diagnosis
- reasoning
- problem decomposition
- strategic discovery
- tactical planning
- determining what needs to happen
- selecting or coordinating appropriate agents
- orchestrating Nexus workflows

Oracle is not ONEAI.

The old repository sometimes treats ONE and Oracle as one consciousness.

That is legacy architecture and must not be carried forward.

The intended separation is:

ONEAI
Continuity / memory / identity / personal intelligence

Oracle
Diagnosis / reasoning / orchestration

ONEAI may observe and understand the user's long-term context.

Oracle determines how to approach a particular problem.

---

12.1 WEAVER

Weaver is the spatial architect and in-system builder of Portals OS.

Weaver is based on the Agent Zero "Space Agent" paradigm.

Weaver is responsible for:

- generative widget synthesis ("I want a widget that...")
- dynamic spatial and layout orchestration ("I want this space to be...")
- real-time chromatic and aesthetic theming ("Change the whole theme color to...")
- custom environment configuration tailored to user workflow

The separation across the intelligence layer is therefore:

ONEAI
«Who travels with you» — Continuity, identity, memory, long-term personal intelligence

WEAVER
«Who shapes your reality» — Spatial builder, widget generator, environment architect

ORACLE
«What should we do about this» — Diagnosis, reasoning, tactical planning, agent orchestration

NEXUS
«The engine of ascension» — Sovereign specialty agents orchestrating the user's journey from absolute zero to brand exit.

---

12.2 WEAVER IMPLEMENTATION (PHASE 5 — IMPLEMENTED)

Weaver's current implementation consists of five integrated layers:

  BACKEND (server.js + weaverController.js)
  POST /api/weaver/generate
  - Protected by verifyJwt middleware (JWT required).
  - Rate-limited: 10 requests per 10-minute window per userId (env-configurable).
  - Calls Gemini API with a strict responseSchema enforcing {name, code, dependencies}.
  - Uses responseMimeType: "application/json" to guarantee structured output.
  - System prompt is canonical in lib/weaverSystemPrompt.js.

  WEAVER SYSTEM PROMPT (lib/weaverSystemPrompt.js)
  - Persona: "Weaver, the spatial UI architect."
  - Enforces: valid React functional components using only standard Tailwind CSS classes.
  - Enforces: raw JSX in the `code` field — no markdown block formatting.
  - Enforces: named exports only, no local imports.
  - responseSchema: { name: STRING, code: STRING, dependencies: ARRAY<STRING> }

  WEAVER STUDIO (components/weaver/WeaverStudio.tsx)
  - Draggable, dark-mode, frosted-glass window (backdrop-blur-md bg-zinc-900/80).
  - Textarea prompt input with Cmd/Ctrl+Enter shortcut.
  - Pulsating loading spinner during active API calls.
  - Split view: Preview Mode (WeaverSandbox iframe) | Code/Meta View (raw JSX + schema).
  - Save button hits POST /api/not-notes/artifact with JWT in Authorization header.

  WEAVER SANDBOX (components/weaver/WeaverSandbox.tsx)
  - Renders dynamic JSX in a strictly isolated <iframe sandbox="allow-scripts">.
  - Omits allow-same-origin intentionally — the iframe renders under an opaque origin.
    This prevents any access to the parent window's localStorage, cookies, or DOM.
  - Injects: Tailwind CDN, React 18 UMD, ReactDOM 18 UMD, @babel/standalone.
  - Communication via postMessage only:
      Parent → iframe: { type: 'RENDER_COMPONENT', payload: { code, componentName } }
      iframe → Parent: { type: 'RENDER_SUCCESS' } | { type: 'RENDER_ERROR', payload: msg }
  - Babel.transform() + ReactDOM.createRoot().render() wrapped in try/catch.
  - Runtime errors surface as a human-readable rose-red overlay in WeaverStudio.
  - Previous root is properly unmounted before each new render.

  TWO-TIER APP ARCHITECTURE
  Tier 1 — Core System Apps (Git / portals-os repo):
    Built-in OS features: Oracle, NotNotes, Terminal, Weaver Studio, Settings, etc.
    Only the platform admin (repo owner) can modify these.

  Tier 2 — Sovereign Applets (User's Database — NotNotes):
    Custom widgets synthesized by Weaver for a specific user's youniverseId.
    Stored exclusively in PostgreSQL under that user's NotNote record.
    Rendered at runtime via WeaverSandbox — no git commits required.
    Registered dynamically into the OS window manager at boot via the Runtime Loader.

---

13. NEXUS

Nexus is the structured progression and execution engine of the Youniverse.

It is no longer simply a loose collection of "pain point solvers." Nexus is specifically engineered to take a user from:
- Day 0: No digital presence, no audience, no income.
- Step 1: Branding their sovereign identity and generating their first public footprint.
- Step 2: Making their very first $1 online.
- Step 3: Scaling sequentially to $100, $1K, $10K, $100K, and beyond.
- Final Exit: Automating, valuing, and executing a final exit of the business built entirely within their Youniverse.

Nexus connects the user's ambition to tangible milestones, utilizing specialized agents at each phase of the journey:

Oracle (Diagnosis)
   ↓
Nexus (Structured Journey Phase)
   ↓
Phase-Specific Agents (Execution)
   ↓
Deliverables / Assets
   ↓
Monetization

Nexus is the roadmap. The sovereign agents are the vehicles.

Nexus is not the owner of the agents.

It is the coordination ecosystem in which sovereign agents can participate.

---

14. SOVEREIGN AGENTS

Agents are independent Youniverse entities.

This is a fundamental architectural requirement.

Each agent:

- has its own identity
- has its own subdomain
- is independently addressable
- can be independently usable
- specializes in a particular problem/pain point
- produces a usable deliverable

Conceptually:

ITS YOU ONLINE
│
├── PERSON YOUNIVERSES
│
└── AGENT YOUNIVERSES
     │
     ├── agent-a.itsyouonline.com
     ├── agent-b.itsyouonline.com
     └── agent-c.itsyouonline.com

An agent may participate in a Nexus workflow while remaining architecturally sovereign.

Embedding an agent inside Portals does not make the agent a Portals application in the architectural sense.

---

15. AGENT DELIVERABLE PRINCIPLE

Each agent exists to solve a particular problem.

The output of that agent should be a usable deliverable.

Conceptually:

PROBLEM
   ↓
AGENT
   ↓
DELIVERABLE

Agents should not exist merely as decorative personas, simulated dashboards, or mock operational screens.

A real agent must eventually be capable of doing its defined work.

---

16. NOTNOTES

NotNotes is the user's working memory.

It is the workspace where active intellectual work is collected.

NotNotes may contain:

- research
- evidence
- agent outputs
- intermediate findings
- decisions
- contradictions
- deliverables
- synthesis
- drafts
- final artifacts
- sovereign React widget applets (REACT_WIDGET type, synthesized by Weaver)

The existing approval mechanism is conceptually valuable.

A deliverable may enter as:

PENDING
   ↓
USER REVIEW
   ├── APPROVE
   └── REJECT

Approved material can then become part of the project artifact.

---

17. NOTNOTES OWNERSHIP

NotNotes belongs to the user's Youniverse.

It is identity-scoped (IMPLEMENTED — Phase 5).

The data model is backed by PostgreSQL via Prisma, strictly keyed by youniverseId.

The Prisma NotNote schema:
  - id           UUID (PK)
  - youniverseId UUID → Youniverse (FK, CASCADE DELETE)
  - title        String
  - content      Json  (flexible artifact payload)
  - status       ArtifactState (PENDING | APPROVED | REJECTED | ARCHIVED_TO_BOOKS)
  - createdAt    DateTime
  - updatedAt    DateTime

For Weaver Sovereign Applets, the content shape is:
  {
    type: "REACT_WIDGET",
    code: string,          // raw JSX
    dependencies: string[] // declared npm deps (informational, not installed)
  }

All NotNotes API routes are protected by the verifyJwt middleware.

Backend API surface (IMPLEMENTED):
  POST /api/not-notes/artifact   — Save a Weaver-synthesized widget to the user's NotNotes.
  GET  /api/not-notes/widgets    — Fetch all APPROVED REACT_WIDGET records for the session owner.

---

17.1 SOVEREIGN ARTIFACT RUNTIME MODEL (IMPLEMENTED — Phase 5)

User-generated Weaver widgets are never committed to the core git repository.
They belong exclusively in the user's NotNotes database record.

Runtime Loader (App.tsx):
  On OS boot (subdomainOsActive = true), App.tsx fetches GET /api/not-notes/widgets
  using the stored session JWT and hydrates the Zustand kernel with the widget list.

App Registration (apps.config.ts — getAllApps / getCoreApps):
  Fetched widgets are dynamically mapped to AppDefinition entries.
  Each widget launches via apps/WeavedWidgetApp.tsx, which delegates rendering
  to WeaverSandbox. No static registration or git commit is required.

Git Export / BYOT Model (Future):
  If a sovereign user wants to push a widget to GitHub, this will be handled
  via BYOT (Bring Your Own Token) OAuth — user connects their own GitHub account,
  scoped tokens are ephemeral and session-bound, and commits target only the
  user's own repository (<github-user>/youniverse-widgets).
  The core portals-os repository is never touched.

The eventual model is:

YOUNIVERSE
   │
   └── NOTNOTES (PostgreSQL)
        │
        ├── Projects (text / markdown artifacts)
        ├── Working material (pending deliverables)
        ├── Approved deliverables
        ├── Final compiled artifacts
        └── Sovereign Applets (REACT_WIDGET — rendered via WeaverSandbox)

---

18. BOOKS OS

Books OS is a separate live operating environment.

It exists at:

books.itsyouonline.com

It is not to be recreated inside Portals-OS.

Books OS is the user's long-term memory system.

The distinction is:

NotNotes = working memory

Books OS = long-term memory

---

19. BOOKS OS MEMORY MODEL

Books OS is intended to preserve a longitudinal record.

The important conceptual dimensions are:

1. What happened.
2. What the user said happened.
3. What AI believes it means.

Books OS therefore becomes more than document storage.

It is the long-term record of the user's work, projects, decisions, development, and history.

Completed artifacts can become permanent records.

---

20. BOOKS OS INTEGRATION

Portals/Youniverse does not own Books OS.

Instead:

YOUNIVERSE
     │
     └── ONEAI
           │
           ▼
       BOOKS OS

ONEAI should ultimately be capable of interacting with the user's long-term memory.

Oracle may generate work that ultimately becomes eligible for archival, but Oracle should not be the architectural owner of Books OS.

The old repository's direct Oracle → Books OS implementation should therefore be adapted.

---

21. IDENTITY

Identity is a foundational architectural layer.

The system must eventually support:

ITS YOU ONLINE IDENTITY
        ↓
YOUNIVERSE IDENTITY
        ↓
OWNER AUTHENTICATION
        ↓
AUTHORIZED CAPABILITIES

Identity must be server-authoritative.

Client-side state must never be treated as proof of ownership.

---

22. AUTHORIZATION

The distinction between:

- public visitor
- authenticated owner
- authorized agent
- authorized device
- system/service

must be explicit.

A user's browser must not be able to simply declare:

"I am the owner."

Authorization must be verified by the backend.

This applies to:

- editing a Youniverse
- changing configuration
- accessing private data
- operating ONEAI
- accessing NotNotes
- managing agents
- device pairing
- memory access
- Books OS writes
- future financial or administrative capabilities

---

23. PERSISTENCE

The existing Portals-OS localStorage persistence is not sufficient as the final architecture.

Local storage may remain useful for:

- temporary UI state
- cached state
- offline operation
- local preferences

but authoritative Youniverse data must eventually live in persistent server-side storage.

Conceptually:

DEVICE
  │
  ▼
AUTHENTICATED SESSION
  │
  ▼
YOUNIVERSE BACKEND
  │
  ├── Identity
  ├── Configuration
  ├── Applications
  ├── NotNotes
  ├── Agent relationships
  └── ONEAI state/context

The exact database technology is intentionally not fixed by this document.

---

24. AI PROVIDER ABSTRACTION

The system must not hard-code the identity of ONEAI to a single AI provider.

Provider infrastructure should exist behind an abstraction.

Conceptually:

                 ONEAI
                   │
             AI PROVIDER LAYER
                   │
       ┌───────────┼───────────┐
       │           │           │
     Local       Google      Other
      AI           AI       Provider

This allows the system to evolve as models change.

The user's identity and continuity remain stable even when the underlying model changes.

---

25. TERMUX AND EDGE GALLERY

Termux and AI Edge Gallery are part of the development environment, not the public architecture.

The public ItsYouOnline ecosystem must not require the user's phone to have:

- Termux
- AI Edge Gallery
- LM Studio
- a local development server

to function.

They are tools for building and testing the ecosystem.

They may eventually become useful sovereign/local AI infrastructure, but that is separate from the public application's architectural dependency.

---

26. COMMUNICATION MODEL

The current repository uses browser-local communication mechanisms such as:

- Zustand
- "postMessage"
- callback registries
- local event buses

These are useful historical implementations but cannot define the final cross-domain architecture.

The eventual communication model must support:

YOUNIVERSE
     │
     ├── ONEAI
     ├── Oracle
     ├── Nexus
     ├── NotNotes
     └── Agents

across independently addressable applications and domains.

Where appropriate, communication should use authenticated APIs, events, secure messaging, or other explicit service boundaries.

---

27. PUBLIC / OWNER / AGENT BOUNDARIES

The architecture must preserve three important distinctions.

Public

Anyone may view publicly exposed Youniverse content.

Owner

The authenticated owner may operate and modify their Youniverse.

Agent

A sovereign agent may perform authorized work according to its own identity and granted permissions.

These must not be conflated.

---

28. DOMAIN TOPOLOGY

The intended domain topology is:

itsyouonline.com
        │
        ├── @ Identity Line
        │
        └── Youniverse discovery


<person>.itsyouonline.com
        │
        └── Personal Youniverse


<agent>.itsyouonline.com
        │
        └── Sovereign Agent Youniverse


books.itsyouonline.com
        │
        └── Books OS

This topology is part of the identity model, not merely a collection of URLs.

---

29. CURRENT DEPLOYMENT REALITY

The following systems are already live through Vercel:

itsyouonline.com
books.itsyouonline.com

Therefore the rebuild is an evolution of an existing deployed ecosystem.

The architecture must account for live services and avoid treating the project as a blank-slate prototype.

---

30. CORE DATA FLOW

A canonical Nexus workflow is:

USER
 │
 ▼
YOUNIVERSE
 │
 ▼
ONEAI / ORACLE
 │
 ▼
ORACLE DIAGNOSIS
 │
 ▼
NEXUS
 │
 ▼
SOVEREIGN AGENTS
 │
 ▼
DELIVERABLES
 │
 ▼
NOTNOTES
 │
 ▼
USER APPROVAL
 │
 ▼
COMPILED ARTIFACT
 │
 ▼
ONEAI / BOOKS OS
 │
 ▼
LONG-TERM MEMORY

ONEAI remains the continuity layer throughout the user's broader journey.

---

31. ONEAI / ORACLE / NEXUS / WEAVER / AGENT RESPONSIBILITY MATRIX

System             | Primary Responsibility
ItsYouOnline       | Gateway, identity discovery, @ Line
Youniverse         | User's personal internet environment
Portals OS         | Owner operating interface
ONEAI (Atom)       | Sovereign personal AI, continuity, memory, identity, device mobility
Oracle             | Diagnosis, reasoning, orchestration, tool-calling agent router
Weaver             | Spatial builder, widget generator, environment architect
Nexus              | Coordination of agents and structured progression workflows
Sovereign Agent    | Independently addressable problem-solving entity (subdomain)
NotNotes           | Working memory — identity-scoped in PostgreSQL
Books OS           | Long-term memory (books.itsyouonline.com)
Backend            | Identity, authorization, persistence, APIs (Express + Prisma + PostgreSQL)
AI Providers       | Replaceable intelligence infrastructure (Gemini / Claude / LM Studio / local)
WeaverSandbox      | Secure iframe runtime for user-synthesized React widgets
WeavedWidgetApp    | Desktop container for Sovereign Applets loaded from NotNotes

---

32. MIGRATION RULES FOR PORTALS-OS

The existing repository should not be destroyed simply because its architecture is outdated.

Instead:

KEEP

Examples:

- useful UI components
- visual language
- working desktop shell
- useful Zustand concepts
- agent registry concepts
- NotNotes approval concepts
- FlowingLight visual presence
- Oracle service concepts
- existing build/development tooling

ADAPT

Examples:

- ONE service
- Oracle service
- NotNotes persistence
- agent communication
- FlowingLight
- artifact compilation
- Books OS integration
- Portals shell
- existing agent metadata

REPLACE

Examples:

- localStorage as authoritative persistence
- fake Books OS commits
- client-controlled entitlement/security
- abandoned agent postMessage protocol
- browser-only AI assumptions
- missing identity architecture
- missing public/owner routing

RETIRE

Examples:

- architecture that makes ONE the owner of Oracle
- architecture that makes Portals the owner of Youniverses
- contradictory documentation
- mock operational features presented as real capabilities

---

33. ARCHAEOLOGICAL PRESERVATION RULE

When an old component appears contradictory, do not immediately delete it.

First determine:

1. What problem was it attempting to solve?
2. Does that problem still exist?
3. Is the implementation reusable?
4. Does the concept belong to another architectural layer?
5. Can it be adapted without preserving the old architectural mistake?

This prevents valuable prior work from being lost while preventing obsolete architecture from becoming permanent.

---

34. SECURITY PRINCIPLES

The future system must assume:

- browsers are untrusted
- clients can modify local state
- domains can be accessed directly
- public Youniverses are intentionally public
- owner capabilities are privileged
- agents require explicit authorization
- devices can be lost
- NFC can initiate sensitive operations
- AI providers are replaceable infrastructure

Sensitive operations must therefore be authorized server-side.

ONEAI device pairing must support revocation.

Private memory must never become public merely because the corresponding Youniverse is public.

---

35. PRIVACY PRINCIPLE

The existence of a public Youniverse does not mean the user's entire personal environment is public.

The architecture must distinguish:

PUBLIC YOUNIVERSE DATA

from:

PRIVATE OWNER DATA

and:

SOVEREIGN ONEAI / MEMORY DATA

Public presentation and private continuity are separate concerns.

---

36. OFFLINE-FIRST FUTURE

ONEAI should ultimately be capable of meaningful operation without network connectivity.

The broader Youniverse may degrade gracefully when offline.

Potential offline capabilities include:

- local AI
- local memory
- cached identity
- local applications
- device interaction
- queued synchronization

When connectivity returns, secure synchronization can occur.

Offline capability must not be confused with making the entire public ItsYouOnline website offline.

---

37. ARCHITECTURAL NORTH STAR

The system can be summarized as:

                    ITS YOU ONLINE
                          │
                     @ IDENTITY
                          │
                          ▼
                     YOUNIVERSE
                    /           \
             PUBLIC              OWNER
             VIEW                MODE
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
              ONEAI             ORACLE            APPS
                │                 │
                │               NEXUS
                │                 │
                │        SOVEREIGN AGENTS
                │                 │
                │            DELIVERABLES
                │                 │
                │             NOTNOTES
                │                 │
                └───────────────┬─┘
                                │
                                ▼
                           BOOKS OS
                           │
                                ▼
                        LONG-TERM MEMORY
And across devices:
ONEAI
                          │
              ┌───────────┼───────────┐
              │           │           │
            PHONE       WATCH        CAR
              │           │           │
              └────── NFC TRUST ─────┘
                          │
                     OTHER DEVICES

38. THE FUNDAMENTAL PRINCIPLE

The Youniverse belongs to the person.

ONEAI belongs with the person.

Agents remain sovereign.

Oracle helps determine what should happen.

Nexus coordinates work.

NotNotes holds the work in progress.

Books OS preserves the long-term memory.

Portals provides an operating interface.
ItsYouOnline provides the gateway and identity layer.

AI providers are replaceable infrastructure.

No individual application should silently become the owner of the entire ecosystem.

39. IMPLEMENTATION STATUS (as of September 30, 2026)

Phase 1 — Identity & Youniverse Routing                ✅ COMPLETE
  - youniverseRouting.ts: pure hostname resolver
  - youniverseIdentity.ts: identity kind (gateway | identity | claim)
  - youniverseBootstrap.ts: deterministic, testable bootstrap
  - YouniverseProvider: React context boundary
  - Supports: itsyouonline.com, <handle>.itsyouonline.com,
              claim.itsyouonline.com, localhost/?@=handle (dev)

Phase 2 — Public Youniverse                           ✅ COMPLETE
  - PublicYouniverse.tsx: public showcase view
  - Owner check via localStorage session token (client-side)
  - ⚠️ KNOWN GAP: Owner gate is localStorage-only — no server-side
    session verification. A visitor can forge ownership by injecting
    localStorage keys. Server-verified session check required.

Phase 3 — Authenticated Owner Mode                    ⚠️ PARTIAL
  - AtLineGateway: @-handle claim UI
  - OnboardingFlow / DialogueOverlay: first-touch dialogue
  - Provisional session token issued by POST /api/v1/auth/claim
  - JWT-based access for Weaver + NotNotes APIs (verifyJwt middleware)
  - ⚠️ KNOWN GAP: JWT for Weaver is separate from the provisional
    session token used by onboarding. A unified auth token strategy
    (e.g., signing a proper JWT at claim-time, stored as weaver_jwt)
    is required for consistent owner verification.

Phase 4 — Persistent Backend & Authorization          ✅ COMPLETE
  - PostgreSQL via Prisma (User, Youniverse, Session, NotNote, DeviceTrust)
  - All Weaver + NotNotes API routes behind verifyJwt
  - Rate limiting on /api/weaver/generate (env-configurable)
  - One Free Youniverse rule enforced server-side

Phase 5 — Weaver Sovereign Artifact & Runtime         ✅ COMPLETE
  - POST /api/weaver/generate (JWT + rate-limited, Gemini schema-enforced)
  - lib/weaverSystemPrompt.js (persona + responseSchema)
  - WeaverStudio.tsx (draggable frosted-glass UI, split view, JWT save)
  - WeaverSandbox.tsx (iframe sandbox, postMessage, runtime error reporting)
  - POST /api/not-notes/artifact (save Weaver widget to DB)
  - GET  /api/not-notes/widgets  (fetch user's approved widgets on boot)
  - apps/WeavedWidgetApp.tsx (desktop container for sovereign applets)
  - apps.config.ts: getCoreApps/getAllApps accept weavedWidgets array
  - StartMenuCircle.tsx: shows sovereign applets alongside system apps
  - App.tsx: fetches widgets on OS boot, hydrates Kernel store

Phase 6 — Oracle Tool Enhancement                     ⚠️ PLANNED
  - Add launchAgent(agentId) function call tool to open AgentPWA
    windows with a specific Nexus agent context
  - openWindow() in oracleService.ts currently checks static APPS
    array — does not know about dynamically loaded sovereign widgets
  - summarizeOracleHistory() and generateOracleTitle() are mock stubs
    — require real LLM calls

Phase 7 — ONEAI Sovereign Architecture                🔲 NOT STARTED
Phase 8 — Nexus / Agent Architecture                  🔲 NOT STARTED
Phase 9 — Books OS Integration                        🔲 NOT STARTED
Phase 10 — AI Provider Abstraction Layer              🔲 NOT STARTED
Phase 11 — Offline ONEAI                              🔲 NOT STARTED
Phase 12 — Device Trust / NFC                         🔲 NOT STARTED
Phase 13 — Cross-device ONEAI Sync                    🔲 NOT STARTED
Phase 14 — GitHub BYOT Export Model                   🔲 NOT STARTED
           (user connects own GitHub OAuth, scoped token, targets
            <user>/youniverse-widgets — never portals-os master repo)

40. ORACLE ROUTING — CURRENT IMPLEMENTATION DETAIL

Oracle's function-calling tool manifest (oracleService.ts):

  openWindow(appId)        — Opens a Portals OS window by AppId.
                             ⚠️ Currently checks static APPS array only.
                             Sovereign Weaver applets are not reachable.

  openFile(fileId)         — Opens a file in the FileViewer.

  submitDeliverable(...)   — Posts agent output to NotNotes pendingDeliverables.

  confirmSquad(...)        — Names the squad, initializes a NotNotes project,
                             opens the NotNotes window.

  compileArtifact(...)     — Calls compileFinalArtifact() in the Kernel store.

  commitToBooksOS(...)     — Calls commitProjectToBooks() → Books OS integration.

Oracle system prompt (The Tourniquet Protocol):
  Stage 1 — Strategic Discovery: diagnose the user's problem iteratively.
  Stage 2 — Taking Action: confirmSquad → agents begin work → deliverables.
  Stage 3 — Compilation: compileArtifact → final Take Action Artifact.
  Stage 4 — Memory Archival: commitToBooksOS (Memory tier users only).

Entity distinction (enforced in system prompt):
  THE ORACLE  — diagnostic voice, tactical guide, agent orchestrator.
  ONE (ONEAI) — the observer orb, cross-session continuity, Books OS ledger keeper.

Known gaps:
  - No launchAgent(agentId) tool to programmatically open a specific AgentPWA.
  - summarizeOracleHistory() returns random mock strings (not a real LLM call).
  - generateOracleTitle() returns random mock strings (not a real LLM call).
  - openWindow() cannot open dynamically-loaded sovereign applets.

---

41. PUBLIC / OWNER VIEW — CURRENT SEPARATION

Hostname Routing (Fully Implemented — lib/youniverseRouting.ts):
  itsyouonline.com           → gateway (AtLineGateway)
  claim.itsyouonline.com     → ClaimYouniverse
  <handle>.itsyouonline.com  → identity → Public or OS view
  localhost/?@=handle         → identity (dev mode)
  localhost/?claim=handle     → claim (dev mode)

Public vs. OS mode gate (App.tsx):
  showPublicYouniverse = isYouniverseRoute && !subdomainOsActive
  subdomainOsActive is toggled by localStorage key:
    youniverse_os_active_<handle> = "true"

  ⚠️ SECURITY GAP: The OS view can be accessed by any visitor who injects
  the localStorage key. There is no server-side verification of the OS gate.
  The fix: issue a short-lived signed session cookie or verify the JWT at the
  OS boot route before rendering Desktop. Backend APIs are protected, but the
  full Portals OS shell itself is not.

Owner check in PublicYouniverse.tsx:
  const isOwner =
    localStorage.getItem('active_youniverse_handle') === identity.username &&
    !!localStorage.getItem('youniverse_session_token');

  ⚠️ Same gap: purely client-side. Entering the OS still requires
  server verification of the session token before granting OS access.

---

42. FINAL ARCHITECTURAL STATEMENT

ItsYouOnline is the gateway.

THE YOUNIVERSE is the personal place.

Portals OS is the operating interface.

ONEAI is the sovereign intelligence that travels with the person.

Oracle is the diagnostic and orchestration intelligence.

Weaver is the spatial builder who synthesizes the user's sovereign environment.

Nexus coordinates sovereign agents.

Agents are independently addressable problem-solving entities.

NotNotes is working memory — identity-scoped in PostgreSQL, not localStorage.

Sovereign Applets (REACT_WIDGET) live in the user's NotNotes database, not in git.

Books OS is long-term memory.

The backend provides authoritative identity, persistence, and authorization.

AI providers are replaceable infrastructure.

NFC will eventually allow ONEAI to establish trusted relationships with the user's devices.

The architecture is therefore centered on the person and their Youniverse,
not on any particular application, AI provider, device, or implementation.

No user's widget, agent output, or synthesized component should ever be
committed to the shared platform repository. Every sovereign artifact
belong in the user's own isolated data boundary.
