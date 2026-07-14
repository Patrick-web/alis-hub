# Alis Hub v3 — Reverse-Engineered Proto Extraction

## Goal

Reverse-engineer the protobuf definitions from the Alis Exchange console's JavaScript bundle
(`console.alisx.com`) to create a folder of `.proto` files, for the purpose of improving the
stability of this app (typed clients, API drift detection, documentation).

## Procedure

### 1. Bundle identification & download
- Discovered the JS assets loaded by `console.alisx.com` via Chrome DevTools.
- Identified the protobuf framework: **gRPC-Web + google-protobuf** (`protoc-gen-js`), with
  `_pb.js` (message definitions) and `_grpc_web_pb.js` (service stubs).
- Assets require authentication (session cookie, httpOnly) — downloaded the 11.4 MB main bundle
  (`index-DVQRvdHW.js`) and ancillary chunks through the authenticated browser page via
  `fetch()` + Chrome DevTools `evaluate_script`.

### 2. Parser design
- Analyzed the minified google-protobuf codegen to find the cleanest source of truth.
  Chose `deserializeBinaryFromReader` (`switch(case N)`) — each case has explicit field
  number, setter/adder name, and constructor (`new proto.X`) or scalar `readXxx()` call.
- Captured: scalar types, message types, repeated/packed fields, maps (`Map.deserializeBinary` +
  `serializeMapToBinary`), enums, oneofs (`oneofGroups_` + `XxxCase`), and services
  (`MethodDescriptor("/pkg.Service/Method", MethodType, Req, Resp, …)`).
- Field numbers, wire types, labels, and type references are exact; field names are recovered
  via getter-name → camel→snake conversion (matches protoc's own convention).
- Post-pass resolves alias-imported message types (e.g. `new ht.Timestamp` → `google.protobuf.Timestamp`)
  against the full message index.

### 3. Enum-field type resolution
- google-protobuf's `readEnum`/`writeEnum` does not encode the enum *type* identity per field.
- Applied a priority-ordered heuristic resolver:
  1. Exact/case-insensitive PascalCase name match in ancestor message scopes and package.
  2. Scope-contains: enum in scope whose name contains the field word, scored by full-name match
     (disambiguates e.g. `private_key_type` → `ServiceAccountPrivateKeyType` vs `PublicKeyType`).
  3. Global unique short-name match.
  4. Sole nested enum + sole enum-typed field in a message.
  5. Known mappings for canonical google.* fields.
  6. Curated confidence tags: high (no comment), medium (`// enum (heuristically resolved)`),
     low, or unrecoverable (`int32` + comment).

### 4. Expansion via alis-build VS Code extension
- Discovered `alisexchange.alis-build` is installed at `~/.vscode/extensions/`.
- Its `dist/extension.js` (7.4 MB) contains a different slice of platform protos — including
  packages the console bundle didn't ship (`alis.os.vscode.v2`, `context.v1`, `prompts.v1`,
  `bl.agents.v1`, `workstations.v1`, etc.) and uses an additional `@grpc/grpc-js`
  service-definition form (`path`, `requestType`, `responseType`, streaming).
- Merged console + extension bundles (by full message/enum/service name) for a union.
- Also checked: local `~/alis.build/` (424 authoritative `.proto` files, but only product protos
  — no alisx platform packages); `grpc.reflection` (disabled, status 12); and
  `alis.os.protos.v1.PackagesService.GetPackage` (returns `bytes fds` FileDescriptorSet,
  but permission-denied, status 7).

### 5. Rendering & validation
- Renders one `.proto` file per package, mirroring the original package path
  (e.g. `alis/os/accounts/v1/accounts.proto`).
- Files include fully-qualified cross-package type references and `import` statements;
  nested messages, nested enums, oneofs, maps, services, and streaming RPCs.
- Validated with `protoc 29.3`: **compiles clean, 0 errors** across all files.
- Remaining enum-typed fields that cannot be confidently resolved are rendered as wire-compatible
  `int32` with a comment — enum is a varint, so wire encoding is identical.

