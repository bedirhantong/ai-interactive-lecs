import fs from "node:fs";
import path from "node:path";
import { contentRoot, loadContent } from "@/lib/content/loader";

/** Serves Colab notebook templates for download (the "upload to Colab" path). */
export async function GET(_request: Request, ctx: RouteContext<"/colab/[file]">) {
  const { file } = await ctx.params;
  const template = [...loadContent().colabTemplates.values()].find((t) => t.notebookFile === file);
  if (!template) return new Response("Bulunamadı", { status: 404 });
  const body = fs.readFileSync(path.join(/* turbopackIgnore: true */ contentRoot(), "colab", template.notebookFile));
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ipynb+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template.notebookFile}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
