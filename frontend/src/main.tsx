
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { WorkspaceProvider } from "./app/stores/workspace.tsx";
import { Toaster } from "./app/components/ui/sonner.tsx";
import { UpdateToast } from "./app/components/UpdateToast.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider>
    <App />
    <Toaster position="bottom-right" theme="dark" />
    <UpdateToast />
  </WorkspaceProvider>
);
  