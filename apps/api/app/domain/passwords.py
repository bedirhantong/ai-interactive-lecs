"""Password rules (NIST SP 800-63B style): length and a blocklist, no composition rules.

Students (11–18) get a shorter minimum than staff; brute force is handled by
login rate limiting, not by forcing hard-to-remember passwords.
"""

import re
from dataclasses import dataclass

from app.domain.errors import InvalidInput
from app.domain.usernames import ascii_fold
from app.models import Role

COMMON_PASSWORDS = frozenset(
    [
        "12345678",
        "123456789",
        "1234567890",
        "87654321",
        "11111111",
        "00000000",
        "12341234",
        "123123123",
        "11223344",
        "qwertyui",
        "qwerty123",
        "asdfghjk",
        "asdf1234",
        "password",
        "password1",
        "passw0rd",
        "iloveyou",
        "abc12345",
        "abcd1234",
        "sifre123",
        "şifre123",
        "sifre1234",
        "sifresifre",
        "parola123",
        "parola1234",
        "benimsifrem",
        "okul1234",
        "ogrenci1",
        "ogrenci123",
        "öğrenci123",
        "ogretmen",
        "ogretmen1",
        "ogretmen123",
        "yapayzeka",
        "atolye123",
        "aiatolye",
        "galatasaray",
        "fenerbahce",
        "fenerbahçe",
        "besiktas",
        "beşiktaş",
        "trabzonspor",
        "turkiye",
        "türkiye",
        "istanbul",
        "ankara",
        "izmir12345",
        "bursa1234",
        "sevgilim",
        "askim123",
        "aşkım123",
        "canimm123",
        "kardesim",
        "minecraft",
        "fortnite",
        "roblox123",
        "pokemon1",
        "football",
    ]
)


@dataclass(frozen=True)
class PasswordPolicy:
    min_length: int
    max_length: int = 128

    def problems(self, password: str, *, context: list[str] = ()) -> list[str]:
        """Return Turkish explanations; empty means the password is acceptable."""
        found: list[str] = []
        lowered = password.casefold()
        if len(password) < self.min_length:
            found.append(f"Şifre en az {self.min_length} karakter olmalı.")
        if len(password) > self.max_length:
            found.append(f"Şifre en fazla {self.max_length} karakter olabilir.")
        if lowered in COMMON_PASSWORDS or ascii_fold(password) in COMMON_PASSWORDS or re.fullmatch(r"(.)\1*", password or "x"):
            found.append("Bu şifre çok yaygın ya da tahmin edilmesi çok kolay.")
        if password.isdigit() and len(set(password)) <= 3:
            found.append("Şifre yalnızca birkaç tekrar eden rakamdan oluşmamalı.")
        folded = ascii_fold(password)
        # Names and usernames split into words ("ayse.1234" -> "ayse"), compared without Turkish accents ("Ayşe" = "ayse").
        words = {w for item in context for w in re.split(r"[^a-z]+", ascii_fold(item)) if len(w) >= 3}
        if any(w in folded for w in words):
            found.append("Şifre kullanıcı adını ya da adını içermemeli.")
        return found

    def check(self, password: str, *, context: list[str] = ()) -> None:
        problems = self.problems(password, context=context)
        if problems:
            raise InvalidInput("Bu şifre kullanılamaz.", code="weak_password", details=[{"field": "new_password", "message": p} for p in problems])


def policy_for(role: Role) -> PasswordPolicy:
    return PasswordPolicy(min_length=8 if role == Role.student else 12)
