"""Colab training report contract, version 1 (mirrors apps/web/lib/labs/colab/report.ts).

Reports are untrusted JSON uploaded by students. They are size-capped,
strictly bounded, checked for consistency and stored as self-reported.
Nothing in a report is ever executed or deserialized beyond plain JSON.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

REPORT_SCHEMA_MAJOR = 1

Unit = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0, le=1_000_000)]
Short = lambda n: Annotated[str, StringConstraints(max_length=n)]  # noqa: E731
ParamValue = float | int | bool | Short(60) | None


class _Strict(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Environment(_Strict):
    python: Short(20)
    sklearn: Short(20)
    accelerator: Literal["none", "gpu", "tpu"]
    colab: bool
    runtime_seconds: Annotated[float, Field(ge=0, le=86_400)]


class DatasetInfo(_Strict):
    name: Short(100)
    synthetic: bool
    n_train: Annotated[int, Field(ge=1, le=1_000_000)]
    n_validation: Count
    n_test: Annotated[int, Field(ge=1, le=1_000_000)]
    features: Annotated[list[Short(40)], Field(min_length=1, max_length=20)]
    classes: Annotated[list[Short(40)], Field(min_length=2, max_length=20)]


class Experiment(_Strict):
    id: Annotated[str, StringConstraints(max_length=40, pattern=r"^[a-z0-9-]+$")]
    algorithm: Short(60)
    params: Annotated[dict[Short(40), ParamValue], Field(max_length=20)]
    train_accuracy: Unit
    validation_accuracy: Unit
    training_seconds: Annotated[float, Field(ge=0, le=86_400)]


class ClassMetrics(_Strict):
    precision: Unit
    recall: Unit
    f1: Unit
    support: Count


class TestMetrics(_Strict):
    accuracy: Unit
    macro_f1: Unit
    labels: Annotated[list[Short(40)], Field(min_length=2, max_length=20)]
    confusion_matrix: Annotated[list[Annotated[list[Count], Field(max_length=20)]], Field(max_length=20)]
    per_class: Annotated[dict[Short(40), ClassMetrics], Field(max_length=20)]


class TrainingReportPayload(_Strict):
    schema_version: Annotated[str, StringConstraints(pattern=r"^\d+\.\d+$")]
    project_id: Short(60)
    template_id: Short(60)
    notebook_version: Annotated[str, StringConstraints(pattern=r"^\d+\.\d+\.\d+$")]
    created_at: Short(40)
    environment: Environment
    dataset: DatasetInfo
    experiments: Annotated[list[Experiment], Field(min_length=1, max_length=20)]
    selected_experiment: Short(40)
    test_metrics: TestMetrics
    loss_curve: Annotated[list[Annotated[float, Field(ge=0, le=1_000_000)]], Field(max_length=1000)] | None = None
    completed: bool

    @model_validator(mode="after")
    def _consistent(self) -> "TrainingReportPayload":
        if int(self.schema_version.split(".")[0]) != REPORT_SCHEMA_MAJOR:
            raise ValueError(f"unsupported schema_version {self.schema_version}")
        if not any(e.id == self.selected_experiment for e in self.experiments):
            raise ValueError("selected_experiment is not in experiments")
        m, n = self.test_metrics.confusion_matrix, len(self.test_metrics.labels)
        if len(m) != n or any(len(row) != n for row in m):
            raise ValueError("confusion_matrix size does not match labels")
        total = sum(map(sum, m))
        if total != self.dataset.n_test:
            raise ValueError("confusion_matrix total does not match n_test")
        trace = sum(m[i][i] for i in range(n))
        if total and abs(trace / total - self.test_metrics.accuracy) > 0.005:
            raise ValueError("accuracy is inconsistent with confusion_matrix")
        if sorted(self.test_metrics.labels) != sorted(self.dataset.classes):
            raise ValueError("labels do not match dataset classes")
        return self
