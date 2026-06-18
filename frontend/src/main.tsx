
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { WorkspaceProvider } from "./app/stores/workspace.tsx";
import { NotificationProvider } from "./app/stores/notifications.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { WailsNotificationBridge } from "./app/components/WailsNotificationBridge.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <NotificationProvider>
    <WorkspaceProvider>
      <App />
      <Toaster position="bottom-right" theme="dark" />
      <WailsNotificationBridge />
    </WorkspaceProvider>
  </NotificationProvider>
);
