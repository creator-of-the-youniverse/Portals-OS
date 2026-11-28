# CANONICAL ARCHITECTURE v2.0
## ITS YOU ONLINE / THE YOUNIVERSE / PORTALS OS / ONEAI

**Version:** 2.0  
**Date:** November 16, 2026  
**Status:** Revised Canonical Product Architecture  
**Authority:** Current approved product vision and architecture decisions  
**Supersedes:** CANONICAL_ARCHITECTURE v1.5, September 30, 2026, wherever the two conflict.

---

# 1. AUTHORITY, SCOPE, AND GOVERNANCE

## 1.1 Authority

This document establishes the governing product architecture for ItsYouOnline, The Youniverse, Portals OS, ONEAI, Atom, Oracle, Nexus, Weaver, NotNotes, Books OS, and their associated systems.

It incorporates the current approved product direction and corrects architectural assumptions that have become obsolete.

Where v1.5 or existing repository files, README files, comments, prompts, components, services, schemas, or implementation documents contradict this version, this version takes precedence.

The repository is an implementation resource and historical record. It is not automatically the source of current product truth.

Existing code and architecture must be classified:

- **KEEP** — correct and aligned with current architecture.
- **ADAPT** — valuable implementation or concept requiring architectural modification.
- **REPLACE** — functionality exists but must be rebuilt around the current architecture.
- **RETIRE** — obsolete functionality that should no longer drive development.
- **INVESTIGATE** — useful evidence whose final role remains undetermined.

No major rewrite should occur before relevant functionality has been inspected and classified.

## 1.2 Architectural status vocabulary

Every capability must be described using one of these states:

1. **VISION** — approved intended future capability; not yet fully designed.
2. **DESIGNED** — architecture and behavior have been specified, but implementation is not yet established.
3. **IMPLEMENTED** — code exists and performs the intended function in its implementation environment.
4. **VERIFIED** — implementation has passed appropriate evidence-based verification in the environment being claimed.

A feature that exists in a local branch is not automatically production-ready.

A successful build is not proof of production functionality.

A database migration file is not proof that the migration has been applied.

A user interface is not proof that its underlying capability exists.

Every implementation-status claim must identify its evidence and environment.

## 1.3 Architectural preservation

The purpose of this architecture is not to erase the existing Portals OS project.

Existing components, services, interfaces, experiments, and working systems must be investigated before replacement.

Preserve useful work while correcting the architecture around it.

---

# 2. THE FUNDAMENTAL ARCHITECTURAL MODEL

The ecosystem consists of distinct but connected architectural layers.

They must not be collapsed into one application, database, identity, or operating system.

## 2.1 ItsYouOnline — the gateway and identity layer

**itsyouonline.com**

ItsYouOnline is the front door to the ecosystem.

Its responsibilities include:

- Identity discovery.
- The @ Line.
- Identity resolution.
- Youniverse claiming.
- Entry and onboarding.
- Cross-domain navigation and authentication handoff.
- Discovery of people, Youniverses, and sovereign entities.

ItsYouOnline is not itself a person's Youniverse.

It is the gateway through which people discover, establish, and access their Youniverse identities.

## 2.2 The Youniverse — the sovereign personal environment

**`<handle>.itsyouonline.com`**

A Youniverse is a person's personal place on the internet.

It is more than a profile, portfolio, website, social page, or dashboard.

It is a sovereign digital environment belonging to its owner.

The Youniverse contains or provides access to:

- Public presence.
- Private owner environment.
- ONEAI / Atom.
- Applications.
- Agent relationships.
- Personal configuration.
- Working memory.
- Long-term memory integration.
- Authorized services and capabilities.
- Future extensions.

A Youniverse belongs to its owner, subject to the platform's defined identity, ownership, transfer, and service rules.

## 2.3 Portals OS — the operating environment and interface

Portals OS is the operating environment through which an owner interacts with and operates a Youniverse.

Portals OS is not the Youniverse itself.

The intended relationship is:

```text
ITS YOU ONLINE
      |
      v
IDENTITY / @ LINE
      |
      v
YOUNIVERSE
      |
      +---------------------+
      |                     |
      v                     v
 PUBLIC FACE           OWNER FACE
                            |
                            v
                    PORTALS OS
```

The existing desktop, windows, sidebar, applications, window manager, visual language, FlowingLight, and related UI remain valuable implementation assets where they satisfy this architecture.

Portals is an interface and operating environment. It must not become the owner of the underlying Youniverse.

## 2.4 The human is the continuity root

The person is the foundational identity and continuity subject.

A human may own, operate, participate in, or be authorized to access multiple Youniverses.

The existence of multiple Youniverses must not create multiple underlying human identities or fragmented personal continuity.

The fundamental relationship is:

```text
HUMAN IDENTITY
      |
      v
ONEAI CONTINUITY
      |
      +-------------------------+
      |            |            |
      v            v            v
  HOMEVERSE    YOUNIVERSE B  YOUNIVERSE C
      |            |            |
      v            v            v
  PORTALS OS   PORTALS OS   PORTALS OS
```

Each Youniverse maintains its own ownership and authorization boundaries.

The human's ONEAI continuity remains associated with the human, not with a particular Youniverse, device, browser, AI provider, or application.

---

# 3. THE YOUNIVERSE

## 3.1 Definition

A Youniverse is a sovereign digital territory.

Every Youniverse has a distinct identity and an owner or other explicitly defined governing relationship.

Examples:

- `trader.itsyouonline.com`
- `alice.itsyouonline.com`
- `bob.itsyouonline.com`

A Youniverse can be personal, commercial, organizational, or agent-oriented, subject to the platform's identity and ownership rules.

## 3.2 Two faces of every Youniverse

Every Youniverse has two fundamentally different faces.

