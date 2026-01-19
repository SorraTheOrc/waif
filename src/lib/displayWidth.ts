import stringWidth from 'string-width';

export function displayWidth(text: string | undefined | null): number {
  if (text == null) return 0;
  return stringWidth(text);
}

export function padDisplay(text: string | undefined | null, width: number): string {
  const safe = text ?? '';
  const w = stringWidth(safe);
  if (w >= width) return safe;
  return safe + ' '.repeat(width - w);
}

export function truncateDisplay(text: string | undefined | null, max: number): string {
  const safe = text ?? '';
  if (max <= 0) return '';
  const w = stringWidth(safe);
  if (w <= max) return safe;
  if (max === 1) return safe.slice(0, 1);
  let out = '';
  for (const ch of safe) {
    if (stringWidth(out + ch) >= max - 1) break;
    out += ch;
  }
  return `${out}…`;
}
