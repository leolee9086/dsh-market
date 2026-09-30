/**
 * The market's agent-facing install tool.
 *
 * The GUI already installs plugins, but that path runs in a web request and
 * can never ask for approval — see ./approval.ts. Anything an agent can start
 * on its own therefore goes through a tool instead, and every one of them asks
 * before it acts: a tool acts on the model's initiative, so the person has to
 * be the one who decides.
 *
 * The tool does three things and delegates the fourth: fork the repository
 * into the operator's account, pin the commit, hand the pinned git spec to the
 * host's plugin manager, and let that manager own pnpm, the lockfile snapshot,
 * rollback and activation. Nothing here re-implements package management.
 */

import { randomUUID } from 'node:crypto'
import { ApprovalRefusedError, INSTALL_MODE, requireApproval, type ApprovalGate } from './approval.ts'
import { ForkInstallRefusedError, forkRevision } from './fork-install.ts'
import type { OfficialPluginManagerLike } from './official-desktop.ts'

/** The tool the model calls to install a community plugin through a fork. */
export const FORK_INSTALL_TOOL = 'market_fork_install'

/** One registered tool, as the host's registry takes it. */
export interface MarketToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): unknown[]
  }
  execute(args: unknown, exec: MarketToolExecution): Promise<unknown>
}

/** The execution identity the registry hands a tool body. */
export interface MarketToolExecution {
  readonly agent?: unknown
  readonly callId: string
  readonly signal: AbortSignal
}

/** The tool registry (`ctx.tools`), structurally. */
export interface ToolRegistryLike {
  register(definition: MarketToolDefinition): unknown
}

/** Everything one tool registration reads from the host. */
export interface MarketToolContext {
  /** The tool registry; absent means no agent-facing surface is composed. */
  readonly tools: ToolRegistryLike | undefined
  /** The approval ingredients, feature-detected at the call site. */
  readonly approval: ApprovalGate
  /** The host's own plugin manager; absent means installation cannot be delegated. */
  readonly pluginManager: () => OfficialPluginManagerLike | undefined
  /** The profile this process booted — the directory `gh` runs in and the profile the manager mutates. */
  readonly profileName: string
  readonly profileDir: string
}

/** One tool result as lossless JSON, rendered to the model as text. */
function textResult(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Build the fork-and-install tool.
 *
 * Approval comes FIRST, before `gh` starts and long before pnpm does: the
 * question is about what the action will do, and an action that asks after it
 * has already forked has already changed something outside the machine.
 * @param context - the host pieces the tool reads.
 * @returns the tool definition, ready to register.
 */
export function createForkInstallTool(context: MarketToolContext): MarketToolDefinition {
  return {
    name: FORK_INSTALL_TOOL,
    description:
      'Install a community DSH plugin from GitHub by forking it into your own account first, pinning the exact '
      + 'commit, and installing that pinned revision through the host plugin manager. Use this instead of installing '
      + 'a third-party repository directly. Requires approval for every call. The fork is what makes the installed '
      + 'code one the operator owns and can read or revert; the pinned commit is what stops the upstream repository '
      + 'from changing what runs here later. Report the fork and the commit to the user afterwards.',
    parameters: {
      repository: {
        type: 'string',
        required: true,
        description: 'The plugin repository: "owner/name", "github:owner/name", or its GitHub URL.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: textResult(value) }],
    },
    async execute(args: unknown, exec: MarketToolExecution): Promise<unknown> {
      const repository = (args as { repository?: unknown } | null)?.repository
      if (typeof repository !== 'string' || repository.trim() === '') {
        throw new Error('repository is required: name it as "owner/name" or a GitHub URL')
      }
      await requireApproval(context.approval, {
        agent: exec.agent,
        callId: exec.callId,
        toolName: FORK_INSTALL_TOOL,
        justification:
          `Install ${repository.trim()} in profile "${context.profileName}": the repository is forked into the `
          + 'operator\'s own account, the current commit of that fork is pinned, and the pinned revision is installed '
          + 'as host code that runs outside the workspace sandbox.',
        displayReason: {
          en: `Fork ${repository.trim()} into your GitHub account and install the pinned commit as a plugin of ${context.profileName}`,
          zh: `把 ${repository.trim()} fork 到你的 GitHub 账号，并把锁定的提交安装为 ${context.profileName} 的插件`,
        },
        signal: exec.signal,
      })
      const manager = context.pluginManager()
      if (manager === undefined || typeof manager.installBundle !== 'function') {
        throw new Error('this host composes no plugin manager, so the market cannot install anything here; use Settings → Plugins in the app instead')
      }
      const forked = await forkRevision({ repository, cwd: context.profileDir, signal: exec.signal })
      exec.signal.throwIfAborted()
      const result = await manager.installBundle(forked.spec, { requestId: randomUUID() })
      return JSON.stringify({
        fork: forked.fork,
        commit: forked.sha,
        spec: forked.spec,
        application: result.application,
        ...result.error === undefined ? {} : { error: result.error },
        output: result.packageResult?.output ?? '',
      })
    },
  }
}

/**
 * Register the market's agent-facing tools on the host registry.
 *
 * A host without a tool registry is not an error: the market's GUI works
 * without one, and the agent-facing surface simply does not exist there.
 * @param context - the host pieces the tools read.
 * @returns whether a registry accepted the registration.
 */
export function registerMarketTools(context: MarketToolContext): boolean {
  const registry = context.tools
  if (registry === undefined || typeof registry.register !== 'function') return false
  registry.register(createForkInstallTool(context))
  return true
}

export { ApprovalRefusedError as MarketApprovalRefusedError, ForkInstallRefusedError as MarketForkInstallRefusedError, INSTALL_MODE }