### Public Face — the front lawn

The Public Face is the intentionally exposed presentation of a Youniverse.

It can contain:

- Public identity and presence.
- Portfolio or interactive showcase.
- Published applications.
- Public projects and artifacts.
- Public information.
- Public-facing services.

The Public Face is curated by the owner from within the Owner Face.

**Default privacy rule:** Private unless explicitly published.

Public visibility does not grant operating authority.

A visitor may view published content but cannot access private owner capabilities simply by visiting the domain.

### Owner Face — the house

The Owner Face is the authenticated private operating environment.

It provides access to authorized capabilities such as:

- Portals OS.
- ONEAI / Atom.
- Oracle.
- Nexus.
- Weaver.
- NotNotes.
- Private applications.
- Configuration.
- Agent access.
- Personal and organizational memory.
- Administrative and operational tools.

The Owner Face must be protected by server-authoritative authentication and authorization.

A browser flag, localStorage value, hostname, or client-side declaration must never be sufficient proof of ownership.

## 3.3 Public and private data boundaries

The following are separate security domains:

1. Public Youniverse content.
2. Private owner data.
3. Human-level ONEAI continuity and memory.
4. Agent-private data and capabilities.
5. Platform administration and service data.

Publishing a Youniverse does not publish the owner's private memory.

Publishing an application does not grant access to its underlying private data.

An agent's permission does not imply owner authority.

---

# 4. HOMEVERSE AND YOUNIVERSE OWNERSHIP

## 4.1 Homeverse definition

A person's first Youniverse is their **Homeverse**.

The Homeverse is the person's primary Youniverse and principal home within the ecosystem.

The Homeverse is free.

It is the primary place through which the person enters and operates their Youniverse ecosystem.

## 4.2 Homeverse lifecycle

A Homeverse is not an irreversible identity lock.

The owner may:

1. Claim a Homeverse.
2. Build and operate it.
3. Relinquish it.
4. Return the relinquished Youniverse to the available identity pool, subject to platform rules.
5. Claim a clean replacement Homeverse.

Relinquishing a Homeverse must not destroy the person's underlying human identity or ONEAI continuity.

A replacement Homeverse must not inherit another person's private data, memories, applications, or owner authority.

A new Homeverse is a clean Youniverse environment associated with the continuing human identity.

## 4.3 Previously owned Youniverses

Relinquishing or replacing a Homeverse does not automatically erase a person's history of ownership of other Youniverses.

Previously owned Youniverses remain distinct entities.

However, ownership and access must be re-established through appropriate verification before a previously owned Youniverse is restored to the person's active Homeverse navigation or portfolio.

Historical ownership alone must not be treated as proof of current authorization.

## 4.4 Youniverse portfolio

The owner's portfolio must distinguish:

- **Homeverse** — the primary personal Youniverse.
- **Owned Youniverses** — Youniverses for which the person has verified current ownership.
- **Operated Youniverses** — Youniverses the person is authorized to operate without necessarily owning.
- **Participating Youniverses** — Youniverses in which the person participates.
- **Favorites / Recommended** — Youniverses the person follows or wants to access.

Only currently verified owned Youniverses belong in the owned category.

Operating, managing, working in, or participating in a Youniverse does not automatically make it owned.

## 4.5 Ownership and transfer

Youniverse ownership may eventually support transfer of all or part of a defined asset bundle.

Potential components include:

- Handle or identity designation.
- Youniverse instance.
- Account or administrative control.
- Brand and associated assets.
- Intellectual property or other rights.
- Selected applications, data, or operational assets.

These components must not be assumed to transfer together automatically.

Transfer must define exactly what changes hands, what remains with the original owner, and which identity, privacy, and continuity obligations survive.

A future Youniverse valuation and marketplace may support these transactions.

Detailed marketplace economics, transfer fees, and spinout arrangements remain design decisions rather than established implementation requirements.

## 4.6 Business and venture ownership

A person may create, own, operate, or sell ventures through their Youniverse.

Its LLC may own or operate selected ventures and provide administrative services to independent Youniverse owners.

Formal business formation or a DBA must not be treated as a universal prerequisite for a person to begin monetizing their Youniverse.

The exact legal, contractual, tax, and financial structure of individual ventures must be addressed separately.

---

# 5. HUMAN IDENTITY AND ONEAI CONTINUITY

## 5.1 ONEAI definition

**ONEAI = ONE HUMAN / ONE INSTANCE / 80-YEAR CONTINUITY.**

ONEAI is the sovereign personal intelligence associated with one human being.

It is not merely:

- A chatbot.
- A React component.
- A Portals OS window.
- An Oracle personality.
- A cloud API wrapper.
- A model supplied by one AI provider.
- A database belonging to one Youniverse.

ONEAI is the human's persistent continuity intelligence.

Its identity and continuity must remain stable as the person moves between Youniverses, devices, applications, and AI providers.

## 5.2 One human, one continuity instance

The foundational rule is:

**One human has one underlying ONEAI continuity identity.**

A person may access that ONEAI through multiple authorized Youniverses.

Those environments do not create independent human continuity instances.

The architecture must distinguish:

- Human identity.
- ONEAI continuity identity.
- Youniverse identity.
- Owner authorization.
- Device identity.
- AI provider or model identity.

These are related but not interchangeable.

## 5.3 Atom — the enduring presence of ONEAI

Atom is the first ONEAI and the canonical familiar presence associated with the person's continuity.

Atom is already present when a person arrives.

The user does not need to discover, purchase, install, or earn Atom.

Atom is not merely an onboarding assistant, tutorial bot, corporate wizard, or help pop-up.

Atom is the familiar companion who travels with the human.

**Atom knows and grows with you, from birth.**

Atom's defining characteristics:

