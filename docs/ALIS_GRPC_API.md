# Alis Build gRPC API Surface

> Extracted from the Alis VSCode extension (`alis-build-2.0.392/dist/extension.js`).
> gRPC client library: `@grpc/grpc-js` (v1.14.3) + protobuf-generated clients from `@internal.*.alis.services/protobuf` npm packages.

## Service Inventory

| Service | Methods | Purpose |
|---------|---------|---------|
| ProductsService | 22 | Product CRUD, deploy, IAM |
| OrganisationsService | 18 | Org CRUD, deploy, workforce federation |
| NeuronsService | 4 | Neuron CRUD |
| NeuronVersionsService | 4 | Neuron version CRUD |
| UsersService | 38 | User/connector/identity management |
| AccountsService | 26 | Account/billing management |
| BlocksService | 25 | CodeBlock marketplace, CRUD, install |
| BlockVersionsService | 10 | CodeBlock versioning |
| InstancesService | 17 | CodeBlock instance lifecycle |
| BuildSpecsService | 24 | Build specification management |
| DeploymentsService | 6 | Deployment CRUD |
| EnvironmentsService | 13 | Environment CRUD |
| SolutionsService | 27 | Solution lifecycle |
| IdeasService | 19 | Idea management |
| IdeateService | 11 | Ideate generation |
| TimeEntriesService | 25 | Time tracking |
| DbdService | 4 | Define-Build-Deploy pipeline |
| BuildersService | 17 | Builder/user registration |
| AgentsService | 8 | Agent/Gemini/CodeBlock management |
| VscodeService | 17 | VSCode extension RPCs |
| AuthService | 3 | Authentication (Git, Docker, Dart) |
| GlassService | 1 | Define explanation (Glass Mode) |
| PackagesService | 4 | Protobuf package publishing |
| DefinitionsService | 6 | Definition artifact management |
| EntitiesService | 26 | Entity/prompt management |
| WorkstationsService | 7 | Cloud workstation provisioning |

---

## ProductsService

### `alis.os.resources.products.v1.ProductsService`

| Method | Request | Response | Notes |
|--------|---------|----------|-------|
| GetProduct | `GetProductRequest` | `Product` | |
| ListProducts | `ListProductsRequest` | `ListProductsResponse` | parent, pageSize, pageToken, showDeleted |
| CreateProduct | `CreateProductRequest` | `google.longrunning.Operation` | CreateProductMetadata |
| UpdateProduct | `UpdateProductRequest` | `google.longrunning.Operation` | UpdateProductMetadata |
| DeleteProduct | `DeleteProductRequest` | `google.longrunning.Operation` | DeleteProductMetadata |
| DeployProduct | `DeployProductRequest` | `google.longrunning.Operation` | |
| SetupProduct | `SetupProductRequest` | `google.longrunning.Operation` | |
| GetOperation | `GetOperationRequest` | `google.longrunning.Operation` | |
| AddIamBindings | `AddIamBindingsRequest` | `Product` | |
| RemoveIamBindings | `RemoveIamBindingsRequest` | `Product` | |
| SetIamPolicy | `SetIamPolicyRequest` | `Policy` | |
| GetIamPolicy | `GetIamPolicyRequest` | `Policy` | |
| TestIamPermissions | `TestIamPermissionsRequest` | `TestIamPermissionsResponse` | |
| BatchTestIamPermissions | `BatchTestIamPermissionsRequest` | `BatchTestIamPermissionsResponse` | |
| BatchGetProducts | `BatchGetProductsRequest` | `BatchGetProductsResponse` | |
| ListProducts | `ListProductsRequest` | `ListProductsResponse` | |
| GenerateServiceAccountKey | `GenerateServiceAccountKeyRequest` | response | |
| AddAccessibleProduct | `AddAccessibleProductRequest` | response | |
| RemoveAccessibleProduct | `RemoveAccessibleProductRequest` | response | |
| ViewProductsWithAccess | `ViewProductsWithAccessRequest` | response | |

