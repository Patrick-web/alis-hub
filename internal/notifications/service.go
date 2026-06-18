package notifications

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type Service struct {
	mu  sync.Mutex
	app *application.App
}

func NewService() *Service { return &Service{} }

func (s *Service) SetApp(app *application.App) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.app = app
}

// Send fires a native macOS notification via osascript.
// title and body values are safely escaped before injection.
func (s *Service) Send(title, body string) error {
	safe := func(v string) string {
		return strings.ReplaceAll(v, `"`, `\"`)
	}
	script := fmt.Sprintf(`display notification %q with title %q`, safe(body), safe(title))
	return exec.Command("osascript", "-e", script).Run()
}
