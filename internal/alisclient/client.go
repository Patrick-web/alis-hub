package alisclient

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"alis-hub-v3/dbdv1"

	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/types/known/anypb"
)

const (
	alisDbdHost    = "auth.alis.build:443"
	alisAppID      = "alis-hub/alis-hub-v3"
	alisAppVersion = "0.1.0"
)

type TokenProvider interface {
	Token() (string, error)
}

type AlisClient struct {
	httpClient *http.Client
	tokens     TokenProvider
}

func New(tokens TokenProvider) *AlisClient {
	transport := &http.Transport{
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
		ForceAttemptHTTP2: true,
	}

	return &AlisClient{
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   120 * time.Second,
		},
		tokens: tokens,
	}
}

func (c *AlisClient) Close() error {
	c.httpClient.CloseIdleConnections()
	return nil
}

// FetchURL makes an authenticated GET request to url, optionally with a Range header for
// incremental fetching. Returns the response body and the new byte offset.
func (c *AlisClient) FetchURL(ctx context.Context, url string, byteOffset int64) ([]byte, int64, error) {
	token, err := c.tokens.Token()
	if err != nil {
		return nil, 0, fmt.Errorf("auth: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if byteOffset > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", byteOffset))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()

	// 416 = no new bytes yet (Range past end-of-file)
	if resp.StatusCode == http.StatusRequestedRangeNotSatisfiable {
		return nil, byteOffset, nil
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return nil, 0, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return body, byteOffset + int64(len(body)), nil
}

// doGRPC sends a gRPC request and handles the response including trailers.
// DoGRPC sends a gRPC request over HTTP/2 to the gRPC endpoint.
func (c *AlisClient) DoGRPC(ctx context.Context, method string, protoBytes []byte) ([]byte, int, string, error) {
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
	defer func() { _ = resp.Body.Close() }()

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
// DoGRPC sends a gRPC request over HTTP/2 to the gRPC endpoint.
func (c *AlisClient) DoGRPCWeb(ctx context.Context, host, method string, protoBytes []byte) ([]byte, int, string, error) {
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
	defer func() { _ = resp.Body.Close() }()

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

	dataFrame, grpcStatus, grpcMessage, err := DecodeGRPCWebTextFrames(rawBody)
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

// DecodeGRPCWebTextFrames decodes a grpc-web-text body. The wire format is
// base64-encoded frames with a 5-byte prefix (flags + big-endian length).
// DecodeGRPCWebTextFrames decodes a grpc-web-text body.
func DecodeGRPCWebTextFrames(rawBody []byte) (dataFrame []byte, grpcStatus int, grpcMsg string, err error) {
	clean := strings.Map(func(r rune) rune {
		switch r {
		case '\n', '\r', ' ', '\t':
			return -1
		}
		return r
	}, string(rawBody))

	pos := 0
	for pos+8 <= len(clean) {
		hdr, e := base64.StdEncoding.DecodeString(clean[pos : pos+8])
		if e != nil || len(hdr) < 5 {
			break
		}

		flags := hdr[0]
		frameLen := int(hdr[1])<<24 | int(hdr[2])<<16 | int(hdr[3])<<8 | int(hdr[4])

		b64Len := ((5 + frameLen + 2) / 3) * 4
		if pos+b64Len > len(clean) {
			break
		}

		frameBytes, e := base64.StdEncoding.DecodeString(clean[pos : pos+b64Len])
		if e != nil {
			break
		}
		pos += b64Len

		if len(frameBytes) < 5+frameLen {
			break
		}
		payload := frameBytes[5 : 5+frameLen]

		if flags == 0x80 {
			grpcStatus, grpcMsg = ParseGRPCWebTrailer(payload)
		} else if dataFrame == nil {
			header := []byte{flags, byte(frameLen >> 24), byte(frameLen >> 16), byte(frameLen >> 8), byte(frameLen)}
			dataFrame = append(header, payload...)
		}
	}
	return
}

// parseGRPCWebTrailer parses the trailer frame body for grpc-status and grpc-message.
// ParseGRPCWebTrailer parses the trailer frame body for grpc-status and grpc-message.
func ParseGRPCWebTrailer(data []byte) (int, string) {
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
func marshalRunDefineRequest(neuron, commit string) []byte {
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

// MarshalGetOperationRequest builds protobuf bytes for google.longrunning.GetOperationRequest.
func MarshalGetOperationRequest(name string) []byte {
	var buf []byte
	if name != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, name)
	}
	return buf
}

// RunDefine starts a Define operation.
func (c *AlisClient) RunDefine(ctx context.Context, req *dbdv1.RunDefineRequest) (*dbdv1.Operation, error) {
	method := "alis.os.dbd.v1.DbdService/RunDefine"
	protoBytes := marshalRunDefineRequest(req.Neuron, req.Commit)

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, method, protoBytes)
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
	protoBytes := MarshalGetOperationRequest(name)

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, method, protoBytes)
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
//
//	1=name (string), 2=metadata (Any), 3=done (bool/varint), 4=error (Status), 5=response (Any)
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
				code, msg := ParseStatus(b)
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
	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.glass.v1.GlassService/ExplainDefine", protoBytes)
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
// images is a map of dockerfile path (relative to build repo root) → action (1=BUILD, 2=RETAG).
// Proto map<string, enum> is encoded as repeated BytesType field (field 3), each entry: field1=key, field2=varint.
func marshalRunBuildRequest(neuron, commit string, images map[string]dbdv1.RunBuildAction) []byte {
	var buf []byte
	if neuron != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, neuron)
	}
	if commit != "" {
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendString(buf, commit)
	}
	for path, action := range images {
		var entry []byte
		entry = protowire.AppendTag(entry, 1, protowire.BytesType)
		entry = protowire.AppendString(entry, path)
		entry = protowire.AppendTag(entry, 2, protowire.VarintType)
		entry = protowire.AppendVarint(entry, uint64(action))
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendBytes(buf, entry)
	}
	return buf
}

