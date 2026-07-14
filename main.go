package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"alis-hub-v3/internal/updater"
	wailsnotif "github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

var version = "dev"

// deepLinkScheme is the custom URL scheme used to focus/return to the app,
// e.g. from the OAuth login success page (alishub://auth/callback).
const deepLinkScheme = "alishub"

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	SetupLogging()

	// Multi-call binary: act as git credential helper when invoked under that name.
	if base := filepath.Base(os.Args[0]); strings.Contains(base, "git-credential-alis") {
		RunAsCredentialHelper()
		return
	}

	// Best-effort: refresh git auth on launch, then keep it fresh. The
	// underlying access token is short-lived (~5min), so only syncing at
	// launch/login leaves git-auth.gitconfig stale for most of the session.
	go func() {
		if err := SyncGitAuth(); err != nil {
			log.Printf("git auth sync: %v", err)
		}
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if err := SyncGitAuth(); err != nil {
				log.Printf("git auth sync: %v", err)
			}
		}
	}()

	updaterSvc := updater.NewService(version)
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

	hubDB, err := OpenHubDB()
	if err != nil {
		log.Fatal("hub db:", err)
	}
	workflowSvc := NewWorkflowService(hubDB, buildSvc, gitSvc, deploySvc, defineSvc, packageSvc)
	settingsSvc := NewSettingsService(hubDB)

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
		Name:        "AlisHub",
		Description: "AlisHub Desktop Application",
		Icon:        appIcon,
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
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.patrickweb.alishub",
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

	installAppMenu(app)

	updaterSvc.SetApp(app)
	productSvc.SetApp(app)
	gitSvc.SetApp(app)
	localAISvc.SetApp(app)
	logSvc.SetApp(app)
	if !isDevelopment {
		updater.BackgroundCheck(app, version, 30*time.Second)
	}

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func installAppMenu(app *application.App) {
	menu := app.NewMenu()
	menu.AddRole(application.AppMenu)
	menu.AddRole(application.EditMenu)

	view := menu.AddSubmenu("View")
	view.Add("Command Palette").SetAccelerator("CmdOrCtrl+K").OnClick(func(_ *application.Context) {
		app.Event.Emit("menu:command-palette", nil)
	})

	menu.AddRole(application.WindowMenu)
	app.Menu.Set(menu)
}
