package dbdv1

import (
	"google.golang.org/protobuf/types/known/anypb"
)

// DbdService client interface matching the alis.os.dbd.v1 gRPC service.
type DbdServiceClient interface {
	RunDefine(req *RunDefineRequest) (*Operation, error)
	RunBuild(req *RunBuildRequest) (*Operation, error)
	RunDeploy(req *RunDeployRequest) (*Operation, error)
}

// --- RunDefine ---

type RunDefineRequest struct {
	Neuron      string
	Commit      string
	ReleaseType string
}

type RunDefineMetadata struct {
	Definition          string
	Version             string
	Notes               string
	DefinitionArtifacts []string
}

type RunDefineResponse struct {
	Definition          string
	Version             string
	DefinitionArtifacts []string
}

// --- RunBuild ---

type RunBuildRequest struct {
	Neuron  string
	Commit  string
	Images  map[string]RunBuildAction
	Deploy  *RunDeployRequest
}

type RunBuildAction int32

const (
	RunBuildActionUnspecified RunBuildAction = 0
	RunBuildActionBuild       RunBuildAction = 1
	RunBuildActionRetag       RunBuildAction = 2
	RunBuildActionBuiltLocally RunBuildAction = 3
)

type RunBuildResponse struct{}

// --- RunDeploy ---

type RunDeployRequest struct {
	Environments []string
	Neuron       string
	Version      string
	PlanOnly     bool
	Beta         bool
}

type RunDeployMetadata struct {
	Version     string
	Deployments []*DeploymentInfo
	Notes       string
}

type DeploymentInfo struct {
	LogsURL string
}

type RunDeployResponse struct{}

// --- Long-running Operation ---

type Operation struct {
	Name     string
	Metadata *anypb.Any
	Done     bool
	Result   isOperationResult
}

type isOperationResult interface {
	isOperationResult()
}

type OperationError struct {
	Code    int32
	Message string
}

func (e *OperationError) isOperationResult() {}

type OperationResponse struct {
	Value *anypb.Any
}

func (r *OperationResponse) isOperationResult() {}

type GetOperationRequest struct {
	Name string
}

// --- Artifacts ---

type ArtifactState int32

const (
	ArtifactStateUnspecified ArtifactState = 0
	ArtifactStateQueued      ArtifactState = 1
	ArtifactStateGenerating  ArtifactState = 2
	ArtifactStateReady       ArtifactState = 3
	ArtifactStateFailed      ArtifactState = 4
)

type DefinitionArtifact struct {
	Name     string
	State    ArtifactState
	Golang   *GoArtifact
	JS       *JavaScriptArtifact
	Python   *PythonArtifact
	Dart     *DartArtifact
	DotNet   *DotNetArtifact
	Spanner  *SpannerArtifact
	PubSub   *PubSubArtifact
	Notes    string
}

type GoArtifact struct {
	LocationURI string
	GoPackage   string
	Version     string
}

type JavaScriptArtifact struct {
	LocationURI string
	PackageName string
	Version     string
}

type PythonArtifact struct {
	LocationURI string
	PackageName string
	Version     string
}

type DartArtifact struct {
	LocationURI string
	PackageName string
	Version     string
}

type DotNetArtifact struct {
	LocationURI string
	PackageName string
	Version     string
}

type SpannerArtifact struct {
	Databases []*SpannerDatabase
}

type SpannerDatabase struct {
	Name        string
	LocationURI string
}

type PubSubArtifact struct {
	Environments []*PubSubEnvironment
}

type PubSubEnvironment struct {
	Name        string
	LocationURI string
}

type BatchGetDefinitionArtifactsRequest struct {
	Names []string
}

type BatchGetDefinitionArtifactsResponse struct {
	DefinitionArtifacts []*DefinitionArtifact
}

// --- ExplainDefine ---

type ExplainDefineRequest struct {
	Definition          string
	Version             string
	DefinitionArtifacts []string
	Neuron              string
	RootDirectory       string
}

type ExplainDefineResponse struct {
	Explanation     string
	DefinitionSource *DefineSource
	Artifacts       []*ArtifactExplanation
}

type DefineSource struct {
	Name        string
	Commit      string
	Version     string
	ReleaseType string
}

type ArtifactExplanation struct {
	Name               string
	Language           string
	State              string
	Notes              string
	InstallInstructions string
	UsageExample       string
}