// RunBuild starts a Build operation.
func (c *AlisClient) RunBuild(ctx context.Context, req *dbdv1.RunBuildRequest) (*dbdv1.Operation, error) {
	method := "alis.os.dbd.v1.DbdService/RunBuild"
	protoBytes := marshalRunBuildRequest(req.Neuron, req.Commit, req.Images)

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, method, protoBytes)
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

// ParseBuildResponse extracts RunBuildResponse from a completed operation's result field.
// Field 5 of the Operation holds a google.protobuf.Any:
//
//	field 1 = type_url (string), field 2 = value (RunBuildResponse proto bytes).
//
// RunBuildResponse fields: 1=neuronVersion, 2=buildLogsUrl, 3=deployments, 4=version.
// ParseBuildResponse extracts build response data from a completed operation.
func ParseBuildResponse(op *dbdv1.Operation) *RunBuildResponseData {
	resp, ok := op.Result.(*dbdv1.OperationResponse)
	if !ok || resp == nil || resp.Value == nil {
		return nil
	}

	// Unwrap the google.protobuf.Any — field 2 holds the actual RunBuildResponse bytes.
	anyBytes := resp.Value.Value
	var responseBytes []byte
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
				responseBytes = b
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

	if len(responseBytes) == 0 {
		return nil
	}

	// Parse RunBuildResponse: 1=neuronVersion, 2=buildLogsUrl, 4=version.
	result := &RunBuildResponseData{}
	data := responseBytes
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

// UnpackBuildMetadata extracts RunBuildMetadata from an operation's metadata Any.
// UnpackBuildMetadata extracts build metadata from a completed operation.
func UnpackBuildMetadata(op *dbdv1.Operation) *RunBuildMetadata {
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

// marshalRunDeployRequest builds protobuf bytes for alis.os.dbd.v1.RunDeployRequest.
// Proto fields: 1=environments (repeated string), 2=neuron, 3=version, 4=plan_only (bool), 5=beta (bool).
func marshalRunDeployRequest(environments []string, neuron, version string, planOnly, beta bool) []byte {
	var buf []byte
	for _, env := range environments {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, env)
	}
	if neuron != "" {
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendString(buf, neuron)
	}
	if version != "" {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendString(buf, version)
	}
	if planOnly {
		buf = protowire.AppendTag(buf, 4, protowire.VarintType)
		buf = protowire.AppendVarint(buf, 1)
	}
	if beta {
		buf = protowire.AppendTag(buf, 5, protowire.VarintType)
		buf = protowire.AppendVarint(buf, 1)
	}
	return buf
}

// RunDeploy starts a Deploy operation.
func (c *AlisClient) RunDeploy(ctx context.Context, req *dbdv1.RunDeployRequest) (*dbdv1.Operation, error) {
	method := "alis.os.dbd.v1.DbdService/RunDeploy"
	protoBytes := marshalRunDeployRequest(req.Environments, req.Neuron, req.Version, req.PlanOnly, req.Beta)

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, method, protoBytes)
	if err != nil {
		return nil, fmt.Errorf("RunDeploy: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("RunDeploy: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("RunDeploy: response too short: %d bytes", len(body))
	}
	return parseOperation(body[5:])
}

// RunDeployMetadata holds progress info for a running Deploy operation.
// Proto fields: 1=version, 2=deployments (repeated DeploymentInfo), 3=notes.
type RunDeployMetadata struct {
	Version     string
	Deployments []*DeployInfo
	Notes       string
}

// DeployInfo is a single deployment entry from RunDeployMetadata.
// Proto fields: 1=logs_url.
type DeployInfo struct {
	LogsURL string
}

// UnpackDeployMetadata extracts RunDeployMetadata from an operation's metadata Any.
// UnpackDeployMetadata extracts deploy metadata from a completed operation.
func UnpackDeployMetadata(op *dbdv1.Operation) *RunDeployMetadata {
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
	meta := &RunDeployMetadata{}
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
				meta.Version = string(b)
			case 2:
				di := parseDeployInfo(b)
				meta.Deployments = append(meta.Deployments, di)
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

// marshalFinishLocalBuildRequest builds protobuf bytes for
// alis.os.resources.products.v1.FinishLocalBuildRequest.
// field 1: neuronVersion (string) — Docker image tag e.g. "hubspot-v1:12345678"
// field 2: failed (bool)
func marshalFinishLocalBuildRequest(neuronVersion string, failed bool) []byte {
	var buf []byte
	if neuronVersion != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, neuronVersion)
	}
	if failed {
		buf = protowire.AppendTag(buf, 2, protowire.VarintType)
		buf = protowire.AppendVarint(buf, 1)
	}
	return buf
}

