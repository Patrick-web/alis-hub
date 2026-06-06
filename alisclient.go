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
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/structpb"
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
func parseOperation(data []byte) (*dbdv1.Operation, error) {
	op := &dbdv1.Operation{}

	for len(data) > 0 {
		num, _, n := protowire.ConsumeTag(data)
		if n < 0 {
			return op, nil
		}
		v, m := protowire.ConsumeVarint(data[n:])
		if m < 0 {
			return op, nil
		}
		length := int(v)
		total := n + m + length
		if total > len(data) {
			return op, nil
		}
		chunk := data[n+m : total]
		data = data[total:]

		switch num {
		case 1: // name
			op.Name = string(chunk)
		case 2: // metadata (google.protobuf.Any)
			metaStruct := &structpb.Struct{}
			if err := proto.Unmarshal(chunk, metaStruct); err == nil {
				op.Metadata, _ = anypb.New(metaStruct)
			}
		case 3: // done
			op.Done = v != 0
		case 4: // error
			code, msg := parseStatus(chunk)
			op.Result = &dbdv1.OperationError{Code: code, Message: msg}
		case 5: // response
			op.Result = &dbdv1.OperationResponse{
				Value: &anypb.Any{Value: chunk, TypeUrl: "type.googleapis.com/alis.os.dbd.v1.RunDefineResponse"},
			}
		}
	}

	return op, nil
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
func unpackDefineMetadata(op *dbdv1.Operation) *dbdv1.RunDefineMetadata {
	if op == nil || op.Metadata == nil {
		return nil
	}
	var s structpb.Struct
	if err := op.Metadata.UnmarshalTo(&s); err != nil {
		return nil
	}
	fields := s.GetFields()
	meta := &dbdv1.RunDefineMetadata{}
	if v, ok := fields["definition"]; ok {
		meta.Definition = v.GetStringValue()
	}
	if v, ok := fields["version"]; ok {
		meta.Version = v.GetStringValue()
	}
	if v, ok := fields["notes"]; ok {
		meta.Notes = v.GetStringValue()
	}
	return meta
}
