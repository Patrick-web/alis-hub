
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { WorkspaceProvider } from "./app/stores/workspace.tsx";
import { NotificationProvider } from "./app/stores/notifications.tsx";
import { LabsProvider } from "./app/stores/labs.tsx";
import { SuggestionsProvider } from "./app/stores/suggestions.tsx";
import { PackageSessionsProvider } from "./app/stores/packageSessions.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { WailsNotificationBridge } from "./app/components/WailsNotificationBridge.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
    <ErrorBoundary>
      <NotificationProvider>
        <WorkspaceProvider>
          <LabsProvider>
            <SuggestionsProvider>
              <PackageSessionsProvider>
                <App />
                <Toaster position="bottom-right" />
                <WailsNotificationBridge />
              </PackageSessionsProvider>
            </SuggestionsProvider>
          </LabsProvider>
        </WorkspaceProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </ThemeProvider>
);