// FinishLocalBuild notifies the backend that a local Docker build completed.
// neuronVersion is the Docker image tag (e.g. "hubspot-v1:12345678").
// failed is true when docker build exited non-zero.
func (c *AlisClient) FinishLocalBuild(ctx context.Context, neuronVersion string, failed bool) error {
	protoBytes := marshalFinishLocalBuildRequest(neuronVersion, failed)
	_, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.resources.products.v1.Service/FinishLocalBuild", protoBytes)
	if err != nil {
		return fmt.Errorf("FinishLocalBuild: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("FinishLocalBuild: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// parseDeployInfo parses RunDeployMetadata.Deployment:
// field 1=name (resource name), field 2=state (enum), field 3=logs_url (HTTP URL).
func parseDeployInfo(data []byte) *DeployInfo {
	di := &DeployInfo{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return di
			}
			if num == 3 {
				di.LogsURL = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return di
			}
			data = data[m:]
		}
	}
	return di
}

// NeuronVersionItem is a single entry from ListNeuronVersions.
// Proto (alis.os.neurons.v1.NeuronVersion): 1=name, 2=version, 3=protoCommit, 4=buildCommit,
// 7=state (enum), 8=logsUrl, 98=create_time (Timestamp).
// State enum: BUILT=1, RETAGGED=2, BUILDING=3, FAILED=4.
type NeuronVersionItem struct {
	Name        string
	Version     string
	BuildCommit string
	LogsURL     string
	State       int32
	CreateTime  int64 // unix seconds from Timestamp.seconds (field 1)
}

// ListNeuronVersions returns available built/retagged versions for a neuron.
// parent is the neuron resource name e.g. "organisations/x/products/y/neurons/bff-v1".
func (c *AlisClient) ListNeuronVersions(ctx context.Context, parent string) ([]*NeuronVersionItem, error) {
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, parent)
	// page_size=100
	req = protowire.AppendTag(req, 2, protowire.VarintType)
	req = protowire.AppendVarint(req, 100)

	method := "alis.os.neurons.v1.NeuronVersionsService/ListNeuronVersions"
	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, method, req)
	if err != nil {
		return nil, fmt.Errorf("ListNeuronVersions: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListNeuronVersions: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListNeuronVersions: response too short")
	}
	return parseNeuronVersionsList(body[5:]), nil
}

