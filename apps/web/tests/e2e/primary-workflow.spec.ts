/**
 * Primary acceptance workflow (revised MVP):
 * lesson → visual experiment → generated Python → edit and run Python →
 * open the Colab notebook → (train in Colab) → import the report →
 * evaluate → complete, with everything persisted across a reload.
 *
 * The Colab training step itself happens in the student's Google account.
 * Here it is represented by the report produced by really executing the same
 * notebook headlessly (scripts/verify_colab_notebook.py).
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useBasicEditor, waitForSave } from "./helpers";

const REPORT = path.resolve(__dirname, "../fixtures/akilli-geri-donusum-colab-report.json");
const reportAccuracy = JSON.parse(fs.readFileSync(REPORT, "utf-8")).test_metrics.accuracy as number;
const shownAccuracy = `%${(Math.round(reportAccuracy * 1000) / 10).toLocaleString("tr-TR")}`;

test("visual → generated Python → Colab report → evaluation, persisted", async ({ page }) => {
  await useBasicEditor(page);
  await page.goto("/ders/geri-donusum-yapici");

  // 1. Visual Lab: train two real models and compare them.
  const training = page.locator("#cell-egit");
  await training.getByTestId("train-button").click();
  await expect(training.getByTestId("test-accuracy")).toHaveText("%80");
  await training.getByRole("checkbox", { name: "İletkenlik" }).check();
  await training.getByTestId("train-button").click();
  await expect(training.getByTestId("test-accuracy")).toHaveText("%97,5");
  await expect(page.locator("#cell-hedef")).toContainText("Hedefe ulaştın");

  // 2. Generated Python reproduces the same model in real Python (Pyodide).
  await training.getByRole("tab", { name: "Python" }).click();
  await expect(training.getByTestId("generated-code")).toContainText('OZELLIKLER = ["seffaflik", "esneklik", "iletkenlik"]');
  await training.getByRole("button", { name: "Düzenlenebilir kopya oluştur" }).click();
  await training.getByRole("button", { name: "Çalıştır" }).click();
  await expect(training.getByTestId("cell-output")).toContainText("Test doğruluğu: 39/40 = 97.5%", { timeout: 120_000 });

  // 3. Independent edit: the copy detaches and is never overwritten by the visual controls.
  const editor = training.getByRole("textbox", { name: "Düzenlenebilir Python kopyası" });
  await editor.fill((await editor.inputValue()).replace("K = 3", "K = 5"));
  await expect(training).toContainText("Bu kod artık senin");
  await training.getByRole("tab", { name: "Görsel" }).click();
  await training.getByRole("checkbox", { name: "Ağırlık" }).check();
  await training.getByRole("tab", { name: "Python" }).click();
  await expect(editor).toHaveValue(/K = 5/);
  await expect(editor).not.toHaveValue(/agirlik_g/);

  // 4. Colab Lab: the notebook is downloadable and opening it does not complete the task.
  const colab = page.locator("#cell-colab");
  const download = colab.getByRole("link", { name: /Defteri indir/ });
  const href = await download.getAttribute("href");
  const nb = await page.request.get(href!);
  expect(nb.status()).toBe(200);
  expect((await nb.json()).nbformat).toBe(4);
  await expect(colab).not.toContainText("Tamamlandı");

  // 5. A wrong file is rejected with a clear message.
  await colab.getByTestId("report-input-colab").setInputFiles({ name: "yanlis.json", mimeType: "application/json", buffer: Buffer.from('{"merhaba": 1}') });
  await expect(colab.getByTestId("report-errors")).toContainText("Rapor içe aktarılamadı");

  // 6. The real report is imported, validated and evaluated.
  await colab.getByTestId("report-input-colab").setInputFiles(REPORT);
  await expect(colab.getByTestId("colab-test-accuracy")).toHaveText(shownAccuracy);
  await expect(colab.getByTestId("lab-comparison")).toContainText("%97,5");
  await expect(colab).toContainText("Öz bildirim: doğrulanmamış sonuç");
  await expect(colab).toContainText("Tamamlandı");

  // 7. Everything survives a reload.
  await waitForSave(page);
  await page.reload();
  await expect(page.locator("#cell-colab").getByTestId("colab-test-accuracy")).toHaveText(shownAccuracy);
  const t = page.locator("#cell-egit");
  // The cell reopens on the Python tab where it was left, with the student's own code intact.
  await expect(t.getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
  await expect(t.getByRole("textbox", { name: "Düzenlenebilir Python kopyası" })).toHaveValue(/K = 5/);
  // Outputs from the previous page session are shown, but marked as stale (Python memory is gone).
  await expect(t).toContainText("Önceki oturumdan kalan çıktı");
  await t.getByRole("tab", { name: "Görsel" }).click();
  await expect(t.getByTestId("test-accuracy")).toHaveText("%97,5");
});
