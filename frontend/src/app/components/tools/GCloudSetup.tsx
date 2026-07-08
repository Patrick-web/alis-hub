import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import { BuildTerminal, type BuildTerminalHandle } from "../BuildTerminal";
import { Button } from "../Button";
import { Loader } from "../Loader";
import { Browser } from "@wailsio/runtime";
import * as GS from "../../../../bindings/alis-hub-v3/gcloudservice";
import type { GCloudStatus } from "../../../../bindings/alis-hub-v3/models";
import { usePlatform } from "../../stores/platform";

interface Props {
  onReady: () => void;
}

const INSTALL_URL = "https://cloud.google.com/sdk/docs/install";

const UNIX_INSTALL_COMMAND =
  "curl https://sdk.cloud.google.com | bash && exec -l $SHELL";

// The setup terminal on Windows is PowerShell (see platformShell in
// platform.go), so the Unix curl|bash one-liner can't run there. Google
// doesn't publish a piped installer for Windows; the documented silent
// install is the NSIS installer run with /S (see
// https://cloud.google.com/sdk/docs/downloads-interactive). It installs to
// %LOCALAPPDATA%\Google\Cloud SDK by default, which gcloudBin() already
// probes. The installer prints nothing when silent, so we echo a line that
// matches INSTALL_SUCCESS below to trigger the status recheck.
const WINDOWS_INSTALL_COMMAND =
  '$installer = "$env:Temp\\GoogleCloudSDKInstaller.exe"; ' +
  '(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", $installer); ' +
  "Start-Process -FilePath $installer -ArgumentList '/S','/noreporting' -Wait; " +
  'Write-Host "Installation complete"';

const SESSION_ID = "gcloud-setup";

function StepCard({
  step,
  title,
  subtitle,
  status,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  status: "ok" | "error" | "pending";
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-[6px] bg-background overflow-hidden">
      <div className="flex items-center gap-[12px] px-[16px] py-[14px] border-b border-border">
        <div
          className={`w-[24px] h-[24px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold font-mono ${
            status === "ok"
              ? "bg-green-500/20 text-green-400"
              : status === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-foreground/[6%] text-foreground/40"
          }`}
        >
          {status === "ok" ? (
            <Icon icon="solar:check-circle-bold" className="text-sm" />
          ) : status === "error" ? (
            <Icon icon="solar:close-circle-bold" className="text-sm" />
          ) : (
            step
          )}
        </div>
        <div>
          <p className="text-[11px] font-bold text-foreground font-mono">
            {title}
          </p>
          <p className="text-[9px] text-foreground/40 uppercase">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="px-[16px] py-[14px]">{children}</div>
    </div>
  );
}

