/**
 * Full stack: web app + API + PostgreSQL. Teacher creates a class and student accounts; the student
 * signs in, sets a password, works in a lesson; the work follows them to a second device; concurrent
 * edits on two devices raise the conflict prompt; the teacher sees the student's evidence.
 *
 * Needs the API behind /api (npm run api, demo mode on, this origin in ATOLYE_ALLOWED_ORIGINS).
 * Skipped when no API is reachable, unless E2E_REQUIRE_API=1 (CI).
 */
import { type Browser, type Page, expect, test } from "@playwright/test";

const LESSON = "python-ilk-adimlar";
const NEW_PASSWORD = "mavi-bisiklet-yaz-2026";

test.beforeEach(async ({ request }) => {
  const ok = await request
    .get("/api/v1/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok && process.env.E2E_REQUIRE_API) throw new Error("API is not reachable behind /api");
  test.skip(!ok, "API is not running; start it with `npm run api` to run this test");
});

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Use the plain textarea editor for this signed-in account (typing into Monaco is unreliable in tests). */
async function useBasicEditor(page: Page) {
  await page.evaluate(() => {
    const id = localStorage.getItem("aiatolye:account");
    const key = `aiatolye:u:${id}:progress`;
    const stored = JSON.parse(localStorage.getItem(key) ?? '{"state":{},"version":1}');
    stored.state.profile = { displayName: "", level: "builder", ageBand: null, ...(stored.state.profile ?? {}), editor: "basic" };
    localStorage.setItem(key, JSON.stringify(stored));
  });
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/giris");
  await page.getByLabel("Kullanıcı adı ya da e-posta").fill(login);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId("sync-status").first()).toContainText("Hesabına kaydedildi", { timeout: 30_000 });
}

/** In a notebook: the local autosave finished, then the upload finished. */
async function waitSavedAndSynced(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText(/Kaydedildi/, { timeout: 10_000 });
  await waitSynced(page);
}

