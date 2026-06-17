# Alis Hub

A native desktop client for [alis.build](https://alis.build) developers - bringing the define → build → deploy pipeline off the browser and onto your machine.

[![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-informational)](#building--distribution)
[![License](https://img.shields.io/badge/license-MIT-green)](/LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Patrick-web/alis-hub)](https://github.com/Patrick-web/alis-hub/releases/latest)

> Community project - not affiliated with or endorsed by Alis.

---

<!-- Add a screenshot here -->
> _Screenshot coming soon_

---

## What is Alis Hub?

Alis Hub is a desktop app for developers working on the alis.build platform. It exposes the full development workflow - define proto schemas, build Docker images, deploy to environments, manage packages, and browse codeblocks - in a single native window, without switching between the web console, a terminal, and VS Code.

It was built by reverse-engineering the web console (`console.alisx.com`) and the published VS Code extension (`alis-build`) to map the gRPC-web API surface. All communication uses the same endpoints the browser console uses - no official SDK or published proto definitions were available. Field numbers, message shapes, and auth flows were extracted by inspecting live network traffic and the compiled extension JS.

This is a demonstration of what a native alis.build client experience could look like. It is an independent project and carries no guarantee of continued API compatibility.

---

## Features

### Define → Build → Deploy pipeline

- **Define** - pick a neuron, select commits, run proto compilation, and read a Glass AI explanation of what changed and why it matters
- **Build** - trigger local Docker builds or cloud builds, stream logs in real time, tag versions
- **Deploy** - select environments, preview a Terraform plan, apply to one or more environments, follow live deploy logs
- **Packages** - scan Go, Node, Python, and Dart projects in your build repo; generate and run install/upgrade scripts in an embedded terminal

### Product & environment management

- Browse organisations and products across your landing zones (own and shared)
- Switch active environment - rewrites the local `.alis/.env` file automatically
- Create, edit, and delete environments and their variables
- View product overview: GCP project details, Git repository, package registries, environment status

### Codeblocks

- Browse the full codeblock catalog with filters by release level (Experimental → Beta → Stable → GA)
- Install blocks with entitlement and plan selection
- Auto-merge the installed block's Git branch into your local build repo
- Create new codeblocks and contribute new versions

### Build Kit

- Configure AI agents, agent tools, skills, and MCP servers
- Gemini Enterprise and Claude integrations
- Agentic launchpad, plugin management, and reporting dashboards

### Embedded GCloud tools

No more switching to the browser for routine cloud operations:

- **Spanner explorer** - browse instances, databases, and tables
- **Cloud Logging** - tail and filter log entries
- **Artifact Registry** - browse images and packages
- **Cloud Storage** - explore buckets and objects
- **Secret Manager** - list secrets and versions

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop framework | [Wails v3](https://v3.wails.io) (Go + WebView) |
| Backend | Go 1.25 |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| API transport | gRPC-Web (manual proto wire encoding via `google.golang.org/protobuf/encoding/protowire`) |
| Git operations | go-git v5 |
| Distribution | GitHub Releases - macOS `.dmg`, Linux `.tar.gz`, Windows `.zip` |

---

## Getting started

**Prerequisites**

- Go 1.25+
- Node 20+
- [Wails v3 CLI](https://v3.wails.io/getting-started/installation): `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`
- An alis.build account

```bash
git clone https://github.com/Patrick-web/alis-hub.git
cd alis-hub
wails3 dev
```

The app opens in dev mode with hot-reload on both Go and frontend changes. You'll be prompted to log in with your alis credentials on first launch.

---

## Building & distribution

```bash
# macOS - signed and notarized (requires cert setup, see docs/SIGNING.md)
wails3 task darwin:sign:notarize

# Release all platforms via CI - push a semver tag:
git tag v0.x.y && git push origin v0.x.y
```

The CI pipeline (`.github/workflows/release.yml`) builds macOS, Linux, and Windows artifacts in parallel and publishes them as a GitHub Release automatically.

Pre-built binaries are available on the [releases page](https://github.com/Patrick-web/alis-hub/releases).

---

## Project structure

```
alis-hub/
├── *service.go          # Go backend services (Define, Build, Deploy, Product, Package, BuildKit, GCloud, Git)
├── alisclient.go        # gRPC-web client - manual proto frame encoding/decoding
├── alisauth.go          # OAuth2 PKCE login flow, token storage
├── alistoken.go         # Token refresh and identity token management
├── frontend/
│   └── src/app/
│       ├── pages/       # 35+ page components
│       ├── components/  # UI primitives, embedded terminal, GCloud tool panels
│       └── stores/      # Workspace state (org, product, environment)
├── build/darwin/        # macOS bundle config, entitlements, signing Taskfile
├── docs/                # Implementation guides, API surface notes, signing docs
└── website/             # Landing page (deployed to Cloudflare Pages)
```

---

## Disclaimer

> Alis Hub is an independent, community-built project. It is not affiliated with, endorsed by, or supported by Alis. The gRPC-web API surface was discovered by inspecting live network traffic from the web console and studying the published VS Code extension - no proprietary source code was accessed or redistributed. Use at your own discretion.

---

## License

[MIT](LICENSE)