func parseNeuronVersionsList(data []byte) []*NeuronVersionItem {
	var items []*NeuronVersionItem
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
			if num == 1 { // neuron_versions (repeated message)
				items = append(items, parseNeuronVersion(b))
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
	return items
}

func parseNeuronVersion(data []byte) *NeuronVersionItem {
	item := &NeuronVersionItem{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch {
		case typ == protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return item
			}
			switch num {
			case 1:
				item.Name = string(b)
			case 2:
				item.Version = string(b)
			case 4:
				item.BuildCommit = string(b)
			case 8:
				item.LogsURL = string(b)
			case 98: // create_time Timestamp: field 1=seconds
				item.CreateTime = parseTimestampSeconds(b)
			}
			data = data[m:]
		case typ == protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return item
			}
			if num == 7 { // state
				item.State = int32(v)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return item
			}
			data = data[m:]
		}
	}
	return item
}

func parseTimestampSeconds(data []byte) int64 {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.VarintType {
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				break
			}
			if num == 1 { // seconds
				return int64(v)
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
	return 0
}

// parseStatus parses google.rpc.Status: field 1=code (varint), field 2=message (string).
// ParseStatus extracts a status code and message from a google.rpc.Status proto.
func ParseStatus(data []byte) (int32, string) {
	var code int32
	var message string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return code, message
			}
			if num == 1 {
				code = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return code, message
			}
			if num == 2 {
				message = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return code, message
			}
			data = data[m:]
		}
	}
	return code, message
}

// UnpackDefineMetadata extracts RunDefineMetadata from an operation's metadata.
// The metadata field in the Operation is a google.protobuf.Any containing RunDefineMetadata.
// We parse the Any.value bytes directly with protowire.
// UnpackDefineMetadata extracts define metadata from a completed operation.
func UnpackDefineMetadata(op *dbdv1.Operation) *dbdv1.RunDefineMetadata {
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

// ── GeneratePackageScripts ────────────────────────────────────────────────────
// alis.os.vscode.v2.VscodeService/GeneratePackageScripts

// vscodeLanguage enum values for alis.os.vscode.v2.Language
const (
	VscodeLanguageGO     = 1
	VscodeLanguageNODE   = 2
	VscodeLanguagePYTHON = 3
	VscodeLanguageDART   = 4
)

// vscodePlatform enum values for alis.os.vscode.v2.Platform
const (
	vscodePlatformWINDOWS = 1
	vscodePlatformLINUX   = 2
	vscodePlatformMACOS   = 3
)

// PackageScriptLocation is an input location for GeneratePackageScripts.
type PackageScriptLocation struct {
	WorkingDirectory string
	Language         int
	BuildDirectory   string
}

// PackageScript holds server-generated shell commands for one language folder.
type PackageScript struct {
	Name           string `json:"name"` // display name: "asana-v1" or "asana-v1/proto"
	Title          string `json:"title"`
	WorkDir        string `json:"workDir"`
	Lang           string `json:"lang"`
	Install        string `json:"install"`
	Upgrade        string `json:"upgrade"`
	UpgradeDefined string `json:"upgradeDefined"`
	Add            string `json:"add"`
}

// GeneratePackageScripts calls VscodeService/GeneratePackageScripts and returns
// the shell commands for each language folder.
func (c *AlisClient) GeneratePackageScripts(ctx context.Context, definition string, locations []PackageScriptLocation) ([]PackageScript, error) {
	protoBytes := marshalGeneratePackageScriptsRequest(definition, locations)

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.vscode.v2.VscodeService/GeneratePackageScripts", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GeneratePackageScripts: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GeneratePackageScripts: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GeneratePackageScripts: response too short (%d bytes)", len(body))
	}
	return parseGeneratePackageScriptsResponse(body[5:])
}

