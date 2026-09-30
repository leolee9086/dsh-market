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
/**
 * The mode a market install needs: it rewrites the profile manifest and
 * lockfile, and the installed host code then runs outside the workspace
 * sandbox. The same target the host's own `plugin_manager` tool escalates to.
 */
export const INSTALL_MODE = 'danger-full-access';
/** Thrown for every answer that is not a one-shot grant, and for every ask that never reached a person. */
export class ApprovalRefusedError extends Error {
    /**
     * @param outcome - the closed outcome, or the refusal that stopped the ask.
     * @param message - what to report; callers surface it unchanged.
     */
    /** The closed outcome, or the refusal that stopped the ask reaching anyone. */
    outcome;
    /**
     * @param outcome - the closed outcome, or the refusal that stopped the ask.
     * @param message - what to report; callers surface it unchanged.
     */
    constructor(outcome, message) {
        super(message);
        this.name = 'ApprovalRefusedError';
        this.outcome = outcome;
    }
}
/** The session an agent belongs to, read structurally for the policy lookup. */
function sessionOf(agent) {
    if (agent === null || typeof agent !== 'object')
        return undefined;
    return agent.session;
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
export async function requireApproval(gate, ask) {
    if (gate.approver === undefined) {
        throw new ApprovalRefusedError('no-approval-service', 'this action installs host code, which needs approval, but no approval service is composed on this host');
    }
    if (ask.agent === undefined) {
        throw new ApprovalRefusedError('no-agent', 'this action installs host code, which needs approval, but the call carries no agent to route the question through');
    }
    if (gate.policy === undefined) {
        throw new ApprovalRefusedError('no-policy', 'this action installs host code, which needs approval, but no sandbox policy is composed to read the current mode from');
    }
    const { mode } = gate.policy.resolve({ session: sessionOf(ask.agent) });
    // Repeating the mode the call already runs in needs no question: the person
    // chose that mode for this session, and asking again would train them to
    // dismiss the prompt that matters.
    if (mode === INSTALL_MODE)
        return;
    const outcome = await gate.approver.request({
        agent: ask.agent,
        toolName: ask.toolName,
        callId: ask.callId,
        reason: ask.justification,
        ...ask.displayReason === undefined ? {} : { displayReason: ask.displayReason },
        ...ask.signal === undefined ? {} : { signal: ask.signal },
    });
    if (outcome === 'allowed-once')
        return;
    throw new ApprovalRefusedError(outcome, outcome === 'rejected'
        ? 'the request was declined, so nothing was installed'
        : outcome === 'cancelled'
            ? 'the request was cancelled before it was answered, so nothing was installed'
            : 'no approver was available to answer, so nothing was installed');
}
