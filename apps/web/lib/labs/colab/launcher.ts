/**
 * Colab Lab launcher. AI Atölye never controls a Colab runtime: it only links
 * to a notebook that opens in the student's own Google account.
 *
 * Colab opens notebooks straight from public GitHub repositories. By default
 * this is the upstream AI Atölye repository; forks can point it at their own
 * with NEXT_PUBLIC_COLAB_GITHUB_REPO=owner/repo (and _BRANCH), or set it to an
 * empty value to only offer the download (students upload it to Colab).
 */
const UPSTREAM_REPO = "bedirhantong/ai-interactive-lecs";
import type { ColabTemplate } from "@/lib/content/schema";

const REPO = process.env.NEXT_PUBLIC_COLAB_GITHUB_REPO ?? UPSTREAM_REPO;
const BRANCH = process.env.NEXT_PUBLIC_COLAB_GITHUB_BRANCH ?? "main";

export function colabOpenUrl(template: ColabTemplate, repo = REPO, branch = BRANCH): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://colab.research.google.com/github/${repo}/blob/${encodeURIComponent(branch)}/content/colab/${template.notebookFile}`;
}

export function templateDownloadUrl(template: ColabTemplate): string {
  return `/colab/${template.notebookFile}`;
}
