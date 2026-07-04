import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout";
import { RouteErrorPage } from "./components/ErrorBoundary";
import { AboutPage } from "./pages/AboutPage";
import { DevelopPage } from "./pages/DevelopPage";
import { EnvironmentsPage } from "./pages/EnvironmentsPage";
import { BuildsPage } from "./pages/BuildsPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { CodeblocksPage } from "./pages/CodeblocksPage";
import { CodeblockCreatePage } from "./pages/CodeblockCreatePage";
import { CodeblockDetailsPage } from "./pages/CodeblockDetailsPage";
import { CodeblockContributePage } from "./pages/CodeblockContributePage";
import { CodeblockUpdatePage } from "./pages/CodeblockUpdatePage";
import { AgentsPage } from "./pages/AgentsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { SharePage } from "./pages/SharePage";
import { BuildKitPage } from "./pages/BuildKitPage";
import { BuildKitCustomApisPage } from "./pages/BuildKitCustomApisPage";
import { BuildKitAgentPage } from "./pages/BuildKitAgentPage";
import { BuildKitAgentToolPage } from "./pages/BuildKitAgentToolPage";
import { BuildKitLaunchpadPage } from "./pages/BuildKitLaunchpadPage";
import { BuildKitReportingPage } from "./pages/BuildKitReportingPage";
import { BuildKitAILaunchpadPage } from "./pages/BuildKitAILaunchpadPage";
import { BuildKitGeminiEnterprisePage } from "./pages/BuildKitGeminiEnterprisePage";
import { BuildKitMcpFlowPage } from "./pages/BuildKitMcpFlowPage";
import { BuildKitSkillsPage } from "./pages/BuildKitSkillsPage";
import { BuildKitFilesConnectorPage } from "./pages/BuildKitFilesConnectorPage";
import { BuildKitIdentityPage } from "./pages/BuildKitIdentityPage";
import { BuildKitPluginsPage } from "./pages/BuildKitPluginsPage";
import { BuildKitPrivateGitPage } from "./pages/BuildKitPrivateGitPage";
import { BuildKitMcpServerPage } from "./pages/BuildKitMcpServerPage";
import { BuildKitGlassModePage } from "./pages/BuildKitGlassModePage";
import { GitPage } from "./pages/GitPage";
import { LearnPage } from "./pages/LearnPage";
import { NotificationsDebugPage } from "./pages/NotificationsDebugPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorPage,
    children: [
      { index: true, Component: AboutPage },
      { path: "about", Component: AboutPage },
      { path: "develop", Component: DevelopPage },
      { path: "builds", Component: BuildsPage },
      { path: "deployments", Component: DeploymentsPage },
      { path: "environments", Component: EnvironmentsPage },
      { path: "tools", Component: ToolsPage },
      { path: "agents", Component: AgentsPage },
      { path: "share", Component: SharePage },
      { path: "codeblocks", Component: CodeblocksPage },
      { path: "codeblocks/mine", element: <CodeblocksPage view="mine" /> },
      { path: "codeblocks/create", Component: CodeblockCreatePage },
      { path: "codeblocks/:id", Component: CodeblockDetailsPage },
      { path: "codeblocks/:id/edit", Component: CodeblockCreatePage },
      { path: "codeblocks/:id/contribute", Component: CodeblockContributePage },
      { path: "codeblocks/:id/update", Component: CodeblockUpdatePage },
      { path: "codeblocks/:id/:tab", Component: CodeblockDetailsPage },
      { path: "buildkit", Component: BuildKitPage },
      { path: "buildkit/custom-apis", Component: BuildKitCustomApisPage },
      { path: "buildkit/agent", Component: BuildKitAgentPage },
      { path: "buildkit/agent-tool", Component: BuildKitAgentToolPage },
      { path: "buildkit/launchpad", Component: BuildKitLaunchpadPage },
      { path: "buildkit/reporting", Component: BuildKitReportingPage },
      { path: "buildkit/ai-launchpad", Component: BuildKitAILaunchpadPage },
      { path: "buildkit/gemini-enterprise", Component: BuildKitGeminiEnterprisePage },
      { path: "buildkit/mcp", Component: BuildKitMcpFlowPage },
      { path: "buildkit/skills", Component: BuildKitSkillsPage },
      { path: "buildkit/files-connector", Component: BuildKitFilesConnectorPage },
      { path: "buildkit/identity", Component: BuildKitIdentityPage },
      { path: "buildkit/plugins", Component: BuildKitPluginsPage },
      { path: "buildkit/private-git", Component: BuildKitPrivateGitPage },
      { path: "buildkit/mcp-server", Component: BuildKitMcpServerPage },
      { path: "buildkit/glass-mode", Component: BuildKitGlassModePage },
      { path: "git", Component: GitPage },
      { path: "learn", Component: LearnPage },
      { path: "debug/notifications", Component: NotificationsDebugPage },
    ],
  },
]);
