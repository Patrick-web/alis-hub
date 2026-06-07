package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	dbdv1 "alis-hub-v3/dbdv1"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/types/known/anypb"
)

const (
	alisDbdHost    = "auth.alis.build:443"
	alisAppID      = "alis-hub/alis-hub-v3"
	alisAppVersion = "0.1.0"
)

type tokenSource interface {
	Token() (string, error)
}

type AlisClient struct {
	httpClient *http.Client
	tokens     tokenSource
}

func NewAlisClient(ctx context.Context) (*AlisClient, error) {
	tokens, err := NewConsoleTokenSource()
	if err != nil {
		return nil, fmt.Errorf("token source: %w", err)
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
		ForceAttemptHTTP2: true,
	}

	return &AlisClient{
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   120 * time.Second,
		},
		tokens: tokens,
	}, nil
}

func (c *AlisClient) Close() error {
	c.httpClient.CloseIdleConnections()
	return nil
}

// doGRPC sends a gRPC request and handles the response including trailers.
func (c *AlisClient) doGRPC(ctx context.Context, method string, protoBytes []byte) ([]byte, int, string, error) {
	token, err := c.tokens.Token()
	if err != nil {
		return nil, 0, "", fmt.Errorf("auth: %w", err)
	}

	// gRPC wire format: 5-byte header + payload
	grpcPayload := make([]byte, 5+len(protoBytes))
	grpcPayload[0] = 0 // uncompressed
	grpcPayload[1] = byte(len(protoBytes) >> 24)
	grpcPayload[2] = byte(len(protoBytes) >> 16)
	grpcPayload[3] = byte(len(protoBytes) >> 8)
	grpcPayload[4] = byte(len(protoBytes))
	copy(grpcPayload[5:], protoBytes)

	url := fmt.Sprintf("https://%s/%s", alisDbdHost, method)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(grpcPayload))
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", "application/grpc")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("x-alis-application-id", alisAppID)
	req.Header.Set("x-alis-application-version", alisAppVersion)
	req.Header.Set("TE", "trailers")

	// Use HTTP/2 transport
	req.Proto = "HTTP/2"
	req.ProtoMajor = 2
	req.ProtoMinor = 0

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, "", fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, "", fmt.Errorf("read body: %w", err)
	}

	// Read gRPC status from trailers
	grpcStatusStr := resp.Trailer.Get("grpc-status")
	grpcMessage := resp.Trailer.Get("grpc-message")

	// Also check response headers
	if grpcStatusStr == "" {
		grpcStatusStr = resp.Header.Get("grpc-status")
	}
	if grpcMessage == "" {
		grpcMessage = resp.Header.Get("grpc-message")
	}

	grpcStatus := 0
	if grpcStatusStr != "" {
		grpcStatus, _ = strconv.Atoi(grpcStatusStr)
	}

	return body, grpcStatus, grpcMessage, nil
}

// doGRPCWeb sends a gRPC-web-text (base64) request and parses the framed response.
// console.alisx.com uses application/grpc-web-text (the same encoding as the browser).
func (c *AlisClient) doGRPCWeb(ctx context.Context, host, method string, protoBytes []byte) ([]byte, int, string, error) {
	token, err := c.tokens.Token()
	if err != nil {
		return nil, 0, "", fmt.Errorf("auth: %w", err)
	}

	// Build 5-byte gRPC frame header + proto payload, then base64-encode the whole thing.
	frame := make([]byte, 5+len(protoBytes))
	frame[0] = 0 // data frame, uncompressed
	frame[1] = byte(len(protoBytes) >> 24)
	frame[2] = byte(len(protoBytes) >> 16)
	frame[3] = byte(len(protoBytes) >> 8)
	frame[4] = byte(len(protoBytes))
	copy(frame[5:], protoBytes)
	encoded := base64.StdEncoding.EncodeToString(frame)

	url := fmt.Sprintf("https://%s/%s", host, method)
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(encoded))
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", "application/grpc-web-text")
	req.Header.Set("Accept", "application/grpc-web-text")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("x-grpc-web", "1")
	req.Header.Set("x-alis-application-id", alisAppID)
	req.Header.Set("x-alis-application-version", alisAppVersion)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, "", fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, "", fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != 200 {
		snippet := rawBody
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, 0, "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(snippet))
	}

	dataFrame, grpcStatus, grpcMessage, err := decodeGRPCWebTextFrames(rawBody)
	if err != nil {
		return nil, 0, "", fmt.Errorf("frame decode: %w", err)
	}

	// Fall back to HTTP-level grpc-status headers.
	if grpcStatus == 0 {
		if s := resp.Header.Get("grpc-status"); s != "" {
			grpcStatus, _ = strconv.Atoi(s)
			grpcMessage = resp.Header.Get("grpc-message")
		}
	}

	return dataFrame, grpcStatus, grpcMessage, nil
}

