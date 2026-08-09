package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
