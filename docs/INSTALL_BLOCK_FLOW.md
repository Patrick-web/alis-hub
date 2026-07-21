# Install Block Flow

How the console's "Install Block" feature works, reverse-engineered from
`https://console.alisx.com/build/blocks/testclaudeblock/settings`.

---

## UX Flow (4 dialogs)

```
[Install Block button]
       ↓
Dialog 1: "Select Install Location"
  - Landing Zone   (org dropdown)
  - Product        (enabled after org selected)
  - Neuron         (enabled after product selected)
       ↓ "Select Install Location"
Dialog 2: "Select Plan"
  - Plan cards (one per EntitlementPlan on the block)
       ↓ "Choose Plan"
Dialog 3: "Configure Installation"
  - Build Folder   (default: "./")
  - Block Version  (dropdown, default: latest)
       ↓ "Install"
[Done — instance created and deployed]
```

---

## API Calls — Step by Step

### 1. Install Block button clicked → Dialog 1 opens

```
POST /alis.os.products.v1.OrganisationsService/ListOrganisations
  request:  {} (empty — lists all orgs the user belongs to)
  response: repeated Organisation { name, display_name, ... }
```

Populates the **Landing Zone** dropdown.

---

### 2. Landing Zone selected → Product dropdown loads

```
POST /alis.os.products.v1.ProductsService/ListProducts
  field 1 (parent):    "organisations/voyage"
  field 4 (read_mask): { paths: ["name", "display_name"] }

POST /alis.bl.blocks.v1.BlocksService/BatchTestIamPermissions
  field 1 (resources, repeated):
    "organisations/voyage/products/vp"
    "organisations/voyage/products/zz"
  field 2 (permissions, repeated):
    "/alis.bl.blocks.v1.BlocksService/InstallBlock"
    "/alis.bl.blocks.v1.BlocksService/AddBlock"
```

`ListProducts` returns all products in the org.
`BatchTestIamPermissions` gates the dropdown — only products where the user
has `InstallBlock` OR `AddBlock` permission are shown.

---

### 3. Product selected → Neuron dropdown loads

```
POST /alis.os.console.v2.ConsoleService/RetrieveAccountPlanLimits
  field 1 (name): "accounts/8na6ap"

POST /alis.os.neurons.v1.NeuronsService/ListNeurons
  field 1 (parent): "organisations/voyage/products/vp"
```

`ListNeurons` returns all neurons (packages) in the product.
Each neuron is shown as `<neuron-id>` with subtitle `packages/<org>.<product>.<neuron>`.

---

### 4. "Select Install Location" clicked → Dialog 2 (Select Plan)

```
POST /alis.bl.blocks.v1.InstancesService/ListInstances
  field 1 (parent): "blocks/testclaudeblock"
  field 5 (filter): "prefix(Instance.package, 'packages/voyage.vp.bff.v1')
                     && Instance.block = 'blocks/testclaudeblock'"

POST /alis.bl.blocks.v1.InstancesService/ListInstances
  (second call — checks the product scope for duplicates)

POST /alis.os.console.v2.ConsoleService/RetrieveAccountPlanLimits
  field 1: "accounts/8na6ap"

POST /alis.bl.blocks.v1.EntitlementsService/ListEntitlements
  field 1 (parent): "blocks/testclaudeblock"
  field 6 (filter): "Entitlement.account = 'accounts/8na6ap'
                     AND Entitlement.state = REDEEMABLE"

POST /alis.bl.blocks.v1.BlocksService/TestIamPermissions

POST /alis.bl.blocks.v1.EntitlementPlansService/ListEntitlementPlans
  field 1 (parent):    "blocks/testclaudeblock"
  field 5 (read_mask): { paths: ["name", "display_name", "license_type",
                                  "license_config", "pricing_config", "type"] }
```

The two `ListInstances` calls guard against installing the same block into the
same neuron twice. `ListEntitlements` checks whether the account already has a
redeemable entitlement (skips `CreateEntitlement` if yes). `ListEntitlementPlans`
populates the plan cards shown in Dialog 2.