export function GCloudSetup({ onReady }: Props) {
  const { effective } = usePlatform();
  const INSTALL_COMMAND =
    effective === "windows" ? WINDOWS_INSTALL_COMMAND : UNIX_INSTALL_COMMAND;

  const [status, setStatus] = useState<GCloudStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const termRef = useRef<BuildTerminalHandle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputBuf = useRef(""); // accumulated raw terminal output for pattern matching
  const recheckPending = useRef(false);

  const check = useCallback(() => {
    setChecking(true);
    GS.CheckGCloudStatus()
      .then((s) => setStatus(s))
      .catch(() => setStatus({ gcloudInstalled: false, authenticated: false }))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Patterns in gcloud output that signal a step has just completed.
  // We strip ANSI codes before matching so colour sequences don't interfere.
  function stripAnsi(s: string) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*[mGKHF]/g, "");
  }

  const AUTH_SUCCESS = [
    "you are now logged in as",
    "credentials saved to file",
    "your current project is", // appears right after auth completes
    "access token is valid",
  ];

  const INSTALL_SUCCESS = [
    "installation complete",
    "google-cloud-sdk installed",
    "update done",
  ];

  // Poll terminal output while session is active
  useEffect(() => {
    if (!sessionActive) return;
    pollRef.current = setInterval(async () => {
      try {
        const chunk = await GS.PollSetupOutput(SESSION_ID, offset);
        if (!chunk) return;
        if (chunk.data) {
          termRef.current?.write(chunk.data);
          setOffset((o) => o + chunk.data.length);

          // Accumulate and scan for success patterns (keep last 2 KB to bound memory)
          outputBuf.current = (outputBuf.current + chunk.data).slice(-2048);
          const plain = stripAnsi(outputBuf.current).toLowerCase();

          const authDone = AUTH_SUCCESS.some((p) => plain.includes(p));
          const installDone = INSTALL_SUCCESS.some((p) => plain.includes(p));

          if ((authDone || installDone) && !recheckPending.current) {
            recheckPending.current = true;
            setTimeout(() => {
              check();
              recheckPending.current = false;
            }, 1200);
          }
        }
        if (chunk.done) {
          setSessionActive(false);
          clearInterval(pollRef.current!);
          // Always recheck when the session process exits
          setTimeout(check, 800);
        }
      } catch {
        // ignore poll errors
      }
    }, 80);
    return () => clearInterval(pollRef.current!);
  }, [sessionActive, offset, check]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      GS.StopSetupSession(SESSION_ID);
    };
  }, []);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function openTerminal(command?: string) {
    if (!terminalOpen) {
      setTerminalOpen(true);
    }
    GS.StopSetupSession(SESSION_ID)
      .then(() => {
        setSessionActive(false);
        setOffset(0);
        outputBuf.current = "";
        recheckPending.current = false;
        termRef.current?.clear();
        return GS.StartSetupSession(SESSION_ID, command ?? "");
      })
      .then(() => {
        setSessionActive(true);
      })
      .catch(console.error);
  }

  if (checking && !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  const gcloudOk = status?.gcloudInstalled ?? false;
  const authOk = status?.authenticated ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Setup content */}
      <div className="flex-1 overflow-y-auto p-[24px]">
        <div className="max-w-[640px] mx-auto">
          <div className="mb-[24px]">
            <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono mb-[4px]">
              Prerequisites
            </p>
            <h2 className="text-[16px] font-bold text-foreground font-mono">
              GCloud Tools Setup
            </h2>
            <p className="text-[11px] text-foreground/50 mt-[4px] leading-[1.6]">
              Complete the steps below to enable Cloud Storage, Logging,
              Artifact Registry and Secret Manager tools.
            </p>
          </div>

          <div className="flex flex-col gap-[12px]">
            {/* Step 1: Install gcloud */}
            <StepCard
              step={1}
              title="Install Google Cloud SDK"
              subtitle="Required — gcloud CLI"
              status={gcloudOk ? "ok" : "error"}
            >
              {gcloudOk ? (
                <div className="flex items-center gap-[8px]">
                  <Icon
                    icon="solar:check-circle-bold"
                    className="text-sm text-green-400"
                  />
                  <p className="text-[10px] text-green-400 font-mono">
                    Found at {status?.gcloudPath}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-foreground/60 leading-[1.6] mb-[12px]">
                    The Google Cloud SDK provides the{" "}
                    <code className="text-brand font-mono">
                      gcloud
                    </code>{" "}
                    CLI used to authenticate and call GCP APIs.
                  </p>

                  {/* Install command */}
                  <div className="bg-background border border-border rounded-[4px] flex items-center gap-[8px] px-[12px] py-[8px] mb-[10px]">
                    <Icon
                      icon="solar:terminal-linear"
                      className="text-sm text-foreground/30 shrink-0"
                    />
                    <code className="text-[10px] text-foreground/70 font-mono flex-1 truncate">
                      {INSTALL_COMMAND}
                    </code>
                  </div>

                  <div className="flex gap-[8px]">
                    <Button
                      variant="primary"
                      onClick={() => openTerminal(INSTALL_COMMAND)}
                      icon={
                        <Icon icon="solar:play-linear" className="text-xs" />
                      }
                    >
                      Run in Terminal
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        copyToClipboard(INSTALL_COMMAND, "install")
                      }
                      icon={
                        <Icon
                          icon={
                            copied === "install"
                              ? "solar:check-linear"
                              : "solar:copy-linear"
                          }
                          className="text-xs"
                        />
                      }
                    >
                      {copied === "install" ? "Copied" : "Copy Command"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => Browser.OpenURL(INSTALL_URL)}
                      icon={
                        <Icon icon="solar:export-linear" className="text-xs" />
                      }
                    >
                      Open Docs
                    </Button>
                  </div>
                </>
              )}
            </StepCard>

            {/* Step 2: Authenticate */}
            <StepCard
              step={2}
              title="Authenticate with Google Cloud"
              subtitle={
                authOk
                  ? `Signed in as ${status?.authAccount}`
                  : "Not authenticated"
              }
              status={!gcloudOk ? "pending" : authOk ? "ok" : "error"}
            >
              {authOk ? (
                <div className="flex items-center gap-[8px]">
                  <Icon
                    icon="solar:check-circle-bold"
                    className="text-sm text-green-400"
                  />
                  <p className="text-[10px] text-green-400 font-mono">
                    Authenticated as {status?.authAccount}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-foreground/60 leading-[1.6] mb-[12px]">
                    Authenticate with your Google account. Your browser will
                    open to complete the login — the terminal below stays
                    interactive for any prompts.
                  </p>

                  <div className="bg-background border border-border rounded-[4px] flex items-center gap-[8px] px-[12px] py-[8px] mb-[10px]">
                    <Icon
                      icon="solar:terminal-linear"
                      className="text-sm text-foreground/30 shrink-0"
                    />
                    <code className="text-[10px] text-foreground/70 font-mono">
                      gcloud auth login
                    </code>
                  </div>

                  <div className="flex gap-[8px]">
                    <Button
                      variant="primary"
                      disabled={!gcloudOk}
                      onClick={() => openTerminal("gcloud auth login")}
                      icon={
                        <Icon icon="solar:play-linear" className="text-xs" />
                      }
                    >
                      Run in Terminal
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        copyToClipboard("gcloud auth login", "auth")
                      }
                      icon={
                        <Icon
                          icon={
                            copied === "auth"
                              ? "solar:check-linear"
                              : "solar:copy-linear"
                          }
                          className="text-xs"
                        />
                      }
                    >
                      {copied === "auth" ? "Copied" : "Copy Command"}
                    </Button>
                  </div>
                </>
              )}
            </StepCard>

            {/* Actions */}
            <div className="flex items-center gap-[10px] pt-[4px]">
              <Button
                variant="secondary"
                onClick={check}
                disabled={checking}
                icon={
                  <Icon
                    icon={
                      checking ? "solar:refresh-bold" : "solar:refresh-linear"
                    }
                    className={`text-xs ${checking ? "animate-spin" : ""}`}
                  />
                }
              >
                {checking ? "Checking…" : "Re-check"}
              </Button>

              <Button
                variant="primary"
                disabled={!gcloudOk || !authOk || checking}
                onClick={onReady}
                icon={
                  <Icon
                    icon="solar:alt-arrow-right-linear"
                    className="text-xs"
                  />
                }
              >
                {gcloudOk && authOk
                  ? "Continue to Tools"
                  : "Complete steps above"}
              </Button>

              {gcloudOk && authOk && (
                <p className="text-[10px] text-green-400 font-mono">
                  All prerequisites met
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Terminal pane */}
      {terminalOpen && (
        <div
          className="border-t border-border flex flex-col"
          style={{ height: "280px" }}
        >
          <div className="flex items-center justify-between px-[12px] h-[30px] border-b border-border shrink-0">
            <div className="flex items-center gap-[8px]">
              <Icon
                icon="solar:terminal-bold"
                className="text-xs text-foreground/40"
              />
              <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono">
                Setup Terminal
              </p>
              {sessionActive && (
                <span className="w-[6px] h-[6px] rounded-full bg-brand-fill animate-pulse" />
              )}
            </div>
            <button
              onClick={() => {
                setTerminalOpen(false);
                GS.StopSetupSession(SESSION_ID);
                setSessionActive(false);
              }}
              className="w-[20px] h-[20px] flex items-center justify-center rounded-[3px] text-foreground/30 hover:text-foreground hover:bg-accent transition-colors"
            >
              <Icon icon="solar:close-circle-linear" className="text-xs" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <BuildTerminal
              ref={termRef}
              className="w-full h-full"
              onInput={(data) => {
                if (sessionActive) GS.WriteSetupInput(SESSION_ID, data);
              }}
              onResize={(cols, rows) => {
                if (sessionActive)
                  GS.ResizeSetupTerminal(SESSION_ID, cols, rows);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
