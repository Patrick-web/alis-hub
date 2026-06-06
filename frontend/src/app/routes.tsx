import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout";
import { AboutPage } from "./pages/AboutPage";
import { DevelopPage } from "./pages/DevelopPage";
import { EnvironmentsPage } from "./pages/EnvironmentsPage";
import { BuildsPage } from "./pages/BuildsPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { CodeblocksPage } from "./pages/CodeblocksPage";
import { CodeblockCreatePage } from "./pages/CodeblockCreatePage";
import { CodeblockDetailsPage } from "./pages/CodeblockDetailsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { SharePage } from "./pages/SharePage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: AboutPage },
      { path: "about", Component: AboutPage },
      { path: "develop", Component: DevelopPage },
      { path: "services", Component: ServicesPage },
      { path: "builds", Component: BuildsPage },
      { path: "deployments", Component: DeploymentsPage },
      { path: "environments", Component: EnvironmentsPage },
      { path: "tools", Component: ToolsPage },
      { path: "agents", Component: AgentsPage },
      { path: "share", Component: SharePage },
      { path: "codeblocks", Component: CodeblocksPage },
      { path: "codeblocks/create", Component: CodeblockCreatePage },
      { path: "codeblocks/:id", Component: CodeblockDetailsPage },
    ],
  },
]);
