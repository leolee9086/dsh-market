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
/** One refused fork-and-install request, before any process starts. */
export declare class ForkInstallRefusedError extends Error {
    /**
     * @param message - what to report; callers surface it unchanged.
     */
    constructor(message: string);
}
/** What one run needs from its surroundings. */
export interface ForkInstallOptions {
    /** `owner/name` or a GitHub URL; anything else is refused before a process starts. */
    readonly repository: string;
    /** Directory the `gh` children run in — the profile directory. */
    readonly cwd: string;
    /** Cancellation owned by the calling tool. */
    readonly signal: AbortSignal;
}
/** The pinned revision a run produced; the caller installs `spec` unchanged. */
export interface ForkedRevision {
    /** `owner/name` of the fork under the authenticated account. */
    readonly fork: string;
    /** The 40-hex commit the install pins. */
    readonly sha: string;
    /** The installation spec: a git spec pinned to `sha`. */
    readonly spec: string;
}
/**
 * Read `owner/name` out of the forms a person or a model actually writes:
 * a bare pair, a `github:` shorthand, or a repository URL. The reference and
 * any trailing path are dropped — the fork is taken from the repository, and
 * the revision is resolved afterwards against the fork.
 * @param input - the repository as written.
 * @returns the repository pair, or undefined when the input names no GitHub repository.
 */
export declare function parseRepository(input: string): {
    owner: string;
    name: string;
} | undefined;
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
export declare function forkRevision(options: ForkInstallOptions): Promise<ForkedRevision>;
