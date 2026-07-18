package main

import (
	"net/http"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const alisProductHost = "console.alisx.com"

// ── Product summary (for picker) ─────────────────────────────────────────────

type ProductSummary struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	State       int32  `json:"state"`
}

// ── Landing zones ─────────────────────────────────────────────────────────────

type Organisation struct {
	Name          string      `json:"name"`
	DisplayName   string      `json:"displayName"`
	Description   string      `json:"description"`
	Logo          string      `json:"logo"`
	Account       string      `json:"account"`
	GoogleProject *GCPProject `json:"googleProject,omitempty"`
}

type LandingZonesData struct {
	Own    []Organisation `json:"own"`
	Shared []Organisation `json:"shared"`
}

// ── Sync repos ───────────────────────────────────────────────────────────────

type SyncReposResult struct {
	DefineDir    string `json:"defineDir"`
	BuildDir     string `json:"buildDir"`
	DefineAction string `json:"defineAction"`
	BuildAction  string `json:"buildAction"`
	Error        string `json:"error,omitempty"`
}

// ── Product overview ──────────────────────────────────────────────────────────

type ProductOverview struct {
	Name              string         `json:"name"`
	DisplayName       string         `json:"displayName"`
	State             int32          `json:"state"`
	GoogleProject     *GCPProject    `json:"googleProject,omitempty"`
	GitRepo           *GitRepoInfo   `json:"gitRepo,omitempty"`
	PackageRegistries *PkgRegistries `json:"packageRegistries,omitempty"`
	DockerRegistry    string         `json:"dockerRegistry,omitempty"`
}

type GCPProject struct {
	FolderID              string `json:"folderId"`
	ID                    string `json:"id"`
	Number                string `json:"number"`
	Region                string `json:"region"`
	BillingAccountID      string `json:"billingAccountId"`
	ManagedBillingAccount bool   `json:"managedBillingAccount"`
	CloudURI              string `json:"cloudUri"`
}

type GitRepoInfo struct {
	RemoteURI   string `json:"remoteUri"`
	CloudRunURI string `json:"cloudRunUri"`
	VMURI       string `json:"vmUri"`
	BucketURI   string `json:"bucketUri"`
}

type PkgRegistries struct {
	Go         string `json:"go"`
	JavaScript string `json:"javascript"`
	Python     string `json:"python"`
}

type EnvInfo struct {
	Name        string      `json:"name"`
	DisplayName string      `json:"displayName"`
	State       int32       `json:"state"`
	EnvType     int32       `json:"envType"`
	GCPProject  *GCPProject `json:"gcpProject,omitempty"`
}

type EnvVariable struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type DeploymentEnvVar struct {
	Name    string
	Value   string
	Managed bool
}

// ── Install Block types ───────────────────────────────────────────────────────

type InstallNeuron struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Package     string `json:"package"`
}

type BlockPlan struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type InstallBlockParams struct {
	BlockID      string `json:"blockId"`
	Package      string `json:"package"`
	PlanName     string `json:"planName"`
	BuildFolder  string `json:"buildFolder"`
	BlockVersion string `json:"blockVersion"`
}

type InstallBlockResult struct {
	InstanceName   string `json:"instanceName"`
	BranchName     string `json:"branchName"`
	RepoPath       string `json:"repoPath"`
	DefineRepoPath string `json:"defineRepoPath"`
}

// ── Codeblocks ────────────────────────────────────────────────────────────────

type Codeblock struct {
	Name             string             `json:"name"`
	DisplayName      string             `json:"displayName"`
	ReleaseLevel     int32              `json:"releaseLevel"`
	Publisher        string             `json:"publisher"`
	LatestVersion    string             `json:"latestVersion"`
	Tagline          string             `json:"tagline"`
	Headline         string             `json:"headline"`
	Description      string             `json:"description"`
	BannerURL        string             `json:"bannerUrl"`
	InstallCount     int32              `json:"installCount"`
	Highlights       []string           `json:"highlights"`
	KeyFeatures      []CodeblockFeature `json:"keyFeatures"`
	CodeArchitecture []CodeblockLayer   `json:"codeArchitecture"`
}

