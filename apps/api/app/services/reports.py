"""Colab training reports: bounded JSON, validated, never executed, stored as self-reported."""

import hashlib
import json
from dataclasses import dataclass

from pydantic import ValidationError

from app.core.config import Settings
from app.core.uow import UnitOfWork
from app.domain.errors import InvalidInput, PayloadTooLarge
from app.domain.training_report import TrainingReportPayload
from app.models import TrainingReport, User, Verification
from app.repositories.reports import ReportRepository
from app.services.content import Catalog


@dataclass(frozen=True)
class SubmitResult:
    report: TrainingReport
    created: bool


def content_hash(payload: TrainingReportPayload) -> str:
    """Same report content -> same hash, regardless of key order or whitespace in the uploaded file."""
    canonical = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


class ReportService:
    def __init__(self, reports: ReportRepository, catalog: Catalog, settings: Settings, uow: UnitOfWork):
        self.reports = reports
        self.catalog = catalog
        self.settings = settings
        self.uow = uow

    @staticmethod
    def parse(raw: bytes) -> TrainingReportPayload:
        try:
            return TrainingReportPayload.model_validate(json.loads(raw))
        except json.JSONDecodeError:
            raise InvalidInput("Rapor geçerli bir JSON değil.", code="invalid_json") from None
        except ValidationError as exc:
            details = [
                {"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"], "type": e["type"]}
                for e in exc.errors(include_url=False, include_input=False, include_context=False)[:8]
            ]
            raise InvalidInput("Rapor beklenen biçimde değil.", code="report_invalid", details=details) from None

    def submit(self, user: User, lesson_id: str, raw: bytes) -> SubmitResult:
        """Idempotent: uploading the same report again returns the stored one (created=False)."""
        if len(raw) > self.settings.max_report_bytes:
            raise PayloadTooLarge("Rapor çok büyük.")
        payload = self.parse(raw)
        lesson = self.catalog.lessons.get(lesson_id)
        template = self.catalog.colab_templates.get(payload.template_id)
        if lesson is None or "colab" not in lesson.labs:
            raise InvalidInput("Bu ders bir Colab aşaması içermiyor.", code="lesson_has_no_colab")
        if template is None or template.project_id != payload.project_id or lesson.project_id != payload.project_id:
            raise InvalidInput("Rapor bu dersin projesine ait değil.", code="report_project_mismatch")
        if payload.notebook_version.split(".")[0] != template.version.split(".")[0]:
            raise InvalidInput("Defter sürümü uyumsuz.", code="report_version_incompatible")
        digest = content_hash(payload)
        existing = self.reports.by_content_hash(user.id, lesson_id, digest)
        if existing is not None:
            return SubmitResult(existing, created=False)
        report = self.reports.add(
            TrainingReport(
                user_id=user.id,
                content_hash=digest,
                lesson_id=lesson_id,
                project_id=payload.project_id,
                template_id=payload.template_id,
                notebook_version=payload.notebook_version,
                test_accuracy=payload.test_metrics.accuracy,
                report=payload.model_dump(mode="json"),
                verification=Verification.self_reported,
            )
        )
        if report is None:  # a parallel upload of the same report won the race
            return SubmitResult(self.reports.by_content_hash(user.id, lesson_id, digest), created=False)
        self.uow.commit()
        return SubmitResult(report, created=True)

    def for_user(self, user: User) -> list[TrainingReport]:
        return self.reports.for_user(user.id)
