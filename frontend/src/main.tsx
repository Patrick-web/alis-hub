
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { WorkspaceProvider } from "./app/stores/workspace.tsx";
import { NotificationProvider } from "./app/stores/notifications.tsx";
import { UpdateProvider } from "./app/stores/update.tsx";
import { LabsProvider } from "./app/stores/labs.tsx";
import { SourceControlProvider } from "./app/stores/sourceControl.tsx";
import { DevelopSettingsProvider } from "./app/stores/developSettings.tsx";
import { ProtectedEnvironmentsProvider } from "./app/stores/protectedEnvironments.tsx";
import { SuggestionsProvider } from "./app/stores/suggestions.tsx";
import { PackageSessionsProvider } from "./app/stores/packageSessions.tsx";
import { WorkflowRunsProvider } from "./app/stores/workflowRuns.tsx";
import { CommandPaletteProvider } from "./app/stores/commandPalette.tsx";
import { PlatformProvider } from "./app/stores/platform.tsx";
import { DevSettingsModalProvider } from "./app/stores/devSettingsModal.tsx";
import { LocalAIProvider } from "./app/stores/localai.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { WailsNotificationBridge } from "./app/components/WailsNotificationBridge.tsx";
import { NetworkStatus } from "./app/components/NetworkStatus.tsx";
import * as settingsClient from "./app/lib/settingsClient.ts";
import "./styles/index.css";

// Mirrors next-themes' choice into the SQLite settings store. next-themes keeps
// owning localStorage itself (it needs a synchronous pre-render read to avoid a
// flash of the wrong theme, which an async SQLite round-trip can't replace).
function ThemeSettingsSync() {
  const { theme } = useTheme();
  useEffect(() => {
    if (theme) settingsClient.set("theme", theme);
  }, [theme]);
  return null;
}

async function bootstrap() {
  await settingsClient.init();

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <ErrorBoundary>
        <NotificationProvider>
          <UpdateProvider>
          <WorkspaceProvider>
            <LabsProvider>
              <LocalAIProvider>
              <SourceControlProvider>
              <DevelopSettingsProvider>
              <ProtectedEnvironmentsProvider>
              <SuggestionsProvider>
                <PackageSessionsProvider>
                  <WorkflowRunsProvider>
                  <CommandPaletteProvider>
                    <PlatformProvider>
                    <DevSettingsModalProvider>
                      <ThemeSettingsSync />
                      <App />
                      <Toaster position="bottom-right" />
                      <WailsNotificationBridge />
                      <NetworkStatus />
                    </DevSettingsModalProvider>
                    </PlatformProvider>
                  </CommandPaletteProvider>
                  </WorkflowRunsProvider>
                </PackageSessionsProvider>
              </SuggestionsProvider>
              </ProtectedEnvironmentsProvider>
              </DevelopSettingsProvider>
              </SourceControlProvider>
              </LocalAIProvider>
            </LabsProvider>
          </WorkspaceProvider>
          </UpdateProvider>
        </NotificationProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

bootstrap();
