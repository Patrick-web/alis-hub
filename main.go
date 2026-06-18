package main

import (
	"embed"
	"log"
	"time"

	"alis-hub-v3/internal/updater"
	wailsnotif "github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var version = "dev"

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	updaterSvc := updater.NewService(version)
	notifSvc := wailsnotif.New()
	productSvc := NewProductService()
	gitSvc := NewGitService()
	changelogSvc := NewChangelogService(version)

	app := application.New(application.Options{
		Name:        "AlisHub",
		Description: "AlisHub Desktop Application",
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

	updaterSvc.SetApp(app)
	productSvc.SetApp(app)
	gitSvc.SetApp(app)
	updater.BackgroundCheck(app, version, 30*time.Second)

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
