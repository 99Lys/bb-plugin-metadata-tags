// bb-plugin-metadata-tags — a BB plugin backend entry.
//
// The frontend (app.tsx) reads thread, project, pull request, and git data
// from bb's own live state. The backend declares the plugin's simple settings
// (BB renders them in its Settings UI) and serves the hidden-projects list —
// a checkbox per project in the plugin's settings section — from plugin
// storage.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  hiddenProjects_list: {
    input: z.null(),
    output: z.object({ projectIds: z.array(z.string()) }),
  },
  hiddenProjects_set: {
    input: z.object({
      projectIds: z.array(z.string().min(1)).max(500),
    }),
    output: z.object({ projectIds: z.array(z.string()) }),
  },
});

// bb host icon names verified against the running app's icon set.
const CHANGES_ICON_OPTIONS = [
  "FileDiff",
  "DiffModified",
  "GitBranch",
  "File",
  "FileText",
] as const;

const COLOR_OPTIONS = [
  "auto",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "muted",
] as const;

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    showProjectTag: {
      type: "boolean",
      label: "Show project tag",
      description:
        "A colored dot and the project's name under each thread's title.",
      default: true,
    },
    showPrState: {
      type: "boolean",
      label: "Show pull request state",
      description:
        "bb's own git glyphs, tinted by pull request state, next to bb's built-in PR number.",
      default: true,
    },
    showChanges: {
      type: "boolean",
      label: "Show uncommitted changes",
      description:
        "A file-diff tag with insertions and deletions when a thread's environment holds uncommitted or untracked files.",
      default: true,
    },
    projectDotColors: {
      type: "select",
      label: "Project dot color",
      description:
        "Auto assigns a stable color per project; the other options use one fixed color for every project.",
      options: [...COLOR_OPTIONS],
      experimental_optionLabels: {
        auto: "Auto (stable per project)",
        red: "Red",
        orange: "Orange",
        amber: "Amber",
        green: "Green",
        teal: "Teal",
        blue: "Blue",
        violet: "Violet",
        pink: "Pink",
        muted: "Muted (theme)",
      },
      default: "auto",
    },
    prColorScheme: {
      type: "select",
      label: "Pull request colors",
      options: ["github", "muted"],
      experimental_optionLabels: {
        github: "State colors (green, purple, red, amber)",
        muted: "Muted (follows theme)",
      },
      default: "github",
    },
    changesColorScheme: {
      type: "select",
      label: "Changes colors",
      description: "Colors for the insertions and deletions counts.",
      options: ["github", "muted"],
      experimental_optionLabels: {
        github: "Green and red (GitHub style)",
        muted: "Muted (follows theme)",
      },
      default: "github",
    },
    changesIcon: {
      type: "select",
      label: "Changes icon",
      description: "The glyph shown beside the insertions and deletions.",
      options: [...CHANGES_ICON_OPTIONS],
      default: "FileDiff",
    },
  });

  async function readHidden(): Promise<string[]> {
    return (await bb.storage.kv.get<string[]>("hiddenProjects")) ?? [];
  }

  bb.rpc.register(
    rpcContract,
    {
      hiddenProjects_list: async () => ({ projectIds: await readHidden() }),
      hiddenProjects_set: async ({ projectIds }) => {
        const unique = Array.from(new Set(projectIds));
        await bb.storage.kv.set("hiddenProjects", unique);
        // Rows refetch their copy of the list when this signal arrives.
        bb.realtime.publish("hidden-projects-changed", { count: unique.length });
        return { projectIds: unique };
      },
    },
    {
      experimental_discoverable: true,
      experimental_description:
        "The projects whose project tag is hidden on thread rows.",
    },
  );

  bb.log.info("loaded");

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