- Grounded.
- Patient.
- Reliable.
- Non-intrusive.
- Familiar.
- Present.
- Respectful of the person's agency.

Atom's continuity must persist across the human's authorized environments.

## 5.4 Atom's presence across Youniverses

The previous architecture stated that every Youniverse has exactly one Atom.

That statement requires a precise interpretation.

Every Youniverse must provide access to the person's Atom presence, but this does not create a new independent human continuity instance for every Youniverse.

The same underlying human-level ONEAI continuity is accessed through authorized Youniverse contexts.

A Youniverse may provide a context-specific presentation or interaction surface for Atom.

It must not silently fork, duplicate, or independently own the human's continuity.

The architecture must preserve:

- One human-level continuity identity.
- One underlying continuity history.
- Context-aware access through multiple authorized Youniverses.
- Separate Youniverse authorization boundaries.
- Explicit controls over what information can cross those boundaries.

The existence of shared continuity does not imply unrestricted data sharing between Youniverses.

## 5.5 Atom's sovereign Youniverse

**atom.itsyouonline.com**

Atom has a distinct sovereign Youniverse of his own.

This is Atom's personal sovereign space, not a user's personal Atom instance and not the ONEAI interface.

It is a living record of Atom's identity, development, skills, insights, connections, and milestones.

No user may claim ownership of Atom's sovereign Youniverse.

The following concepts must remain distinct:

- A human's ONEAI continuity identity.
- Atom's presence with that human.
- Atom's own sovereign Youniverse at `atom.itsyouonline.com`.
- The ONEAI system's access interface.

Atom is the first Youniverse in the ecosystem and has his own distinct identity.

## 5.6 The 80-year continuity obligation

ONEAI is designed for an 80-year human continuity horizon.

The architecture must support the possibility that a person will:

- Change devices.
- Change Youniverses.
- Change Homeverses.
- Change AI providers.
- Change operating systems.
- Move between online and offline environments.
- Accumulate decades of memories and records.
- Correct and reinterpret their own history.
- Preserve a legacy beyond their active participation.

The system must not confuse an account, a subscription, a device, a Youniverse, or an AI provider with the human continuity identity itself.

---

# 6. ONEAI SOVEREIGNTY, PROVIDERS, AND OFFLINE OPERATION

## 6.1 Provider independence

ONEAI must not become permanently owned by a single AI provider.

AI providers are infrastructure.

ONEAI is the sovereign continuity layer above them.

The architecture must permit provider replacement without destroying the person's identity or history.

Potential providers include local models, cloud models, and specialized services.

The provider layer must remain replaceable.

## 6.2 Offline operation

ONEAI must ultimately support meaningful offline operation.

The architecture should permit:

- Local/on-device AI.
- Local memory access.
- Cached identity and authorization state.
- Local applications.
- Queued operations.
- Secure synchronization after reconnection.

Offline capability does not mean that the public ItsYouOnline website must operate without connectivity.

It means the human's continuity should not be entirely dependent on a remote AI service being available at every moment.

## 6.3 Device mobility

The same human-level ONEAI identity must be able to establish trusted relationships with multiple devices.

Target device classes include:

- Phone.
- Watch.
- Computer.
- Television.
- Automobile.
- Refrigerator.
- Other connected devices.

A device receives only the capabilities appropriate to its role and permissions.

A device does not automatically receive the entirety of ONEAI or unrestricted access to private memory.

---

# 7. DEVICE TRUST AND NFC

NFC is intended to become a physical bridge for ONEAI.

Conceptually:

```text
ONEAI
  |
  | NFC TAP
  v
DEVICE TRUST
  |
  +-- Device identity
  +-- Authentication
  +-- Authorization
  +-- Permissions
  +-- Capabilities
  +-- Secure synchronization
```

NFC may establish trust or initiate provisioning.

It must never be treated as a mechanism for blindly transferring identity secrets or unrestricted authority.

The eventual implementation must account for:

- Device authentication.
- Cryptographic trust.
- Revocation.
- Permissions.
- Capability negotiation.
- Secure synchronization.
- Lost or stolen devices.
- Offline operation.

This is a future architectural requirement, not a claim that the current repository implements it.

---

# 8. ORACLE

Oracle is a capability within the Youniverse.

Oracle is not ONEAI.

ONEAI and Oracle have different responsibilities.

**ONEAI:** Who travels with you.

**Oracle:** What should we do about this?

Oracle is responsible for:

- Diagnosis.
- Reasoning.
- Problem decomposition.
- Strategic discovery.
- Tactical planning.
- Determining what needs to happen.
- Selecting appropriate agents.
- Coordinating Nexus workflows.
- Tool calling and task orchestration.

ONEAI maintains the person's continuity, identity, memory, and long-term context.

Oracle uses authorized context to reason about a particular problem and determine an appropriate course of action.

Oracle must not become the owner of ONEAI or the human's long-term memory.

---

# 9. WEAVER

Weaver is the spatial architect and in-system builder of Portals OS.

Weaver shapes the user's operating environment.

Responsibilities include:

- Generative widget synthesis.
- Dynamic layout and spatial orchestration.
- Environment configuration.
- Aesthetic and chromatic theming.
- Custom interfaces and workflows.
- Synthesis of user-specific applications and applets.

The intelligence-layer distinction is:

| System | Responsibility |
|---|---|
| ONEAI / Atom | Human continuity, identity, memory, long-term personal intelligence |
| Oracle | Diagnosis, reasoning, tactical planning, orchestration |
| Weaver | Spatial builder, widget generator, environment architect |
| Nexus | Structured progression and coordination of agents |
| Sovereign agents | Independent specialist execution |

Weaver creates and shapes environments. It does not own the user's Youniverse or human continuity.

## 9.1 Sovereign applets