// parseGRPCWebTrailer parses the trailer frame body for grpc-status and grpc-message.
func parseGRPCWebTrailer(data []byte) (int, string) {
	status := 0
	message := ""
	for _, line := range strings.Split(string(data), "\r\n") {
		idx := strings.IndexByte(line, ':')
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(strings.ToLower(line[:idx]))
		val := strings.TrimSpace(line[idx+1:])
		switch key {
		case "grpc-status":
			status, _ = strconv.Atoi(val)
		case "grpc-message":
			message = val
		}
	}
	return status, message
}

// marshalRunDefineRequest builds protobuf bytes for alis.os.dbd.v1.RunDefineRequest.
func marshalRunDefineRequest(neuron, commit string, releaseType int32) []byte {
	var buf []byte
	if neuron != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, neuron)
	}
	if commit != "" {
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendString(buf, commit)
	}
	if releaseType != 0 {
		buf = protowire.AppendTag(buf, 3, protowire.VarintType)
		buf = protowire.AppendVarint(buf, uint64(releaseType))
	}
	return buf
}

func marshalGetOperationRequest(name string) []byte {
	var buf []byte
	if name != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, name)
	}
	return buf
}

func enumValue(s string) int32 {
	switch s {
	case "GA":
		return 1
	case "BETA":
		return 2
	case "ALPHA":
		return 3
	}
	return 0
}

// RunDefine starts a Define operation.
func (c *AlisClient) RunDefine(ctx context.Context, req *dbdv1.RunDefineRequest) (*dbdv1.Operation, error) {
	method := "alis.os.dbd.v1.DbdService/RunDefine"
	protoBytes := marshalRunDefineRequest(req.Neuron, req.Commit, enumValue(req.ReleaseType))

	body, grpcStatus, grpcMsg, err := c.doGRPC(ctx, method, protoBytes)
	if err != nil {
		return nil, fmt.Errorf("RunDefine: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("RunDefine: grpc status %d: %s", grpcStatus, grpcMsg)
	}

	if len(body) < 5 {
		return nil, fmt.Errorf("response too short: %d bytes (grpcStatus=%d msg=%s)", len(body), grpcStatus, grpcMsg)
	}

	return parseOperation(body[5:])
}

// GetOperation polls a long-running operation by name.
func (c *AlisClient) GetOperation(ctx context.Context, name string) (*dbdv1.Operation, error) {
	method := "google.longrunning.Operations/GetOperation"
	protoBytes := marshalGetOperationRequest(name)

	body, grpcStatus, grpcMsg, err := c.doGRPC(ctx, method, protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GetOperation: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetOperation: grpc status %d: %s", grpcStatus, grpcMsg)
	}

	if len(body) < 5 {
		return nil, fmt.Errorf("response too short: %d bytes (grpcStatus=%d msg=%s)", len(body), grpcStatus, grpcMsg)
	}

	return parseOperation(body[5:])
}

// parseOperation parses a protobuf-serialized google.longrunning.Operation.
// google.longrunning.Operation fields:
//   1=name (string), 2=metadata (Any), 3=done (bool/varint), 4=error (Status), 5=response (Any)
func parseOperation(data []byte) (*dbdv1.Operation, error) {
	op := &dbdv1.Operation{}

	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return op, nil
		}
		data = data[n:]

		switch typ {
		case protowire.VarintType:
			// Handles bool `done` (field 3) and any other varint fields.
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return op, nil
			}
			if num == 3 {
				op.Done = v != 0
			}
			data = data[m:]

		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return op, nil
			}
			switch num {
			case 1:
				op.Name = string(b)
			case 2:
				op.Metadata = &anypb.Any{Value: b}
			case 4:
				code, msg := parseStatus(b)
				op.Result = &dbdv1.OperationError{Code: code, Message: msg}
			case 5:
				op.Result = &dbdv1.OperationResponse{
					Value: &anypb.Any{Value: b},
				}
			}
			data = data[m:]

		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return op, nil
			}
			data = data[m:]
		}
	}

	return op, nil
}

