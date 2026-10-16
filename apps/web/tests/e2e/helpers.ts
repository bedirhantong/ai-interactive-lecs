import type { Page } from "@playwright/test";

/** Use the simple textarea editor so tests can type code reliably. */
export async function useBasicEditor(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("aiatolye:v1:progress")) {
      localStorage.setItem(
        "aiatolye:v1:progress",
        JSON.stringify({
          state: { profile: { displayName: "", level: "builder", ageBand: null, editor: "basic" }, lessons: {}, skills: {}, recent: [], portfolio: {}, lastLessonId: null },
          version: 1,
        }),
      );
    }
  });
}

/** Wait until the notebook autosave has written to localStorage. */
export async function waitForSave(page: Page) {
  await page.getByTestId("save-status").filter({ hasText: "Kaydedildi" }).waitFor();
}
