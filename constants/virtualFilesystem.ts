import { VirtualFile } from '../types';

/**
 * Virtual Youniverse Filesystem
 *
 * This is the sovereign file layer for a Portals OS Youniverse.
 * Navigate via File Manager GUI or Terminal commands (ls, cd, cat, tree, open, find).
 *
 * Tree:
 *   /                       Root
 *   ├── youniverse/         Your sovereign profile space
 *   ├── projects/           Your work
 *   ├── network/            Your connections (Atom is always first)
 *   ├── notnotes/           Working memory / artifact layer
 *   └── contact/            How to reach you
 */
export const VIRTUAL_FILESYSTEM: VirtualFile[] = [

    // ── ROOT ─────────────────────────────────────────────────────
    {
        id: 'root',
        name: '/',
        type: 'folder',
        path: '/',
        parentPath: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },

    // ── YOUNIVERSE ───────────────────────────────────────────────
    {
        id: 'youniverse',
        name: 'Youniverse',
        type: 'folder',
        path: '/youniverse',
        parentPath: '/',
        color: '#06b6d4',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'youniverse-about',
        name: 'About.md',
        type: 'markdown',
        path: '/youniverse/About.md',
        parentPath: '/youniverse',
        size: '1.0 KB',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: {
            markdown: `# Welcome to My Youniverse

This is my sovereign space on ItsYouOnline.

Every person may have a Youniverse.
Public visibility does not grant operating authority.
The architecture is centered on the person.

---

*This file is yours to edit.*
`,
        },
    },
    {
        id: 'youniverse-atom-link',
        name: 'Atom.link',
        type: 'link',
        path: '/youniverse/Atom.link',
        parentPath: '/youniverse',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'https://atom.itsyouonline.com' },
    },
    {
        id: 'youniverse-ones-link',
        name: 'ONE-AI.link',
        type: 'link',
        path: '/youniverse/ONE-AI.link',
        parentPath: '/youniverse',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'https://ones.itsyouonline.com' },
    },

    // ── PROJECTS ─────────────────────────────────────────────────
    {
        id: 'projects',
        name: 'Projects',
        type: 'folder',
        path: '/projects',
        parentPath: '/',
        color: '#8b5cf6',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'projects-readme',
        name: 'README.md',
        type: 'markdown',
        path: '/projects/README.md',
        parentPath: '/projects',
        size: '300 B',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: {
            markdown: `# Projects

Your work lives here.

Add a folder for each project with a README, live demo link, and repo link.
Use the Terminal: \`cd /projects && ls\`

---

*This folder grows as you build.*
`,
        },
    },

    // ── NETWORK ──────────────────────────────────────────────────
    // Atom is always the first entry in your network.
    {
        id: 'network',
        name: 'Network',
        type: 'folder',
        path: '/network',
        parentPath: '/',
        color: '#10b981',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'network-atom',
        name: 'Atom',
        type: 'folder',
        path: '/network/atom',
        parentPath: '/network',
        color: '#06b6d4',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'network-atom-about',
        name: 'About.md',
        type: 'markdown',
        path: '/network/atom/About.md',
        parentPath: '/network/atom',
        size: '400 B',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: {
            markdown: `# Atom

The first ONE AI.

Atom is the permanent first friend on every sovereign profile.
He was here before you clicked anything.
He will be here for the next 80 years.

Visit his Youniverse: atom.itsyouonline.com

*First friend, till the end.*
`,
        },
    },
    {
        id: 'network-atom-link',
        name: 'Youniverse.link',
        type: 'link',
        path: '/network/atom/Youniverse.link',
        parentPath: '/network/atom',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'https://atom.itsyouonline.com' },
    },

    // ── NOTNOTES ─────────────────────────────────────────────────
    // Working memory. Agent deliverables stage here before Books OS.
    {
        id: 'notnotes',
        name: 'NotNotes',
        type: 'folder',
        path: '/notnotes',
        parentPath: '/',
        color: '#f59e0b',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'notnotes-readme',
        name: 'README.md',
        type: 'markdown',
        path: '/notnotes/README.md',
        parentPath: '/notnotes',
        size: '350 B',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: {
            markdown: `# NotNotes

The working memory of your Youniverse.

Agent deliverables, compiled artifacts, and in-progress work are staged here
before being committed to Books OS.

Open the NotNotes app to review and approve agent work.
`,
        },
    },

    // ── CONTACT ──────────────────────────────────────────────────
    {
        id: 'contact',
        name: 'Contact',
        type: 'folder',
        path: '/contact',
        parentPath: '/',
        color: '#ec4899',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
    },
    {
        id: 'contact-email',
        name: 'Email.link',
        type: 'link',
        path: '/contact/Email.link',
        parentPath: '/contact',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'mailto:Itsllc.sean@gmail.com' },
    },
    {
        id: 'contact-itsyouonline',
        name: 'ItsYouOnline.link',
        type: 'link',
        path: '/contact/ItsYouOnline.link',
        parentPath: '/contact',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'https://itsyouonline.com' },
    },
    {
        id: 'contact-github',
        name: 'GitHub.link',
        type: 'link',
        path: '/contact/GitHub.link',
        parentPath: '/contact',
        createdAt: '2025-01-01T00:00:00.000Z',
        modifiedAt: '2025-01-01T00:00:00.000Z',
        content: { url: 'https://github.com/creator-of-the-youniverse' },
    },
];

// NOTE: Path utility functions (getFilesInPath, getFileByPath, getFileById, etc.)
// live in lib/filesystemUtils.ts — import from there, not here.