package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// neuronVersionRoot derives ~/alis.build/{org}/build/{product}/{neuron}/{version} from a package string.
func neuronVersionRoot(pkg string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	p := strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(p, ".", 4)
	if len(parts) < 4 {
		return "", fmt.Errorf("invalid package: %s", pkg)
	}
	org, product, neuron, version := parts[0], parts[1], parts[2], parts[3]
	return filepath.Join(home, "alis.build", org, "build", product, neuron, version), nil
}

// neuronDefineRoot derives ~/alis.build/{org}/define/{org}/{product}/{neuron}/{version} from a package string.
func neuronDefineRoot(pkg string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	p := strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(p, ".", 4)
	if len(parts) < 4 {
		return "", fmt.Errorf("invalid package: %s", pkg)
	}
	org, product, neuron, version := parts[0], parts[1], parts[2], parts[3]
	return filepath.Join(home, "alis.build", org, "define", org, product, neuron, version), nil
}

// ScanNeuronFiles scans the local neuron version directory and returns build/infra files.
// Returns a soft error (NeuronScanResult.Error) when the path is missing or unreadable; no Go error.
func (s *ProductService) ScanNeuronFiles(neuronPackage string) (*NeuronScanResult, error) {
	versionRoot, err := neuronVersionRoot(neuronPackage)
	if err != nil {
		return &NeuronScanResult{Error: err.Error()}, nil
	}
	infraDir := filepath.Join(versionRoot, "infra")

	if _, err := os.Stat(versionRoot); os.IsNotExist(err) {
		return &NeuronScanResult{
			Package: neuronPackage,
			Error:   fmt.Sprintf("neuron not checked out locally — expected at %s", versionRoot),
		}, nil
	}

	skipDirs := map[string]bool{
		"node_modules": true, ".git": true, ".dart_tool": true,
		".symlinks": true, ".plugin_symlinks": true,
		".venv": true, "venv": true, "__pypackages__": true, "__pycache__": true,
	}

	var files []ScannedNeuronFile
	err = filepath.WalkDir(versionRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if path == versionRoot {
				return err // propagate root errors (e.g. EACCES); skip per-entry errors
			}
			return nil
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(versionRoot, path)
		if strings.HasPrefix(rel, "infra"+string(filepath.Separator)) {
			infraRel, _ := filepath.Rel(infraDir, path)
			files = append(files, ScannedNeuronFile{Path: infraRel, Category: "infra", Selected: true})
		} else {
			files = append(files, ScannedNeuronFile{Path: rel, Category: "build", Selected: true})
		}
		return nil
	})
	if err != nil {
		return &NeuronScanResult{Package: neuronPackage, Error: fmt.Sprintf("cannot scan neuron directory: %v", err)}, nil
	}

	// Append proto files from the define repo — optional, silently skip if not checked out.
	if defineRoot, derr := neuronDefineRoot(neuronPackage); derr == nil {
		if _, statErr := os.Stat(defineRoot); statErr == nil {
			_ = filepath.WalkDir(defineRoot, func(path string, d os.DirEntry, err error) error {
				if err != nil {
					return nil
				}
				if d.IsDir() {
					if skipDirs[d.Name()] {
						return filepath.SkipDir
					}
					return nil
				}
				rel, _ := filepath.Rel(defineRoot, path)
				files = append(files, ScannedNeuronFile{Path: rel, Category: "proto", Selected: true})
				return nil
			})
		}
	}

	return &NeuronScanResult{Package: neuronPackage, Files: files}, nil
}

// ReadNeuronFileContents reads the content of the given selected files off disk for a neuron
// package, without publishing anything. Used to materialize file content for preview/diffing
// before a codeblock Update is published.
func (s *ProductService) ReadNeuronFileContents(neuronPackage string, files []ScannedNeuronFile) (*NeuronFileContents, error) {
	build, infra, proto, err := readSelectedNeuronFiles(neuronPackage, files)
	if err != nil {
		return nil, err
	}
	return &NeuronFileContents{BuildFiles: build, InfraFiles: infra, ProtoFiles: proto}, nil
}

