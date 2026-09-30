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
import { ApprovalRefusedError, INSTALL_MODE, type ApprovalGate } from './approval.ts';
import { ForkInstallRefusedError } from './fork-install.ts';
import type { OfficialPluginManagerLike } from './official-desktop.ts';
/** The tool the model calls to install a community plugin through a fork. */
export declare const FORK_INSTALL_TOOL = "market_fork_install";
/** One registered tool, as the host's registry takes it. */
export interface MarketToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly output: {
        readonly schema: Record<string, unknown>;
        render(args: unknown, value: unknown): unknown[];
    };
    execute(args: unknown, exec: MarketToolExecution): Promise<unknown>;
}
/** The execution identity the registry hands a tool body. */
export interface MarketToolExecution {
    readonly agent?: unknown;
    readonly callId: string;
    readonly signal: AbortSignal;
}
/** The tool registry (`ctx.tools`), structurally. */
export interface ToolRegistryLike {
    register(definition: MarketToolDefinition): unknown;
}
/** Everything one tool registration reads from the host. */
export interface MarketToolContext {
    /** The tool registry; absent means no agent-facing surface is composed. */
    readonly tools: ToolRegistryLike | undefined;
    /** The approval ingredients, feature-detected at the call site. */
    readonly approval: ApprovalGate;
    /** The host's own plugin manager; absent means installation cannot be delegated. */
    readonly pluginManager: () => OfficialPluginManagerLike | undefined;
    /** The profile this process booted — the directory `gh` runs in and the profile the manager mutates. */
    readonly profileName: string;
    readonly profileDir: string;
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
export declare function createForkInstallTool(context: MarketToolContext): MarketToolDefinition;
/**
 * Register the market's agent-facing tools on the host registry.
 *
 * A host without a tool registry is not an error: the market's GUI works
 * without one, and the agent-facing surface simply does not exist there.
 * @param context - the host pieces the tools read.
 * @returns whether a registry accepted the registration.
 */
export declare function registerMarketTools(context: MarketToolContext): boolean;
export { ApprovalRefusedError as MarketApprovalRefusedError, ForkInstallRefusedError as MarketForkInstallRefusedError, INSTALL_MODE };