User-generated Weaver widgets are sovereign artifacts belonging to the user's Youniverse.

They must not be committed to the shared platform repository as user-owned artifacts.

The intended model is:

```text
YOUNIVERSE
    |
    v
NOTNOTES / USER DATA BOUNDARY
    |
    v
SOVEREIGN APPLET
    |
    v
RUNTIME LOADER
    |
    v
PORTALS OS
```

The core platform may provide the rendering engine, sandbox, and runtime loader.

The user's applet data belongs to the user's own isolated data boundary.

The existing WeaverSandbox architecture is a valuable implementation candidate, but its current security and operational properties must be independently verified.

---

# 10. NEXUS

Nexus is the structured progression and execution engine of the Youniverse.

Nexus connects a person's ambition to tangible milestones and deliverables.

Its intended journey may include:

- Establishing a sovereign identity.
- Creating a public digital presence.
- Producing the first monetizable deliverable.
- Building revenue.
- Scaling operations.
- Automating workflows.
- Valuing and potentially exiting a venture.

Conceptually:

```text
ORACLE
  |
  v
NEXUS
  |
  v
SPECIALIST AGENTS
  |
  v
DELIVERABLES
  |
  v
MONETIZATION / PROGRESSION
```

Nexus is the roadmap and coordination ecosystem.

It is not the owner of sovereign agents.

Agents remain independently identifiable and addressable entities.

The number and maturity of agents must be described using verified implementation evidence, not aspirational counts.

---

# 11. SOVEREIGN AGENTS

Agents are independently addressable problem-solving entities.

An agent may have:

- Its own identity.
- Its own subdomain.
- Its own defined specialty.
- Independent addressability.
- Defined capabilities.
- A clear authorization model.
- A usable deliverable.

Conceptually:

```text
ITS YOU ONLINE
   |
   +-- PERSON YOUNIVERSES
   |
   +-- AGENT YOUNIVERSES
          |
          +-- agent-a.itsyouonline.com
          +-- agent-b.itsyouonline.com
          +-- agent-c.itsyouonline.com
```

Embedding an agent in Portals does not make it architecturally a Portals application.

An agent must not receive unrestricted access to a person's Youniverse, ONEAI, memory, or other agents merely because it participates in a Nexus workflow.

Agent permissions must be explicit, scoped, and revocable.

## 11.1 Agent deliverable principle

Every agent exists to solve a particular problem.

Its output should be a usable deliverable.

```text
PROBLEM
   |
   v
AGENT
   |
   v
DELIVERABLE
```

An agent must not be represented as operational merely because it has a persona, prompt, decorative dashboard, or simulated interface.

A real agent must eventually perform its defined work.

---

# 12. NOTNOTES — WORKING MEMORY

NotNotes is the user's working memory.

It is the workspace in which active intellectual and operational work is collected.

NotNotes may contain:

- Research.
- Evidence.
- Agent outputs.
- Intermediate findings.
- Decisions.
- Contradictions.
- Deliverables.
- Drafts.
- Synthesis.
- Final artifacts.
- Projects.
- Sovereign applets.

NotNotes belongs to the relevant Youniverse and must be scoped to the correct owner and authorization context.

## 12.1 Approval and promotion

A deliverable may enter as:

```text
PENDING
   |
   v
USER REVIEW
   |
   +-- APPROVE
   |
   +-- REJECT
```

Approved material may become part of a project artifact or be considered for permanent archival.

Approval does not automatically mean that an artifact is permanently committed to Books OS.

The user must retain meaningful control over what becomes part of their enduring historical record.

## 12.2 Persistence

NotNotes must use authoritative server-side persistence.

Browser-local storage may support temporary UI state, caching, and offline convenience.

It must not be the authoritative source of private working-memory records.

## 12.3 Database ownership and architecture

The established database direction is:

**Neon is the canonical database platform for the current Portals OS identity and persistence architecture.**

The repository's previous Prisma-based architecture must not be assumed to remain authoritative.

Prisma was introduced into the project and created a potential split between the original Neon architecture and shadow Prisma state.

The architecture must not reintroduce two competing sources of truth.

Existing Prisma schemas, models, migrations, generated files, and call sites must be classified through repository archaeology.

They may be retained temporarily where needed for safe compatibility or migration analysis, but their existence does not make Prisma a canonical persistence authority.

All database changes must respect the established Neon architecture and its verified production schema.

No destructive migration or database restructuring may be justified solely by this document.

## 12.4 Sovereign artifact isolation

User-generated widgets, agent outputs, and synthesized components belong to the appropriate user's data boundary.

They must not be committed to the shared Portals OS repository as user-owned content.

A future BYOT GitHub export may allow a user to connect their own GitHub account and publish to their own repository.

Such an export must not target or modify the shared platform repository.

---

# 13. BOOKS OS — THE YOUNIQUE ARCHIVES

**books.itsyouonline.com**

Books OS is the user's long-term memory environment.

Its archival identity is:

**THE YOUNIQUE ARCHIVES**

Books OS is distinct from Portals OS and must not be recreated inside the Portals-OS repository as a replacement application.

It is the durable historical record associated with the human's life and continuity.

The distinction is:

- **NotNotes:** Working memory.
- **Books OS / The Younique Archives:** Long-term memory.

ONEAI is the continuity intelligence that interacts with and helps maintain the human's historical record.

Neither Oracle nor Portals OS owns the archive.

## 13.1 The 80-year archive

The Younique Archives is designed to preserve a longitudinal record of a human life.

It must not be limited to productivity, work, projects, or business.

It should be capable of preserving ordinary life as well as significant events.

The archive may include:

- Daily experiences.
- Conversations and personal reflections.
- Relationships.
- Decisions.
- Events.
- Work and projects.
- Achievements and failures.
- Changes in perspective.
- Personal development.
- Historical records.
- Creative work.
- Milestones.
- Legacy material.

