import { expect, test } from "@playwright/test";
import { useBasicEditor, waitForSave } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useBasicEditor(page);
});

test("real Python: output, Turkish error help, graded challenge, restore after reload", async ({ page }) => {
  await page.goto("/ders/python-ilk-adimlar");

  // Real execution with print output.
  const first = page.locator("#cell-ilk-kod");
  await first.getByRole("button", { name: "Çalıştır" }).click();
  await expect(first.getByTestId("cell-output")).toContainText("Merhaba, Atölye Ortaokulu", { timeout: 120_000 });
  await expect(first.getByTestId("cell-output")).toContainText("Kantine her gün yaklaşık 105 öğrenci uğruyor.");

  // A real Python error is shown with an authored Turkish explanation.
  const editor = first.getByRole("textbox");
  await editor.fill("print(ogrenci)");
  await first.getByRole("button", { name: "Çalıştır" }).click();
  await expect(first.getByTestId("cell-error")).toContainText("NameError: name 'ogrenci' is not defined");
  await expect(first.getByTestId("cell-error")).toContainText("Tanımlanmamış bir isim");

  // Shared namespace: a variable defined in one cell is visible in the next run.
  await editor.fill("toplam_ogrenci = 420\ntoplam_ogrenci * 2");
  await first.getByRole("button", { name: "Çalıştır" }).click();
  await expect(first.getByTestId("cell-output")).toContainText("→ 840");

  // Challenge: wrong answer fails a test, correct answer passes all (graded in the browser).
  const challenge = page.locator("#cell-ortalama-gorevi");
  const code = challenge.getByRole("textbox");
  await code.fill("def ortalama(sayilar):\n    return sum(sayilar)\n");
  await challenge.getByRole("button", { name: "Kontrol et" }).click();
  await expect(challenge.getByTestId("test-results")).toContainText("Beklenen 2, gelen 6");
  await code.fill("def ortalama(sayilar):\n    return sum(sayilar) / len(sayilar)\n");
  await challenge.getByRole("button", { name: "Kontrol et" }).click();
  await expect(challenge).toContainText("Harika, şimdi kendi kodunu yaz");
  await expect(challenge).toContainText("Tamamlandı");
  await expect(challenge.getByLabel("geçti")).toHaveCount(3);

  // Progress and code survive a reload.
  await waitForSave(page);
  await page.reload();
  const restored = page.locator("#cell-ortalama-gorevi");
  await expect(restored).toContainText("Tamamlandı");
  await expect(restored.getByRole("textbox")).toHaveValue(/sum\(sayilar\) \/ len\(sayilar\)/);
  await expect(page.getByTestId("lesson-progress")).toHaveText(/^2\/\d+ görev$/);
});

test("an infinite loop can be stopped and the runtime recovers", async ({ page }) => {
  await page.goto("/ders/python-ilk-adimlar");
  const cell = page.locator("#cell-serbest-alan");
  await cell.getByRole("textbox").fill("x = 0\nwhile True:\n    x += 1\n");
  await cell.getByRole("button", { name: "Çalıştır" }).click();
  const stop = cell.getByRole("button", { name: "Durdur" });
  await expect(stop).toBeVisible({ timeout: 120_000 });
  // Make sure the loop itself is running (not just Python starting up).
  await expect(page.getByTestId("runtime-status")).toHaveAttribute("title", "Python çalışıyor", { timeout: 120_000 });
  await page.waitForTimeout(1000);
  await stop.click();
  await expect(cell.getByTestId("cell-error")).toContainText("durduruldu");

  // A fresh Python process runs the next job.
  await cell.getByRole("textbox").fill("print('yeniden hazır')");
  await cell.getByRole("button", { name: "Çalıştır" }).click();
  await expect(cell.getByTestId("cell-output")).toContainText("yeniden hazır", { timeout: 120_000 });
});

test("packages such as numpy load on demand in the browser runtime", async ({ page }) => {
  await page.goto("/ders/geri-donusum-gelistirici");
  const load = page.locator("#cell-yukle");
  await load.getByRole("button", { name: "Çalıştır" }).click();
  await expect(load.getByTestId("cell-output")).toContainText("Örnek sayısı: 160", { timeout: 120_000 });
  const numpyCell = page.locator("#cell-numpy");
  await numpyCell.getByRole("button", { name: "Çalıştır" }).click();
  await expect(numpyCell.getByTestId("cell-output")).toContainText("metal    ortalama iletkenlik", { timeout: 150_000 });
});
