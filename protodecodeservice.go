package main

import (
	"context"
	"embed"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/bufbuild/protocompile"
	"github.com/bufbuild/protocompile/linker"
	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclparse"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	"github.com/zclconf/go-cty/cty"
	"github.com/zclconf/go-cty/cty/function"
	"github.com/zclconf/go-cty/cty/function/stdlib"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

// fallbackProtosFS holds the reverse-engineered common Alis-platform protos vendored in
// this repo's protos/ directory (alis/os, alis/open, alis/bl, alis/ws). Org define repos
// only vendor the packages they directly need — cross-org shared packages like
// "alis/open/iam" are often not present locally (no submodule/BSR fetch happens), so
// these embedded copies are used as a last-resort import resolver when compiling an
// org's define repo. This deliberately does NOT include a "google/**" tree: real
// per-file googleapis protos are already available via each org's define repo (its
// "google" symlink), and well-known google/protobuf/* types are provided directly by
// protocompile's WithStandardImports — an earlier embedded google/** existed here as a
// set of synthetic per-package "aggregate" files that duplicated (and collided with)
// symbols from the real per-file tree; it was removed rather than fixed piecemeal.
//
//go:embed protos/alis
var fallbackProtosFS embed.FS

func fallbackProtoAccessor(path string) (io.ReadCloser, error) {
	f, err := fallbackProtosFS.Open("protos/" + path)
	if err != nil {
		return nil, os.ErrNotExist
	}
	return f, nil
}

// ProtoDecodeService compiles an org's cloned "define" repo (~/alis.build/{org}/define)
// into linked proto descriptors in-process — no protoc/buf binary required — so Spanner
// BYTES columns can be decoded into JSON using the org's real message definitions.
type ProtoDecodeService struct {
	mu      sync.Mutex
	cache   map[string]linker.Files            // org -> compiled files
	tfMu    sync.Mutex
	tfCache map[string]map[string]map[string]string // "org/product" -> table -> column -> protoPackage
}

func NewProtoDecodeService() *ProtoDecodeService {
	return &ProtoDecodeService{
		cache:   map[string]linker.Files{},
		tfCache: map[string]map[string]map[string]string{},
	}
}

// ProtoMessageInfo describes a message type discovered in an org's define repo.
type ProtoMessageInfo struct {
	FullName string `json:"fullName"`
	FilePath string `json:"filePath"`
}

func defineDirForOrg(org string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "alis.build", org, "define"), nil
}

// buildDirForOrgProduct mirrors the path convention already used by
// GitService.GetProductRepoPaths (gitservice.go) — inlined here to avoid a
// cross-service dependency.
func buildDirForOrgProduct(org, product string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "alis.build", org, "build", product), nil
}

// filesForOrg returns the cached compiled descriptors for an org, compiling them on
// first use. Compilation walks every .proto file in the org's define repo, so results
// are cached for the process lifetime; call RefreshProtoIndex to force a recompile.
func (s *ProtoDecodeService) filesForOrg(org string) (linker.Files, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if files, ok := s.cache[org]; ok {
		return files, nil
	}
	files, err := compileDefine(org)
	if err != nil {
		return nil, err
	}
	s.cache[org] = files
	return files, nil
}

// RefreshProtoIndex invalidates the cached descriptors for an org and recompiles them,
// e.g. after SyncRepos pulls new proto changes into the define repo.
func (s *ProtoDecodeService) RefreshProtoIndex(org string) error {
	s.mu.Lock()
	delete(s.cache, org)
	s.mu.Unlock()
	_, err := s.filesForOrg(org)
	return err
}

// tfMapForOrgProduct returns the cached (or freshly scanned) spanner.tf-declared
// table -> column -> protoPackage mapping for an org+product.
func (s *ProtoDecodeService) tfMapForOrgProduct(org, product string) (map[string]map[string]string, error) {
	s.tfMu.Lock()
	defer s.tfMu.Unlock()
	key := org + "/" + product
	if m, ok := s.tfCache[key]; ok {
		return m, nil
	}
	m, err := scanSpannerTF(org, product)
	if err != nil {
		return nil, err
	}
	s.tfCache[key] = m
	return m, nil
}

