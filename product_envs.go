package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// GetEnvironmentVariables fetches the variables for a single environment.
// envName is the full resource name, e.g. "organisations/voyage/products/vp/environments/1y2ozw66zv6p3".
func (s *ProductService) GetEnvironmentVariables(envName string) ([]EnvVariable, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GetEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("GetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetEnvironmentVariables: response too short (%d bytes)", len(body))
	}
	return parseEnvVariablesFromGetEnvironment(body[5:])
}

// retrieveDeploymentEnvs calls DeploymentsService/RetrieveDeploymentEnvs with
// migrated=true and returns all vars with their managed flag.
func (s *ProductService) retrieveDeploymentEnvs(envName string) ([]DeploymentEnvVar, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)
	buf = protowire.AppendTag(buf, 3, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1) // migrated = true

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.DeploymentsService/RetrieveDeploymentEnvs", buf)
	if err != nil {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: response too short (%d bytes)", len(body))
	}

	// Parse top-level field 2 (repeated Env) from the response payload.
	data := body[5:]
	var vars []DeploymentEnvVar
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
		data = data[m:]
		if typ != protowire.BytesType || num != 2 {
			continue
		}
		// Parse Env sub-message: field 1=name, field 2=value, field 3=managed
		var v DeploymentEnvVar
		sub := b
		for len(sub) > 0 {
			fn, ft, fn2 := protowire.ConsumeTag(sub)
			if fn2 < 0 {
				break
			}
			sub = sub[fn2:]
			switch ft {
			case protowire.BytesType:
				sb, sm := protowire.ConsumeBytes(sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
				switch fn {
				case 1:
					v.Name = string(sb)
				case 2:
					v.Value = string(sb)
				}
			case protowire.VarintType:
				sv, sm := protowire.ConsumeVarint(sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
				if fn == 3 {
					v.Managed = sv != 0
				}
			default:
				sm := protowire.ConsumeFieldValue(fn, ft, sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
			}
		}
		if v.Name != "" {
			vars = append(vars, v)
		}
	}
	return vars, nil
}

// SetEnvironmentVariables replaces all variables on an environment by calling
// UpdateEnvironment with an update_mask of "envs". Variables are field 8
// (repeated Environment.Env sub-messages: field 1=name/label, field 2=value).
func (s *ProductService) SetEnvironmentVariables(envName string, vars []EnvVariable) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	// Build environment sub-message with name + all variables
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 1, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, envName)
	for _, v := range vars {
		var varBuf []byte
		varBuf = protowire.AppendTag(varBuf, 1, protowire.BytesType)
		varBuf = protowire.AppendString(varBuf, v.Label)
		varBuf = protowire.AppendTag(varBuf, 2, protowire.BytesType)
		varBuf = protowire.AppendString(varBuf, v.Value)
		envBuf = protowire.AppendTag(envBuf, 8, protowire.BytesType)
		envBuf = protowire.AppendBytes(envBuf, varBuf)
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, marshalFieldMask([]string{"envs"}))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return fmt.Errorf("SetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("SetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// CreateEnvironment creates a new environment under the given org/product.
// envType: 1=DEV, 2=STAGING, 3=PROD. region must be a valid GCP region.
func (s *ProductService) CreateEnvironment(org, product, displayName, region string, envType int32) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)

	// Build google_project sub-message (Environment field 5): field 4=region
	var gcpBuf []byte
	gcpBuf = protowire.AppendTag(gcpBuf, 4, protowire.BytesType)
	gcpBuf = protowire.AppendString(gcpBuf, region)

	// Build environment sub-message: field 2=displayName, field 5=googleProject, field 7=type
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 2, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, displayName)
	envBuf = protowire.AppendTag(envBuf, 5, protowire.BytesType)
	envBuf = protowire.AppendBytes(envBuf, gcpBuf)
	if envType != 0 {
		envBuf = protowire.AppendTag(envBuf, 7, protowire.VarintType)
		envBuf = protowire.AppendVarint(envBuf, uint64(envType))
	}

	// CreateEnvironmentRequest: field 1=parent, field 2=environment
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/CreateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("CreateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("CreateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("CreateEnvironment: response too short (%d bytes)", len(body))
	}
	return parseEnvInfoFromEnvironment(body[5:])
}