---

## OrganisationsService

### `alis.os.resources.products.v1.OrganisationsService`

| Method | Request | Notes |
|--------|---------|-------|
| GetOrganisation | `GetOrganisationRequest` | |
| ListOrganisations | `ListOrganisationsRequest` | parent, pageSize, pageToken, showDeleted |
| CreateOrganisation | `CreateOrganisationRequest` | LRO (CreateOrganisationMetadata) |
| UpdateOrganisation | `UpdateOrganisationRequest` | |
| DeleteOrganisation | `DeleteOrganisationRequest` | LRO (DeleteOrganisationMetadata) |
| DeployOrganisation | `DeployOrganisationRequest` | LRO |
| GetOperation | `GetOperationRequest` | |
| SetOrganisationWorkforceFederation | `SetOrganisationWorkforceFederationRequest` | |
| ValidateLzBillingAccount | `ValidateLzBillingAccountRequest` | |
| ValidateLzFolder | `ValidateLzFolderRequest` | |
| AddIamBindings | `AddIamBindingsRequest` | |
| RemoveIamBindings | `RemoveIamBindingsRequest` | |
| SetIamPolicy | `SetIamPolicyRequest` | |
| GetIamPolicy | `GetIamPolicyRequest` | |
| TestIamPermissions | `TestIamPermissionsRequest` | |
| BatchTestIamPermissions | `BatchTestIamPermissionsRequest` | |
| BatchGetOrganisations | `BatchGetOrganisationsRequest` | |

---

## NeuronsService

### `alis.os.resources.products.v1.NeuronsService`

| Method | Request | Notes |
|--------|---------|-------|
| GetNeuron | `GetNeuronRequest` | |
| ListNeurons | `ListNeuronsRequest` | parent, pageSize, pageToken, showDeleted |
| CreateNeuron | `CreateNeuronRequest` | parent, neuronId + Neuron body |
| DeleteNeuron | `DeleteNeuronRequest` | LRO with DeleteNeuronProgress |

---

## NeuronVersionsService

### `alis.os.resources.products.v1.NeuronVersionsService`

| Method | Request | Notes |
|--------|---------|-------|
| GetNeuronVersion | `GetNeuronVersionRequest` | |
| ListNeuronVersions | `ListNeuronVersionsRequest` | parent, pageSize, pageToken, showDeleted |
| CreateNeuronVersion | `CreateNeuronVersionRequest` | LRO (CreateNeuronVersionMetadata) |
| DeleteNeuronVersion | `DeleteNeuronVersionRequest` | LRO (DeleteNeuronVersionMetadata) |

---

## UsersService

### `alis.open.iam.v1.UsersService`

| Method | Notes |
|--------|-------|
| GetUser | |
| ListUsers | parent, pageSize, pageToken, showDeleted |
| CreateUser | |
| UpdateUser | |
| DeleteUser | |
| EditMyInfo | |
| EditMyMetadata | |
| EditUserInfo | |
| EditUserMetadata | |
| RetrieveMyUser | |
| RetrieveUserByEmail | |
| RetrieveMaskedUser | |
| RetrieveMaskedUsers | |
| BatchRetrieveMaskedUsers | |
| BatchGetUsers | |
| BatchDeleteUsers | |
| LookupUser | |
| RemoveMyUser | |
| SetUserPicture | |
| EditMyGithubId | |
| StreamUsers | |
| CheckBuilderReadiness | |
| SyncToGoogleGroup | |
| FetchAccessToken | |
| FetchApiKey | |
| Connector CRUD | AuthorizeConnector, CreateConnector, GetConnector, ListConnectors, UpdateConnector, DeleteConnector, UndeleteConnector, RevokeConnector, BatchCreateConnectors, BatchGetConnectors, BatchUpdateConnectors, BatchDeleteConnectors, BatchUndeleteConnectors, StreamConnectors, ListMyAvailableConnectors |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, BatchTestIamPermissions, TestIamPermissions |

---

