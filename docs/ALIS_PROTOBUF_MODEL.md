# Alis Build Protobuf Data Model

> Extracted from the Alis VSCode extension (`alisexchange.alis-build-2.0.392/dist/extension.js`).
> Protobuf JS runtime: google-protobuf (jspb).

## Contents

1. [Workspace Model](#1-workspace-model)
2. [Neuron Model](#2-neuron-model)
3. [Product Model](#3-product-model)
4. [Organisation Model](#4-organisation-model)
5. [Deployment Model](#5-deployment-model)
6. [Build Kit Model](#6-build-kit-model)
7. [CodeBlock Model](#7-codeblock-model)
8. [VSCode Extension Model](#8-vscode-extension-model)
9. [DBD Service Model](#9-dbd-service-model)
10. [Timesheet Model](#10-timesheet-model)
11. [Solutions Model](#11-solutions-model)
12. [Enums](#12-enums)

---

## 1. Workspace Model

### `alis.os.vscode.v2.WorkspaceContext`

The central context object that drives the VSCode extension UI. Represents the developer's current workspace state.

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `user` | string | Current user ID/email |
| 2 | `product` | string | Product resource name (`organizations/{org}/products/{product}`) |
| 3 | `solution` | string | Solution resource name |
| 4 | `activeNeuronsList` | repeated string | List of active neuron resource names |
| 5 | `rootDirectory` | string | Workspace root path |
| 6 | `organisation` | string | Organization resource name |
| 7 | `environment` | string | Environment resource name |
| 8 | `buildSpec` | string | Active Build Specification name |
| 9 | `platform` | string | Platform (e.g. `darwin`) |
| 10 | `buildSpecEtag` | string | Build Spec version/etag |
| 11 | `editor` | string | Editor (e.g. `vscode`) |
| 12 | `engineered` | bool | Context engineering enabled |
| 13 | `workstation` | string | Connected workstation |
| 14 | `hostname` | string | Hostname |
| 15 | `title` | string | Workspace title |
| 16 | `geminiModel` | string | Active Gemini model |
| 17 | `agentNeuron` | string | Active agent neuron |
| 18 | `environmentGoogleProjectNumber` | string | GCP project number |
| 19 | `environmentGoogleRegion` | string | GCP region |
| 20 | `organisationDisplayName` | string | Org display name |
| 21 | `productDisplayName` | string | Product display name |
| 22 | `environmentDisplayName` | string | Environment display name |
| 23 | `environmentGoogleProjectId` | string | GCP project ID |

---

## 2. Neuron Model

### `alis.os.resources.products.v1.Neuron`

A microservice within a product.

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `name` | string | Resource name (`organizations/{org}/products/{product}/neurons/{neuron}`) |
| 2 | `type` | enum (Neuron.Type) | Neuron type |
| 5 | `state` | enum (Neuron.State) | Current state |
| 6 | `envsList` | repeated Neuron.Env | Environment variables |
| 8 | `updateTime` | google.protobuf.Timestamp | Last update time |
| 9 | `expireTime` | google.protobuf.Timestamp (oneof) | Expiration time |
| 10 | `ttl` | google.protobuf.Duration (oneof) | Time-to-live |

**Neuron.Type:**
- `TYPE_UNSPECIFIED: 0`
- `RESOURCE: 1`
- `SERVICE: 2`

**Neuron.State:**
- `STATE_UNSPECIFIED: 0`
- `ACTIVE: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `DEV: 4`
- `CREATING: 5`
- `UPDATING: 6`
- `FAILED: 7`
- `LOCKED: 8`
- `DELETING: 9`

### `Neuron.Env`

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| 2 | `value` | string |
| 3 | `description` | string |
| 4 | `optional` | bool |

### `alis.os.resources.products.v1.NeuronVersion`

A specific version/revision of a neuron.

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| 2 | `version` | string |
| 3 | `state` | enum (NeuronVersion.State) |
| 4 | `updateTime` | google.protobuf.Timestamp |
| 5 | `repositoryTag` | string |
| 6 | `commitSha` | string |
| 7 | `protoCommitSha` | string |
| 8 | `dockerfilePathsList` | repeated string |
| 9 | `fileDescriptorSet` | google.protobuf.FileDescriptorSet |
| 10 | `expireTime` | google.protobuf.Timestamp (oneof) |
| 11 | `ttl` | google.protobuf.Duration (oneof) |
| 12 | `createTime` | google.protobuf.Timestamp |
| 13 | `fastBuildName` | string |
| 14 | `retagPathsList` | repeated string |
| 15 | `locallyBuiltPathsList` | repeated string |

**NeuronVersion.State:**
- `STATE_UNSPECIFIED: 0`
- `ACTIVE: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `DEV: 4`
- `UPDATING: 5`
- `FAILED: 6`
- `PROVISIONING: 7`

### `alis.os.resources.products.v1.NeuronDeployment`

A deployment of a neuron to a specific environment.

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| 2 | `version` | string |
| 3 | `state` | enum (NeuronDeployment.State) |
| 6 | `envsList` | repeated Neuron.Env |
| 7 | `updateTime` | google.protobuf.Timestamp |
| 8 | `infrastructureUri` | string |
| 9 | `expireTime` | google.protobuf.Timestamp (oneof) |
| 10 | `ttl` | google.protobuf.Duration (oneof) |
| 11 | `terraformTfvars` | bytes |

**NeuronDeployment.State:**
- `STATE_UNSPECIFIED: 0`
- `RUNNING: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `DEV: 4`
- `CREATING: 5`
- `UPDATING: 6`
- `FAILED: 7`
- `DESTROYED: 8`

---

## 3. Product Model

### `alis.os.resources.products.v1.Product`

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| - | `displayName` | string |
| - | `googleProjectId` | string |
| - | `state` | enum (Product.State) |
| - | `owner` | string |
| - | `description` | string |
| - | `version` | string |
| - | `overview` | string |
| - | `documentationUri` | string |
| - | `availability` | enum (Product.Availability) |
| - | `dependenciesList` | repeated Product.Dependency |
| - | `baseUri` | string |
| - | `billingAccount` | string |
| - | `managedTerraform` | bool |
| - | `googleDocDescriptionUri` | string |
| - | `fastBuilds` | bool |
| - | `runHash` | string |
| - | `managedSpannerDbInstance` | string |
| - | `googleProjectNumber` | string |
| 17 | `expireTime` | google.protobuf.Timestamp (oneof) |
| 18 | `ttl` | google.protobuf.Duration (oneof) |

**Product.State:**
- `STATE_UNSPECIFIED: 0`
- `ACTIVE: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `DEV: 4`
- `CREATING: 5`
- `UPDATING: 6`
- `FAILED: 7`

**Product.Availability:**
- `AVAILABILITY_UNSPECIFIED: 0`
- `PRIVATE: 1`
- `GA: 2`
- `BETA: 3`
- `ALPHA: 4`
- `GA_ORG: 5`

### `Product.Dependency`

| # | Field | Type |
|---|-------|------|
| - | `product` | string |
| - | `required` | bool |

### `Product.BuildConfig`

| # | Field | Type |
|---|-------|------|
| - | `repository` | string |

---

## 4. Organisation Model

### `alis.os.resources.products.v1.Organisation`

| # | Field | Type |
|---|-------|------|
| - | `migrated` | bool |
| 1 | `name` | string |
| - | `displayName` | string |
| - | `logoUri` | string |
| - | `state` | enum (Organisation.State) |
| - | `owner` | string |
| - | `envList` | repeated Organisation.EnvEntry |
| - | `domain` | string |
| - | `googleProjectId` | string |
| - | `identityUri` | string |
| - | `billingAccount` | string |
| - | `folder` | string |
| - | `googleCustomerId` | string |
| - | `version` | string |
| - | `description` | string |
| - | `aiEnabled` | bool |
| - | `gitProvider` | enum (Organisation.GitProvider) |
| - | `lbEnabled` | bool |
| - | `runHash` | string |
| - | `googleProjectNumber` | string |
| - | `managedSpannerDbInstance` | string |
| - | `region` | string |
| 14 | `expireTime` | google.protobuf.Timestamp (oneof) |
| 15 | `ttl` | google.protobuf.Duration (oneof) |

**Organisation.State:**
- `STATE_UNSPECIFIED: 0`
- `ACTIVE: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `DEV: 4`
- `CREATING: 5`
- `UPDATING: 6`
- `FAILED: 7`
- `DETACHED: 8`

**Organisation.GitProvider:**
- `GIT_PROVIDER_UNSPECIFIED: 0`
- `ALIS_MANAGED: 1`

---

## 5. Deployment Model

### `alis.os.resources.products.v1.ProductDeployment`

A deployment target environment for a product.

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| - | `googleProjectId` | string |
| - | `environment` | enum (EnvironmentType) |
| - | `state` | enum (ProductDeployment.State) |
| - | `owner` | string |
| - | `version` | string |
| - | `displayName` | string |
| - | `envsList` | repeated Neuron.Env |
| - | `infrastructureUri` | string |
| - | `billingAccount` | string |
| - | `gatewayEnabled` | bool |
| - | `workflowsEnabled` | bool |
| - | `gatewaysList` | repeated Gateway |
| - | `serviceAccount` | string |
| - | `consoleUri` | string |
| - | `runHash` | string |
| - | `region` | string |
| - | `managedSpannerDbInstance` | string |
| - | `flowsEnabled` | bool |
| - | `operationsEnabled` | bool |
| - | `googleProjectNumber` | string |
| 18 | `expireTime` | google.protobuf.Timestamp (oneof) |
| 19 | `ttl` | google.protobuf.Duration (oneof) |

**EnvironmentType:**
- `ENVIRONMENT_TYPE_UNSPECIFIED: 0`
- `DEV: 1`
- `STAGING: 2`
- `PROD: 3`

**ProductDeployment.State:**
- `STATE_UNSPECIFIED: 0`
- `RUNNING: 1`
- `ARCHIVED: 2`
- `DELETED: 3`
- `CREATING: 4`
- `FAILED: 5`
- `UPDATING: 6`
- `LOCKED: 7`

### `ProductDeployment.Gateway`

| # | Field | Type |
|---|-------|------|
| - | `displayName` | string |
| - | `host` | string |
| - | `type` | enum (Gateway.Type) |

**Gateway.Type:**
- `TYPE_UNSPECIFIED: 0`
- `CONSUMER: 1`
- `INTERNAL: 2`

---

## 6. Build Kit Model

### `alis.os.vscode.v2.BuildKit`

The Build Kit data structure displayed in the VSCode Build Kit webview.

| Field | Type |
|-------|------|
| `displayName` | string |
| `summary` | string |
| `buildSpec` | string |
| `status` | enum (NEW, ACTIVE, COMPLETED) |
| `builder` | string |
| `createTime` | google.protobuf.Timestamp |
| `updateTime` | google.protobuf.Timestamp |
| `extensions` | BuildKit.Extensions |
| `productsList` | repeated BuildKit.Product |

### `BuildKit.Product`

| Field | Type |
|-------|------|
| `name` | string (resource name) |
| `displayName` | string |
| `landingZoneUrl` | string |

### `BuildKit.Extensions`

| Field | Type |
|-------|------|
| `ideate` | Ideate |
| `timesheet` | Timesheet |

### `BuildKit.Extensions.Ideate`

| Field | Type |
|-------|------|
| `ideasList` | repeated Idea |

### `BuildKit.Extensions.Ideate.Idea`

| Field | Type |
|-------|------|
| `name` | string |
| `title` | string |
| `overview` | string |
| `url` | string |
| `updateTime` | google.protobuf.Timestamp |
| `contributorsList` | repeated Contributor |

### `BuildKit.Extensions.Ideate.Idea.Contributor`

| Field | Type |
|-------|------|
| `name` | string |
| `email` | string |

### `BuildKit.Extensions.Timesheet`

| Field | Type |
|-------|------|
| `logEntriesList` | repeated LogEntry |
| `totalDuration` | google.protobuf.Duration |
| `flowPercentage` | float |
| `builderCount` | int32 |
| `updateTime` | google.protobuf.Timestamp |

### `BuildKit.Extensions.Timesheet.LogEntry`

| Field | Type |
|-------|------|
| `date` | google.type.Date |
| `duration` | google.protobuf.Duration |
| `description` | string |
| `flowType` | string |
| `buildSpec` | string |

### `alis.os.vscode.v2.Instance`

An installed CodeBlock instance within a neuron.

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| 2 | `pb_package` | string |
| 3 | `block` | string (reference to Block) |
| 4 | `blockVersion` | string |
| 5 | `buildFolder` | string |
| 6 | `gitBranch` | string |
| 7 | `state` | enum (Instance.State) |

**Instance.State:**
- `STATE_UNSPECIFIED: 0`
- `PENDING_INSTALLATION: 1`
- `INSTALLING: 2`
- `ACTIVE: 3`
- `UNINSTALLED: 4`
- `SUSPENDED: 5`

---

## 7. CodeBlock Model

### `alis.os.vscode.v2.Block`

A CodeBlock reference displayed in the Build Kit UI. (Note: this is the VSCode-layer Block, not the full `bl.blocks.v1.Block`.)

| # | Field | Type |
|---|-------|------|
| 1 | `name` | string |
| 2 | `displayName` | string |
| 3 | `tagline` | string |
| - | `agent` | Block.Agent |
| - | `releases` | Block.Releases |

### `Block.Releases`

| Field | Type |
|-------|------|
| `ga` | string |
| `beta` | string |
| `rc` | string |
| `alpha` | string |
| `experimental` | string |

### `Block.Agent`

| Field | Type |
|-------|------|
| `serviceEndpoint` | string |
| `agenticInstallEnabled` | bool |

### `proto.alis.bl.blocks.v1.Instance` (Full CodeBlock Instance)

**State:**
- `STATE_UNSPECIFIED: 0`
- `PENDING_INSTALLATION: 1`
- `INSTALLING: 2`
- `ACTIVE: 3`
- `UNINSTALLED: 4`
- `SUSPENDED: 5`

**SuspensionReason:**
- `SUSPENSION_REASON_UNSPECIFIED: 0`
- `ENTITLEMENT_DELETED: 1`

### `RetrievePackageCodeblockInstancesResponse.CodeblockInstance`

| Field | Type |
|-------|------|
| `pb_package` | string |
| `instance` | string |
| `block` | string |
| `blockVersion` | string |
| `buildFolder` | string |
| `state` | string |
| `gitBranch` | string |

---

## 8. VSCode Extension Model

### `alis.os.vscode.v2.Language`

| Value | Name |
|-------|------|
| 0 | LANGUAGE_UNSPECIFIED |
| 1 | GO |
| 2 | JAVASCRIPT |
| 3 | PYTHON |
| 4 | DART |
| 5 | TYPESCRIPT |

### `alis.os.vscode.v2.Platform`

| Value | Name |
|-------|------|
| 0 | PLATFORM_UNSPECIFIED |
| 1 | LINUX |
| 2 | MACOS |
| 3 | WINDOWS |

### Generate Requests/Responses

#### `GenerateBuildScriptsRequest`

| Field | Type |
|-------|------|
| `definition` | string |
| `locationsList` | repeated Location |

**Location:** `workingDirectory`, `language`

**Response.Script:** `title`, `workingDirectory`, `language`, `script`

#### `GeneratePackageScriptsRequest`

| Field | Type |
|-------|------|
| `definition` | string |
| `locationsList` | repeated Location |
| `excludeGcloudAuth` | bool |
| `targetPlatform` | string |

**Response:** `goLangList`, `nodeList`, `pythonList`, `dartList` (each a list of Scripts)

#### `GenerateContextRequest`

| Field | Type |
|-------|------|
| `product` | string |

**Response:** `context` (string), `filesList` (repeated File)

#### `GenerateBuildSpecRequest`

| Field | Type |
|-------|------|
| `workspaceContext` | WorkspaceContext |

**Response:** `filesList` (repeated File), `buildSpecEtag` (string)

#### `GenerateConfigurationsRequest`

| Field | Type |
|-------|------|
| `product` | string |

**Response:** `editorconfigsList`, `gitignoresList`, `bufList`, `nixList` (each: File with `name`, `replaceExisting`)

#### AI Config Generators

- `GenerateClaudeConfigsRequest`: `neuron` → Response: `filesList`, `location`, `googleProject`, `directory`
- `GenerateCodexConfigsRequest`: `neuron` → Response: `filesList`, `directory`
- `GenerateGeminiConfigsRequest`: `model`, `neuron` → Response: `filesList`, `location`, `googleProject`, `directory`
- `GenerateCommonProtosRequest` → Response: `filesList`

#### `GeneratePlaygroundRequest`

| Field | Type |
|-------|------|
| `neuron` | string |

**Response:** `filesList` (repeated File with `name`, `replaceExisting`)

#### `GenerateSshKeysRequest`

| Field | Type |
|-------|------|
| `name` | string |

**Response:** `privateKey`, `publicKey`

#### `MergeSshConfigRequest`

| Field | Type |
|-------|------|
| `name` | string |
| `ip` | string |
| `user` | string |
| `identityFilePath` | string |

#### `GenerateProductWorkspaceListOverviewRequest`

| Field | Type |
|-------|------|
| `productWorkspacesList` | repeated ProductWorkspace |

**ProductWorkspace:** `product`, `displayName`, `state`, `packagesDomain`

### `RetrieveBuildKitRequest`

| Field | Type |
|-------|------|
| `workspaceContext` | WorkspaceContext |

**Response:** `buildKit` (BuildKit)

### `RetrievePackageCodeblockInstancesRequest`

| Field | Type |
|-------|------|
| `pb_package` | string |

**Response:** `codeblockInstancesList` (repeated CodeblockInstance)

### `RetrieveProductNpmHostsRequest`

| Field | Type |
|-------|------|
| `product` | string |

**Response:** `npmHostsList`, `npmScopesList`

---

## 9. DBD Service Model

### `alis.os.services.dbd.v1`

The Define-Build-Deploy service protos.

#### `RunDefineRequest`

| Field | Type |
|-------|------|
| `neuron` | string |
| `protoFiles` | repeated ProtoFile |
| `commit` | bool |

**ProtoFile:** `path`, `content`

#### `RunDefineResponse`

**ResponseCase:** `INITIAL_DEFINE`, `STANDARD_DEFINE`

- **InitialDefineResponse:** `initialResponse`, `explanationRequired`
- **StandardDefineResponse:** `message`, `explanation`

#### `RunBuildRequest`

| Field | Type |
|-------|------|
| `neuron` | string |
| `neuronVersion` | string |
| `imageTagsList` | repeated string |

#### `RunBuildResponse`

| Field | Type |
|-------|------|
| `imageUri` | string |
| `logsUrl` | string |

#### `RunDeployRequest`

**DeploymentCase:** `NEURON_DEPLOYMENT`, `PRODUCT_DEPLOYMENT`

| Field | Type |
|-------|------|
| `neuron` | string |
| `imageUri` | string |
| `deployment` | oneof (neuronDeployment / productDeployment) |

#### `RunDeployResponse`

| Field | Type |
|-------|------|
| `logsUrl` | string |

#### `DefineBuildDeployProgress`

| Field | Type |
|-------|------|
| `state` | enum |
| `message` | string |
| `operationName` | string |

**State:**
- `STATE_UNSPECIFIED: 0`
- `PENDING: 1`
- `RUNNING: 2`
- `SUCCEEDED: 3`
- `FAILED: 4`
- `CANCELLED: 5`

#### `RunBuildAndDeployRequest`

| Field | Type |
|-------|------|
| `buildRequest` | RunBuildRequest |
| `deployRequest` | RunDeployRequest |

#### Metadata types (long-running operations):
- `RunDefineMetadata`
- `RunBuildMetadata`
- `RunDeployMetadata`
- `RunBuildAndDeployMetadata`

---

## 10. Timesheet Model

### `alis.os.timesheet.v1.TimeEntry`

| Field | Type |
|-------|------|
| `name` | string |
| `state` | enum (TimeEntry.State) |
| `builder` | string |
| `target` | TimeEntry.Target |
| `startTime` | google.protobuf.Timestamp |
| `endTime` | google.protobuf.Timestamp |
| `duration` | google.protobuf.Duration |
| `description` | string |
| `timeLogs` | repeated TimeEntry.TimeLog |
| `reflection` | TimeEntry.Reflection |
| `buildSpec` | string |
| `flowType` | string |

**TimeEntry.State:**
- `STATE_UNSPECIFIED: 0`
- `STATE_RUNNING: 2`
- `STATE_PAUSED: 3`
- `STATE_STOPPED: 4`
- `STATE_SUBMITTED: 5`
- `STATE_DELETED: 6`

**TimeEntry.Target:** `buildSpec` (string)
**TimeEntry.TimeLog:** `startTime`, `endTime`
**TimeEntry.Reflection:** `accomplishments`, `challenges`, `nextSteps`

### RPC Methods (TimesheetService)
- `StartTimeLogging` / `StartTimeLoggingResponse`
- `StopTimeLogging` / `StopTimeLoggingResponse`
- `PauseTimeLogging` / `PauseTimeLoggingResponse`
- `SubmitTimeEntry` / `SubmitTimeEntryResponse`
- `SubmitManualTimeEntry` / `SubmitManualTimeEntryResponse`
- `DiscardTimeEntry` / `DiscardTimeEntryResponse`
- `RetrieveUserLatestTimeEntry` / `RetrieveUserLatestTimeEntryResponse`
- `GenerateTimeLogSummary` / `GenerateTimeLogSummaryResponse`
- CRUD: Create, Get, List, Update, Delete, Undelete, Batch variants
- `StreamTimeEntries`

---

## 11. Solutions Model

### `alis.os.solutions.v2.Solution`

| Field | Type |
|-------|------|
| `name` | string |
| `displayName` | string |
| `description` | string |
| `status` | enum (Solution.Status) |
| `ideate` | Solution.Ideate |
| `modules` | repeated Solution.Module |

**Status:**
- `STATE_UNSPECIFIED: 0`
- `PENDING: 1`
- `ACTIVE: 2`
- `COMPLETED: 3`

**Module:**
- `MODULE_UNSPECIFIED: 0`
- `BILLING: 1`
- `TEAM: 2`
- `PROPOSAL: 3`
- `BUILD_PLAN: 4`
- `WIREFRAME: 5`

### RPC Methods (SolutionsService)
- CRUD: Create, Get, List, Update, Delete, Undelete + Batch variants
- `CreateSolutionRevision`
- `DuplicateSolution`
- `GenerateSolutionFromRfp` (long-running)
- `GenerateSolutionFromSpec` (long-running)
- `GenerateSolutionSummary`
- `SuggestTextEnhancement`

### `alis.os.ideas.v1.Idea`

| Field | Type |
|-------|------|
| `name` | string |
| `title` | string |
| `overview` | string |
| `problemStatement` | string |
| `proposedSolution` | string |
| `successCriteria` | string |
| `status` | string |
| `createTime` | google.protobuf.Timestamp |
| `updateTime` | google.protobuf.Timestamp |
| `author` | string |

---

## 12. Enums

### Resource Hierarchy Enums

```
Organisation.State:
  STATE_UNSPECIFIED=0, ACTIVE=1, ARCHIVED=2, DELETED=3, DEV=4,
  CREATING=5, UPDATING=6, FAILED=7, DETACHED=8

Product.State:
  STATE_UNSPECIFIED=0, ACTIVE=1, ARCHIVED=2, DELETED=3, DEV=4,
  CREATING=5, UPDATING=6, FAILED=7

Product.Availability:
  AVAILABILITY_UNSPECIFIED=0, PRIVATE=1, GA=2, BETA=3, ALPHA=4, GA_ORG=5

Neuron.Type:
  TYPE_UNSPECIFIED=0, RESOURCE=1, SERVICE=2

ProductDeployment.EnvironmentType:
  ENVIRONMENT_TYPE_UNSPECIFIED=0, DEV=1, STAGING=2, PROD=3

ProductDeployment.Gateway.Type:
  TYPE_UNSPECIFIED=0, CONSUMER=1, INTERNAL=2

Organisation.GitProvider:
  GIT_PROVIDER_UNSPECIFIED=0, ALIS_MANAGED=1
```

### Masked Roles (for unauthenticated contexts)

```
MaskedOrganisation.Role:
  ROLE_UNSPECIFIED=0, VIEWER=1, BUILDER=2, ADMIN=3

MaskedProduct.Role:
  ROLE_UNSPECIFIED=0, CONSUMER=2, BUILDER=3, ADMIN=4
```

### Also referenced in the extension

Additional protobuf namespaces with types:
- `proto.google.api.*` — HTTP rules, client libraries, resource descriptors
- `proto.google.iam.admin.v1.*` — IAM roles, service accounts, policy management
- `proto.google.iam.v1.*` — Policy, Binding, AuditConfig
- `proto.google.longrunning.*` — Operation tracking
- `proto.google.protobuf.*` — Well-known types (Timestamp, Duration, FieldMask, etc.)
- `proto.google.rpc.Status` — Standard error status
- `proto.google.type.*` — Date, Money, Expr, PostalAddress

### Open Alis Services (`proto.alis.open.*`)

Referenced but not fully extracted:
- `alis.open.iam.v1` — Public IAM (AddIamBindings, RemoveIamBindings, etc.)
- `alis.open.options.v1` — Options/fields
- `alis.open.agent.v1` — Agent tasks (GetTask, ListTasks, Stream)
- `alis.open.pubsub.v1` — Pub/Sub
- `alis.open.validation.v1` — Validation rules
- `alis.open.notifications.v1` — Notifications
- `alis.open.cx.v1` — Customer experience
- `alis.open.flows.v1` — Workflow flows
- `alis.open.operations.v1` — Operations
- `alis.open.support.v1` — Support
- `alis.open.px.v1` — Product experience
- `alis.open.config.v1` — Configuration
- `alis.open.in.v1` — Integrations

### Workspace Controller (`alis.ws.controller.v1`)

- `Workstation`, `Mount`
- `CreateWorkstation`, `DeleteWorkstation`, `ListWorkstations`, `GetWorkstation`
- `UpgradeAllWorkstations`
- `RetrieveMyWorkstation`