---

### 5. Plan selected + "Choose Plan" clicked → Dialog 3 (Configure Installation)

This is where the writes happen.

```
# Guard re-check
POST /alis.bl.blocks.v1.EntitlementsService/ListEntitlements
  (same filter as above — race guard before writing)

# 1. Create an entitlement (licensing agreement)
POST /alis.bl.blocks.v1.EntitlementsService/CreateEntitlement
  field 1 (parent): "blocks/testclaudeblock"
  field 2 (entitlement message):
    field 2 (entitlement_plan): "blocks/testclaudeblock/entitlements/contributors-community-plan"
    field 3 (account):          "accounts/8na6ap"
    field 8 (state varint):     2   ← REDEEMABLE

  response:
    field 1 (name): "blocks/testclaudeblock/entitlements/c35e97a6-db46-4fa2-ac51-47e71a8c3ae1"

# 2. Create the instance
POST /alis.bl.blocks.v1.BlocksService/AddBlock
  field 1 (block):       "blocks/testclaudeblock"
  field 2 (package):     "packages/voyage.vp.bff.v1"     ← selected neuron's package
  field 3 (entitlement): "blocks/testclaudeblock/entitlements/c35e97a6-..."

  response:
    field 1 (name): "blocks/testclaudeblock/instances/0de"

# 3. Fetch the created instance (x2) to populate Dialog 3
POST /alis.bl.blocks.v1.InstancesService/GetInstance
  field 1 (name): "blocks/testclaudeblock/instances/0de"
```

Dialog 3 shows:
- Instance resource name: `blocks/testclaudeblock/instances/0de`
- **Build Folder** text field (default `./`)
- **Block Version** dropdown (populated from `ListBlockVersions`, default = latest)
- **Install** button

---

### 6. "Install" clicked — the actual deployment

```
POST /alis.bl.agents.v1.AgentsService/InstallBlock
  field 1 (instance):     "blocks/testclaudeblock/instances/0de"
  field 2 (build_folder): "./"
  field 3 (block_version): "blocks/testclaudeblock/blockVersions/v1.0.0"   ← optional
  field 4 (block_config):
    field 1 (architecture): 1  ← ARCHITECTURE_GO_ADK

  response: google.longrunning.Operation
    field 1 (name): "operations/..."
    field 3 (done): false  ← must poll

# Poll until done:
POST /google.longrunning.Operations/GetOperation
  field 1 (name): "operations/..."

  response:
    field 1 (name): "operations/..."
    field 3 (done): 1 (true)
    field 4 (error): Status { field 1=code, field 2=message }  ← only on failure
```

Note: `InstallBlock` is on `alis.bl.agents.v1.AgentsService`, NOT on `alis.bl.blocks.v1.BlocksService`.
The `BlockConfig.Architecture` enum: `0=UNSPECIFIED`, `1=GO_ADK`.

---

## Proto Field Reference

### `ListProducts` request
| Field | # | Type | Value |
|---|---|---|---|
| parent | 1 | string | `"organisations/{org}"` |
| read_mask | 4 | message | paths: `["name", "display_name"]` |

### `BatchTestIamPermissions` request
| Field | # | Type | Value |
|---|---|---|---|
| resources | 1 | repeated string | product resource names |
| permissions | 2 | repeated string | `/alis.bl.blocks.v1.BlocksService/InstallBlock`, `/AddBlock` |

### `ListNeurons` request
| Field | # | Type | Value |
|---|---|---|---|
| parent | 1 | string | `"organisations/{org}/products/{product}"` |

### `ListInstances` (duplicate check) filter
```
prefix(Instance.package, 'packages/{org}.{product}.{neuron}')
&& Instance.block = 'blocks/{block}'
```

### `ListEntitlements` (entitlement check) filter
```
Entitlement.account = 'accounts/{accountId}' AND Entitlement.state = REDEEMABLE
```

