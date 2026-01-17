import { describe, test, expect, afterEach } from 'vitest'
import { execSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const cli = 'node dist/index.js'
const outPath = resolve('tmp', 'CONTEXT_PACK_INTEGRATION.md')

describe('wf context integration', () => {
  afterEach(() => {
    try { if (existsSync(outPath)) unlinkSync(outPath); } catch (e) {}
  })

  test('writes generated context pack to --out', () => {
    execSync(`${cli} context --out ${outPath} --force`)
    expect(existsSync(outPath)).toBe(true)
    const content = readFileSync(outPath, 'utf8')
    expect(content.includes('## Generated entries')).toBe(true)
  })
})
