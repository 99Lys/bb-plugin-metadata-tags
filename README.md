# Metadata Tags

A BB plugin for the sidebar's thread rows:

- each thread's project as a small colored tag (stable dot color per project),
- its pull request's state as one of bb's own git glyphs, tinted by state
  (draft, open, checks running/passing/failing, conflicts, merged, closed), and
- a changed-files tag for uncommitted edits: bb's file-diff glyph with
  green insertions and red deletions, GitHub-style; tooltip lists each file
  with its git status. Untracked files count; the tag clears once committed.

Useful in the chronological (flat) sidebar organization, where projects are
otherwise invisible, and wherever PR state colors alone are hard to read.

## What it does

- Registers three `experimental_threadRowMetadata` items: the project tag
  (colored dot + name), a pull request state glyph, and a changed-files tag.
- The dot color is a stable hash of the project id, so each project keeps its
  own color.
- PR states come from bb's GitHub PR Status plugin and working-tree changes
  from bb's git plugin, both through their public data interfaces — no extra
  fetches of your repositories. The backend serves only the hidden-projects
  list, from plugin storage.

## Settings

In Settings → Plugins, or with `bb plugin config metadata-tags set <key> <value>`:

- `showProjectTag`, `showPrState`, `showChanges` — toggle each item.
- `projectDotColors` — `auto` (stable per-project color) or a fixed color
  (red, orange, amber, green, teal, blue, violet, pink, muted).
- Hidden project tags — in Settings → Plugins, a checkbox per project (any
  number, personal included) hides that project's tag.
- `prColorScheme`, `changesColorScheme` — `github` (state colors) or `muted`.
- `changesIcon` — `FileDiff`, `DiffModified`, `GitBranch`, `File`, or `FileText`.

## Requirements

The metadata line is experimental. Both must be on:

```sh
bb settings experiment threadRowMetadata true
bb thread-list prefs set showRowMetadata true
```

(Organize → Rows → Metadata in the app is the same toggle as the second
command.)

## Install / develop

```sh
npm install
bb plugin build
bb plugin install .
bb plugin dev   # rebuild + reload on every save
```
