package lshorter

import "fmt"

// Error represents a structured error returned by the LShorter API or SDK.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("lshorter: HTTP %d (%s): %s", e.Status, e.Code, e.Message)
	}
	return fmt.Sprintf("lshorter: HTTP %d: %s", e.Status, e.Message)
}