### `CreateEntitlement` request (field 2 = Entitlement message)
| Field | # | Type | Value |
|---|---|---|---|
| parent | 1 | string | `"blocks/{block}"` |
| entitlement.entitlement_plan | 2.2 | string | `"blocks/{block}/entitlements/{plan-id}"` |
| entitlement.account | 2.3 | string | `"accounts/{accountId}"` |
| entitlement.state | 2.8 | varint | `2` (REDEEMABLE) |

### `AddBlock` request
| Field | # | Type | Value |
|---|---|---|---|
| block | 1 | string | `"blocks/{block}"` |
| package | 2 | string | `"packages/{org}.{product}.{neuron}"` |
| entitlement | 3 | string | `"blocks/{block}/entitlements/{entitlement-uuid}"` |

### `AddBlock` response
| Field | # | Type | Value |
|---|---|---|---|
| instance | 1 | string | `"blocks/{block}/instances/{id}"` |

### `InstallBlock` request (`alis.bl.agents.v1.AgentsService/InstallBlock`)
| Field | # | Type | Value |
|---|---|---|---|
| instance | 1 | string | `"blocks/{block}/instances/{id}"` |
| build_folder | 2 | string | `"./"` (default) |
| block_version | 3 | string | version resource name (optional) |
| block_config | 4 | message | `BlockConfig` |

### `BlockConfig` message
| Field | # | Type | Value |
|---|---|---|---|
| architecture | 1 | enum | `1` = `ARCHITECTURE_GO_ADK` |
| agent_name | 2 | string | (optional) |
| tagline | 3 | string | (optional) |
| include_console | 4 | bool | (optional) |

### `InstallBlock` response / `GetOperation` response
`google.longrunning.Operation`:
| Field | # | Type | Value |
|---|---|---|---|
| name | 1 | string | operation resource name |
| done | 3 | varint (bool) | `1` when complete |
| error | 4 | Status message | `f1=code(int32), f2=message(string)` — only on failure |

---

## Implementation Notes

- The "Install Block" button name is misleading — the console actually calls
  `AddBlock`, not `InstallBlock`. `InstallBlock` appears to be a separate final
  deployment step triggered by the "Install" button in Dialog 3.

- `CreateEntitlement` happens **before** `AddBlock`. The entitlement UUID returned
  from `CreateEntitlement` is passed directly into `AddBlock.entitlement`.

- If the account already has a `REDEEMABLE` entitlement for this block (checked by
  `ListEntitlements` before writing), `CreateEntitlement` is skipped and the
  existing entitlement is reused.

- The `package` field in `AddBlock` maps to the neuron's package name:
  `packages/{org}.{product}.{neuron-id}` — not the neuron resource name
  (`organisations/.../neurons/...`).

- Auth: all calls use cookie auth (`alis_access_token_fvc`, `alis_id_token_fvc`,
  `alis_refresh_token_fvc`) via the `ConsoleTokenSource` pattern, same as all
  other console API calls. See `PORTING_CONSOLE_PAGES.md` for details.

---

## Quick Reference

| What | API |
|---|---|
| Populate org dropdown | `OrganisationsService/ListOrganisations` |
| Populate product dropdown | `ProductsService/ListProducts` |
| Gate products by permission | `BlocksService/BatchTestIamPermissions` |
| Populate neuron dropdown | `NeuronsService/ListNeurons` |
| Check plan limits | `ConsoleService/RetrieveAccountPlanLimits` |
| Load plan cards | `EntitlementPlansService/ListEntitlementPlans` |
| Check for duplicate install | `InstancesService/ListInstances` (with filter) |
| Check existing entitlement | `EntitlementsService/ListEntitlements` (with filter) |
| Create licensing agreement | `EntitlementsService/CreateEntitlement` |
| Create the instance | `BlocksService/AddBlock` |
| Fetch created instance | `InstancesService/GetInstance` |
| Final deployment | `AgentsService/InstallBlock` (Dialog 3 → Install button) — returns LRO |
| Poll LRO | `google.longrunning.Operations/GetOperation` |
