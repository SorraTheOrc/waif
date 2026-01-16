export type NormalizeResult = { argv: string[]; stripped: boolean };

/**
 * Normalize argv that may include a leading slash-command token (e.g., "/implement").
 * If the first token starts with '/', drop the leading slash and treat the token as the command name.
 */
export function normalizeSlashCommandArgv(argv: string[]): NormalizeResult {
  if (!argv.length) return { argv, stripped: false };
  const [first, ...rest] = argv;
  if (!first.startsWith('/')) return { argv, stripped: false };

  const withoutSlash = first.slice(1);
  if (withoutSlash.length === 0) {
    return { argv: rest, stripped: true };
  }

  return { argv: [withoutSlash, ...rest], stripped: true };
}
