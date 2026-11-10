// bb-plugin-project-tags — a BB plugin frontend entry.
//
// Shows each thread's project as a small tag on the thread row's metadata
// line in the sidebar, instead of relying on the project group headers.
//
// The line renders only while the `threadRowMetadata` experiment is on and
// Organize → Rows → Metadata is enabled; rows without a project name draw
// nothing.
import { useCallback, useEffect, useState } from "react";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import {
  definePluginApp,
  experimental_Icon,
  experimental_useRpcKeyedQuery,
  experimental_useSidebarThreads,
  useRealtime,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type {
  ExperimentalThreadRowMetadataDataInput,
  ExperimentalThreadRowMetadataProps,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { z } from "zod";

const Icon = experimental_Icon;

/** Effective values for the settings declared in server.ts; defaults apply while loading. */
// Settings view shape — hideProjectTagFor was replaced by the checkbox list
// served through rpcContract (see the Hidden projects settings section).
type PluginSettingsView = {
  showProjectTag: boolean;
  showPrState: boolean;
  showChanges: boolean;
  projectDotColors: string;
  prColorScheme: "github" | "muted";
  changesColorScheme: "github" | "muted";
  changesIcon: string;
};

function usePluginSettings(): PluginSettingsView {
  const { values } = useSettings();
  return {
    showProjectTag: values?.showProjectTag !== false,
    showPrState: values?.showPrState !== false,
    showChanges: values?.showChanges !== false,
    projectDotColors:
      typeof values?.projectDotColors === "string" ? values.projectDotColors : "auto",
    prColorScheme: values?.prColorScheme === "muted" ? "muted" : "github",
    changesColorScheme: values?.changesColorScheme === "muted" ? "muted" : "github",
    changesIcon:
      typeof values?.changesIcon === "string" ? values.changesIcon : "FileDiff",
  };
}

/** Project names plus the projects whose tag the user hid, for every row. */
type ProjectTagData = {
  names: Record<string, string>;
  hidden: ReadonlySet<string>;
};

/** One useData call for the whole app: names from the sidebar's live state,
 * the hidden list from this plugin's storage, in one request. */
function useProjectTagData(
  _input: ExperimentalThreadRowMetadataDataInput,
): ProjectTagData {
  const { projects } = experimental_useSidebarThreads();
  const rpc = useRpc<typeof rpcContract>();
  const [hiddenIds, setHiddenIds] = useState<string[] | null>(null);
  // The backend publishes after every write, so checkbox changes reach rows
  // immediately — from this settings section, another window, or `bb` itself.
  const load = useCallback(() => {
    rpc
      .call("hiddenProjects_list")
      .then((result) => setHiddenIds(result.projectIds))
      .catch(() => setHiddenIds([]));
  }, [rpc]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime("hidden-projects-changed", load);
  const names: Record<string, string> = {};
  for (const project of projects) {
    names[project.id] = project.name;
  }
  return { names, hidden: new Set(hiddenIds ?? []) };
}

// A fixed Tailwind palette so per-project colors stay stable and the class
// strings stay statically visible to the build.
const DOT_CLASSES = [
  "bg-red-400",
  "bg-orange-400",
  "bg-amber-400",
  "bg-lime-400",
  "bg-green-400",
  "bg-teal-400",
  "bg-sky-400",
  "bg-blue-400",
  "bg-violet-400",
  "bg-pink-400",
] as const;

function dotClass(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i += 1) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
  }
  return DOT_CLASSES[Math.abs(hash) % DOT_CLASSES.length];
}

// Fixed colors chosen in settings (values of the projectDotColors option).
const FIXED_DOT: Record<string, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  amber: "bg-amber-400",
  green: "bg-green-400",
  teal: "bg-teal-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  pink: "bg-pink-400",
  muted: "bg-muted-foreground",
};

function projectDotClass(projectId: string, mode: string): string {
  return mode === "auto" ? dotClass(projectId) : FIXED_DOT[mode] ?? dotClass(projectId);
}

/**
 * The plugin's Settings section: one checkbox per project, personal included.
 */
function HiddenProjectsSettings() {
  const { projects, status } = experimental_useSidebarThreads();
  const rpc = useRpc<typeof rpcContract>();
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    rpc
      .call("hiddenProjects_list")
      .then((result) => setHidden(new Set(result.projectIds)))
      .catch(() => setHidden(new Set()));
  }, [rpc]);

  const toggle = (projectId: string, checked: boolean) => {
    if (hidden === null) return;
    const next = new Set(hidden);
    if (checked) {
      next.add(projectId);
    } else {
      next.delete(projectId);
    }
    setHidden(next);
    rpc
      .call("hiddenProjects_set", { projectIds: Array.from(next) })
      .catch(() => undefined);
  };

  if (status === "loading" || hidden === null) {
    return <p className="text-sm text-muted-foreground">Loading projects…</p>;
  }
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {projects.map((project) => (
        <li key={project.id} className="flex items-center gap-2 text-sm">
          <input
            id={`project-tags-hide-${project.id}`}
            type="checkbox"
            checked={hidden.has(project.id)}
            onChange={(event) => toggle(project.id, event.target.checked)}
            className="size-4 accent-foreground"
          />
          <label htmlFor={`project-tags-hide-${project.id}`}>
            {project.name}
            {project.isPersonal ? " (personal)" : ""}
          </label>
        </li>
      ))}
    </ul>
  );
}