type CodeblockVersion struct {
	Name         string            `json:"name"`
	VersionTag   string            `json:"versionTag"`
	ReleaseLevel int32             `json:"releaseLevel"`
	CreateTime   string            `json:"createTime"`
	UpdateTime   string            `json:"updateTime"`
	ReleaseNotes string            `json:"releaseNotes"`
	Files        []CodeblockFolder `json:"files"`
}

type CodeblockFolder struct {
	Name  string              `json:"name"`
	Files []CodeblockFileItem `json:"files"`
}

type CodeblockFileItem struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type CodeblockInstance struct {
	Name         string `json:"name"`
	ShortID      string `json:"shortId"`
	Package      string `json:"package"`
	State        int32  `json:"state"`
	Block        string `json:"block"`
	BlockVersion string `json:"blockVersion"`
	CreateTime   string `json:"createTime"`
	UpdateTime   string `json:"updateTime"`
	Entitlement  string `json:"entitlement"`
}

type CodeblockMember struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	PhotoURL    string `json:"photoUrl"`
}

type ContributeBlockParams struct {
	BlockID      string              `json:"blockId"`
	VersionTag   string              `json:"versionTag"`
	ReleaseNotes string              `json:"releaseNotes"`
	ReleaseLevel int32               `json:"releaseLevel"` // 3=EXPERIMENTAL,6=ALPHA,9=BETA,12=RC,99=GA
	ProtoFiles   []CodeblockFileItem `json:"protoFiles"`
	InfraFiles   []CodeblockFileItem `json:"infraFiles"`
	BuildFiles   []CodeblockFileItem `json:"buildFiles"`
}

type BlockCommit struct {
	Hash     string `json:"hash"`     // short 8-char hash
	FullHash string `json:"fullHash"` // full 40-char hash
	Date     string `json:"date"`     // ISO 8601
	Message  string `json:"message"`  // first line of commit message
	Author   string `json:"author"`   // author name
}

type CreateCodeblockParams struct {
	BlockID          string             `json:"blockId"`
	DisplayName      string             `json:"displayName"`
	Tagline          string             `json:"tagline"`
	HeroStatement    string             `json:"heroStatement"`
	Description      string             `json:"description"`
	Highlights       []string           `json:"highlights"`
	KeyFeatures      []CodeblockFeature `json:"keyFeatures"`
	CodeArchitecture []CodeblockLayer   `json:"codeArchitecture"`
}

type CodeblockFeature struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type CodeblockLayer struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ScannedNeuronFile struct {
	Path     string `json:"path"`     // relative path within its category folder
	Category string `json:"category"` // "build" or "infra"
	Selected bool   `json:"selected"`
}

type NeuronScanResult struct {
	Files   []ScannedNeuronFile `json:"files"`
	Package string              `json:"package"`
	Error   string              `json:"error,omitempty"` // soft error — caller checks, not throws
}

type NeuronFileContents struct {
	BuildFiles []CodeblockFileItem `json:"buildFiles"`
	InfraFiles []CodeblockFileItem `json:"infraFiles"`
	ProtoFiles []CodeblockFileItem `json:"protoFiles"`
}

type BootstrapBlockParams struct {
	BlockID     string              `json:"blockId"`
	DisplayName string              `json:"displayName"`
	Tagline     string              `json:"tagline"`
	Package     string              `json:"package"` // e.g. "packages/myorg.myproduct.my-service.v1"
	Files       []ScannedNeuronFile `json:"files"`
}

type ProductService struct {
	tokens       *ConsoleTokenSource
	mu           sync.Mutex
	app          *application.App
	proxies      map[string]*authProxy
	editorWindow *application.WebviewWindow
	editorURL    string
}

func NewProductService() *ProductService {
	return &ProductService{}
}

func (s *ProductService) SetApp(app *application.App) {
	s.mu.Lock()
	s.app = app
	s.mu.Unlock()
}

// authProxy holds a local reverse-proxy server for one upstream host.
type authProxy struct {
	server *http.Server
	port   int
	base   string
}