// --- Glass (ExplainDefine) support ---

// GlassArtifact is one artifact type from ExplainDefine.
type GlassArtifact struct {
	Type        string `json:"type"`
	State       int32  `json:"state"`
	Notes       string `json:"notes"`
	LocationUri string `json:"locationUri"`
	Extra       string `json:"extra"` // packageImportPath (Go) or packageName (JS)
}

// GlassDefinition holds current definition metadata from ExplainDefine.
type GlassDefinition struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Commit      string `json:"commit"`
	ReleaseType string `json:"releaseType"`
}

// GlassResult is the response from ExplainDefine.
type GlassResult struct {
	Title      string          `json:"title"`
	Summary    string          `json:"summary"`
	Definition GlassDefinition `json:"definition"`
	Artifacts  []GlassArtifact `json:"artifacts"`
}

// neuronToDefinition converts a neuron resource name to a product-level definition resource name.
// "organisations/voyage/products/vp/neurons/bff-v1" → "definitions/voyage.vp"
func neuronToDefinition(neuron string) string {
	afterOrgs := strings.TrimPrefix(neuron, "organisations/")
	orgEnd := strings.Index(afterOrgs, "/")
	if orgEnd < 0 {
		return ""
	}
	org := afterOrgs[:orgEnd]

	afterProducts := strings.TrimPrefix(afterOrgs[orgEnd:], "/products/")
	prodEnd := strings.Index(afterProducts, "/")
	if prodEnd < 0 {
		return ""
	}
	product := afterProducts[:prodEnd]

	return fmt.Sprintf("definitions/%s.%s", org, product)
}

func marshalExplainDefineRequest(definition string, artifacts []string, neuron string) []byte {
	var buf []byte
	if definition != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, definition)
	}
	// field 3: repeated artifact resource names
	for _, a := range artifacts {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendString(buf, a)
	}
	if neuron != "" {
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendString(buf, neuron)
	}
	return buf
}

func parseGlassArtifactMsg(data []byte) (state int32, notes, locationUri, extra string) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return
			}
			if num == 2 {
				state = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return
			}
			switch num {
			case 3:
				notes = string(b)
			case 4:
				locationUri = string(b)
			case 5:
				if extra == "" {
					extra = string(b)
				}
			case 8:
				extra = string(b) // packageImportPath for Go (overrides field 5)
			}
			data = data[m:]
		default:
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return
			}
			data = data[n:]
		}
	}
	return
}

var glassArtifactNames = map[protowire.Number]string{
	1: "Go", 2: "Javascript", 3: "Python", 4: "Dart",
	5: "Cloud Spanner", 6: "Cloud Pub/Sub", 7: ".NET",
	8: "OpenAPI", 9: "Postman", 10: "Go (Public)",
	11: "Javascript (Public)", 12: "Protos (Public)", 13: "ECMAScript (Public)",
}