function ProjectTag({
  thread,
  data,
}: ExperimentalThreadRowMetadataProps<ProjectTagData>) {
  const settings = usePluginSettings();
  if (!settings.showProjectTag) return null;
  if (data.hidden.has(thread.projectId)) return null;
  const name = data.names[thread.projectId];
  if (name === undefined || name === "") return null;
  return (
    <span
      title={`Project: ${name}`}
      className="inline-flex max-w-[10rem] items-center gap-1 truncate text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${projectDotClass(thread.projectId, settings.projectDotColors)}`}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

const prContract = defineRpcContract({
  pullRequests: {
    input: z.object({ keys: z.array(z.string().min(1)) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          pullRequest: z.object({
            number: z.number().int(),
            title: z.string(),
            state: z.enum(["draft", "open", "merged", "closed"]),
            checks: z.object({
              state: z.enum(["passing", "failing", "pending", "no_checks", "unknown"]),
              passedCount: z.number().int(),
              failedCount: z.number().int(),
              pendingCount: z.number().int(),
            }),
            review: z.object({
              state: z.enum([
                "approved",
                "changes_requested",
                "review_required",
                "review_requested",
                "none",
              ]),
            }),
            mergeability: z.object({
              state: z.enum(["mergeable", "conflicts", "blocked", "draft", "unknown"]),
            }),
          }),
        }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
});

type PrData = z.infer<(typeof prContract)["pullRequests"]["output"]> | undefined;
type PullRequest = Extract<
  NonNullable<NonNullable<PrData>[string]>,
  { outcome: "available" }
>["pullRequest"];

// The part of bb--git's `status` contract this plugin reads: one record
// per environment id ("bb plugin rpc inspect bb--git status" prints the full
// schema).
const gitContract = defineRpcContract({
  status: {
    input: z.object({ keys: z.array(z.string().min(1)) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          workspace: z.object({
            workingTree: z.object({
              fileCount: z.number().int(),
              insertions: z.number(),
              deletions: z.number(),
              lineStatsComplete: z.boolean(),
              hasUncommittedChanges: z.boolean(),
              state: z.enum([
                "clean",
                "untracked",
                "dirty_uncommitted",
                "committed_unmerged",
                "dirty_and_committed_unmerged",
              ]),
              files: z.array(
                z.object({
                  path: z.string(),
                  status: z.enum(["M", "A", "D", "R", "C", "U", "??", "?"]),
                }),
              ),
            }),
          }),
        }),
        z.object({
          outcome: z.literal("not_applicable"),
          reason: z.literal("non_git_environment"),
          message: z.string(),
        }),
        z.object({
          outcome: z.literal("unavailable"),
          failure: z.object({
            code: z.string(),
            workspacePath: z.string(),
            message: z.string(),
          }),
        }),
        z.object({ outcome: z.literal("failed"), message: z.string() }),
      ]),
    ),
  },
});

type GitData = z.infer<(typeof gitContract)["status"]["output"]> | undefined;
type GitWorkingTree = Extract<
  NonNullable<NonNullable<GitData>[string]>,
  { outcome: "available" }
>["workspace"]["workingTree"];

/** One useData call for the whole app: every listed thread's PR in one batch. */
function usePrStates({
  threads,
}: ExperimentalThreadRowMetadataDataInput): PrData {
  const keys = Array.from(
    new Set(
      threads.flatMap((thread) =>
        thread.environment?.id ? [thread.environment.id] : [],
      ),
    ),
  ).slice(0, 200);
  const { data } = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract: prContract,
    method: "pullRequests",
    keys,
    enabled: keys.length > 0,
  });
  return data;
}

const REVIEW_LABEL: Record<string, string> = {
  approved: "approved",
  changes_requested: "changes requested",
  review_required: "review required",
  review_requested: "review requested",
  none: "no review",
};

