import {
  BarChart3,
  Cloud,
  BookOpen,
  BrainCircuit,
  Code2,
  FlaskConical,
  type LucideIcon,
  PenLine,
  Table2,
  Target,
} from "lucide-react";
import type { CellType } from "@/lib/content/schema";

export const CELL_META: Record<CellType, { label: string; icon: LucideIcon; color: string }> = {
  explanation: { label: "Açıklama", icon: BookOpen, color: "var(--cell-explanation)" },
  code: { label: "Python", icon: Code2, color: "var(--cell-code)" },
  experiment: { label: "Deney", icon: FlaskConical, color: "var(--cell-experiment)" },
  dataset: { label: "Veri", icon: Table2, color: "var(--cell-dataset)" },
  training: { label: "Model eğitimi", icon: BrainCircuit, color: "var(--cell-training)" },
  evaluation: { label: "Değerlendirme", icon: BarChart3, color: "var(--cell-evaluation)" },
  challenge: { label: "Görev", icon: Target, color: "var(--cell-challenge)" },
  reflection: { label: "Düşün", icon: PenLine, color: "var(--cell-reflection)" },
  colab: { label: "Colab Lab", icon: Cloud, color: "var(--cell-colab)" },
};
