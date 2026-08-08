import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "./Button";
import { Loader } from "./Loader";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import type { Approval, EnvGateResult } from "../../../bindings/alis-hub-v3/models";

/**
 * Shared UI for commands the CLI refuses to run without a human's say-so.
 *
 * Two different gates arrive as exit 3 and must not be conflated:
 *
 *   APPROVAL_REQUIRED              the user's automation tier gates this class
 *                                  of command (destructive ones on the default
 *                                  "balanced" tier). Cleared by --approve.
 *   PRODUCTION_CONFIRMATION_REQUIRED  the target is a production environment.
 *                                  Cleared only by --confirm-production;
 *                                  --approve does nothing for it.
 *
 * The flow is deliberately two-pass. The first call runs *ungated*, so the CLI
 * itself reports what the command would change — that message is the CLI's own
 * words, not ours, and is what the user actually approves. Only after they
 * agree does the second call carry the approval the gate asked for.
 *
 * Nothing here decides on the user's behalf. `gate.approval` comes back from
 * the Go side already matched to the gate code, so the retry cannot escalate a
 * tier approval into a production confirmation by accident.
 */

/**
 * Gate codes the CLI returns on exit 3.
 */
export const GATE_PRODUCTION = "PRODUCTION_CONFIRMATION_REQUIRED";
export const GATE_APPROVAL = "APPROVAL_REQUIRED";

/**
 * Adapts a DBD result into the gate shape.
 *
 * RunDefine/RunBuild/RunDeploy report a gate in-band — `error` carries the gate
 * code and `notes` the retry command — rather than as an EnvGateResult, because
 * those result types predate the gate work and are what the panes already poll
 * against. Returns null when the result is not a gate, so a caller can treat
 * "gated" and "started" as distinct outcomes.
 *
 * Without this, a gated deploy looks like a successful start with an empty
 * operation name, and the pane waits on an operation that was never created.
 */
export function gateFromDbdResult(
  result: { error?: string; notes?: string } | null | undefined,
): EnvGateResult | null {
  const code = result?.error;
  if (code !== GATE_PRODUCTION && code !== GATE_APPROVAL) return null;
  return {
    gated: true,
    code,
    // The CLI's own message is not carried on these result types, so describe
    // the gate rather than inventing detail the caller does not have.
    message:
      code === GATE_PRODUCTION
        ? "This targets a production environment and needs explicit confirmation before it runs."
        : "Your automation tier requires approval before this command runs.",
    retryCmd: result?.notes ?? "",
    output: "",
    approval:
      code === GATE_PRODUCTION
        ? { approve: false, confirmProduction: true }
        : { approve: true, confirmProduction: false },
  };
}

/** A gated operation: run it with the given approval and report the outcome. */
export type GatedCall = (approval: Approval) => Promise<EnvGateResult | null>;

const NO_APPROVAL: Approval = { approve: false, confirmProduction: false };