// UpdateEnvironment updates the displayName of an existing environment.
// envName is the full resource name.
func (s *ProductService) UpdateEnvironment(envName, displayName string) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	// Build environment sub-message: field 1=name, field 2=displayName
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 1, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, envName)
	envBuf = protowire.AppendTag(envBuf, 2, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, displayName)

	// UpdateEnvironmentRequest: field 1=environment, field 2=update_mask
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, marshalFieldMask([]string{"display_name"}))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("UpdateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("UpdateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("UpdateEnvironment: response too short (%d bytes)", len(body))
	}
	return parseEnvInfoFromEnvironment(body[5:])
}

// DeleteEnvironment deletes the environment with the given full resource name.
func (s *ProductService) DeleteEnvironment(envName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/DeleteEnvironment", buf)
	if err != nil {
		return fmt.Errorf("DeleteEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("DeleteEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// generateServiceAccountKey calls EnvironmentsService/GenerateServiceAccountKey
// to mint a fresh service-account key for envName. This mirrors what the Alis
// VSCode extension downloads to .alis/key.json on every environment switch,
// so that GOOGLE_APPLICATION_CREDENTIALS always points at a key that's valid
// for the environment currently active in .env (not a stale one left behind
// by whichever environment was active before).
func (s *ProductService) generateServiceAccountKey(envName string) ([]byte, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GenerateServiceAccountKey", buf)
	if err != nil {
		return nil, fmt.Errorf("generateServiceAccountKey: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("generateServiceAccountKey: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("generateServiceAccountKey: response too short (%d bytes)", len(body))
	}

	// Top-level field 1 = ServiceAccountKey message; within it, field 3 = private_key_data bytes.
	data := body[5:]
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
		val, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num != 1 {
			continue
		}
		sub := val
		for len(sub) > 0 {
			subNum, subTyp, subN := protowire.ConsumeTag(sub)
			if subN < 0 {
				break
			}
			sub = sub[subN:]
			if subTyp != protowire.BytesType {
				sm := protowire.ConsumeFieldValue(subNum, subTyp, sub)
				if sm < 0 {
					break
				}
				sub = sub[sm:]
				continue
			}
			subVal, sm := protowire.ConsumeBytes(sub)
			if sm < 0 {
				break
			}
			sub = sub[sm:]
			if subNum == 3 {
				return subVal, nil
			}
		}
	}
	return nil, fmt.Errorf("generateServiceAccountKey: no private_key_data in response")
}

// SwitchEnvironment rewrites the local .alis/.env and .alis/key.json files to
// match the output produced by the Alis VSCode extension when switching
// environments.
func (s *ProductService) SwitchEnvironment(org, product, envName, projectID, projectNumber, region string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}

	envParts := strings.Split(envName, "/")
	envID := envParts[len(envParts)-1]

	alisDir := filepath.Join(home, "alis.build", org, "build", product, ".alis")
	envFilePath := filepath.Join(alisDir, ".env")
	keyFilePath := filepath.Join(alisDir, "key.json")

	keyData, err := s.generateServiceAccountKey(envName)
	if err != nil {
		return fmt.Errorf("generate service account key: %w", err)
	}

	vars, err := s.retrieveDeploymentEnvs(envName)
	if err != nil {
		return fmt.Errorf("retrieve deployment envs: %w", err)
	}

	var managed, nonManaged []DeploymentEnvVar
	for _, v := range vars {
		if v.Managed {
			managed = append(managed, v)
		} else {
			nonManaged = append(nonManaged, v)
		}
	}
	sort.Slice(managed, func(i, j int) bool { return managed[i].Name > managed[j].Name })
	sort.Slice(nonManaged, func(i, j int) bool { return nonManaged[i].Name > nonManaged[j].Name })

	builderURL := fmt.Sprintf("https://console.alisx.com/build/landing-zone/%s/%s/environments/%s/variables", org, product, envID)

	var sb strings.Builder
	sb.WriteString("# Alis Build Managed\n")
	for _, v := range managed {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}
	sb.WriteString("\n# Local Authentication\n")
	sb.WriteString(`GOOGLE_APPLICATION_CREDENTIALS="`)
	sb.WriteString(keyFilePath)
	sb.WriteString("\"\n")
	sb.WriteString("\n# Builder Managed via the Alis Build Console at ")
	sb.WriteString(builderURL)
	sb.WriteByte('\n')
	for _, v := range nonManaged {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}

	if err := os.MkdirAll(alisDir, 0755); err != nil {
		return fmt.Errorf("mkdir alis dir: %w", err)
	}
	if err := os.WriteFile(keyFilePath, keyData, 0600); err != nil {
		return fmt.Errorf("write key.json: %w", err)
	}
	return os.WriteFile(envFilePath, []byte(sb.String()), 0644)
}
