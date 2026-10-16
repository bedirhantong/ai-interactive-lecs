"""Readable usernames for teacher-created student accounts (no email for minors)."""

import re
import secrets

USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]{3,40}$")
_TR = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "İ": "i", "ö": "o", "ş": "s", "ü": "u", "Ç": "c", "Ğ": "g", "Ö": "o", "Ş": "s", "Ü": "u"})


def ascii_fold(text: str) -> str:
    """'Çağrı Öztürk' -> 'cagri ozturk' (Turkish letters to ASCII, lowercase)."""
    return text.translate(_TR).lower()


def username_base(display_name: str) -> str:
    """'Ayşe K.' -> 'ayse'. Only the first word, ASCII letters, at most 12 characters."""
    first = ascii_fold((display_name.strip().split() or [""])[0])
    base = re.sub(r"[^a-z]", "", first)[:12]
    return base if len(base) >= 2 else "ogrenci"


def username_candidate(display_name: str) -> str:
    """'ayse.4821'. Callers retry on collision."""
    return f"{username_base(display_name)}.{secrets.randbelow(9000) + 1000}"


def normalize_login(login: str) -> str:
    return login.strip().casefold()
