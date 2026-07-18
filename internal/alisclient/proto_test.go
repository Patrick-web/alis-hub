package alisclient

import (
	"testing"

	"google.golang.org/protobuf/encoding/protowire"
)

func TestParseStatus(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		wantCode int32
		wantMsg  string
	}{
		{
			name:     "empty",
			data:     nil,
			wantCode: 0,
			wantMsg:  "",
		},
		{
			name: "code only",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 1, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 5)
				return buf
			}(),
			wantCode: 5,
			wantMsg:  "",
		},
		{
			name: "message only",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendString(buf, "something went wrong")
				return buf
			}(),
			wantCode: 0,
			wantMsg:  "something went wrong",
		},
		{
			name: "code and message",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 1, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 13)
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendString(buf, "internal error")
				return buf
			}(),
			wantCode: 13,
			wantMsg:  "internal error",
		},
		{
			name: "reversed field order",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendString(buf, "error first")
				buf = protowire.AppendTag(buf, 1, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 7)
				return buf
			}(),
			wantCode: 7,
			wantMsg:  "error first",
		},
		{
			name: "unknown fields ignored",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 1, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 3)
				buf = protowire.AppendTag(buf, 3, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 99)
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendString(buf, "msg")
				return buf
			}(),
			wantCode: 3,
			wantMsg:  "msg",
		},
		{
			name: "zero code with message",
			data: func() []byte {
				var buf []byte
				buf = protowire.AppendTag(buf, 1, protowire.VarintType)
				buf = protowire.AppendVarint(buf, 0)
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendString(buf, "OK")
				return buf
			}(),
			wantCode: 0,
			wantMsg:  "OK",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotCode, gotMsg := ParseStatus(tt.data)
			if gotCode != tt.wantCode {
				t.Errorf("ParseStatus() code = %d, want %d", gotCode, tt.wantCode)
			}
			if gotMsg != tt.wantMsg {
				t.Errorf("ParseStatus() msg = %q, want %q", gotMsg, tt.wantMsg)
			}
		})
	}
}

func TestParseStatusTruncated(t *testing.T) {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 5)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, "hello")

	// Truncate to remove the string length byte.
	truncated := buf[:len(buf)-1]
	code, msg := ParseStatus(truncated)
	if code != 5 {
		t.Errorf("ParseStatus(truncated) code = %d, want 5", code)
	}
	if msg != "" {
		t.Errorf("ParseStatus(truncated) msg = %q, want empty (message field truncated)", msg)
	}
}

func TestMarshalGetOperationRequest(t *testing.T) {
	tests := []struct {
		name string
		op   string
	}{
		{"empty", ""},
		{"simple", "operations/abc-123"},
		{"long", "organisations/org/products/prod/neurons/n-v1/operations/op-456"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := MarshalGetOperationRequest(tt.op)
			if tt.op == "" {
				if len(data) != 0 {
					t.Errorf("expected empty output for empty name, got %d bytes", len(data))
				}
				return
			}

			// Verify field 1 is present and contains the name.
			num, typ, n := protowire.ConsumeTag(data)
			if n < 0 {
				t.Fatal("failed to consume tag")
			}
			if num != 1 {
				t.Errorf("field num = %d, want 1", num)
			}
			if typ != protowire.BytesType {
				t.Errorf("field type = %d, want %d (bytes)", typ, protowire.BytesType)
			}

			s, m := protowire.ConsumeBytes(data[n:])
			if m < 0 {
				t.Fatal("failed to consume bytes")
			}
			if string(s) != tt.op {
				t.Errorf("value = %q, want %q", string(s), tt.op)
			}
		})
	}
}

func TestParseGRPCWebTrailer(t *testing.T) {
	tests := []struct {
		name       string
		data       string
		wantStatus int
		wantMsg    string
	}{
		{
			name:       "empty",
			data:       "",
			wantStatus: 0,
			wantMsg:    "",
		},
		{
			name:       "status only",
			data:       "grpc-status: 0",
			wantStatus: 0,
			wantMsg:    "",
		},
		{
			name:       "status and message",
			data:       "grpc-status: 5\r\ngrpc-message: not found",
			wantStatus: 5,
			wantMsg:    "not found",
		},
		{
			name:       "status and message reversed",
			data:       "grpc-message: out of memory\r\ngrpc-status: 8",
			wantStatus: 8,
			wantMsg:    "out of memory",
		},
		{
			name:       "with extra whitespace",
			data:       "grpc-status:   13  \r\ngrpc-message:   internal   ",
			wantStatus: 13,
			wantMsg:    "internal",
		},
		{
			name:       "mixed case headers",
			data:       "Grpc-Status: 2\r\nGRPC-MESSAGE: bad request",
			wantStatus: 2,
			wantMsg:    "bad request",
		},
		{
			name:       "non-grpc headers ignored",
			data:       "content-type: application/json\r\ngrpc-status: 0",
			wantStatus: 0,
			wantMsg:    "",
		},
		{
			name:       "status with extra metadata",
			data:       "grpc-status: 0\r\ngrpc-message: \r\ncustom-header: value",
			wantStatus: 0,
			wantMsg:    "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotStatus, gotMsg := ParseGRPCWebTrailer([]byte(tt.data))
			if gotStatus != tt.wantStatus {
				t.Errorf("ParseGRPCWebTrailer() status = %d, want %d", gotStatus, tt.wantStatus)
			}
			if gotMsg != tt.wantMsg {
				t.Errorf("ParseGRPCWebTrailer() msg = %q, want %q", gotMsg, tt.wantMsg)
			}
		})
	}
}

