export interface ClassroomOut {
  id: number;
  name: string;
  join_code: string | null;
}

export interface StudentSummary {
  user_id: string;
  display_name: string;
  username: string | null;
  status: "pending" | "active";
  last_activity_at: string | null;
  completed_lessons: string[];
  challenges_passed: number;
  reports: number;
  latest_test_accuracy: number | null;
}

export interface Credential {
  user_id: string;
  display_name: string;
  login: string;
  one_time_password: string;
}

export interface AssignmentOut {
  id: number;
  lesson_id: string;
  due_at: string | null;
}

export interface EventOut {
  id: number;
  lesson_id: string;
  cell_id: string;
  kind: string;
  detail: string;
  occurred_at: string;
}

export interface ReportOut {
  id: number;
  lesson_id: string;
  notebook_version: string;
  test_accuracy: number;
  verification: string;
  created_at: string;
}

export interface ReflectionOut {
  lesson_id: string;
  cell_id: string;
  text: string;
  submitted_at: string | null;
}

/** Lesson facts the teacher views need (titles, reflection prompts). Built on the server from content. */
export interface TeacherCatalog {
  lessons: { id: string; title: string; level: string }[];
  reflectionPrompts: Record<string, string>;
}

export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const EVENT_LABELS: Record<string, string> = {
  "cell-completed": "Görevi tamamladı",
  "lesson-completed": "Dersi bitirdi",
  "challenge-passed": "Görevin testlerini geçti",
  "challenge-attempt": "Görevi denedi",
  "error-fixed": "Hatalı kodunu düzeltti",
  "model-trained": "Model eğitti",
  "reflection-submitted": "Yansıtma yazdı",
  "labels-completed": "Örnekleri etiketledi",
  "mistake-inspected": "Hatalı bir tahmini inceledi",
  "hint-revealed": "İpucu açtı",
  "solution-revealed": "Çözümü görüntüledi",
  "colab-opened": "Colab defterini açtı",
  "report-imported": "Colab raporu yükledi",
};