## BlocksService (CodeBlocks)

### `alis.bl.blocks.v1.BlocksService`

| Method | Notes |
|--------|-------|
| GetBlock | |
| ListBlocks | |
| CreateBlock | |
| UpdateBlock | |
| DeleteBlock | |
| BatchGetBlocks | |
| AddBlock | Marketplace operation |
| BootstrapBlock | Create block from existing code |
| GetOperation | LRO tracking |
| InstallBlock | |
| UninstallBlock | |
| UpgradeBlock | |
| RetrieveBlockDetails | |
| GenerateBlockOverview | |
| GenerateAgentContent | |
| GenerateUserContent | |
| GenerateFileUploadUri | |
| UploadBlockDocumentationConfigAttachment | |
| DeleteBlockDocumentationConfigAttachment | |
| RetrieveRules | |
| ValidateMessage | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## BlockVersionsService

### `alis.bl.blocks.v1.BlockVersionsService`

| Method | Notes |
|--------|-------|
| GetBlockVersion | |
| GetLatestStableBlockVersion | |
| ListBlockVersions | |
| CreateBlockVersion | |
| UpdateBlockVersion | |
| DeleteBlockVersion | |
| RetrieveRules | |
| ValidateMessage | |
| GenerateDocumentationAgentContent | |
| GenerateDocumentationUserContent | |

---

## InstancesService

### `alis.bl.blocks.v1.InstancesService`

| Method | Notes |
|--------|-------|
| GetInstance | |
| ListInstances | |
| CreateInstance | |
| UpdateInstance | |
| DeleteInstance | |
| SuspendInstance | |
| PurgeInstances | |
| BatchGetInstances | |
| CommitFiles | Git worktree file commit |
| MergeBlockBranch | Merge CodeBlock feature branch |
| RetrieveInstancesByPackages | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## BuildSpecsService

### `alis.os.buildspecs.v1.BuildSpecsService`

| Method | Notes |
|--------|-------|
| GetBuildSpec | |
| ListBuildSpecs | |
| CreateBuildSpec | |
| UpdateBuildSpec | |
| DeleteBuildSpec | |
| UndeleteBuildSpec | |
| BatchCreateBuildSpecs | |
| BatchGetBuildSpecs | |
| BatchUpdateBuildSpecs | |
| BatchDeleteBuildSpecs | |
| BatchUndeleteBuildSpecs | |
| StreamBuildSpecs | Server-streaming |
| InitialiseBuildSpec | |
| CreateBuildSpecRevision | |
| GetBuildSpecRevision | |
| ListBuildSpecRevisions | |
| UpdateBuildSpecRevision | |
| DeleteBuildSpecRevision | |
| RollbackBuildSpec | |
| RequestAssistance | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## SolutionsService

### `alis.os.solutions.v2.SolutionsService`

| Method | Notes |
|--------|-------|
| GetSolution | |
| ListSolutions | |
| CreateSolution | |
| UpdateSolution | |
| DeleteSolution | |
| UndeleteSolution | |
| DuplicateSolution | |
| CreateSolutionRevision | |
| StreamSolutions | Server-streaming |
| BatchCreateSolutions | |
| BatchGetSolutions | |
| BatchUpdateSolutions | |
| BatchDeleteSolutions | |
| BatchUndeleteSolutions | |
| GenerateSolutionFromRfp | LRO |
| GenerateSolutionFromSpec | LRO |
| GenerateSolutionSummary | |
| SuggestTextEnhancement | |
| RetrievePendingSpecs | |
| GetOperation | LRO tracking |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## TimeEntriesService

### `alis.os.timesheet.v1.TimeEntriesService`