func parseGlassArtifacts(data []byte) []GlassArtifact {
	var artifacts []GlassArtifact
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			if name, ok := glassArtifactNames[num]; ok {
				state, notes, locationUri, extra := parseGlassArtifactMsg(b)
				artifacts = append(artifacts, GlassArtifact{
					Type: name, State: state, Notes: notes,
					LocationUri: locationUri, Extra: extra,
				})
			}
			data = data[m:]
		} else {
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				break
			}
			data = data[n:]
		}
	}
	return artifacts
}

func parseGlassDefinitionMsg(data []byte) GlassDefinition {
	def := GlassDefinition{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return def
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return def
			}
			switch num {
			case 1:
				def.Name = string(b)
			case 2:
				def.Version = string(b)
			case 3:
				def.Commit = string(b)
			case 4:
				def.ReleaseType = string(b)
			}
			data = data[m:]
		} else {
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return def
			}
			data = data[n:]
		}
	}
	return def
}

func parseGlassResponse(data []byte) *GlassResult {
	result := &GlassResult{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return result
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return result
			}
			switch num {
			case 1:
				result.Title = string(b)
			case 2:
				result.Summary = string(b)
			case 3:
				result.Definition = parseGlassDefinitionMsg(b)
			case 5:
				result.Artifacts = parseGlassArtifacts(b)
			}
			data = data[m:]
		} else {
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return result
			}
			data = data[n:]
		}
	}
	return result
}

// ExplainDefine calls alis.os.glass.v1.GlassService/ExplainDefine.
// definition is the product-level definition name (e.g. "definitions/voyage.vp").
// artifacts is the list of artifact resource names from RunDefineMetadata.
// neuron is the neuron resource name.
func (c *AlisClient) ExplainDefine(ctx context.Context, definition string, artifacts []string, neuron string) (*GlassResult, error) {
	if definition == "" {
		definition = neuronToDefinition(neuron)
	}
	if definition == "" {
		return nil, fmt.Errorf("ExplainDefine: cannot derive definition name from %q", neuron)
	}
	protoBytes := marshalExplainDefineRequest(definition, artifacts, neuron)
	body, grpcStatus, grpcMsg, err := c.doGRPC(ctx, "alis.os.glass.v1.GlassService/ExplainDefine", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ExplainDefine: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ExplainDefine: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ExplainDefine: response too short")
	}
	return parseGlassResponse(body[5:]), nil
}

// marshalRunBuildRequest builds protobuf bytes for alis.os.dbd.v1.RunBuildRequest.
func marshalRunBuildRequest(neuron, commit string) []byte {
	var buf []byte
	if neuron != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, neuron)
	}
	if commit != "" {
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendString(buf, commit)
	}
	return buf
}