// readSelectedNeuronFiles reads the selected build/infra/proto files for a neuron package
// off disk, categorizing each by its repo of origin (build/define repo, infra subfolder).
// Paths that escape their repo root are silently skipped.
func readSelectedNeuronFiles(pkg string, files []ScannedNeuronFile) (build, infra, proto []CodeblockFileItem, err error) {
	versionRoot, err := neuronVersionRoot(pkg)
	if err != nil {
		return nil, nil, nil, err
	}
	defineRoot, err := neuronDefineRoot(pkg)
	if err != nil {
		return nil, nil, nil, err
	}
	infraDir := filepath.Join(versionRoot, "infra")
	buildPrefix := filepath.Clean(versionRoot) + string(filepath.Separator)
	infraPrefix := filepath.Clean(infraDir) + string(filepath.Separator)
	definePrefix := filepath.Clean(defineRoot) + string(filepath.Separator)

	for _, file := range files {
		if !file.Selected {
			continue
		}
		var absPath, containmentPrefix string
		switch file.Category {
		case "build":
			absPath = filepath.Join(versionRoot, file.Path)
			containmentPrefix = buildPrefix
		case "infra":
			absPath = filepath.Join(infraDir, file.Path)
			containmentPrefix = infraPrefix
		case "proto":
			absPath = filepath.Join(defineRoot, file.Path)
			containmentPrefix = definePrefix
		default:
			continue
		}
		if !strings.HasPrefix(filepath.Clean(absPath)+string(filepath.Separator), containmentPrefix) {
			continue // skip paths that escaped their repo root
		}
		data, err := os.ReadFile(absPath)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("read %s: %w", file.Path, err)
		}
		item := CodeblockFileItem{Name: file.Path, Content: string(data)}
		switch file.Category {
		case "build":
			build = append(build, item)
		case "infra":
			infra = append(infra, item)
		case "proto":
			proto = append(proto, item)
		}
	}
	return build, infra, proto, nil
}

func marshalBootstrapBlockRequest(p BootstrapBlockParams, accountName string) ([]byte, error) {
	build, infra, proto, err := readSelectedNeuronFiles(p.Package, p.Files)
	if err != nil {
		return nil, err
	}

	marshalFile := func(f CodeblockFileItem) []byte {
		var b []byte
		b = protowire.AppendTag(b, 1, protowire.BytesType)
		b = protowire.AppendString(b, f.Name)
		b = protowire.AppendTag(b, 2, protowire.BytesType)
		b = protowire.AppendBytes(b, []byte(f.Content))
		return b
	}

	// BlockVersion.Content: f1=build_files, f2=infra_files, f3=proto_files
	var content []byte
	for _, f := range build {
		content = protowire.AppendTag(content, 1, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range infra {
		content = protowire.AppendTag(content, 2, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range proto {
		content = protowire.AppendTag(content, 3, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}

	// Publisher sub-message: f1=account
	var publisher []byte
	if accountName != "" {
		publisher = protowire.AppendTag(publisher, 1, protowire.BytesType)
		publisher = protowire.AppendString(publisher, accountName)
	}

	// Block sub-message: f2=display_name, f13=tagline, f30=publisher
	var block []byte
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(publisher) > 0 {
		block = protowire.AppendTag(block, 30, protowire.BytesType)
		block = protowire.AppendBytes(block, publisher)
	}

	// BootstrapBlockRequest: f2=block, f3=block_id, f4=package, f5=contributed_content
	var req []byte
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 3, protowire.BytesType)
	req = protowire.AppendString(req, p.BlockID)
	req = protowire.AppendTag(req, 4, protowire.BytesType)
	req = protowire.AppendString(req, p.Package)
	if len(content) > 0 {
		req = protowire.AppendTag(req, 5, protowire.BytesType)
		req = protowire.AppendBytes(req, content)
	}
	return req, nil
}

func (s *ProductService) BootstrapBlock(params BootstrapBlockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	accountName := s.myPrimaryAccountID()
	protoBytes, err := marshalBootstrapBlockRequest(params, accountName)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/BootstrapBlock", protoBytes)
	if err != nil {
		return "", fmt.Errorf("BootstrapBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("BootstrapBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("BootstrapBlock: response too short (%d bytes)", len(body))
	}
	// Response: BootstrapBlockResponse { f1: Block { f1: name (string) } }
	blockName := parseStringField1([]byte(parseStringFieldN(body[5:], 1)))
	if blockName == "" {
		return "", fmt.Errorf("BootstrapBlock: response contained no block name")
	}
	return blockName, nil
}
