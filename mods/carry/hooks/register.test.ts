import { expect, test } from 'claude-code/testing'
import { buildPrompt, countLines, readSteps } from './register'

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