// RunBuild starts a Build operation.
func (c *AlisClient) RunBuild(ctx context.Context, req *dbdv1.RunBuildRequest) (*dbdv1.Operation, error) {
	method := "alis.os.dbd.v1.DbdService/RunBuild"
	protoBytes := marshalRunBuildRequest(req.Neuron, req.Commit)

	body, grpcStatus, grpcMsg, err := c.doGRPC(ctx, method, protoBytes)
	if err != nil {
		return nil, fmt.Errorf("RunBuild: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("RunBuild: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("RunBuild: response too short: %d bytes", len(body))
	}
	return parseOperation(body[5:])
}

// RunBuildMetadata holds progress info for a running Build operation.
// Proto fields: 1=logsUrl, 2=version, 3=notes, 4=deployMetadata (message).
type RunBuildMetadata struct {
	LogsURL string
	Version string
	Notes   string
}

// RunBuildResponseData holds the final result of a completed Build operation.
// RunBuildResponse proto fields: 1=neuronVersion, 2=buildLogsUrl, 3=deployments (repeated), 4=version.
type RunBuildResponseData struct {
	NeuronVersion string
	BuildLogsURL  string
	Version       string
}

// parseBuildResponse extracts RunBuildResponse from a completed operation's result field.
func parseBuildResponse(op *dbdv1.Operation) *RunBuildResponseData {
	resp, ok := op.Result.(*dbdv1.OperationResponse)
	if !ok || resp == nil || resp.Value == nil {
		return nil
	}
	data := resp.Value.Value
	result := &RunBuildResponseData{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			switch num {
			case 1:
				result.NeuronVersion = string(b)
			case 2:
				result.BuildLogsURL = string(b)
			case 4:
				result.Version = string(b)
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
		}
	}
	return result
}

// unpackBuildMetadata extracts RunBuildMetadata from an operation's metadata Any.
func unpackBuildMetadata(op *dbdv1.Operation) *RunBuildMetadata {
	if op == nil || op.Metadata == nil {
		return nil
	}
	anyBytes := op.Metadata.Value
	var metaBytes []byte
	for len(anyBytes) > 0 {
		num, typ, n := protowire.ConsumeTag(anyBytes)
		if n < 0 {
			break
		}
		anyBytes = anyBytes[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(anyBytes)
			if m < 0 {
				break
			}
			if num == 2 {
				metaBytes = b
			}
			anyBytes = anyBytes[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, anyBytes)
			if m < 0 {
				break
			}
			anyBytes = anyBytes[m:]
		}
	}
	if len(metaBytes) == 0 {
		return nil
	}
	meta := &RunBuildMetadata{}
	data := metaBytes
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			switch num {
			case 1:
				meta.LogsURL = string(b)
			case 2:
				meta.Version = string(b)
			case 3:
				meta.Notes = string(b)
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
		}
	}
	return meta
}

// parseStatus parses google.rpc.Status.
func parseStatus(data []byte) (int32, string) {
	var code int32
	var message string
	for len(data) > 0 {
		num, _, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		v, m := protowire.ConsumeVarint(data[n:])
		if m < 0 {
			break
		}
		total := n + m + int(v)
		if num == 1 {
			code = int32(v)
		} else if num == 2 && total <= len(data) {
			message = string(data[n+m : total])
		}
		data = data[total:]
	}
	return code, message
}

// unpackDefineMetadata extracts RunDefineMetadata from an operation's metadata.
// The metadata field in the Operation is a google.protobuf.Any containing RunDefineMetadata.
// We parse the Any.value bytes directly with protowire.
func unpackDefineMetadata(op *dbdv1.Operation) *dbdv1.RunDefineMetadata {
	if op == nil || op.Metadata == nil {
		return nil
	}
	// op.Metadata.Value holds the raw bytes of the google.protobuf.Any message.
	// Field 1 = type_url (string), field 2 = value (bytes = RunDefineMetadata proto).
	anyBytes := op.Metadata.Value
	var metaBytes []byte
	for len(anyBytes) > 0 {
		num, typ, n := protowire.ConsumeTag(anyBytes)
		if n < 0 {
			break
		}
		anyBytes = anyBytes[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(anyBytes)
			if m < 0 {
				break
			}
			if num == 2 {
				metaBytes = b
			}
			anyBytes = anyBytes[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, anyBytes)
			if m < 0 {
				break
			}
			anyBytes = anyBytes[m:]
		}
	}
	if len(metaBytes) == 0 {
		return nil
	}
	// Parse RunDefineMetadata: field 1=definition, 2=version, 3=notes, 4=artifact names (repeated).
	meta := &dbdv1.RunDefineMetadata{}
	data := metaBytes
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			switch num {
			case 1:
				meta.Definition = string(b)
			case 2:
				meta.Version = string(b)
			case 3:
				meta.Notes = string(b)
			case 4:
				meta.DefinitionArtifacts = append(meta.DefinitionArtifacts, string(b))
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
		}
	}
	return meta
}
