"""Execute the Colab Lab notebook headlessly and keep the report it produces.

This proves the template runs top to bottom on CPU without Colab-only
features, and that its exported report is real output. The report is copied
to apps/web/tests/fixtures/ so the app's import validation is tested against
a genuine report, not a hand-written one.

    .venv-notebooks/bin/python scripts/verify_colab_notebook.py
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

import nbformat
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parent.parent
COLAB = ROOT / "content" / "colab"
FIXTURES = ROOT / "apps" / "web" / "tests" / "fixtures"


def verify(manifest_file: Path) -> None:
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    nb_path = COLAB / manifest["notebookFile"]
    nb = nbformat.read(nb_path, as_version=4)
    nbformat.validate(nb)
    with tempfile.TemporaryDirectory() as tmp:
        started = time.time()
        NotebookClient(nb, timeout=600, kernel_name="python3", resources={"metadata": {"path": tmp}}).execute()
        report_path = Path(tmp) / "ai-atolye-rapor.json"
        if not report_path.exists():
            sys.exit(f"FAIL {nb_path.name}: no report was written")
        report = json.loads(report_path.read_text(encoding="utf-8"))
        FIXTURES.mkdir(parents=True, exist_ok=True)
        shutil.copy(report_path, FIXTURES / f"{manifest['id']}-report.json")
    assert report["notebook_version"] == manifest["version"], "notebook version mismatch"
    assert report["schema_version"] == manifest["reportSchemaVersion"], "report schema mismatch"
    assert report["completed"] is True
    selected = next(e for e in report["experiments"] if e["id"] == report["selected_experiment"])
    print(
        f"OK {nb_path.name}: {len(report['experiments'])} experiments, selected {selected['id']} "
        f"(validation {selected['validation_accuracy']:.3f}), test accuracy {report['test_metrics']['accuracy']:.3f}, "
        f"{time.time() - started:.1f}s"
    )


if __name__ == "__main__":
    for manifest in sorted(COLAB.glob("*.json")):
        verify(manifest)