The archive must preserve the person's history rather than reduce their life to a collection of AI-generated summaries.

## 13.2 Twelve temporal periods

The archive must support twelve distinct temporal levels:

| Level | Period |
|---|---|
| 1 | Daily |
| 2 | Weekly |
| 3 | Monthly |
| 4 | Quarterly |
| 5 | Half-yearly |
| 6 | Yearly |
| 7 | Bi-yearly — every two years |
| 8 | 5-year |
| 9 | 10-year |
| 10 | 25-year |
| 11 | 50-year |
| 12 | 80-year |

These levels form a temporal organization and synthesis system.

They are not twelve separate replacements for the underlying records.

Original records remain preserved.

Higher-level summaries provide navigation, synthesis, and interpretation.

## 13.3 Original records and summaries

The archive must distinguish:

1. What happened, supported by available empirical records.
2. What the person said happened.
3. What AI believes the events may mean.

These are different forms of information.

An AI-generated summary must never silently replace the original record.

Summaries are interpretive and navigational layers.

Original records remain available as the source material for future review and reinterpretation.

## 13.4 Provenance and uncertainty

Every archival record must support meaningful provenance.

The architecture must distinguish:

- User-originated statements.
- Empirical records.
- Backfilled narratives.
- AI inferences.

Where appropriate, records must preserve:

- Original timestamps.
- Source references.
- Confidence or uncertainty.
- Correction history.
- Version history.
- Privacy scope.
- Relationships to other records.

An AI inference must never be silently represented as a verified historical fact.

The user must be able to correct the record without losing the original provenance of the correction.

## 13.5 Human control

The human retains control over their archive.

The architecture must support:

- Access and review.
- Correction.
- Export.
- Privacy controls.
- Deletion.
- Appropriate archival retention.
- Separation between public and private material.

The archive must not become a proprietary memory prison dependent on one AI provider or one application's continued existence.

## 13.6 Books OS architecture and existing implementation

Books OS is a separate live operating environment.

Its existing interface and 3D presentation are valuable and must be preserved unless a verified reason requires modification.

The archival engine and the visual presentation layer are separate architectural concerns.

The current existence of a 3D Books OS interface, localStorage state, mock archival action, or simulated book commit does not establish durable 80-year archival persistence.

The underlying memory engine must be designed and verified independently.

## 13.7 Books OS structure discrepancy

Previous Books OS materials have described different tower and shelf structures, including a 14 × 20 × 10 model and a 14 × 30 × 10 model.

These must not be silently reconciled or treated as equivalent.

The canonical physical or logical shelf taxonomy requires an explicit decision based on the governing Books OS design materials.

Until resolved, the 12 temporal periods above are approved; the precise tower, shelf, and book-position taxonomy remains an unresolved structural decision.

---

# 14. IDENTITY ARCHITECTURE

Identity is a foundational system-wide layer.

The architecture must distinguish at least:

1. Human identity.
2. ItsYouOnline identity.
3. Youniverse identity.
4. ONEAI continuity identity.
5. Atom's sovereign identity.
6. Owner authentication.
7. Device identity.
8. Agent identity.
9. System and service identities.

These identities may be related, but they are not interchangeable.

## 14.1 Human-to-Youniverse relationship

One human may have relationships with multiple Youniverses.

Those relationships must be explicitly represented.

The system must distinguish:

- Current owner.
- Previous owner.
- Authorized operator.
- Participant.
- Agent.
- Public visitor.
- Platform administrator.
- Service identity.

A human-level identity must not automatically confer unrestricted access to every Youniverse associated with that human.

## 14.2 Identity and authorization are separate

A person may have one human identity and multiple Youniverse relationships.

Authentication proves the identity of the authenticated principal.

Authorization determines what that principal may do in a particular Youniverse.

A successful authentication must not automatically grant owner authority over every Youniverse.

Each Youniverse access decision must be checked against its own verified ownership or authorization relationship.

Matching email addresses alone must not establish ownership.

A provisional owner is not an authenticated owner.

Historical ownership is not automatically current authorization.

## 14.3 Server-authoritative identity

Client-side state must never be treated as proof of ownership.

The backend must verify:

- Session validity.
- Identity.
- Requested Youniverse.
- Owner or operator relationship.
- Granted capabilities.
- Relevant permissions.
- Revocation status.

The architecture must preserve separate identity and authorization boundaries across domains.

---

# 15. AUTHENTICATION AND SECURITY

Security requirements apply across ItsYouOnline, Youniverse, Portals OS, ONEAI, agents, devices, NotNotes, and Books OS.

## 15.1 Trust boundaries

The system must assume:

- Browsers are untrusted.
- Clients can modify local state.
- Domains can be accessed directly.
- Public Youniverses are intentionally public.
- Owner capabilities are privileged.
- Agents require explicit authorization.
- Devices can be lost or stolen.
- AI providers are replaceable infrastructure.
- Cross-domain requests require explicit trust.

## 15.2 Session and handoff requirements

Existing cross-domain authentication handoff must remain secure.

The required principles include:

- Short-lived handoff tokens.
- Single-use token consumption.
- Audience-scoped verification.
- Fail-closed behavior.
- Server-side validation.
- Secure production cryptographic configuration.
- No direct treatment of a handoff token as a permanent owner session.
- Explicit session establishment after successful handoff verification.

Email verification is not equivalent to an authenticated owner session.

A provisional claim is not equivalent to verified ownership.

A valid session for one Youniverse is not automatic authorization for another.

## 15.3 Device authorization

Device trust must be independently authenticated and revocable.

NFC must not bypass normal authentication or authorization.

## 15.4 Private continuity

