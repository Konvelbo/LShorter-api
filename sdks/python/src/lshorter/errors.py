from __future__ import annotations

from typing import Optional


class LShorterError(Exception):
    """Typed error raised when the LShorter API returns a non-2xx response or error payload."""

    def __init__(
        self,
        message: str,
        status: int = 500,
        code: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

    def __repr__(self) -> str:
        return f"LShorterError(status={self.status!r}, code={self.code!r}, message={self.message!r})"


QuickLinkError = LShorterError
