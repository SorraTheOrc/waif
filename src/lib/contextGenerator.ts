import { promises as fs } from 'fs'
import { resolve, join } from 'path'

export interface ContextEntry {
  path: string
  summary: string
}

export async function loadGitignore(root = process.cwd()): Promise<string[]> {
  try {
    const gitignorePath = resolve(root, '.gitignore')
    const content = await fs.readFile(gitignorePath, 'utf8')
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  } catch (e) {
    return []
  }
}

function isIgnored(relPath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (!p) continue
    // simple rules: prefix match for directories (ending with /), exact match, or prefix
    const normalized = p.replace(/^\//, '')
    if (normalized.endsWith('/')) {
      const prefix = normalized.slice(0, -1)
      if (relPath === prefix || relPath.startsWith(prefix + '/')) return true
    } else {
      if (relPath === normalized) return true
      if (relPath.startsWith(normalized + '/')) return true
      if (relPath.includes(normalized)) return true
    }
  }
  return false
}

async function walkDir(dir: string, root: string, out: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const abs = join(dir, e.name)
    const rel = abs.substring(root.length + 1)
    if (e.isDirectory()) {
      await walkDir(abs, root, out)
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(rel.replace(/\\/g, '/'))
    }
  }
}

export async function scanDocs(root = process.cwd(), patterns: string[] = ['docs']): Promise<ContextEntry[]> {
  const gitignore = await loadGitignore(root)
  const paths: string[] = []

  for (const p of patterns) {
    const dir = resolve(root, p)
    try {
      await walkDir(dir, root, paths)
    } catch (e) {
      // ignore missing dirs
    }
  }

  const entries: ContextEntry[] = []
  for (const rel of paths) {
    if (isIgnored(rel, gitignore)) continue
    const abs = resolve(root, rel)
    try {
      const content = await fs.readFile(abs, 'utf8')
      const lines = content.split('\n').map(l => l.replace(/\r$/, ''))
      const nonBlank: string[] = []
      for (const line of lines) {
        if (line.trim().length === 0) continue
        nonBlank.push(line)
        if (nonBlank.length >= 10) break
      }
      const excerpt = nonBlank.join('\n')
      entries.push({ path: rel, summary: excerpt })
    } catch (e) {
      // skip
    }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path))
  return entries
}