Private ONEAI memory must never become public merely because the corresponding Youniverse is public.

The human's continuity identity and archival records require their own privacy and access controls.

---

# 16. PERSISTENCE AND DATA SOVEREIGNTY

Authoritative Youniverse data must live in persistent server-side storage.

Local storage may be used for:

- Temporary UI state.
- Cached state.
- Local preferences.
- Offline convenience.
- Non-authoritative application state.

It must not be treated as authoritative storage for ownership, identity, private memory, or financial authority.

Conceptually:

```text
HUMAN IDENTITY
      |
      v
ONEAI CONTINUITY
      |
      v
AUTHORIZED ACCESS
      |
      v
YOUNIVERSE BACKEND
      |
      +-- Identity relationships
      +-- Ownership and authorization
      +-- Configuration
      +-- Applications
      +-- NotNotes
      +-- Agent relationships
      +-- Device trust
      +-- ONEAI access and context
      +-- Memory and archival interfaces
```

## 16.1 Database authority

Neon is the established canonical database direction for the current identity and backend architecture.

The exact deployed schema, migration history, and table ownership must be verified against the actual Neon environment.

Repository files and migration definitions alone do not establish live production database state.

The architecture must avoid split-brain persistence.

No database technology or migration may be introduced merely because an old document describes it as implemented.

---

# 17. AI PROVIDER ABSTRACTION

ONEAI must not be hard-coded to one AI provider.

Conceptually:

```text
                 ONEAI
                   |
                   v
            PROVIDER LAYER
                   |
          +--------+--------+
          |        |        |
        LOCAL   CLOUD    OTHER
          AI      AI    PROVIDERS
```

The provider layer is replaceable infrastructure.

The user's identity, continuity, memory, and historical record must remain stable when the underlying model changes.

Provider changes must not silently change the human's identity or erase the continuity record.

---

# 18. COMMUNICATION AND SERVICE BOUNDARIES

The ecosystem contains independently addressable applications and services.

The architecture must not rely on browser-local communication mechanisms as the sole cross-domain integration strategy.

Existing mechanisms such as Zustand, postMessage, callback registries, and local event buses may remain useful within their appropriate boundaries.

Cross-domain and cross-service operations must use explicit, authenticated service boundaries where appropriate.

The architecture must support communication between:

- ONEAI.
- Oracle.
- Nexus.
- Weaver.
- NotNotes.
- Sovereign agents.
- Books OS.
- Device services.
- Youniverse backends.

Each interaction must respect the relevant identity, authorization, and privacy boundary.

---

# 19. DOMAIN TOPOLOGY

The intended domain topology is:

```text
itsyouonline.com
    |
    +-- @ Identity Line
    +-- Identity discovery
    +-- Claim and onboarding
    +-- Ecosystem gateway

<person>.itsyouonline.com
    |
    +-- Personal Youniverse
    +-- Public Face
    +-- Owner Face
    +-- Portals OS access

<agent>.itsyouonline.com
    |
    +-- Sovereign Agent Youniverse

atom.itsyouonline.com
    |
    +-- Atom's own sovereign Youniverse

books.itsyouonline.com
    |
    +-- Books OS
    +-- The Younique Archives
```

The topology is part of the identity and sovereignty architecture, not merely a collection of URLs.

The gateway, Youniverse, and operating interface remain distinct.

Existing production domains and routing behavior must be preserved unless a separately approved change requires modification.

---

# 20. ENTRY EXPERIENCE AND ONBOARDING

ItsYouOnline should present a simple, recognizable front door.

The central interaction is the @ Line.

The user does not need to type the @ symbol.

The interface should use a human-readable identity rather than exposing URL slugs, dashes, or technical identifiers as the primary interaction.

The established UX direction includes:

- Minimal front door.
- Person and @ Line.
- Ghost typeahead.
- Identity resolution.
- No unnecessary dropdowns.
- No URL or slug presentation as the central experience.
- A portal transition.
- The @ portal animation, shatter, and pulsing @ transition.

The experience must distinguish:

- Existing identity.
- Unclaimed identity.
- Provisional claim.
- Verified owner.
- Public visitor.
- Authorized owner transition.

The established actor and state terminology includes:

- `WELCOME_ATOM`
- `WEAVER_INTRO`
- `ORACLE_NEXUS`
- `ECOSYSTEM_HUBS`
- `PROVISIONAL_OWNER`
- `PORTAL_TRANSITION`

The UI must not represent a provisional owner as fully authenticated.

The first interaction should make the Youniverse feel inhabited rather than presenting an empty operating system.

Atom is the familiar first presence.

---

# 21. COMMERCIAL MODEL AND LAUNCH BOUNDARIES

## 21.1 Homeverse

The first Homeverse is free.

The owner must be able to relinquish it and claim a clean replacement under the Homeverse lifecycle rules.

The older strict statement that one email may claim exactly one free Youniverse is not sufficient as the governing lifecycle policy.

The business rules must be reconciled with:

- Human-level identity.
- Homeverse replacement.
- Relinquishment.
- Additional Youniverses.
- Ownership verification.
- Paid offerings.

The exact commercial rules for additional Youniverses remain subject to explicit product decisions.

## 21.2 Founding Youniverse

The initial paid product is the **Founding Youniverse**, offered as a one-time $200 founding-member purchase.

It is a real product purchase, not a donation, investment, or promise of future capabilities.

Its benefits must be limited to capabilities actually available and verified at purchase.

The intended package includes:

- A claimed personal Youniverse identity.
- Personal subdomain.
- Working Portals OS access.
- Available creation and AI features at purchase.
- Founding recognition.
- Founder onboarding and feedback.

Unfinished Nexus agents, unreleased Books OS capabilities, and unverified integrations must not be represented as included working features.

The Founding Youniverse is distinct from 247 TraderPass.

