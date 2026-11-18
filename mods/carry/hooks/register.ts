import type { EngineInterface, Register } from 'claude-code'

const DEFAULT_LINES = 400

// `/carry [lines] [extra instruction]`
function parseArgs(args: string): { lines: number; note: string } {
  const [first = '', ...rest] = args.trim().split(/\s+/)
  const n = Number(first)
  if (Number.isInteger(n) && n > 0) return { lines: n, note: rest.join(' ') }
  return { lines: DEFAULT_LINES, note: args.trim() }
}

const STEP = 50

// Physical lines, as Read numbers them: a final newline ends the last line, it does not start one.
export function countLines(text: string): number {
  if (text === '') return 0
  const parts = text.split('\n').length
  return text.endsWith('\n') ? parts - 1 : parts
}

// Tail-first read steps: 50, then 50, 100, 200… upward, cut so the sum never passes the budget
// (or the file). With a line count, each step is an absolute range for Read's offset/limit.
export function readSteps(budget: number, total: number): string[] {
  const cap = total > 0 ? Math.min(budget, total) : budget
  const sizes: number[] = []
  let used = 0
  let next = STEP
  while (used < cap) {
    const size = Math.min(next, cap - used)
    sizes.push(size)
    used += size
    if (sizes.length > 1) next *= 2
  }
  let end = total
  return sizes.map((size, i) => {
    const where = i === 0 ? `the last ${size} lines` : `the ${size} lines above that`
    if (total <= 0) return where
    const range = `${where} (L${end - size + 1}-L${end}: Read offset ${end - size + 1}, limit ${size})`
    end -= size
    return range
  })
}

// The budget picks who reads: ≤100 main, 101-200 haiku or sonnet, >200 haiku.
export function buildPrompt(path: string, budget: number, total: number): string {
  const size = total > 0
    ? `It has ${total} lines.`
    : 'Its length is not known: run `wc -l` on it first, and use that count for every line number.'
  const steps = readSteps(budget, total)
  const plan =
    `Read ${path} (an /export of my previous session) from the end. ${size} ` +
    `Step 1: ${steps[0]}. Only if that is not enough to know the current task, state and next step, ` +
    `go up one step at a time and stop as soon as it is enough: ` +
    (steps.length > 1 ? steps.slice(1).map((s, i) => `step ${i + 2}: ${s}`).join('; ') : 'no more steps') +
    `. Never read more than the last ${budget} lines.`

  if (budget <= 100) {
    return `${plan}\n\nThen continue where we left off. Start with a short summary of the state.`
  }
  const who = budget <= 200
    ? 'an Agent subagent with model "haiku" or "sonnet"'
    : 'an Agent subagent with model "haiku" (required, do not read it yourself)'
  return `Do not read the export yourself first. Give the reading to ${who}, with this brief, word for word:\n\n` +
    `"${plan} Return: (1) a short summary of the task, decisions, current state and open next step; ` +
    `(2) pointers: absolute line ranges (like L812-L840) with one line each on what is there ` +
    `(errors, file paths, commands, decisions). Do not paste the transcript."\n\n` +
    `Then read only the line ranges you need from the pointers (Read with offset/limit on ${path}). ` +
    `Continue where we left off. Start with a short summary of the state.`
}

async function carry($: EngineInterface, args: string) {
  const { lines, note } = parseArgs(args)
  // Windows sets USERPROFILE, not HOME (only its sshd sets HOME).
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const id = await $.session.id()
  const dir = `${home}/.claude/carry`
  // /export refuses an existing file, so each run gets its own name (a second /carry in one session too).
  const path = `${dir}/${id}-${Date.now()}.txt`

  // A marker file creates the folder; a non-empty export afterwards proves /export wrote it.
  await $.fs.write(`${dir}/.keep`, '')
  await $.command.run({ command: 'export', args: path })
  const exported = (await $.fs.exists(path)) && (await $.fs.stat(path)).size > 0
  if (!exported) {
    $.ui.log(`carry: /export did not write ${path}; session left as it was`)
    return
  }

  let total = 0
  try {
    total = countLines(await $.fs.read(path))
  } catch {
    // Over 4 MiB or unreadable: the prompt then works without a line count.
  }

  await $.command.run({ command: 'clear' })
  const text = buildPrompt(path, lines, total) + (note ? `\n\n${note}` : '')
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'carry',
      description: 'Export, /clear, then read the export\'s tail in the new session: /carry [lines] [note]',
    })
    return next(e)
  })

  on('command.run', { command: 'carry' }, ($, e) => {
    // Detached: the built-ins queue until the session is idle, which it is not while this hook runs.
    $.clock.after(0, () => {
      carry($, e.args).catch(err => $.ui.log(`carry failed: ${String(err)}`))
    })
    return { text: 'Carrying this session into a new one…' }
  })
}
