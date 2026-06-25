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
)

var version = "dev"

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	// Multi-call binary: act as git credential helper when invoked under that name.
	if base := filepath.Base(os.Args[0]); strings.Contains(base, "git-credential-alis") {
		RunAsCredentialHelper()
		return
	}

	// Best-effort: refresh git auth on every app launch.
	go func() {
		if err := SyncGitAuth(); err != nil {
			log.Printf("git auth sync: %v", err)
		}
	}()

	updaterSvc := updater.NewService(version)
	notifSvc := wailsnotif.New()
	productSvc := NewProductService()
	gitSvc := NewGitService()
	changelogSvc := NewChangelogService(version)
	localAISvc := NewLocalAIService()

	app := application.New(application.Options{
		Name:        "AlisHub",
		Description: "AlisHub Desktop Application",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(&ServiceManager{}),
			application.NewService(NewDefineService()),
			application.NewService(NewBuildService()),
			application.NewService(NewDeployService()),
			application.NewService(productSvc),
			application.NewService(NewPackageService()),
			application.NewService(NewBuildKitService()),
			application.NewService(updaterSvc),
			application.NewService(notifSvc),
			application.NewService(NewGCloudService()),
			application.NewService(gitSvc),
			application.NewService(changelogSvc),
			application.NewService(localAISvc),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Create a new window
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "AlisHub",
		Width:  1024,
		Height: 768,
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

	trayWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:         "Tray Window",
		Width:         300,
		Height:        400,
		AlwaysOnTop:   true,
		Frameless:     true,
		Hidden:        true,
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
	if !isDevelopment {
		updater.BackgroundCheck(app, version, 30*time.Second)
	}

	err := app.Run()
	if err != nil {
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