| Method | Notes |
|--------|-------|
| GetTimeEntry | |
| ListTimeEntries | |
| StreamTimeEntries | Server-streaming |
| CreateTimeEntry | |
| UpdateTimeEntry | |
| DeleteTimeEntry | |
| UndeleteTimeEntry | |
| BatchCreateTimeEntries | |
| BatchGetTimeEntries | |
| BatchUpdateTimeEntries | |
| BatchDeleteTimeEntries | |
| BatchUndeleteTimeEntries | |
| StartTimeLogging | |
| StopTimeLogging | |
| PauseTimeLogging | |
| SubmitTimeEntry | |
| SubmitManualTimeEntry | |
| DiscardTimeEntry | |
| RetrieveUserLatestTimeEntry | |
| GenerateTimeLogSummary | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## DbdService (Define-Build-Deploy)

### `alis.os.services.dbd.v1.DbdService`

| Method | Request | Response | Notes |
|--------|---------|----------|-------|
| RunDefine | `RunDefineRequest` | `google.longrunning.Operation` (RunDefineMetadata → RunDefineResponse) | Compile .proto files |
| RunBuild | `RunBuildRequest` | `google.longrunning.Operation` (RunBuildMetadata → RunBuildResponse) | Docker build |
| RunDeploy | `RunDeployRequest` | `google.longrunning.Operation` (RunDeployMetadata → RunDeployResponse) | Terraform apply |
| TestIamPermissions | `TestIamPermissionsRequest` | `TestIamPermissionsResponse` | |

---

## VscodeService (Extension Host)

### `alis.os.vscode.v2.VscodeService`

| Method | Notes |
|--------|-------|
| GenerateBuildScripts | |
| GenerateBuildSpec | |
| GenerateClaudeConfigs | |
| GenerateCodexConfigs | |
| GenerateCommonProtos | |
| GenerateConfigurations | |
| GenerateContext | |
| GenerateGeminiConfigs | |
| GenerateLanguagePackageConfigs | |
| GeneratePackageScripts | |
| GeneratePlayground | |
| GenerateProductWorkspaceListOverview | |
| GenerateSshKeys | |
| GetWorkstationProvisionOperation | |
| MergeSshConfig | |
| RetrieveBuildKit | |
| RetrievePackageCodeblockInstances | |
| RetrieveProductNpmHosts | |

---

## AccountsService

### `alis.os.accounts.v1.AccountsService`

| Method | Notes |
|--------|-------|
| GetAccount | |
| ListAccounts | |
| CreateAccount | |
| UpdateAccount | |
| DeleteAccount | |
| ArchiveAccount | |
| RetrieveMaskedAccounts | |
| RetrieveMaskedUsers | |
| RetrieveDomainMaskedAccounts | |
| RetrieveBuildPartnerAccounts | |
| EnrollAccountAsBuildPartner | |
| SwitchGcpBillingAccount | |
| AllocateBillingAccount | |
| EditAccountBillingInfo | |
| ChangeAccountPlan | |
| PrepareSandboxProduct | |
| ResetAccountSandbox | |
| ConfigureIdeateUsageBilling | |
| PaystackIsAuthorized | |
| AuthorizePaystack | |
| SetStripeDefaultPaymentMethod | |
| RetrieveStripeClientSecretAndCustomerSessionSecret | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## EnvironmentsService

### `alis.os.environments.v1.EnvironmentsService`

| Method | Notes |
|--------|-------|
| GetEnvironment | |
| ListEnvironments | |
| CreateEnvironment | |
| UpdateEnvironment | |
| DeleteEnvironment | |
| DeployEnvironment | LRO |
| GetOperation | LRO tracking |
| GenerateServiceAccountKey | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## DeploymentsService

### `alis.os.deployments.v1.DeploymentsService`

| Method | Notes |
|--------|-------|
| GetDeployment | |
| ListDeployments | |
| UpdateDeployment | |
| DeleteDeployment | |
| BatchGetDeployments | |
| RetrieveDeploymentEnvs | |

---

## BuildersService

### `alis.os.resources.builders.v1.BuildersService`