func marshalGeneratePackageScriptsRequest(definition string, locations []PackageScriptLocation) []byte {
	var buf []byte

	// field 1: definition
	if definition != "" {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, definition)
	}

	// field 2: repeated Location
	for _, loc := range locations {
		var inner []byte
		if loc.WorkingDirectory != "" {
			inner = protowire.AppendTag(inner, 1, protowire.BytesType)
			inner = protowire.AppendString(inner, loc.WorkingDirectory)
		}
		if loc.Language != 0 {
			inner = protowire.AppendTag(inner, 2, protowire.VarintType)
			inner = protowire.AppendVarint(inner, uint64(loc.Language))
		}
		if loc.BuildDirectory != "" {
			inner = protowire.AppendTag(inner, 3, protowire.BytesType)
			inner = protowire.AppendString(inner, loc.BuildDirectory)
		}
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendBytes(buf, inner)
	}

	// field 3: excludeGcloudAuth = true
	buf = protowire.AppendTag(buf, 3, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1)

	// field 4: targetPlatform
	if p := currentVscodePlatform(); p != 0 {
		buf = protowire.AppendTag(buf, 4, protowire.VarintType)
		buf = protowire.AppendVarint(buf, uint64(p))
	}

	return buf
}

func currentVscodePlatform() int {
	switch runtime.GOOS {
	case "windows":
		return vscodePlatformWINDOWS
	case "linux":
		return vscodePlatformLINUX
	default:
		return vscodePlatformMACOS
	}
}

func parseGeneratePackageScriptsResponse(data []byte) ([]PackageScript, error) {
	langByField := map[protowire.Number]string{1: "go", 2: "node", 3: "python", 4: "dart"}
	var scripts []PackageScript
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return scripts, nil
			}
			if langStr, ok := langByField[num]; ok {
				scripts = append(scripts, parsePackageScript(b, langStr))
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return scripts, nil
			}
			data = data[m:]
		}
	}
	return scripts, nil
}

func parsePackageScript(data []byte, langStr string) PackageScript {
	s := PackageScript{Lang: langStr}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return s
			}
			switch num {
			case 1:
				s.Title = string(b)
			case 2:
				s.WorkDir = string(b)
			case 4:
				s.Install = parseStringValue(b)
			case 5:
				s.Upgrade = parseStringValue(b)
			case 6:
				s.UpgradeDefined = parseStringValue(b)
			case 7:
				s.Add = parseStringValue(b)
			}
			data = data[m:]
		case protowire.VarintType:
			_, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return s
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return s
			}
			data = data[m:]
		}
	}
	return s
}

// parseStringValue unwraps a google.protobuf.StringValue (field 1 = string).
func parseStringValue(data []byte) string {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType && num == 1 {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			return string(b)
		}
		m := protowire.ConsumeFieldValue(num, typ, data)
		if m < 0 {
			break
		}
		data = data[m:]
	}
	return ""
}

// ── Package Registry Auth ─────────────────────────────────────────────────────
// Mirrors the extension's GT() + sre() calls that run before package scripts.

// gcpRegions is the full list used by the extension to write .netrc entries.
var gcpRegions = []string{
	"northamerica-northeast1", "northamerica-northeast2", "northamerica-south1",
	"us-central1", "us-east1", "us-east4", "us-east5", "us-south1",
	"us-west1", "us-west2", "us-west3", "us-west4",
	"southamerica-east1", "southamerica-west1",
	"europe-central2", "europe-north1", "europe-north2", "europe-southwest1",
	"europe-west1", "europe-west2", "europe-west3", "europe-west4",
	"europe-west6", "europe-west8", "europe-west9", "europe-west10", "europe-west12",
	"me-central1", "me-central2", "me-west1",
	"asia-east1", "asia-east2",
	"asia-northeast1", "asia-northeast2", "asia-northeast3",
	"asia-south1", "asia-south2",
	"asia-southeast1", "asia-southeast2",
	"australia-southeast1", "australia-southeast2",
	"africa-south1",
}

