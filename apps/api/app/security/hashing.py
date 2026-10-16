"""Password hashing behind an interface (swap scrypt for argon2 without touching services)."""

import hashlib
import hmac
import secrets
from typing import Protocol


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password: str, stored: str | None) -> bool:
        """Constant-ish time; must also spend hashing time when `stored` is None (unknown user)."""
        ...


class ScryptHasher:
    """scrypt (stdlib). Parameters are stored with each hash, so they can be raised later."""

    def __init__(self, n: int = 2**14, r: int = 8, p: int = 1):
        self.n, self.r, self.p = n, r, p
        # Verifying against this when the user does not exist keeps timing similar,
        # so login responses do not reveal which usernames exist.
        self._dummy = self.hash(secrets.token_urlsafe(16))

    def _derive(self, password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
        return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32, maxmem=256 * 1024 * 1024)

    def hash(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        return f"scrypt${self.n}${self.r}${self.p}${salt.hex()}${self._derive(password, salt, self.n, self.r, self.p).hex()}"

    def verify(self, password: str, stored: str | None) -> bool:
        target = stored or self._dummy
        parts = target.split("$")
        if len(parts) == 3 and parts[0] == "scrypt":  # legacy format from the first release: scrypt$salt$digest
            n, r, p, salt_hex, digest_hex = 2**14, 8, 1, parts[1], parts[2]
        elif len(parts) == 6 and parts[0] == "scrypt":
            n, r, p, salt_hex, digest_hex = int(parts[1]), int(parts[2]), int(parts[3]), parts[4], parts[5]
        else:
            return False
        ok = hmac.compare_digest(self._derive(password, bytes.fromhex(salt_hex), n, r, p).hex(), digest_hex)
        return ok and stored is not None
