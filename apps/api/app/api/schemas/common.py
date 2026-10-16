from typing import Annotated

from pydantic import StringConstraints

Slug = Annotated[str, StringConstraints(max_length=80, pattern=r"^[a-z0-9-]+$")]
