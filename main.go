package main

import (
	"embed"
	"log"
	"runtime"
	"strings"
	"time"

	"alis-hub-v3/internal/appflavor"
	"alis-hub-v3/internal/updater"
	wailsnotif "github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

var version = "dev"

// deepLinkScheme is the custom URL scheme used to focus/return to the app,
// e.g. from the OAuth login success page (alishub://auth/callback). Per-flavor,
// so a beta login callback cannot land in the user's stable install.
var deepLinkScheme = appflavor.URLScheme(version)

//go:embed all:frontend/dist
var assets embed.FS

// Both icons ride along in every binary and the flavor picks one at runtime,
// so the two builds differ only in how CI wraps them.
//
//go:embed build/appicon.png
var appIconStable []byte

//go:embed build/appicon-beta.png
var appIconBeta []byte

func appIcon() []byte {
	if appflavor.IsBeta(version) {
		return appIconBeta
	}
	return appIconStable
}

func main() {
	SetupLogging()

	// Widen PATH before anything shells out: GUI launches inherit a minimal
	// PATH missing /usr/local/bin, /opt/homebrew/bin, ~/.docker/bin, etc., so
	// installed tools like docker would otherwise report "not found". This also
	// has to happen before any git command, since the CLI credential helper is
	// resolved off PATH.
	fixPathEnv()

	// Git credentials belong to the alis CLI. Undo the app's old parallel
	// scheme (helper symlink, global credential.helper, baked-in token file)
	// wherever it is still installed. Best-effort: a failure here leaves stale
	// config behind but does not stop the app, since git auth itself now comes
	// from the CLI helper injected per-command.
	go func() {
		if err := CleanupLegacyGitAuth(); err != nil {
			log.Printf("legacy git auth cleanup: %v", err)
		}
	}()

	notifSvc := wailsnotif.New()
	productSvc := NewProductService()
	gitSvc := NewGitService()
	changelogSvc := NewChangelogService(version)
	localAISvc := NewLocalAIService()
	buildSvc := NewBuildService()
	deploySvc := NewDeployService()
	defineSvc := NewDefineService()
	packageSvc := NewPackageService()
	logSvc := NewLogService()

	// Prefer the alis CLI backend when available; fall back to the existing gRPC
	// backend. The CLI provides more reliable operation polling and built-in safety
	// gates for production deploys.
	if cli, err := NewCLIBackend(); err == nil {
		log.Println("[main] alis CLI backend available — DBD operations will use alis commands")
		defineSvc.setBackend(cli)
		buildSvc.setBackend(cli)
		deploySvc.setBackend(cli)
		// Live operation progress rides on the same runner. Polling stays the
		// source of truth; these events only fill the gaps between polls.
		dbdProgress.setRunner(cli.Runner())
		go reportCLIVersion(cli)
	} else {
		log.Printf("[main] alis CLI not found (%v) — falling back to gRPC backend", err)
		grpcBackend := NewGRPCBackend(defineSvc, buildSvc, deploySvc)
		defineSvc.setBackend(grpcBackend)
		buildSvc.setBackend(grpcBackend)
		deploySvc.setBackend(grpcBackend)
	}

	cliSvc := NewCLIService()

	// Pull requests resolve their remote and their token through the CLI, so the
	// service needs it rather than a local clone.
	prSvc := NewPRService(cliSvc)

	hubDB, err := OpenHubDB()
	if err != nil {
		log.Fatal("hub db:", err)
	}
	workflowSvc := NewWorkflowService(hubDB, buildSvc, gitSvc, deploySvc, defineSvc, packageSvc)
	settingsSvc := NewSettingsService(hubDB)

	updaterSvc := updater.NewService(version)

	// window is declared up front so the single-instance and deep-link
	// callbacks can bring it to the foreground.
	var window *application.WebviewWindow
	focusMainWindow := func() {
		if window == nil {
			return
		}
		window.Show()
		window.Restore()
		window.Focus()
	}

	// app is declared up front so the single-instance callback can emit events.
	var app *application.App
	app = application.New(application.Options{
		Name:        appflavor.Name(version),
		Description: appflavor.Name(version) + " Desktop Application",
		Icon:        appIcon(),
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(&ServiceManager{}),
			application.NewService(defineSvc),
			application.NewService(buildSvc),
			application.NewService(deploySvc),
			application.NewService(productSvc),
			application.NewService(packageSvc),
			application.NewService(NewBuildKitService()),
			application.NewService(updaterSvc),
			application.NewService(notifSvc),
			application.NewService(NewGCloudService()),
			application.NewService(NewProtoDecodeService()),
			application.NewService(gitSvc),
			application.NewService(changelogSvc),
			application.NewService(localAISvc),
			application.NewService(workflowSvc),
			application.NewService(settingsSvc),
			application.NewService(logSvc),
			application.NewService(cliSvc),
			application.NewService(prSvc),
		},
		Assets: application.AssetOptions{
			Handler:    application.BundledAssetFileServer(assets),
			Middleware: devBridgeMiddleware,
		},
		Transport: devBridgeTransport(func() *application.App { return app }),
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			// Per-flavor, otherwise launching the beta would just focus the
			// running stable window instead of starting its own instance.
			UniqueID: appflavor.BundleID(version),
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				focusMainWindow()
				for _, arg := range data.Args {
					if strings.HasPrefix(arg, deepLinkScheme+"://") {
						app.Event.Emit("deep-link", arg)
					}
				}
			},
		},
	})

	// Create a new window
	window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:           "AlisHub",
		Width:           1024,
		Height:          768,
		Frameless:       true,
		DevToolsEnabled: true,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBar{
				AppearsTransparent: true,
				Hide:               true,
				HideTitle:          true,
				FullSizeContent:    true,
			},
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})
	window.Maximise()

	// Bring the app to the foreground when it is opened via its custom URL
	// scheme (e.g. the "Return to Alis Hub" button on the login page), and
	// forward the URL to the frontend for deep-link routing.
	app.Event.OnApplicationEvent(events.Common.ApplicationLaunchedWithUrl, func(e *application.ApplicationEvent) {
		app.Event.Emit("deep-link", e.Context().URL())
		focusMainWindow()
	})

	trayWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:       "Tray Window",
		Width:       300,
		Height:      400,
		AlwaysOnTop: true,
		Frameless:   true,
		Hidden:      true,
		Windows: application.WindowsWindow{
			BackdropType: application.Acrylic,
		},
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
		},
		URL: "/tray",
	})

	tray := app.SystemTray.New()
	tray.SetLabel("Alis")

	tray.OnClick(func() {
		if trayWindow.IsVisible() {
			trayWindow.Hide()
		} else {
			trayWindow.Show()
			trayWindow.Focus()
		}
	})

	trayMenu := app.NewMenu()
	trayMenu.Add("Show Main Window").OnClick(func(_ *application.Context) {
		window.Show()
		window.Focus()
	})
	trayMenu.AddSeparator()
	trayMenu.Add("Quit").OnClick(func(_ *application.Context) {
		app.Quit()
	})

	tray.SetMenu(trayMenu)

	installAppMenu(app, updaterSvc)

	updaterSvc.SetApp(app)
	productSvc.SetApp(app)
	gitSvc.SetApp(app)
	prSvc.SetApp(app)
	localAISvc.SetApp(app)
	logSvc.SetApp(app)
	// Lets the DBD services emit dbd:progress / dbd:done while an operation runs.
	dbdProgress.setApp(app)
	if !isDevelopment {
		updater.BackgroundCheck(app, updaterSvc, 30*time.Second)
	}

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func installAppMenu(app *application.App, updaterSvc *updater.Service) {
	menu := app.NewMenu()

	installAppRoleMenu(app, menu)
	menu.AddRole(application.EditMenu)

	view := menu.AddSubmenu("View")
	view.Add("Command Palette").SetAccelerator("CmdOrCtrl+K").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:command-palette", nil)
	})
	view.AddSeparator()
	view.AddRole(application.Reload)
	view.AddRole(application.ForceReload)
	view.AddRole(application.OpenDevTools)
	view.AddSeparator()
	view.AddRole(application.ResetZoom)
	view.AddRole(application.ZoomIn)
	view.AddRole(application.ZoomOut)
	view.AddSeparator()
	view.AddRole(application.ToggleFullscreen)

	installGoMenu(app, menu)

	menu.AddRole(application.WindowMenu)

	installHelpMenu(app, menu, updaterSvc)

	app.Menu.Set(menu)
}

