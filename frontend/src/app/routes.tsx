import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout";
import { AboutPage } from "./pages/AboutPage";
import { DevelopPage } from "./pages/DevelopPage";
import { EnvironmentsPage } from "./pages/EnvironmentsPage";
import { BuildsPage } from "./pages/BuildsPage";
import { CodeblocksPage } from "./pages/CodeblocksPage";
import { CodeblockCreatePage } from "./pages/CodeblockCreatePage";
import { CodeblockDetailsPage } from "./pages/CodeblockDetailsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: AboutPage },
      { path: "about", Component: AboutPage },
      { path: "develop", Component: DevelopPage },
      { path: "builds", Component: BuildsPage },
      { path: "deployments", Component: AboutPage }, // Placeholder
      { path: "environments", Component: EnvironmentsPage },
      { path: "tools", Component: AboutPage }, // Placeholder
      { path: "agents", Component: AboutPage }, // Placeholder
      { path: "codeblocks", Component: CodeblocksPage },
      { path: "codeblocks/create", Component: CodeblockCreatePage },
      { path: "codeblocks/:id", Component: CodeblockDetailsPage },
    ],
  },
]);