test("teacher provisions students; work syncs across devices; conflicts are resolved; teacher sees evidence", async ({ browser }) => {
  test.setTimeout(240_000);

  // --- Teacher: class, two student accounts, an assignment -------------------------------
  const teacher = await newDevice(browser);
  await teacher.goto("/giris");
  await teacher.getByRole("button", { name: "Demo öğretmen" }).click();
  await expect(teacher).toHaveURL(/\/ogretmen$/);
  await teacher.getByLabel("Yeni sınıf").fill("7-A Yapay Zekâ");
  await teacher.getByRole("button", { name: "Oluştur" }).click();
  await teacher.getByTestId("classroom-card").filter({ hasText: "7-A Yapay Zekâ" }).click();
  await teacher.getByTestId("student-names").fill("Ayşe K.\nMehmet Y.");
  await teacher.getByRole("button", { name: "2 hesap oluştur" }).click();
  const card = teacher.getByTestId("credential-card").filter({ hasText: "Ayşe K." });
  const login = (await card.getByTestId("credential-login").textContent())!.trim();
  const oneTime = (await card.getByTestId("credential-password").textContent())!.trim();
  expect(login).toMatch(/^ayse\.\d{4}$/);
  await expect(teacher.getByTestId("student-row")).toHaveCount(2);
  await teacher.getByLabel("Ders").selectOption(LESSON);
  await teacher.getByRole("button", { name: "Ödev ver" }).click();
  await expect(teacher.getByTestId("assignment")).toContainText("Python'a İlk Adımlar");

  // --- Student, laptop: first sign-in forces a new password, then the assignment shows up ---
  const laptop = await newDevice(browser);
  await signIn(laptop, login, oneTime);
  await expect(laptop).toHaveURL(/\/sifre$/);
  await laptop.getByLabel("Tek seferlik şifre").fill(oneTime);
  await laptop.getByLabel("Yeni şifre", { exact: true }).fill("12345678");
  await laptop.getByLabel("Yeni şifre (tekrar)").fill("12345678");
  await laptop.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await expect(laptop.getByTestId("password-errors")).toContainText("yaygın");
  await laptop.getByLabel("Yeni şifre", { exact: true }).fill(NEW_PASSWORD);
  await laptop.getByLabel("Yeni şifre (tekrar)").fill(NEW_PASSWORD);
  await laptop.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await expect(laptop).toHaveURL(/\/ana-sayfa$/);
  await expect(laptop.getByTestId("my-assignments")).toContainText("Python'a İlk Adımlar");
  await expect(laptop.getByTestId("account-name").first()).toHaveText("Ayşe K.");

  // Work in the lesson: real Python run (task completed) + a reflection for the teacher.
  await useBasicEditor(laptop);
  await laptop.goto(`/ders/${LESSON}`);
  const firstCell = laptop.locator("#cell-ilk-kod");
  await firstCell.getByRole("textbox").fill('okul = "Laptop Ortaokulu"\nprint("Merhaba,", okul)');
  await firstCell.getByRole("button", { name: "Çalıştır" }).click();
  await expect(firstCell.getByTestId("cell-output")).toContainText("Merhaba, Laptop Ortaokulu", { timeout: 120_000 });
  const reflection = laptop.locator("#cell-dusun");
  await reflection.getByRole("textbox").fill("Model kuralı geçmiş satışlardan kendisi çıkarır; insan bazı sıcaklıkları atlayabilir ama model veriye bakar.");
  await reflection.getByRole("button", { name: "Gönder" }).click();
  await expect(laptop.getByTestId("lesson-progress")).toContainText("2/5");
  await waitSavedAndSynced(laptop);

  // --- Student, school computer: the same work is there ------------------------------------
  const school = await newDevice(browser);
  await signIn(school, login, NEW_PASSWORD);
  await expect(school).toHaveURL(/\/ana-sayfa$/);
  await waitSynced(school); // the sign-in download finished (it also writes the progress store)
  await useBasicEditor(school);
  await school.goto(`/ders/${LESSON}`);
  await expect(school.locator("#cell-ilk-kod").getByRole("textbox")).toHaveValue(/Laptop Ortaokulu/);
  await expect(school.getByTestId("lesson-progress")).toContainText("2/5");
  await expect(school.locator("#cell-ilk-kod")).toContainText("Tamamlandı");

  // --- Both devices edit the same notebook: the second save is not lost, the student chooses ---
  await school.locator("#cell-ilk-kod").getByRole("textbox").fill('print("okuldaki değişiklik")');
  await waitSavedAndSynced(school);
  await laptop.locator("#cell-ilk-kod").getByRole("textbox").fill('print("dizüstündeki değişiklik")');
  const conflict = laptop.getByTestId("sync-conflict");
  await expect(conflict).toBeVisible({ timeout: 30_000 });
  await expect(conflict).toContainText("başka bir cihazda da değiştirilmiş");
  await conflict.getByRole("button", { name: "Diğer cihazdakini kullan" }).click();
  await expect(conflict).toBeHidden();
  await expect(laptop.locator("#cell-ilk-kod").getByRole("textbox")).toHaveValue(/okuldaki değişiklik/);

  // --- Teacher: overview, the student's evidence and reflection ----------------------------
  await teacher.reload();
  const row = teacher.getByTestId("student-row").filter({ hasText: "Ayşe K." });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Ayşe K." }).click();
  await expect(teacher.getByTestId("reflection")).toContainText("Model kuralı geçmiş satışlardan");
  await expect(teacher.getByTestId("event").first()).toBeVisible();
  await expect(teacher.getByText("Görevi tamamladı").first()).toBeVisible();

  // --- The student sees that the teacher looked, and signing out removes the local copy -----
  await school.goto("/profil");
  await school.getByRole("button", { name: "Verime kim erişti?" }).click();
  await expect(school.getByTestId("access-log")).toContainText("Yansıtma yazılarını okudu");
  await school.getByRole("button", { name: "Çıkış yap" }).first().click();
  await expect(school).toHaveURL(/\/giris$/);
  const leftovers = await school.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("aiatolye:u:")));
  expect(leftovers).toEqual([]);
});