// installAppRoleMenu builds the primary application menu. On macOS this is the
// bold app-named menu; on other platforms AppMenu is a no-op so the extra
// entries (Preferences, Sign Out) are appended under a "File" submenu instead.
func installAppRoleMenu(app *application.App, menu *application.Menu) {
	if runtime.GOOS == "darwin" {
		menu.AddRole(application.AppMenu)
		if appMenu := menu.FindByRole(application.AppMenu); appMenu != nil {
			sub := appMenu.GetSubmenu()
			prefs := sub.Add("Preferences…").SetAccelerator("CmdOrCtrl+,")
			prefs.OnClick(func(_ *application.Context) { app.Event.Emit("menu:preferences", nil) })
			signOut := sub.Add("Sign Out")
			signOut.OnClick(func(_ *application.Context) { app.Event.Emit("menu:sign-out", nil) })
		}
		return
	}

	file := menu.AddSubmenu("File")
	file.Add("Preferences…").SetAccelerator("CmdOrCtrl+,").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:preferences", nil)
	})
	file.AddSeparator()
	file.Add("Sign Out").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:sign-out", nil)
	})
	file.AddSeparator()
	file.AddRole(application.Quit)
}

// installGoMenu mirrors the command palette's navigation group so the primary
// workspace destinations are reachable (and discoverable) from the menu bar.
func installGoMenu(app *application.App, menu *application.Menu) {
	navItems := []struct {
		label, route, accelerator string
	}{
		{"Develop", "/develop", "CmdOrCtrl+1"},
		{"Builds", "/builds", "CmdOrCtrl+2"},
		{"Deployments", "/deployments", "CmdOrCtrl+3"},
		{"Environments", "/environments", "CmdOrCtrl+4"},
		{"Tools", "/tools", "CmdOrCtrl+5"},
		{"Source Control", "/git", "CmdOrCtrl+Shift+G"},
		{"Workflows", "/workflows", ""},
	}

	goMenu := menu.AddSubmenu("Go")
	for _, item := range navItems {
		route := item.route
		mi := goMenu.Add(item.label)
		if item.accelerator != "" {
			mi.SetAccelerator(item.accelerator)
		}
		mi.OnClick(func(_ *application.Context) {
			app.Event.Emit("menu:navigate", route)
		})
	}
}

// installHelpMenu surfaces about/updates/logs/support actions that were
// previously only reachable through the profile or hidden dev-settings modals.
func installHelpMenu(app *application.App, menu *application.Menu, updaterSvc *updater.Service) {
	help := menu.AddSubmenu("Help")

	if runtime.GOOS != "darwin" {
		help.Add("About AlisHub").OnClick(func(_ *application.Context) {
			app.Event.Emit("menu:about", nil)
		})
		help.AddSeparator()
	}

	help.Add("Check for Updates…").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:check-updates", nil)
	})
	help.Add("Release Notes").OnClick(func(_ *application.Context) {
		if err := updaterSvc.OpenReleasePage(); err != nil {
			log.Printf("open release page: %v", err)
		}
	})
	help.AddSeparator()
	// Diagnostics is machine-scoped, so the standalone shortcuts are its home in
	// the UI. Repeating it here keeps it reachable from inside a product
	// workspace, where that nav is not rendered.
	help.Add("Diagnostics").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:navigate", "/diagnostics")
	})
	help.Add("View Logs").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:view-logs", nil)
	})
	help.Add("Report an Issue").OnClick(func(_ *application.Context) {
		openBrowserURL("https://github.com/Patrick-web/alis-hub-v3/issues")
	})
}
