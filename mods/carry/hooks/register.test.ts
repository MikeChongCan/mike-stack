import { expect, test } from 'claude-code/testing'
import { buildPrompt, countLines, lastTitle, readSteps, sessionTitle } from './register'

test('steps double and stop at the budget', () => {
  expect(readSteps(400, 0)).toEqual(['the last 50 lines', 'the 50 lines above that', 'the 100 lines above that', 'the 200 lines above that'])
  expect(readSteps(20, 0)).toEqual(['the last 20 lines'])
  expect(readSteps(150, 0).length).toBe(3) // 50 + 50 + 50 (cut)
  expect(readSteps(1000, 0).length).toBe(6) // 50+50+100+200+400 = 800, then 200
  expect(readSteps(1000, 0).at(-1)).toBe('the 200 lines above that')
})

test('steps are absolute ranges when the line count is known', () => {
  const s = readSteps(150, 900)
  expect(s[0]).toContain('L851-L900')
  expect(s[1]).toContain('L801-L850')
  expect(s[2]).toContain('L751-L800')
  expect(readSteps(400, 30)).toEqual(['the last 30 lines (L1-L30: Read offset 1, limit 30)'])
})

test('≤100 (also 100): main agent reads', () => {
  for (const n of [50, 100]) {
    const p = buildPrompt('/x.txt', n, 900)
    expect(p).not.toContain('subagent')
    expect(p).toContain('It has 900 lines')
  }
})

test('101 and 200: haiku or sonnet', () => {
  for (const n of [101, 200]) expect(buildPrompt('/x.txt', n, 900)).toContain('"haiku" or "sonnet"')
})

test('201 and default 400: haiku required; brief carries path, count, pointers', () => {
  for (const n of [201, 400]) {
    const p = buildPrompt('/x.txt', n, 900)
    expect(p).toContain('"haiku" (required')
    const brief = p.slice(p.indexOf('"'), p.lastIndexOf('"'))
    expect(brief).toContain('/x.txt')
    expect(brief).toContain('900 lines')
    expect(brief).toContain('L812-L840')
  }
})

test('unknown length: asks for wc -l', () => {
  expect(buildPrompt('/x.txt', 400, 0)).toContain('wc -l')
})

test('countLines keeps trailing blank lines', () => {
  expect(countLines('a\nb\n')).toBe(2)
  expect(countLines('a\nb')).toBe(2)
  expect(countLines('a\n\n\n')).toBe(3)
  expect(countLines('')).toBe(0)
})

test('lastTitle takes the last /rename, keeps quotes and unicode', () => {
  const rec = (t: string) => JSON.stringify({ type: 'custom-title', customTitle: t, sessionId: 'x' })
  expect(lastTitle(`${rec('old')}\n{"type":"user"}\n${rec('[rstar] "infoflow" v6 中文')}\n`)).toBe('[rstar] "infoflow" v6 中文')
  expect(lastTitle('{"type":"user","message":"hi"}\n')).toBeUndefined()
  expect(lastTitle('')).toBeUndefined()
  expect(lastTitle(rec('   '))).toBe('')
  expect(lastTitle(`${rec('old')}\n${rec('')}\n`)).toBe('')
})

test('lastTitle skips a record cut at a range edge', () => {
  expect(lastTitle('{"type":"custom-title","customTitle":"ok"}\n{"type":"custom-title","customTitle":"cut')).toBe('ok')
})

test('lastTitle ignores the same keys nested in a tool input', () => {
  const nested = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', input: { type: 'custom-title', customTitle: 'fake' } }] },
  })
  expect(lastTitle(nested)).toBeUndefined()
  const real = JSON.stringify({ type: 'custom-title', customTitle: 'real' })
  expect(lastTitle(`${real}\n${nested}\n`)).toBe('real')
})

// A fake $ over one in-memory transcript: enough of session.info and fs for sessionTitle.
function fake(text: string, reads: Array<[number, number]> = []) {
  return {
    session: { info: async () => ({ transcriptPath: '/t.jsonl' }) },
    fs: {
      exists: async () => true,
      stat: async () => ({ size: text.length }),
      read: async (_: string, o: { offset: number; length: number }) => {
        reads.push([o.offset, o.length])
        return text.slice(o.offset, o.offset + o.length)
      },
    },
  } as unknown as Parameters<typeof sessionTitle>[0]
}

test('sessionTitle reads from the end and stops at the first range with a title', async () => {
  const pad = (n: number) => `{"type":"user","p":"${'x'.repeat(n)}"}\n`
  const title = (t: string) => `${JSON.stringify({ type: 'custom-title', customTitle: t })}\n`
  const MiB = 1024 * 1024
  const reads: Array<[number, number]> = []
  const text = title('first') + pad(6 * MiB) + title('last') + pad(10)
  expect(await sessionTitle(fake(text, reads))).toBe('last')
  expect(reads.length).toBe(1)
  expect(await sessionTitle(fake(title('only') + pad(9 * MiB)))).toBe('only')
  expect(await sessionTitle(fake(pad(5 * MiB)))).toBeUndefined()
  expect(await sessionTitle(fake(title('old') + pad(10) + title(' ')))).toBeUndefined()
})

test('sessionTitle finds a title cut by the range edge', async () => {
  const MiB = 1024 * 1024
  const rec = `${JSON.stringify({ type: 'custom-title', customTitle: 'edge' })}\n`
  // The range [size-4MiB, size) starts 10 chars into the title line.
  const tail = `{"type":"user","p":"${'x'.repeat(4 * MiB - (rec.length - 10) - 22)}"}\n`
  const text = `${'{"type":"user"}\n'.repeat(100)}${rec}${tail}`
  expect(await sessionTitle(fake(text))).toBe('edge')
})
