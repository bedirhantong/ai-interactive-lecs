"""Random secrets and one-way identifiers."""

import hashlib
import hmac
import secrets

# No 0/O, 1/l/I: easy to read aloud and copy from a printed class sheet.
_READABLE = "abcdefghjkmnpqrstuvwxyz23456789"


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Session tokens are stored only as SHA-256 hashes, so a database leak does not leak live sessions."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_join_code() -> str:
    return "".join(secrets.choice(_READABLE.upper()) for _ in range(6))


def new_one_time_password() -> str:
    """e.g. 'k7mp-3xqa-9fde' — about 59 bits; valid only until the first login."""
    return "-".join("".join(secrets.choice(_READABLE) for _ in range(4)) for _ in range(3))


class KeyedHasher:
    """HMAC-SHA256 with a server secret, for identifiers we must compare but should not store (login names, IPs)."""

    def __init__(self, secret: str):
        self._key = secret.encode()

    def digest(self, value: str) -> str:
        return hmac.new(self._key, value.encode(), hashlib.sha256).hexdigest()
