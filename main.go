package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name:        "Alis Hub",
		Description: "Alis Hub Desktop Application",
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(&ServiceManager{}),
			application.NewService(NewDefineService()),
			application.NewService(NewBuildService()),
			application.NewService(NewDeployService()),
			application.NewService(NewProductService()),
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
		Title: "Alis Hub",
		Width:  1024,
		Height: 768,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

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

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