func TestParseGRPCWebTrailerInvalidStatus(t *testing.T) {
	status, _ := ParseGRPCWebTrailer([]byte("grpc-status: not-a-number"))
	if status != 0 {
		t.Errorf("expected status 0 for invalid number, got %d", status)
	}
}

func TestDecodeGRPCWebTextFramesDataOnly(t *testing.T) {
	// Build a single data frame (flags=0x00) with payload "hello".
	var frame []byte
	frame = append(frame, 0x00) // flags
	frame = append(frame, 0x00, 0x00, 0x00, 0x05) // len = 5
	frame = append(frame, []byte("hello")...)

	// Base64 encode the frame.
	rawBody := []byte(encodeBase64(frame))

	dataFrame, grpcStatus, grpcMsg, err := DecodeGRPCWebTextFrames(rawBody)
	if err != nil {
		t.Fatalf("DecodeGRPCWebTextFrames() error = %v", err)
	}
	if grpcStatus != 0 {
		t.Errorf("grpcStatus = %d, want 0", grpcStatus)
	}
	if grpcMsg != "" {
		t.Errorf("grpcMsg = %q, want empty", grpcMsg)
	}
	if len(dataFrame) < 5 {
		t.Fatalf("dataFrame too short: %d bytes", len(dataFrame))
	}
	payload := dataFrame[5:]
	if string(payload) != "hello" {
		t.Errorf("payload = %q, want %q", string(payload), "hello")
	}
}

func TestDecodeGRPCWebTextFramesWithTrailer(t *testing.T) {
	// Data frame.
	var dataFrame []byte
	dataFrame = append(dataFrame, 0x00)
	dataFrame = append(dataFrame, 0x00, 0x00, 0x00, 0x03)
	dataFrame = append(dataFrame, []byte("abc")...)

	// Trailer frame.
	var trailer []byte
	trailer = append(trailer, 0x80)
	trailerBody := "grpc-status: 5\r\ngrpc-message: not found"
	trailer = append(trailer, 0x00, 0x00, 0x00, byte(len(trailerBody)))
	trailer = append(trailer, []byte(trailerBody)...)

	// Concatenate base64 of both frames.
	combined := encodeBase64(dataFrame) + encodeBase64(trailer)
	rawBody := []byte(combined)

	dataFrameOut, grpcStatus, grpcMsg, err := DecodeGRPCWebTextFrames(rawBody)
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if grpcStatus != 5 {
		t.Errorf("grpcStatus = %d, want 5", grpcStatus)
	}
	if grpcMsg != "not found" {
		t.Errorf("grpcMsg = %q, want 'not found'", grpcMsg)
	}
	if len(dataFrameOut) < 5 {
		t.Fatalf("dataFrame too short: %d bytes", len(dataFrameOut))
	}
	if string(dataFrameOut[5:]) != "abc" {
		t.Errorf("payload = %q, want 'abc'", string(dataFrameOut[5:]))
	}
}

func TestDecodeGRPCWebTextFramesEmpty(t *testing.T) {
	frame, status, msg, err := DecodeGRPCWebTextFrames(nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if status != 0 {
		t.Errorf("status = %d, want 0", status)
	}
	if msg != "" {
		t.Errorf("msg = %q, want empty", msg)
	}
	if frame != nil {
		t.Errorf("frame = %v, want nil", frame)
	}
}

func TestDecodeGRPCWebTextFramesGarbage(t *testing.T) {
	frame, status, msg, err := DecodeGRPCWebTextFrames([]byte("not-valid-base64!!!===="))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if status != 0 {
		t.Errorf("status = %d, want 0", status)
	}
	if msg != "" {
		t.Errorf("msg = %q, want empty", msg)
	}
	if frame != nil {
		t.Errorf("frame = %v, want nil", frame)
	}
}

func TestDecodeGRPCWebTextFramesWithWhitespace(t *testing.T) {
	var frame []byte
	frame = append(frame, 0x00)
	frame = append(frame, 0x00, 0x00, 0x00, 0x01)
	frame = append(frame, 'x')

	b64 := encodeBase64(frame)
	// Add newlines and spaces that the decoder should strip.
	withWS := b64[:4] + "\n" + b64[4:8] + "  \r\n" + b64[8:]
	rawBody := []byte(withWS)

	dataFrame, _, _, err := DecodeGRPCWebTextFrames(rawBody)
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if len(dataFrame) < 6 || dataFrame[5] != 'x' {
		t.Errorf("payload = %v, want 'x'", dataFrame[5:])
	}
}

// encodeBase64 returns the standard base64 encoding of data.
func encodeBase64(data []byte) string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	var out []byte
	for i := 0; i < len(data); i += 3 {
		b := uint32(data[i]) << 16
		if i+1 < len(data) {
			b |= uint32(data[i+1]) << 8
		}
		if i+2 < len(data) {
			b |= uint32(data[i+2])
		}
		out = append(out,
			alphabet[(b>>18)&0x3f],
			alphabet[(b>>12)&0x3f],
		)
		if i+1 < len(data) {
			out = append(out, alphabet[(b>>6)&0x3f])
			if i+2 < len(data) {
				out = append(out, alphabet[b&0x3f])
			} else {
				out = append(out, '=')
			}
		} else {
			out = append(out, '=', '=')
		}
	}
	return string(out)
}
