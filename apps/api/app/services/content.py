"""Read-only view of the versioned lesson content in /content.

Lessons are not copied into the database: the files are the source of truth
and every stored notebook records the lesson version it was saved against.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings


@dataclass(frozen=True)
class LessonInfo:
    id: str
    version: int
    title: str
    level: str
    labs: tuple[str, ...]
    project_id: str | None


@dataclass(frozen=True)
class ColabTemplateInfo:
    id: str
    version: str
    project_id: str
    report_schema_version: str


@dataclass(frozen=True)
class Catalog:
    lessons: dict[str, LessonInfo]
    colab_templates: dict[str, ColabTemplateInfo]


def _load(content_dir: Path) -> Catalog:
    lessons = {}
    for file in sorted((content_dir / "notebooks").glob("*.json")):
        d = json.loads(file.read_text(encoding="utf-8"))
        lessons[d["id"]] = LessonInfo(d["id"], d["version"], d["title"], d["level"], tuple(d["labs"]), d.get("projectId"))
    templates = {}
    for file in sorted((content_dir / "colab").glob("*.json")):
        d = json.loads(file.read_text(encoding="utf-8"))
        templates[d["id"]] = ColabTemplateInfo(d["id"], d["version"], d["projectId"], d["reportSchemaVersion"])
    return Catalog(lessons, templates)


@lru_cache
def get_catalog() -> Catalog:
    return _load(get_settings().content_dir)
