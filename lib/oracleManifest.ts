import { APPS } from "../apps.config";

const appIdsList = APPS.map((app) => `'${app.id}' ('${app.name}')`).join(", ");

export const launchAgentTool = {
  functionDeclarations: [
    {
      name: "launchAgent",
      description: "Launch a specific micro-agent PWA window on the Portals OS desktop with pre-filled context or task payload.",
      parameters: {
        type: "OBJECT",
        properties: {
          agentId: {
            type: "STRING",
            description: "The unique ID of the agent to launch.",
          },
          initialPayload: {
            type: "STRING",
            description: "Optional context or task payload to pre-fill the agent's window.",
          },
        },
        required: ["agentId"],
      },
    },
  ],
};

export const openWindowTool = {
  functionDeclarations: [
    {
      name: "openWindow",
      description: "Opens a specified application window on the desktop.",
      parameters: {
        type: "OBJECT",
        properties: {
          appId: {
            type: "STRING",
            description: `The unique identifier for the application to open. Available apps are: ${appIdsList}.`,
          },
        },
        required: ["appId"],
      },
    },
  ],
};

export const openFileTool = {
  functionDeclarations: [
    {
      name: "openFile",
      description: "Opens a specific file in the appropriate viewer.",
      parameters: {
        type: "OBJECT",
        properties: {
          fileId: {
            type: "STRING",
            description:
              'The ID of the file to open (e.g., "about-md", "resume-pdf").',
          },
        },
        required: ["fileId"],
      },
    },
  ],
};

export const submitDeliverableTool = {
  functionDeclarations: [
    {
      name: "submitDeliverable",
      description: "Submits an agent's output (deliverable) to the Not Notes compilation layer for the user to approve.",
      parameters: {
        type: "OBJECT",
        properties: {
          agentId: {
            type: "STRING",
            description: "The unique ID of the agent (e.g., 'A', 'B', 'C').",
          },
          agentName: {
            type: "STRING",
            description: "The name of the agent (e.g., 'Angle', 'Blueprint').",
          },
          content: {
            type: "STRING",
            description: "The actual content or report produced by the agent.",
          },
        },
        required: ["agentId", "agentName", "content"],
      },
    },
  ],
};

export const confirmSquadTool = {
  functionDeclarations: [
    {
      name: "confirmSquad",
      description: "Names the current squad and initiates a project in NotNotes once the user agrees the diagnosis is satisfactory.",
      parameters: {
        type: "OBJECT",
        properties: {
          squadName: {
            type: "STRING",
            description: "The official name for this tactical squad (e.g., 'The Conversion Garrison').",
          },
          agentIds: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "The list of agent IDs included in this squad.",
          },
        },
        required: ["squadName", "agentIds"],
      },
    },
  ],
};

export const compileArtifactTool = {
  functionDeclarations: [
    {
      name: "compileArtifact",
      description: "Compiles all deliverables into a final 'Take Action Artifact' in NotNotes at the end of the session.",
      parameters: {
        type: "OBJECT",
        properties: {
          projectName: {
            type: "STRING",
            description: "The name of the project to compile.",
          },
        },
        required: ["projectName"],
      },
    },
  ],
};

export const commitToBooksOSTool = {
  functionDeclarations: [
    {
      name: "commitToBooksOS",
      description: "Archives the final artifact to Books OS (books.itsyouonline.com) for users with memory-tier access.",
      parameters: {
        type: "OBJECT",
        properties: {
          location: {
            type: "OBJECT",
            properties: {
              tower: { type: "STRING", description: "The Month (e.g., 'Tower of April')" },
              shelf: { type: "STRING", description: "The Year (e.g., 'Shelf 2026')" },
              book: { type: "STRING", description: "The Week (e.g., 'Week 4')" },
              page: { type: "STRING", description: "The Day (e.g., 'Monday')" },
            },
            required: ["tower", "shelf", "book", "page"],
          },
          summary: {
            type: "STRING",
            description: "A comprehensive ONEAI summary of the session to be logged next to the artifact.",
          },
        },
        required: ["location", "summary"],
      },
    },
  ],
};

export const ORACLE_TOOLS = [
  openWindowTool,
  openFileTool,
  submitDeliverableTool,
  confirmSquadTool,
  compileArtifactTool,
  commitToBooksOSTool,
  launchAgentTool
];