type dartPubHost struct {
	Host  string
	Token string
}

// AuthSetupPackages authenticates against Google Artifact Registry and writes
// ~/.netrc, ~/.npmrc (and optionally dart pub-tokens.json) before running scripts.
func (c *AlisClient) AuthSetupPackages(ctx context.Context, org, product string, hasDart bool) error {
	token, err := c.authArtifactRegistry(ctx, org, product)
	if err != nil {
		return fmt.Errorf("auth artifact registry: %w", err)
	}
	if err := writeNetrc(token); err != nil {
		return fmt.Errorf("write .netrc: %w", err)
	}
	npmHosts, err := c.retrieveProductNpmHosts(ctx, org, product)
	if err != nil {
		return fmt.Errorf("retrieve npm hosts: %w", err)
	}
	if len(npmHosts) > 0 {
		if err := writeNpmrc(npmHosts, token); err != nil {
			return fmt.Errorf("write .npmrc: %w", err)
		}
	}
	if hasDart {
		pubHosts, err := c.generateLanguagePackageConfigsDart(ctx, org, product)
		if err != nil {
			return fmt.Errorf("dart package configs: %w", err)
		}
		if len(pubHosts) > 0 {
			if err := writeDartPubTokens(pubHosts); err != nil {
				return fmt.Errorf("write dart pub tokens: %w", err)
			}
		}
	}
	return nil
}

// authArtifactRegistry calls alis.os.gcloud.v1.AuthService/AuthArtifactRegistry.
// Request field 1 = product resource; response field 1 = access token.
func (c *AlisClient) authArtifactRegistry(ctx context.Context, org, product string) (string, error) {
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, fmt.Sprintf("organisations/%s/products/%s", org, product))

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.gcloud.v1.AuthService/AuthArtifactRegistry", req)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short")
	}
	data := body[5:]
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		if typ == protowire.BytesType && num == 1 {
			return string(b), nil
		}
		data = data[m:]
	}
	return "", fmt.Errorf("accessToken not in response")
}

// retrieveProductNpmHosts calls VscodeService/RetrieveProductNpmHosts.
// Request field 1 = product resource; response field 1 = repeated string (hosts).
func (c *AlisClient) retrieveProductNpmHosts(ctx context.Context, org, product string) ([]string, error) {
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, fmt.Sprintf("organisations/%s/products/%s", org, product))

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.vscode.v2.VscodeService/RetrieveProductNpmHosts", req)
	if err != nil {
		return nil, err
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, nil
	}
	data := body[5:]
	var hosts []string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		if num == 1 {
			hosts = append(hosts, string(b))
		}
		data = data[m:]
	}
	return hosts, nil
}

// generateLanguagePackageConfigsDart calls VscodeService/GenerateLanguagePackageConfigs
// and returns the dart pub host list.
// Request field 1 = definition; response field 3 = DartConfig (field 1 = repeated PubHost).
func (c *AlisClient) generateLanguagePackageConfigsDart(ctx context.Context, org, product string) ([]dartPubHost, error) {
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, fmt.Sprintf("definitions/%s.%s", org, product))

	body, grpcStatus, grpcMsg, err := c.DoGRPCWeb(ctx, alisDbdHost, "alis.os.vscode.v2.VscodeService/GenerateLanguagePackageConfigs", req)
	if err != nil {
		return nil, err
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, nil
	}
	data := body[5:]
	var hosts []dartPubHost
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		if num == 3 { // DartConfig
			hosts = parseDartConfig(b)
		}
		data = data[m:]
	}
	return hosts, nil
}

func parseDartConfig(data []byte) []dartPubHost {
	var hosts []dartPubHost
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		if num == 1 { // repeated PubHost
			hosts = append(hosts, parseDartPubHostMsg(b))
		}
		data = data[m:]
	}
	return hosts
}

