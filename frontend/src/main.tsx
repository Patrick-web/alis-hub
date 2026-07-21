import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { WailsNotificationBridge } from "./app/components/WailsNotificationBridge.tsx";
import { NetworkStatus } from "./app/components/NetworkStatus.tsx";
import * as settingsClient from "./app/lib/settingsClient.ts";
import { rehydratePersistedStores } from "./app/stores/lib/persistSqlite.ts";
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
  rehydratePersistedStores();

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <ErrorBoundary>
        <ThemeSettingsSync />
        <App />
        <Toaster position="bottom-right" />
        <WailsNotificationBridge />
        <NetworkStatus />
      </ErrorBoundary>
    </ThemeProvider>,
  );
}

bootstrap();