| Method | Notes |
|--------|-------|
| GetBuilder | |
| ListBuilders | |
| CreateBuilder | |
| UpdateBuilder | |
| DeleteBuilder | |
| BatchGetBuilders | |
| RetrieveMaskedBuilder | |
| BatchRetrieveMaskedBuilders | |
| LookupBuilder | |
| SignupBuilder | |
| SendBuilderWelcomeEmail | |
| GetBuilderConfig | |
| UpdateBuilderConfig | |
| Notification CRUD | CreateNotification, GetNotification, ListNotifications, DeleteNotification, UpdateNotification |
| SetNotificationsLastOpened | |

---

## AgentsService

### `alis.bl.agents.v1.AgentsService`

| Method | Notes |
|--------|-------|
| InitialiseAgent | |
| InitialiseGeminiEnterprise | |
| GenerateBlockContent | |
| InstallBlock | |
| UninstallBlock | |
| UpgradeBlock | |
| PublishGeminiEnterpriseA2aAgent | |
| GetOperation | LRO tracking |

---

## IdeasService

### `alis.os.ideas.v1.IdeasService`

| Method | Notes |
|--------|-------|
| GetIdea | |
| ListIdeas | |
| CreateIdea | |
| UpdateIdea | |
| DeleteIdea | |
| ArchiveIdea | |
| UnarchiveIdea | |
| DuplicateIdea | |
| MergeIdeas | |
| BatchGetIdeas | |
| SearchIdeas | |
| RetrieveSimilarIdeas | |
| RetrievePrincipalIdeas | |
| DescribeIdeaComparison | |
| GenerateIdeaTitle | |
| IAM | AddIamBindings, RemoveIamBindings, SetIamPolicy, GetIamPolicy, TestIamPermissions, BatchTestIamPermissions |

---

## AuthService

### `alis.open.iam.v1.AuthService`

| Method | Notes |
|--------|-------|
| AuthGit | Returns git credentials |
| AuthArtifactRegistry | Returns Artifact Registry credentials |
| AuthDart | Returns Dart/pub credentials |

---

## WorkstationsService / WorkstationController

### `alis.os.workstations.v1.WorkstationsService`

| Method | Notes |
|--------|-------|
| GetWorkstation | |
| ListWorkstations | |
| CreateWorkstation | LRO |
| DeleteWorkstation | LRO |
| RetrieveMyWorkstation | |
| UpgradeAllWorkstations | |
| GetOperation | LRO tracking |

---

## EntitiesService

### `alis.os.entities.v1.EntitiesService`

| Method | Notes |
|--------|-------|
| CreateEntity | |
| GetEntity | |
| ListEntities | |
| UpdateEntity | |
| DeleteEntity | |
| UndeleteEntity | |
| BatchCreateEntities | |
| BatchGetEntities | |
| BatchUpdateEntities | |
| BatchDeleteEntities | |
| BatchUndeleteEntities | |
| StreamEntities | |
| CreatePrompt | |
| GetPrompt | |
| ListPrompts | |
| UpdatePrompt | |
| DeletePrompt | |
| UndeletePrompt | |
| BatchCreatePrompts | |
| BatchGetPrompts | |
| BatchUpdatePrompts | |
| BatchDeletePrompts | |
| BatchUndeletePrompts | |
| StreamPrompts | |
| ParsePrompt | |
| IAM standard | |

---

## PackagesService

### `alis.os.protos.v1.PackagesService`

| Method | Notes |
|--------|-------|
| GetPackage | |
| RetrieveDefinitionOverview | |
| RetrievePackageDetails | |
| SetPublishConfig | |
| SyncCommonProtos | |

---

## DefinitionsService

### `alis.os.protos.v1.DefinitionsService`

| Method | Notes |
|--------|-------|
| GetDefinition | |
| UpdateDefinition | |
| DeleteDefinition | |
| GetDefinitionArtifact | |
| BatchGetDefinitionArtifacts | |
| BatchUpdateDefinitionArtifacts | |

---

## GlassService

### `alis.os.glass.v1.GlassService`

| Method | Notes |
|--------|-------|
| ExplainDefine | Generate an explanation of the Define step's output (Glass Mode) |