interface ApprovalGateDialogProps {
  gate: EnvGateResult | null;
  /** What the user is about to do, in the app's words, e.g. "Remove DATABASE_URL". */
  action?: string;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

export function ApprovalGateDialog({
  gate,
  action,
  busy = false,
  onApprove,
  onCancel,
}: ApprovalGateDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyRetry = useCallback(() => {
    if (!gate?.retryCmd) return;
    void navigator.clipboard.writeText(gate.retryCmd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [gate?.retryCmd]);

  if (!gate?.gated) return null;

  const isProduction = gate.code === "PRODUCTION_CONFIRMATION_REQUIRED";

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="text-foreground p-0 gap-0 sm:max-w-[520px] overflow-hidden">
        <AlertDialogHeader className="p-0">
          <div
            className={`flex items-center gap-[10px] px-[18px] py-[13px] border-b border-border ${
              isProduction ? "bg-red-500/8" : "bg-amber-400/6"
            }`}
          >
            <Icon
              icon={isProduction ? "solar:shield-warning-bold" : "solar:lock-keyhole-linear"}
              className={`text-[18px] ${isProduction ? "text-red-400" : "text-amber-400"}`}
            />
            <AlertDialogTitle className="text-[12px] font-mono text-foreground m-0">
              {isProduction ? "Production change — confirm" : "Approval required"}
            </AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <div className="px-[18px] py-[14px] flex flex-col gap-[12px]">
          {action && <span className="text-[11px] text-foreground font-mono">{action}</span>}

          {/* The CLI's own description of the change is what is being approved,
              so it is shown verbatim rather than reworded. */}
          <p className="text-[11px] leading-[1.6] text-foreground/70 font-mono">{gate.message}</p>

          {isProduction && (
            <div className="flex items-start gap-[7px] px-[10px] py-[8px] border border-red-500/25 bg-red-500/5">
              <Icon
                icon="solar:danger-triangle-linear"
                className="text-red-400 text-[13px] mt-[1px] shrink-0"
              />
              <span className="text-[10px] leading-[1.5] text-red-300/90 font-mono">
                This targets a production environment. Approving here is the same as answering yes
                at the terminal.
              </span>
            </div>
          )}

          {gate.retryCmd && (
            <div className="flex flex-col gap-[4px]">
              <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
                Equivalent command
              </span>
              <div className="flex items-start gap-[6px] px-[10px] py-[7px] bg-card border border-border group">
                <code className="text-[10px] leading-[1.5] text-foreground/60 font-mono flex-1 break-all">
                  {gate.retryCmd}
                </code>
                <button
                  onClick={copyRetry}
                  className="text-foreground/20 hover:text-foreground transition-colors shrink-0"
                  title="Copy to run it yourself"
                >
                  <Icon
                    icon={copied ? "solar:check-read-linear" : "solar:copy-linear"}
                    className="text-[13px]"
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[18px] py-[12px] border-t border-border">
          <Button variant="ghost" onClick={onCancel} disabled={busy} className="text-[10px]">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onApprove}
            disabled={busy}
            className={`text-[10px] ${isProduction ? "!bg-red-500 hover:!bg-red-600" : ""}`}
          >
            {busy ? (
              <span className="flex items-center gap-[6px]">
                <Loader size={12} color="currentColor" />
                Running…
              </span>
            ) : isProduction ? (
              "Confirm production change"
            ) : (
              "Approve and run"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Drives the two-pass gate cycle for one gated operation.
 *
 * ```tsx
 * const gate = useApprovalGate();
 * // first pass runs ungated; a gate opens the dialog automatically
 * await gate.run((approval) => PS.UnsetEnvironmentVariablesCLI(org, p, env, [name], false, approval),
 *                `Remove ${name} from ${env}`);
 * …
 * <ApprovalGateDialog {...gate.dialogProps} />
 * ```
 */
export function useApprovalGate(onSuccess?: (result: EnvGateResult) => void) {
  const [gate, setGate] = useState<EnvGateResult | null>(null);
  const [action, setAction] = useState<string>("");
  const [pending, setPending] = useState<GatedCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const invoke = useCallback(
    async (call: GatedCall, approval: Approval) => {
      const result = await call(approval);
      if (!result) return null;
      if (result.gated) {
        setGate(result);
        return null;
      }
      setGate(null);
      setPending(null);
      onSuccess?.(result);
      return result;
    },
    [onSuccess],
  );

  /** First pass: attempt the operation with no approval attached. */
  const run = useCallback(
    async (call: GatedCall, describeAction = "") => {
      setBusy(true);
      setError("");
      setAction(describeAction);
      setPending(() => call);
      try {
        return await invoke(call, NO_APPROVAL);
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [invoke],
  );

  /** Second pass: retry carrying exactly the approval the gate asked for. */
  const approve = useCallback(async () => {
    if (!pending || !gate) return;
    setBusy(true);
    setError("");
    try {
      await invoke(pending, gate.approval ?? { approve: true, confirmProduction: false });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [pending, gate, invoke]);

  const cancel = useCallback(() => {
    setGate(null);
    setPending(null);
  }, []);

  return {
    run,
    busy,
    error,
    gated: Boolean(gate?.gated),
    dialogProps: { gate, action, busy, onApprove: approve, onCancel: cancel },
  };
}
