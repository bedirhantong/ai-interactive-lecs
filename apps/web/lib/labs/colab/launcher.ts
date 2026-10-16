/**
 * Colab Lab launcher. AI Atölye never controls a Colab runtime: it only links
 * to a notebook that opens in the student's own Google account.
 *
 * Colab can open notebooks from public GitHub repositories. Set
 * NEXT_PUBLIC_COLAB_GITHUB_REPO=owner/repo (and optionally _BRANCH) once the
 * repository is public. Without it, students download the .ipynb and upload
 * it to Colab themselves.
 */
import type { ColabTemplate } from "@/lib/content/schema";

const REPO = process.env.NEXT_PUBLIC_COLAB_GITHUB_REPO ?? "";
const BRANCH = process.env.NEXT_PUBLIC_COLAB_GITHUB_BRANCH ?? "main";

export function colabOpenUrl(template: ColabTemplate, repo = REPO, branch = BRANCH): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://colab.research.google.com/github/${repo}/blob/${encodeURIComponent(branch)}/content/colab/${template.notebookFile}`;
}

export function templateDownloadUrl(template: ColabTemplate): string {
  return `/colab/${template.notebookFile}`;
}
