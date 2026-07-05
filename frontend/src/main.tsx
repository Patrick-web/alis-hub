
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { WorkspaceProvider } from "./app/stores/workspace.tsx";
import { NotificationProvider } from "./app/stores/notifications.tsx";
import { UpdateProvider } from "./app/stores/update.tsx";
import { LabsProvider } from "./app/stores/labs.tsx";
import { SourceControlProvider } from "./app/stores/sourceControl.tsx";
import { DevelopSettingsProvider } from "./app/stores/developSettings.tsx";
import { SuggestionsProvider } from "./app/stores/suggestions.tsx";
import { PackageSessionsProvider } from "./app/stores/packageSessions.tsx";
import { CommandPaletteProvider } from "./app/stores/commandPalette.tsx";
import { PlatformProvider } from "./app/stores/platform.tsx";
import { DevSettingsModalProvider } from "./app/stores/devSettingsModal.tsx";
import { LocalAIProvider } from "./app/stores/localai.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { WailsNotificationBridge } from "./app/components/WailsNotificationBridge.tsx";
import { NetworkStatus } from "./app/components/NetworkStatus.tsx";
import "./styles/index.css";

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
            <SuggestionsProvider>
              <PackageSessionsProvider>
                <CommandPaletteProvider>
                  <PlatformProvider>
                  <DevSettingsModalProvider>
                    <App />
                    <Toaster position="bottom-right" />
                    <WailsNotificationBridge />
                    <NetworkStatus />
                  </DevSettingsModalProvider>
                  </PlatformProvider>
                </CommandPaletteProvider>
              </PackageSessionsProvider>
            </SuggestionsProvider>
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
