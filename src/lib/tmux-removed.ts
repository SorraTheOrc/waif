export function tmuxRemovedError(): Error {
  return new Error(
    "TMUX integration has been removed. See docs/migration/tmux-removal.md for migration guidance.",
  );
}

export function ensureTmuxRemoved(): void {
  throw tmuxRemovedError();
}