// GetSpannerColumnProtoTypes returns the column -> proto message type mapping declared
// in spanner.tf (infra/spanner.tf under the product's build repo) for the given table.
// Spanner's own PROTO<> column metadata only covers columns using that native type;
// spanner.tf is the authoritative source and also covers columns Spanner exposes as
// plain BYTES. Returns an empty map (not an error) if the table has no declared mapping.
func (s *ProtoDecodeService) GetSpannerColumnProtoTypes(org, product, table string) (map[string]string, error) {
	m, err := s.tfMapForOrgProduct(org, product)
	if err != nil {
		return nil, err
	}
	if cols, ok := m[table]; ok {
		return cols, nil
	}
	return map[string]string{}, nil
}

// RefreshSpannerSchemaIndex invalidates the cached spanner.tf scan for an org+product
// and rescans, e.g. after SyncRepos pulls in infra changes.
func (s *ProtoDecodeService) RefreshSpannerSchemaIndex(org, product string) error {
	key := org + "/" + product
	s.tfMu.Lock()
	delete(s.tfCache, key)
	s.tfMu.Unlock()
	_, err := s.tfMapForOrgProduct(org, product)
	return err
}

// scanSpannerTF walks every "infra/spanner.tf" file under an org/product's build repo
// and extracts alis_google_spanner_table resources' column -> proto_package mapping.
// A file or resource that can't be parsed/statically evaluated (e.g. it references a
// terraform variable) is skipped and logged rather than failing the whole scan.
func scanSpannerTF(org, product string) (map[string]map[string]string, error) {
	buildDir, err := buildDirForOrgProduct(org, product)
	if err != nil {
		return nil, err
	}
	if _, statErr := os.Stat(buildDir); statErr != nil {
		return nil, fmt.Errorf("build repo not found locally for %q/%q — run Sync Repos for this product first", org, product)
	}

	var tfFiles []string
	err = filepath.WalkDir(buildDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() == "spanner.tf" && filepath.Base(filepath.Dir(path)) == "infra" {
			tfFiles = append(tfFiles, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("scan build repo: %w", err)
	}

	result := map[string]map[string]string{}
	// Covers the "${replace("leads-v1", "-", "_")}_Leads"-style templated table names
	// seen in some spanner.tf files. Names referencing terraform variables (var.X) are
	// still unresolvable and are skipped.
	evalCtx := &hcl.EvalContext{
		Functions: map[string]function.Function{"replace": stdlib.ReplaceFunc},
	}
	parser := hclparse.NewParser()
	for _, path := range tfFiles {
		f, diags := parser.ParseHCLFile(path)
		if diags.HasErrors() {
			log.Printf("[protodecode] spanner.tf: skipping %s: %s", path, diags.Error())
			continue
		}
		body, ok := f.Body.(*hclsyntax.Body)
		if !ok {
			continue
		}
		for _, block := range body.Blocks {
			if block.Type != "resource" || len(block.Labels) < 2 || block.Labels[0] != "alis_google_spanner_table" {
				continue
			}
			table, cols, ok := parseSpannerTableBlock(block, evalCtx)
			if !ok {
				log.Printf("[protodecode] spanner.tf: skipping table %s in %s (couldn't statically resolve name/schema)", block.Labels[1], path)
				continue
			}
			if len(cols) == 0 {
				continue
			}
			if result[table] == nil {
				result[table] = map[string]string{}
			}
			for col, protoPkg := range cols {
				result[table][col] = protoPkg
			}
		}
	}
	return result, nil
}

// parseSpannerTableBlock extracts the table name and column->proto_package mapping
// from a single "resource \"alis_google_spanner_table\" \"X\" { ... }" block.
func parseSpannerTableBlock(block *hclsyntax.Block, evalCtx *hcl.EvalContext) (table string, columns map[string]string, ok bool) {
	nameAttr, exists := block.Body.Attributes["name"]
	if !exists {
		return "", nil, false
	}
	nameVal, diags := nameAttr.Expr.Value(nil)
	if diags.HasErrors() {
		nameVal, diags = nameAttr.Expr.Value(evalCtx)
		if diags.HasErrors() {
			return "", nil, false
		}
	}
	if nameVal.IsNull() || nameVal.Type() != cty.String {
		return "", nil, false
	}
	table = nameVal.AsString()

	schemaAttr, exists := block.Body.Attributes["schema"]
	if !exists {
		return table, nil, true
	}
	schemaVal, diags := schemaAttr.Expr.Value(nil)
	if diags.HasErrors() {
		schemaVal, diags = schemaAttr.Expr.Value(evalCtx)
		if diags.HasErrors() {
			return table, nil, false
		}
	}
	if schemaVal.IsNull() || !schemaVal.CanIterateElements() {
		return table, nil, true
	}
	colsVal, hasCols := schemaVal.AsValueMap()["columns"]
	if !hasCols || colsVal.IsNull() || !colsVal.CanIterateElements() {
		return table, nil, true
	}

	columns = map[string]string{}
	for _, colVal := range colsVal.AsValueSlice() {
		if colVal.IsNull() || !colVal.CanIterateElements() {
			continue
		}
		colMap := colVal.AsValueMap()
		nameV, hasName := colMap["name"]
		protoV, hasProto := colMap["proto_package"]
		if !hasName || !hasProto || nameV.IsNull() || protoV.IsNull() {
			continue
		}
		if nameV.Type() != cty.String || protoV.Type() != cty.String {
			continue
		}
		columns[nameV.AsString()] = protoV.AsString()
	}
	return table, columns, true
}

func compileDefine(org string) (linker.Files, error) {
	defineDir, err := defineDirForOrg(org)
	if err != nil {
		return nil, err
	}
	if _, statErr := os.Stat(defineDir); statErr != nil {
		return nil, fmt.Errorf("define repo not found locally for %q — run Sync Repos for this org first", org)
	}

	var protoFiles []string
	err = filepath.WalkDir(defineDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(path, ".proto") {
			if rel, relErr := filepath.Rel(defineDir, path); relErr == nil {
				protoFiles = append(protoFiles, filepath.ToSlash(rel))
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("scan define repo: %w", err)
	}
	if len(protoFiles) == 0 {
		return nil, fmt.Errorf("no .proto files found under %s", defineDir)
	}

	resolver := protocompile.WithStandardImports(
		protocompile.CompositeResolver{
			// The org's own cloned define repo (includes symlinked sibling-org repos
			// like google/, lf/) takes priority.
			&protocompile.SourceResolver{ImportPaths: []string{defineDir}},
			// Fallback for shared packages (e.g. alis/open/**) that aren't vendored
			// in every org's define repo and weren't fetched via a buf dependency.
			&protocompile.SourceResolver{Accessor: fallbackProtoAccessor},
		},
	)
	compiler := protocompile.Compiler{Resolver: resolver}

	ctx := context.Background()
	if files, err := compiler.Compile(ctx, protoFiles...); err == nil {
		return files, nil
	}

	// The batch failed — likely because some files reference proto packages that no
	// longer exist locally (e.g. a deleted neuron). Fall back to compiling file by
	// file so one broken/missing dependency doesn't take down the whole org's index;
	// broken files are skipped and logged instead of failing the request.
	var files linker.Files
	var skipped []string
	for _, f := range protoFiles {
		fileCompiler := protocompile.Compiler{Resolver: resolver}
		result, err := fileCompiler.Compile(ctx, f)
		if err != nil {
			skipped = append(skipped, f)
			log.Printf("[protodecode] skipping %s (org %s): %v", f, org, err)
			continue
		}
		files = append(files, result...)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no proto files under %s could be compiled — see logs for details", defineDir)
	}
	if len(skipped) > 0 {
		log.Printf("[protodecode] org %s: compiled %d/%d proto files (%d skipped due to missing/broken imports)",
			org, len(protoFiles)-len(skipped), len(protoFiles), len(skipped))
	}
	return files, nil
}

// ListProtoMessageTypes returns every message type discovered in the org's cloned
// define repo, for a UI type picker.
func (s *ProtoDecodeService) ListProtoMessageTypes(org string) ([]ProtoMessageInfo, error) {
	files, err := s.filesForOrg(org)
	if err != nil {
		return nil, err
	}
	var out []ProtoMessageInfo
	for _, f := range files {
		collectMessageTypes(f.Messages(), f.Path(), &out)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].FullName < out[j].FullName })
	return out, nil
}

func collectMessageTypes(msgs protoreflect.MessageDescriptors, filePath string, out *[]ProtoMessageInfo) {
	for i := 0; i < msgs.Len(); i++ {
		md := msgs.Get(i)
		*out = append(*out, ProtoMessageInfo{FullName: string(md.FullName()), FilePath: filePath})
		collectMessageTypes(md.Messages(), filePath, out)
	}
}

// ProtoFieldInfo describes one field of a proto message, for the Spanner "query by
// field" drill-down UI. Only one level is returned per call — for Kind=="message"
// fields, the frontend calls GetMessageFields again with TypeName to drill further,
// since message graphs can be deep or self-referential.
type ProtoFieldInfo struct {
	Name       string   `json:"name"`       // proto source field name (snake_case) — exactly what Spanner's dot-path SQL syntax uses
	Number     int32    `json:"number"`
	Kind       string   `json:"kind"`       // "scalar" | "message" | "enum"
	ScalarType string   `json:"scalarType"` // set when Kind=="scalar": "string" | "bytes" | "bool" | "int" | "float"
	TypeName   string   `json:"typeName"`   // set when Kind=="message"/"enum": fully-qualified type name
	Repeated   bool     `json:"repeated"`
	IsMap      bool     `json:"isMap"`
	EnumValues []string `json:"enumValues"` // set when Kind=="enum"
}

// GetMessageFields returns the direct (one-level) fields of a proto message type found
// in the org's cloned define repo, for the Spanner "query by field" drill-down UI.
func (s *ProtoDecodeService) GetMessageFields(org, messageFullName string) ([]ProtoFieldInfo, error) {
	files, err := s.filesForOrg(org)
	if err != nil {
		return nil, err
	}
	desc, err := files.AsResolver().FindDescriptorByName(protoreflect.FullName(messageFullName))
	if err != nil {
		return nil, fmt.Errorf("message type %q not found: %w", messageFullName, err)
	}
	msgDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("%q is not a message type", messageFullName)
	}

	fields := msgDesc.Fields()
	out := make([]ProtoFieldInfo, 0, fields.Len())
	for i := 0; i < fields.Len(); i++ {
		f := fields.Get(i)
		info := ProtoFieldInfo{
			Name:     string(f.Name()),
			Number:   int32(f.Number()),
			Repeated: f.IsList(),
			IsMap:    f.IsMap(),
		}
		switch f.Kind() {
		case protoreflect.MessageKind, protoreflect.GroupKind:
			info.Kind = "message"
			info.TypeName = string(f.Message().FullName())
		case protoreflect.EnumKind:
			info.Kind = "enum"
			info.TypeName = string(f.Enum().FullName())
			values := f.Enum().Values()
			info.EnumValues = make([]string, values.Len())
			for j := 0; j < values.Len(); j++ {
				info.EnumValues[j] = string(values.Get(j).Name())
			}
		case protoreflect.BoolKind:
			info.Kind = "scalar"
			info.ScalarType = "bool"
		case protoreflect.StringKind:
			info.Kind = "scalar"
			info.ScalarType = "string"
		case protoreflect.BytesKind:
			info.Kind = "scalar"
			info.ScalarType = "bytes"
		case protoreflect.FloatKind, protoreflect.DoubleKind:
			info.Kind = "scalar"
			info.ScalarType = "float"
		default:
			// Int32Kind, Sint32Kind, Uint32Kind, Int64Kind, Sint64Kind, Uint64Kind,
			// Sfixed32Kind, Fixed32Kind, Sfixed64Kind, Fixed64Kind
			info.Kind = "scalar"
			info.ScalarType = "int"
		}
		out = append(out, info)
	}
	return out, nil
}

// DecodeProtoBytes decodes a base64-encoded Spanner BYTES value as the given proto
// message type (found in the org's cloned define repo) and returns pretty JSON.
// Decoding an unrelated message type will not necessarily error — proto3's wire format
// is permissive — so the result should be treated as best-effort, not a correctness
// guarantee that the chosen type is right.
func (s *ProtoDecodeService) DecodeProtoBytes(org, base64Data, messageFullName string) (string, error) {
	files, err := s.filesForOrg(org)
	if err != nil {
		return "", err
	}
	desc, err := files.AsResolver().FindDescriptorByName(protoreflect.FullName(messageFullName))
	if err != nil {
		return "", fmt.Errorf("message type %q not found: %w", messageFullName, err)
	}
	msgDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		return "", fmt.Errorf("%q is not a message type", messageFullName)
	}

	raw, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}

	msg := dynamicpb.NewMessage(msgDesc)
	if err := proto.Unmarshal(raw, msg); err != nil {
		return "", fmt.Errorf("unmarshal proto: %w", err)
	}

	out, err := protojson.MarshalOptions{Indent: "  "}.Marshal(msg)
	if err != nil {
		return "", fmt.Errorf("marshal json: %w", err)
	}
	return string(out), nil
}