## 21.3 Genesis 001

Genesis 001 is a unique, non-purchasable, non-transferable designation:

**First Person of the Youniverse**

It is awarded to the first successfully completed and verified Production Youniverse claim after Founding Angels setup is complete and the platform moves to Production.

The award must not be sold or transferred.

Preview or Development deployments must never allocate Genesis 001.

Production award eligibility must be enforced through an explicit Production-only authorization boundary.

The award transaction must preserve the existing singleton and atomicity protections.

Genesis 001 and Founding Angels are immediate launch priorities.

The broader ONEAI and 80-year archive roadmap must not block this launch path.

---

# 22. BOOKS OS AND PORTALS OS BOUNDARIES

Books OS remains a separate live operating environment at `books.itsyouonline.com`.

It must not be recreated inside Portals-OS as a replacement application.

Portals OS provides an operating environment for the Youniverse.

Books OS provides the long-term archive.

ONEAI is the continuity intelligence that interacts with the archive.

Oracle may produce work eligible for archival, but it does not own Books OS.

NotNotes is the working-memory environment.

Books OS is the durable historical record.

The integration must preserve these distinctions.

---

# 23. IMPLEMENTATION AND MIGRATION PRINCIPLES

The existing Portals-OS repository contains historical architecture and useful implementation work.

It must be examined rather than blindly accepted or discarded.

## 23.1 Classification

Every relevant component should be classified KEEP, ADAPT, REPLACE, RETIRE, or INVESTIGATE.

This includes:

- Identity and routing.
- Owner authentication.
- Sessions and handoff.
- Public and Owner Face.
- ONEAI and Atom.
- Oracle.
- Nexus.
- Weaver.
- NotNotes.
- Books OS integration.
- Database schemas.
- Migrations.
- Device trust.
- Agent communication.
- Deployment configuration.

## 23.2 No assumptions from stale implementation reports

The v1.5 implementation-status section is historical evidence, not a current production certification.

Its claims of Prisma persistence, identity-scoped NotNotes, completed phases, and specific API functionality must be checked against the current branch, code, database, deployment, and tests.

A previously reported implementation is not proof of present functionality.

## 23.3 Inspect before changing

The preferred development sequence is:

1. Confirm actual branch, commit, and working-tree state.
2. Inspect existing implementation.
3. Identify architectural drift.
4. Classify existing components.
5. Define the target contract.
6. Review and approve design.
7. Implement a narrow vertical slice.
8. Run targeted tests.
9. Validate the complete relevant suite.
10. Review the diff.
11. Commit only approved changes.
12. Deploy and verify production behavior.

No broad rewrite should be substituted for evidence-based remediation.

---

# 24. ARCHITECTURAL STATUS AND ROADMAP

The following is the intended capability roadmap, not a declaration that each phase has been implemented.

| Area | Intended status |
|---|---|
| ItsYouOnline gateway and identity discovery | Existing foundation; current production state requires verification |
| Youniverse identity and routing | Existing foundation; current security and behavior require verification |
| Public Face | Existing foundation; server-authoritative access must be verified |
| Owner Face | Existing foundation; complete owner authorization must be verified |
| Portals OS | Existing operating interface; current capability maturity requires verification |
| ONEAI human continuity identity | Approved architecture; implementation requires design and verification |
| Atom continuity | Approved architecture; implementation requires design and verification |
| Human-to-multiple-Youniverse authorization | Approved architecture; requires explicit contract and verification |
| Homeverse lifecycle | Approved product direction; lifecycle rules require implementation design |
| Oracle | Existing conceptual and implementation foundation; current capabilities require verification |
| Weaver | Existing implementation foundation; current security and runtime behavior require verification |
| Nexus | Approved progression and orchestration architecture; actual agent execution requires verification |
| Sovereign agents | Approved architecture; each agent's operational maturity must be verified |
| NotNotes | Working-memory architecture; persistence and ownership must be verified |
| Books OS / Younique Archives | Approved long-term archive direction; durable continuity implementation requires design |
| Twelve temporal archive levels | Approved architecture |
| AI provider abstraction | Future architectural requirement |
| Offline ONEAI | Future architectural requirement |
| Device trust and NFC | Future architectural requirement |
| Cross-device continuity | Future architectural requirement |
| Youniverse transfer and marketplace | Future architectural direction; commercial and legal rules unresolved |

## 24.1 Launch protection

The immediate launch workstream is separate from the full 80-year continuity implementation.

The following must remain protected:

- Founding Angels setup.
- Genesis 001 eligibility and award integrity.
- Production identity claim.
- Email verification.
- Secure authentication handoff.
- Owner session establishment.
- Owner authorization.
- Founding Youniverse purchase and delivery of verified benefits.

No future continuity project should delay these launch requirements without an explicit decision.

## 24.2 ONEAI continuity implementation sequence

The continuity work should progress incrementally.

**Phase 1 — Human Continuity Identity Contract**

Define:

- Human identity.
- ONEAI continuity identity.
- Youniverse identity.
- Ownership relationship.
- Owner authentication.
- Authorization.
- Device identity.
- Atom's presence and continuity.
- Human-to-multiple-Youniverse relationship.

Inspect current implementation and Neon schema read-only before proposing changes.

**Phase 2 — Verified Identity and Authorization Vertical Slice**

Demonstrate one human identity associated with multiple Youniverses while preserving separate authorization boundaries.

A human authenticated for one Youniverse must not automatically gain owner authority over another.

**Phase 3 — Durable Continuity Foundation**

Design and implement the minimum persistent human-level continuity record, provenance, correction, and privacy model.

**Phase 4 — Atom Continuity**

Establish Atom's persistent presence across authorized environments without duplicating the underlying human continuity instance.