### 6. Extraction tooling
- `.proto-extraction/extract.js` — parser (message, enum, oneof, service extraction).
- `.proto-extraction/render.js` — renderer (proto output, imports, nested types, confidence comments).
- `.proto-extraction/resolve_enums.js` — deep enum-type resolver (shared by renderer).
- `.proto-extraction/raw/` — downloaded bundle files (gitignored, ~23 MB).
- Re-run: `node extract.js && node render.js` from `.proto-extraction/`.

## Results

| Metric | Count |
|---|---|
| **Proto files** | 45 |
| **Packages** | 45 |
| **Messages** | 3,063 |
| **Enums** | 278 |
| **Services** | 84 |
| **RPCs** | 1,208 |
| **Enum fields typed** | ~87 % |
| **Enum fields as int32 fallback** | 62 |
| **`protoc` compilation** | exit 0 |

### Packages recovered

**alis.* platform surface (45 packages):**

`alis.bl.agents.v1`, `alis.bl.blocks.v1`, `alis.ideate`,
`alis.open.agent.v1`, `alis.open.iam.v1`, `alis.open.options.v1`,
`alis.open.pubsub.v1`, `alis.open.support.v1`, `alis.open.validation.v1`,
`alis.os.accounts.v1`, `alis.os.billing.v1`, `alis.os.buildspecs.v1`,
`alis.os.console.v2`, `alis.os.context.v1`, `alis.os.dbd.v1`,
`alis.os.gcloud.v1`, `alis.os.glass.v1`, `alis.os.iam.v1`, `alis.os.iam.v2`,
`alis.os.ideas.v1`, `alis.os.loadbalancing.v1`, `alis.os.metrics.v1`,
`alis.os.neurons.v1`, `alis.os.products.v1`, `alis.os.prompts.v1`,
`alis.os.protos.v1`, `alis.os.quests.v1`, `alis.os.resources.builders.v1`,
`alis.os.resources.products.v1`, `alis.os.resources.solutions.v1`,
`alis.os.services.dbd.v1`, `alis.os.services.images.v1`, `alis.os.solutions.v2`,
`alis.os.support.v1`, `alis.os.timesheet.v1`, `alis.os.vscode.v2`,
`alis.os.workstations.v1`, `alis.ws.controller.v1`,
`google.api`, `google.iam.admin.v1`, `google.iam.v1`,
`google.longrunning`, `google.protobuf`, `google.rpc`, `google.type`

## Accuracy & limitations

### Exact (recovered from wire (de)serializers):
- Field numbers, wire types (scalar/message/map/bytes/string/int/etc.), repeated/label.
- Message field type references.
- Map key/value types.
- gRPC service/method names and streaming flags.
- Enum definitions and their values.
- Well-known types (`google.protobuf.{Timestamp,FieldMask,Duration,Empty,Struct,Any,Value,…}`).
- gRPC method paths (`/pkg.Service/Method`).

### Heuristic (high accuracy, matches protoc naming conventions):
- Field names (getter camelCase → snake_case; protoc's canonical backwards transform).
- Map field names.
- Oneof names.
- Oneof group → field membership.

### Approximate / unrecoverable from the client bundle:
- **62 enum-typed fields** rendered as `int32` with comments. The enum *definitions* exist,
  but google-protobuf codegen does not encode the enum *type* per field descriptor. Rendered
  `int32` is wire-compatible (both varint). Includes 8 `google.protobuf` `*edition` fields
  whose `Edition` enum definition was tree-shaken from the bundle.
- No proto comments, annotations (`google.api.http`, `field_behavior`, resource annotations),
  or field-level options survived codegen.
- Well-known type enum fields referencing `google.protobuf.Edition` remain as `int32`
  (the enum definition is not present in either the console or extension bundles).
- Field names may differ in character-for-character casing from the canonical names
  (rare — protoc's camel→snake is deterministic and the reverse is generally unique).

### Not obtained (requires alisx backend access):
- Authoritative `FileDescriptorSet` from `alis.os.protos.v1.PackagesService.GetPackage.fds`
  (permission-denied for this account, status 7).
- Any `.proto` source or descriptor not embedded in the client-side JS bundles.
