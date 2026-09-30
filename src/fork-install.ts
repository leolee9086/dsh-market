/**
 * Fork-then-install: the one path by which this market puts another author's
 * plugin into the operator's profile.
 *
 * Why fork first. The rule this project installs under is that another
 * author's plugin is never taken as-is. A fork puts the exact revision under
 * the operator's own account, so the installed spec names a commit they own:
 * the upstream repository cannot change what runs here by pushing, and the
 * operator can read, diff and revert the code they are actually running.
 * The install itself is not done here — it is handed to the host's plugin
 * manager, which owns pnpm, the lockfile snapshot and the rollback.
 *
 * Every GitHub operation goes through `gh`, so this package never holds a
 * token: the CLI keeps its own credential and this code only reads its
 * answers. Absent `gh` is a refusal with a hint, never a fallback to an
 * unauthenticated API call.
 */

import { spawn } from 'node:child_process'

/** How long one `gh` child may run before it is killed. */
const GH_TIMEOUT_MS = 120_000

/** A fork becomes readable a moment after it is created; poll rather than fail. */
const FORK_VISIBLE_ATTEMPTS = 10

/** Wait between fork-visibility polls. */
const FORK_VISIBLE_WAIT_MS = 1500

/** One refused fork-and-install request, before any process starts. */
export class ForkInstallRefusedError extends Error {
  /**
   * @param message - what to report; callers surface it unchanged.
   */
  constructor(message: string) {
    super(message)
    this.name = 'ForkInstallRefusedError'
  }
}

/** What one run needs from its surroundings. */
export interface ForkInstallOptions {
  /** `owner/name` or a GitHub URL; anything else is refused before a process starts. */
  readonly repository: string
  /** Directory the `gh` children run in — the profile directory. */
  readonly cwd: string
  /** Cancellation owned by the calling tool. */
  readonly signal: AbortSignal
}

/** The pinned revision a run produced; the caller installs `spec` unchanged. */
export interface ForkedRevision {
  /** `owner/name` of the fork under the authenticated account. */
  readonly fork: string
  /** The 40-hex commit the install pins. */
  readonly sha: string
  /** The installation spec: a git spec pinned to `sha`. */
  readonly spec: string
}

/** The account `gh` is authenticated as. */
interface GhIdentity {
  readonly login: string
}

/** One finished `gh` child. */
interface GhRun {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

/**
 * Read `owner/name` out of the forms a person or a model actually writes:
 * a bare pair, a `github:` shorthand, or a repository URL. The reference and
 * any trailing path are dropped — the fork is taken from the repository, and
 * the revision is resolved afterwards against the fork.
 * @param input - the repository as written.
 * @returns the repository pair, or undefined when the input names no GitHub repository.
 */
export function parseRepository(input: string): { owner: string; name: string } | undefined {
  const trimmed = input.trim()
    .replace(/^github:/i, '')
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    // The ref goes first: a `.git` that precedes a `#ref` is not at the end
    // yet, and dropping the ref after the suffix check left `name.git` as the
    // repository name.
    .replace(/[#?].*$/s, '')
    .replace(/\.git$/i, '')
  // A trailing path is dropped, not refused: a pasted browser URL usually
  // carries `/tree/<ref>` or `/blob/<ref>/<file>`, and the revision is
  // resolved against the fork afterwards rather than trusted from the link.
  const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)(?:\/.*)?$/.exec(trimmed)
  if (match === null) return undefined
  return { owner: match[1] as string, name: match[2] as string }
}

/**
 * Run one `gh` argument vector without a shell.
 *
 * `shell: false` is the point: a repository name reaches this function from
 * model arguments, and a shell would make that string code. The environment is
 * inherited because `gh` resolves its own credential from it; nothing here
 * reads or forwards a token.
 * @param args - arguments after `gh`.
 * @param cwd - working directory for the child.
 * @param signal - cancellation owned by the caller.
 * @returns the finished run, including timeout and spawn failures.
 */
function runGh(args: readonly string[], cwd: string, signal: AbortSignal): Promise<GhRun> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('gh', [...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: 127, stdout: '', stderr: error instanceof Error ? error.message : String(error), timedOut: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve({ code, stdout, stderr, timedOut })
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, GH_TIMEOUT_MS)
    const onAbort = (): void => { child.kill() }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error: Error) => { stderr += error.message; finish(127) })
    child.on('close', (code: number | null) => finish(code))
  })
}

/**
 * The account `gh` is authenticated as, or a refusal naming what to do.
 * @param cwd - working directory for the probe.
 * @param signal - cancellation owned by the caller.
 * @returns the authenticated login.
 * @throws {ForkInstallRefusedError} when `gh` is missing, unauthenticated, or silent about the account.
 */
async function requireGhIdentity(cwd: string, signal: AbortSignal): Promise<GhIdentity> {
  const probe = await runGh(['api', 'user', '--jq', '.login'], cwd, signal)
  const login = probe.stdout.trim()
  if (probe.code !== 0 || login === '') {
    throw new ForkInstallRefusedError(
      'this action forks with the GitHub CLI, which is not available or not signed in here; '
      + 'run "gh auth login" where the harness runs, then ask again'
      + (probe.stderr.trim() === '' ? '' : `: ${probe.stderr.trim()}`),
    )
  }
  return { login }
}

/**
 * Fork a repository into the authenticated account and pin the revision the
 * install will use.
 *
 * The fork is idempotent: forking a repository that is already forked is a
 * no-op, so asking twice pins whatever the fork's current head is rather than
 * creating a second copy. The revision is read from the FORK, not from
 * upstream — that is what makes the pin mean "the code in the operator's
 * account at this commit".
 * @param options - the repository, working directory and cancellation.
 * @returns the fork and the pinned commit.
 * @throws {ForkInstallRefusedError} when the input is not a GitHub repository, when `gh` cannot fork, or when the fork never becomes readable.
 */
export async function forkRevision(options: ForkInstallOptions): Promise<ForkedRevision> {
  const parsed = parseRepository(options.repository)
  if (parsed === undefined) {
    throw new ForkInstallRefusedError(`not a GitHub repository: ${options.repository}`)
  }
  const { login } = await requireGhIdentity(options.cwd, options.signal)
  const upstream = `${parsed.owner}/${parsed.name}`
  // A fork that already exists answers with its own URL and exit code 0; the
  // only interesting failure is one that left no fork to read.
  const forked = await runGh(['repo', 'fork', upstream, '--clone=false', '--remote=false'], options.cwd, options.signal)
  if (forked.code !== 0) {
    throw new ForkInstallRefusedError(`could not fork ${upstream}: ${forked.stderr.trim() || 'gh reported no reason'}`)
  }
  const fork = `${login}/${parsed.name}`
  for (let attempt = 0; attempt < FORK_VISIBLE_ATTEMPTS; attempt += 1) {
    const head = await runGh(['api', `repos/${fork}/commits/HEAD`, '--jq', '.sha'], options.cwd, options.signal)
    const sha = head.stdout.trim()
    if (head.code === 0 && /^[0-9a-f]{40}$/.test(sha)) return { fork, sha, spec: `github:${fork}#${sha}` }
    if (options.signal.aborted) break
    await new Promise((resolve) => setTimeout(resolve, FORK_VISIBLE_WAIT_MS))
  }
  throw new ForkInstallRefusedError(`the fork ${fork} was created but its head commit never became readable`)
}