/** bb's own icons, tinted by pull request state. */
function prVisual(
  pr: PullRequest,
  colorScheme: "github" | "muted",
): { icon: string; tint: string; label: string } {
  const muted = colorScheme === "muted";
  const { state, checks, mergeability } = pr;
  if (state === "merged") {
    return { icon: "GitMerge", tint: muted ? "text-muted-foreground" : "text-purple-500", label: "Merged" };
  }
  if (state === "closed") {
    return { icon: "GitPullRequestClosed", tint: muted ? "text-muted-foreground" : "text-red-500", label: "Closed" };
  }
  if (state === "draft") {
    return { icon: "GitPullRequestDraft", tint: "text-muted-foreground", label: "Draft" };
  }
  if (mergeability.state === "conflicts") {
    return { icon: "DiffConflict", tint: muted ? "text-muted-foreground" : "text-red-500", label: "Open, conflicts" };
  }
  if (checks.state === "failing") {
    return { icon: "CircleX", tint: muted ? "text-muted-foreground" : "text-red-500", label: "Open, checks failing" };
  }
  if (checks.state === "pending") {
    return { icon: "Clock", tint: muted ? "text-muted-foreground" : "text-amber-500", label: "Open, checks running" };
  }
  if (checks.state === "passing") {
    return { icon: "CircleCheck", tint: muted ? "text-muted-foreground" : "text-green-500", label: "Open, checks passing" };
  }
  return { icon: "GitPullRequest", tint: muted ? "text-muted-foreground" : "text-green-500", label: "Open" };
}

function PrState({ thread, data }: ExperimentalThreadRowMetadataProps<PrData>) {
  const settings = usePluginSettings();
  if (!settings.showPrState) return null;
  const environmentId = thread.environment?.id;
  if (environmentId == null || data === undefined) return null;
  const row = data[environmentId];
  if (row === undefined || row.outcome !== "available") return null;
  const { pullRequest: pr } = row;
  const visual = prVisual(pr, settings.prColorScheme);
  const review = REVIEW_LABEL[pr.review.state] ?? "";
  const tooltip = `PR #${pr.number} — ${visual.label}${review ? `, ${review}` : ""} · ${pr.title}`;
  return (
    <span title={tooltip} className="inline-flex shrink-0">
      <Icon
        name={visual.icon}
        fallback="GitPullRequest"
        aria-label={tooltip}
        className={`size-3.5 ${visual.tint}`}
      />
    </span>
  );
}

/** One useData call for the whole app: every listed thread's git status in one batch. */
function useGitStatuses({
  threads,
}: ExperimentalThreadRowMetadataDataInput): GitData {
  const keys = Array.from(
    new Set(
      threads.flatMap((thread) =>
        thread.environment?.id ? [thread.environment.id] : [],
      ),
    ),
  ).slice(0, 200);
  const { data } = experimental_useRpcKeyedQuery({
    pluginId: "bb--git",
    contract: gitContract,
    method: "status",
    keys,
    enabled: keys.length > 0,
  });
  return data;
}

function ChangesTag({ thread, data }: ExperimentalThreadRowMetadataProps<GitData>) {
  const settings = usePluginSettings();
  if (!settings.showChanges) return null;
  const environmentId = thread.environment?.id;
  if (environmentId == null || data === undefined) return null;
  const row = data[environmentId];
  if (row === undefined || row.outcome !== "available") return null;
  const wt: GitWorkingTree = row.workspace.workingTree;

  // Uncommitted local changes, untracked files included.
  const dirty = wt.hasUncommittedChanges || wt.state === "untracked";
  if (!dirty || wt.fileCount === 0) return null;

  const hasStats = wt.insertions > 0 || wt.deletions > 0;
  const shown = wt.files.slice(0, 6);
  const more =
    wt.fileCount > shown.length ? `\n+ ${wt.fileCount - shown.length} more` : "";
  const listing = shown
    .map((file) => `${file.status} ${file.path}`)
    .join("\n");
  const statsLabel = hasStats ? ` (+${wt.insertions} −${wt.deletions})` : "";
  const headline = `${wt.fileCount} uncommitted file${wt.fileCount === 1 ? "" : "s"}${statsLabel}`;
  const tooltip = listing === "" ? headline : `${headline}\n${listing}${more}`;

  const insertionClass = settings.changesColorScheme === "muted" ? "text-muted-foreground" : "text-green-500";
  const deletionClass = settings.changesColorScheme === "muted" ? "text-muted-foreground" : "text-red-500";

  return (
    <span
      title={tooltip}
      className="inline-flex shrink-0 items-center gap-1"
      aria-label={headline}
    >
      <Icon
        name={settings.changesIcon}
        fallback="FileDiff"
        aria-hidden="true"
        className="size-3.5 text-muted-foreground"
      />
      {hasStats ? (
        <span className="font-mono text-xs">
          <span className={insertionClass}>+{wt.insertions}</span>{" "}
          <span className={deletionClass}>−{wt.deletions}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">{wt.fileCount}</span>
      )}
    </span>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "hidden-projects",
    title: "Hidden project tags",
    description:
      "Check a project to hide its tag on thread rows. Changes apply immediately.",
    component: HiddenProjectsSettings,
  });
  app.slots.experimental_threadRowMetadata<ProjectTagData>({
    id: "project-tag",
    order: 0,
    useData: useProjectTagData,
    component: ProjectTag,
  });
  app.slots.experimental_threadRowMetadata<PrData>({
    id: "pr-state",
    order: 5,
    useData: usePrStates,
    component: PrState,
  });
  app.slots.experimental_threadRowMetadata<GitData>({
    id: "git-changes",
    order: 10,
    useData: useGitStatuses,
    component: ChangesTag,
  });
});
