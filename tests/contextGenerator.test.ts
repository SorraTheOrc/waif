import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import { resolve } from 'path'
import { scanDocs } from '../src/lib/contextGenerator'

const root = resolve('.')

describe('context generator scanDocs', () => {
  it('scans docs and respects .gitignore', async () => {
    // create a temporary doc and a gitignored doc
    const tmpPath = resolve('docs', 'TMP_TEST.md')
    const ignorePath = resolve('.gitignore')
    try {
      fs.mkdirSync('docs', { recursive: true })
      fs.writeFileSync(tmpPath, '# TMP_TEST\ncontent')

      // add a rule to gitignore to ignore docs/IGNORED.md
      const originalGitignore = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8') : ''
      fs.writeFileSync(ignorePath, (originalGitignore + '\n' + 'docs/IGNORED.md').trim())

      // create ignored file
      fs.writeFileSync(resolve('docs', 'IGNORED.md'), '# IGNORED\nsecret')

      const results = await scanDocs(root, ['docs'])
      const paths = results.map(r => r.path)
      expect(paths).toContain('docs/TMP_TEST.md')
      expect(paths).not.toContain('docs/IGNORED.md')

      // cleanup
      fs.unlinkSync(tmpPath)
      fs.unlinkSync(resolve('docs', 'IGNORED.md'))
      fs.writeFileSync(ignorePath, originalGitignore)
    } catch (e) {
      try { fs.unlinkSync(tmpPath) } catch (e) {}
      throw e
    }
  })
})