func parseDartPubHostMsg(data []byte) dartPubHost {
	var h dartPubHost
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		switch num {
		case 1:
			h.Host = string(b)
		case 2:
			h.Token = string(b)
		}
		data = data[m:]
	}
	return h
}

// writeNetrc writes oauth2 credentials for all GCP regions to ~/.netrc.
// Existing pkg.dev entries are replaced; all other entries are preserved.
func writeNetrc(token string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	netrcPath := filepath.Join(home, ".netrc")

	existing := ""
	if b, err := os.ReadFile(netrcPath); err == nil {
		existing = string(b)
	}

	// Keep lines that don't reference *.pkg.dev hosts.
	var kept []string
	for _, line := range strings.Split(existing, "\n") {
		if strings.Contains(line, ".pkg.dev") {
			continue
		}
		kept = append(kept, line)
	}

	var buf strings.Builder
	trimmed := strings.TrimRight(strings.Join(kept, "\n"), "\n ")
	if trimmed != "" {
		buf.WriteString(trimmed + "\n")
	}
	for _, region := range gcpRegions {
		fmt.Fprintf(&buf, "machine %s-docker.pkg.dev login oauth2accesstoken password %s\n", region, token)
		fmt.Fprintf(&buf, "machine %s-go.pkg.dev login oauth2accesstoken password %s\n", region, token)
	}
	return os.WriteFile(netrcPath, []byte(buf.String()), 0600)
}

// writeNpmrc writes _authToken entries for each npm host to ~/.npmrc.
// Existing entries for those hosts are replaced.
func writeNpmrc(hosts []string, token string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	npmrcPath := filepath.Join(home, ".npmrc")

	existing := ""
	if b, err := os.ReadFile(npmrcPath); err == nil {
		existing = string(b)
	}

	hostSet := make(map[string]bool, len(hosts))
	for _, h := range hosts {
		hostSet[h] = true
	}

	var kept []string
	for _, line := range strings.Split(existing, "\n") {
		trimmed := strings.TrimSpace(line)
		isAuthLine := false
		for _, h := range hosts {
			if strings.HasPrefix(trimmed, "//"+h+":_authToken=") {
				isAuthLine = true
				break
			}
		}
		if !isAuthLine {
			kept = append(kept, line)
		}
	}

	var buf strings.Builder
	base := strings.TrimRight(strings.Join(kept, "\n"), "\n ")
	if base != "" {
		buf.WriteString(base + "\n")
	}
	for _, h := range hosts {
		fmt.Fprintf(&buf, "//%s:_authToken=%s\n", h, token)
	}
	return os.WriteFile(npmrcPath, []byte(buf.String()), 0600)
}

// dartPubTokensPath returns the platform-specific path for dart pub-tokens.json,
// matching the extension's GetDartPubTokensPath logic.
func dartPubTokensPath() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		if appdata := os.Getenv("APPDATA"); appdata != "" {
			return filepath.Join(appdata, "dart", "pub-tokens.json")
		}
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "dart", "pub-tokens.json")
	default:
		if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
			return filepath.Join(xdg, "dart", "pub-tokens.json")
		}
		return filepath.Join(home, ".config", "dart", "pub-tokens.json")
	}
	return filepath.Join(home, ".config", "dart", "pub-tokens.json")
}

// writeDartPubTokens updates the dart pub-tokens.json file with new host tokens.
func writeDartPubTokens(hosts []dartPubHost) error {
	path := dartPubTokensPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	type pubEntry struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	}
	type pubTokens struct {
		Version int        `json:"version"`
		Hosted  []pubEntry `json:"hosted"`
	}

	var tokens pubTokens
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &tokens)
	}
	if tokens.Version == 0 {
		tokens.Version = 1
	}
	if tokens.Hosted == nil {
		tokens.Hosted = []pubEntry{}
	}

	for _, h := range hosts {
		updated := false
		for i := range tokens.Hosted {
			if tokens.Hosted[i].URL == h.Host {
				tokens.Hosted[i].Token = h.Token
				updated = true
				break
			}
		}
		if !updated {
			tokens.Hosted = append(tokens.Hosted, pubEntry{URL: h.Host, Token: h.Token})
		}
	}

	b, err := json.Marshal(tokens)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