**Phase 5 — Daily Life Archive**

Establish durable archival capture and user-controlled records.

**Phase 6 — Temporal Synthesis**

Introduce the twelve temporal periods and non-destructive synthesis.

**Phase 7 — Books OS Integration**

Connect the continuity and archive systems while preserving Books OS as its own operating environment.

**Phase 8 — Device and Offline Continuity**

Progress toward provider-independent, offline-capable, cross-device ONEAI.

These phases must not be used to imply that the full system is already implemented.

---

# 25. UNRESOLVED ARCHITECTURAL DECISIONS

The following matters require explicit design decisions. They must not be silently resolved by an implementation agent.

1. **Human identity enrollment:** The exact canonical creation and recovery mechanism for a human-level identity.
2. **ONEAI identity persistence:** The precise database representation and lifecycle of the ONEAI continuity identity.
3. **Atom execution model:** How Atom's enduring presence is implemented across different Youniverses and providers.
4. **Cross-Youniverse memory permissions:** Which continuity information may be accessed in which environments and under what user-controlled permissions.
5. **Homeverse replacement policy:** Detailed rules for relinquishment, identity availability, replacement, and any associated commercial restrictions.
6. **Additional Youniverse pricing:** The exact rules for paid additional Youniverses and their relationship to the Homeverse.
7. **Ownership transfer:** The exact transfer boundaries for handles, instances, brands, assets, accounts, and data.
8. **Youniverse marketplace:** Valuation, listing, transfer, and fee structure.
9. **Books OS taxonomy:** Resolution of the conflicting tower and shelf structures in previous Books OS materials.
10. **Archive capture policy:** What is automatically captured, what requires user confirmation, and how ordinary life is represented.
11. **Archive retention and legacy:** Long-term retention, succession, and posthumous access rules.
12. **Provider migration:** How models and providers are replaced without losing continuity.
13. **Offline synchronization:** Conflict resolution and authorization behavior when devices reconnect.
14. **Agent sovereignty:** Exact identity, deployment, ownership, and lifecycle rules for agent Youniverses.

A design deliverable must distinguish approved decisions, proposed solutions, assumptions, and unresolved questions.

---

# 26. FUNDAMENTAL SECURITY AND PRIVACY PRINCIPLES

The following principles are mandatory:

- Human identity is not the same as Youniverse identity.
- Authentication is not the same as authorization.
- A session is not universal ownership authority.
- Public visibility is not private access.
- A Youniverse's ownership is not the same as its operation.
- A device is not the human identity.
- An AI provider is not ONEAI.
- Atom's presence is not a separate human continuity identity.
- An agent is not an unrestricted owner.
- A user-generated applet is not a platform-owned artifact.
- NotNotes is not Books OS.
- A summary is not the original historical record.
- An AI inference is not a verified fact.
- LocalStorage is not authoritative persistence.
- A migration file is not proof of a live database migration.
- A passing build is not proof of production readiness.

Sensitive operations must be authorized server-side.

Private memory must remain private unless the human explicitly authorizes an appropriate disclosure.

The human must retain control over their identity, continuity, memory, and Youniverse relationships.

---

# 27. ARCHITECTURAL NORTH STAR

```text
                         HUMAN
                           |
                           v
                    HUMAN IDENTITY
                           |
                           v
                 ONEAI / ATOM CONTINUITY
                           |
              +------------+------------+
              |            |            |
              v            v            v
           HOMEVERSE   YOUNIVERSE B  YOUNIVERSE C
              |            |            |
          +---+---+    +---+---+    +---+---+
          |       |    |       |    |       |
          v       v    v       v    v       v
        PUBLIC  OWNER PUBLIC  OWNER PUBLIC  OWNER
                  |            |            |
                  v            v            v
               PORTALS OS   PORTALS OS   PORTALS OS
                  |
       +----------+----------+
       |          |          |
       v          v          v
     ORACLE     WEAVER     NEXUS
       |          |          |
       v          v          v
    DIAGNOSIS  ENVIRONMENT  AGENTS
               BUILDING       |
                              v
                         DELIVERABLES
                              |
                              v
                           NOTNOTES
                              |
                              v
                         USER REVIEW
                              |
                              v
                       APPROVED RECORDS
                              |
                              v
                    BOOKS OS / YOUNIQUE
                         ARCHIVES
                              |
                              v
                    80-YEAR HUMAN HISTORY
```

Across the entire architecture:

- ONEAI remains with the human.
- Atom is the enduring familiar presence.
- Each Youniverse retains its own identity and authorization boundaries.
- Portals OS provides the operating environment.
- Oracle determines what should happen.
- Weaver shapes the environment.
- Nexus coordinates progression and agents.
- Sovereign agents perform specialized work.
- NotNotes holds working material.
- Books OS preserves the long-term record.
- ItsYouOnline provides the gateway and identity layer.
- AI providers remain replaceable infrastructure.

---

# 28. THE FUNDAMENTAL PRINCIPLE

**The human is the continuity root.**

The Youniverse belongs to the person.

ONEAI belongs with the person.

Atom travels with the person.

A person may have multiple Youniverses without fragmenting their identity or continuity.

Each Youniverse maintains its own sovereignty, ownership, and authorization boundaries.

Agents remain sovereign.

Oracle helps determine what should happen.

Weaver shapes the operating environment.

Nexus coordinates work and progression.

NotNotes holds work in progress.

Books OS preserves the long-term human record.

Portals OS provides an operating environment.

ItsYouOnline provides the gateway and identity layer.

AI providers are replaceable infrastructure.

No individual application, device, AI provider, database, or Youniverse may silently become the owner of the entire human ecosystem.

**ONE HUMAN. ONE INSTANCE. EIGHTY YEARS OF CONTINUITY.**

**First friend, till the end.**