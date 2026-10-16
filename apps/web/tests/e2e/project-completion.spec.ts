/**
 * Kâşif (no-code) mode of the flagship project, completed only through real
 * actions, then checked in the portfolio and achievements pages.
 */
import { expect, test } from "@playwright/test";

const LABELS: Record<number, string> = { 0: "Kâğıt", 3: "Plastik", 5: "Cam", 6: "Metal", 13: "Kâğıt", 21: "Cam", 27: "Plastik", 28: "Metal" };

test("explorer completes the project with evidence; portfolio and skills reflect it", async ({ page }) => {
  await page.goto("/ders/geri-donusum-kasif");
  await expect(page.getByTestId("lesson-progress")).toHaveText("0/6 görev");

  // Predict first, then check.
  const predict = page.locator("#cell-once-sen-tahmin-et");
  for (const [id, label] of [[8, "Cam"], [35, "Plastik"], [17, "Kâğıt"], [14, "Kâğıt"]] as const) {
    await predict.getByTestId(`prediction-${id}`).getByRole("radio", { name: label }).click();
  }
  await predict.getByRole("button", { name: "Tahminlerimi kontrol et" }).click();
  await expect(predict).toContainText("3/4 doğru tahmin");

  // Label the examples that will be used for training.
  for (const [id, label] of Object.entries(LABELS)) {
    await page.getByTestId(`label-row-${id}`).getByRole("radio", { name: label }).click();
  }

  // Explore the KNN plane with the keyboard (each pause counts as one experiment).
  const probe = page.locator("#cell-komsu-deneyi").getByRole("slider", { name: /Gizemli nesne/ });
  for (const key of ["ArrowRight", "ArrowUp", "ArrowUp", "ArrowLeft"]) {
    await probe.focus();
    await probe.press(key);
    await page.waitForTimeout(650);
  }
  await expect(page.locator("#cell-komsu-deneyi")).toContainText("Tamamlandı");

  // Train model A and model B.
  const training = page.locator("#cell-egit");
  await training.getByTestId("train-button").click();
  await training.getByRole("checkbox", { name: "İletkenlik" }).check();
  await training.getByTestId("train-button").click();
  await expect(training).toContainText("Senin 8 etiketin eğitimde kullanılacak");

  // Inspect a mistake.
  const evaluation = page.locator("#cell-degerlendir");
  await evaluation.getByTestId("mistake-item").first().click();
  await expect(evaluation).toContainText("Modelin baktığı en yakın");

  // Reflect.
  const reflection = page.locator("#cell-neden-hata");
  await reflection.getByRole("textbox").fill(
    "Alüminyum folyo ve gazete hem ışık geçirmiyor hem de esnek, bu yüzden A modeli onları karıştırdı. İletkenlik metalleri ayırdı.",
  );
  await reflection.getByRole("button", { name: "Gönder" }).click();

  await expect(page.getByTestId("lesson-progress")).toHaveText("6/6 görev");
  await expect(page.getByTestId("lesson-complete")).toBeVisible();

  // Portfolio entry with results, reflection and a working .ipynb export.
  await page.goto("/projelerim");
  const entry = page.getByTestId("portfolio-entry");
  await expect(entry).toContainText("Akıllı Geri Dönüşüm Makinesi");
  await expect(entry).toContainText("Gizli");
  await expect(entry).toContainText("Alüminyum folyo ve gazete");
  const [download] = await Promise.all([page.waitForEvent("download"), entry.getByRole("button", { name: ".ipynb indir" }).click()]);
  const nb = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf-8")));
  expect(nb.nbformat).toBe(4);
  expect(nb.metadata.aiatolye.lessonId).toBe("geri-donusum-kasif");

  // Skills show the evidence behind them.
  await page.goto("/basarilarim");
  await expect(page.getByTestId("skill-veri-ve-etiketler")).toContainText("8 örneği etiketledi");
  await expect(page.getByTestId("skill-model-egitimi")).toContainText("2 farklı model eğitip karşılaştırdı");
});
