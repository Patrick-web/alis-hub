package main

import (
	"context"
	"fmt"

	"alis-hub-v3/internal/alisclient"
)

// newAlisClient creates an AlisClient with the default console token source.
func newAlisClient(ctx context.Context) (*alisclient.AlisClient, error) {
	tokens, err := NewConsoleTokenSource()
	if err != nil {
		return nil, fmt.Errorf("token source: %w", err)
	}
	return alisclient.New(tokens), nil
}
