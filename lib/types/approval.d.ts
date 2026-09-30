/**
 * Approval gate for every market action an agent can start on its own.
 *
 * Why the market needs this at all. Its HTTP routes run inside a web request:
 * no agent, no open turn. The host's approval stack needs both —
 * `ApprovalService.request()` rejects outside an open turn, because its
 * `approval/asked` + `approval/decided` audit pair must be turn-enclosed to
 * survive replay. A GUI button can therefore only carry out what the person
 * clicking it already decided; it has no way to ask. An agent-facing tool is
 * the opposite case: it acts on the model's initiative, so it asks first, and
 * it refuses to run when the host composes no approval service, when the call
 * carries no agent, or when the answer is anything but a one-shot grant.
 *
 * Structural subset, like every other host contract this package reads
 * (profileContext, desktopPnpm, agents): no runtime import of
 * `@deepseek-ai/dsh-sandbox` or `@deepseek-ai/dsh-user-approval`, so the
 * market keeps loading on hosts that compose neither. The escalation semantics
 * mirror `approveEscalation`: a call whose effective mode is already the
 * target mode is not asked again, because the person already chose that mode
 * for the session.
 */
/** Closed approval outcomes; only `allowed-once` grants the action. */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** Why an ask never reached a person. */
export type ApprovalRefusal = 'no-approval-service' | 'no-agent' | 'no-policy';
/**
 * The approval service (`ctx.approval`), structurally: one readonly ask that
 * resolves to the closed outcome vocabulary. The host owns routing, the audit
 * pair and the fail-closed normalization; this package only reads the answer.
 */
export interface ApprovalRequesterLike {
    request(request: {
        readonly agent: unknown;
        readonly toolName: string;
        readonly callId: string;
        readonly reason: string;
        readonly displayReason?: {
            readonly en: string;
            readonly [locale: string]: string;
        };
        readonly signal?: AbortSignal;
    }): Promise<ApprovalOutcome>;
}
/** The sandbox policy service (`ctx.sandboxPolicy`), structurally. */
export interface SandboxPolicyLike {
    resolve(input: {
        readonly session?: unknown;
    }): {
        readonly mode: string;
    };
}
/** The host pieces one ask goes through, feature-detected at the call site. */
export interface ApprovalGate {
    readonly approver: ApprovalRequesterLike | undefined;
    readonly policy: SandboxPolicyLike | undefined;
}
/**
 * The mode a market install needs: it rewrites the profile manifest and
 * lockfile, and the installed host code then runs outside the workspace
 * sandbox. The same target the host's own `plugin_manager` tool escalates to.
 */
export declare const INSTALL_MODE = "danger-full-access";
/** What one gate call describes to the person answering it. */
export interface ApprovalAsk {
    /** The calling agent; without one the ask cannot be routed, and refuses. */
    readonly agent: unknown;
    /** Tool-call identity the prompt attaches to, read back by the audit pair. */
    readonly callId: string;
    readonly toolName: string;
    /** One sentence shown verbatim inside the audit reason. */
    readonly justification: string;
    /** Localized presentation, when the caller has a translation to offer. */
    readonly displayReason?: {
        readonly en: string;
        readonly [locale: string]: string;
    };
    readonly signal?: AbortSignal;
}
/** Thrown for every answer that is not a one-shot grant, and for every ask that never reached a person. */
export declare class ApprovalRefusedError extends Error {
    /**
     * @param outcome - the closed outcome, or the refusal that stopped the ask.
     * @param message - what to report; callers surface it unchanged.
     */
    /** The closed outcome, or the refusal that stopped the ask reaching anyone. */
    readonly outcome: ApprovalOutcome | ApprovalRefusal;
    /**
     * @param outcome - the closed outcome, or the refusal that stopped the ask.
     * @param message - what to report; callers surface it unchanged.
     */
    constructor(outcome: ApprovalOutcome | ApprovalRefusal, message: string);
}
/**
 * Ask for permission to run one market action, or refuse.
 *
 * Refuses — never proceeds — when the host composes no approval service
 * (nothing could be asked), when the call has no agent (nothing could be
 * routed), when no sandbox policy answers (the effective mode is unknown), and
 * for every outcome other than `allowed-once`. A refusal the person made
 * (`rejected`) and one the host could not deliver (`unavailable`) are reported
 * differently, but neither executes.
 * @param gate - the host pieces, already feature-detected by the caller.
 * @param ask - the action being asked about.
 * @throws {ApprovalRefusedError} for every outcome other than a one-shot grant.
 */
export declare function requireApproval(gate: ApprovalGate, ask: ApprovalAsk): Promise<void>;
