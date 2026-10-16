"""Audit actions and how they are explained to the person they concern."""

from enum import StrEnum


class AuditAction(StrEnum):
    # A teacher looked at a student's data
    STUDENT_PROGRESS_VIEWED = "student_progress_viewed"
    STUDENT_REPORTS_VIEWED = "student_reports_viewed"
    STUDENT_REFLECTIONS_VIEWED = "student_reflections_viewed"
    CLASS_OVERVIEW_VIEWED = "class_overview_viewed"
    # Account and classroom changes made by someone else
    STUDENT_ACCOUNT_CREATED = "student_account_created"
    STUDENT_PASSWORD_RESET = "student_password_reset"  # noqa: S105 - an event name, not a password
    STUDENT_ACCOUNT_DELETED = "student_account_deleted"
    TEACHER_ACCOUNT_CREATED = "teacher_account_created"
    MEMBER_APPROVED = "member_approved"
    MEMBER_REMOVED = "member_removed"
    # The person themself
    DATA_EXPORTED = "data_exported"
    PROFILE_UPDATED = "profile_updated"
    ACCOUNT_DELETED = "account_deleted"


DESCRIPTIONS: dict[AuditAction, str] = {
    AuditAction.STUDENT_PROGRESS_VIEWED: "İlerleme kayıtlarını görüntüledi",
    AuditAction.STUDENT_REPORTS_VIEWED: "Colab raporlarını görüntüledi",
    AuditAction.STUDENT_REFLECTIONS_VIEWED: "Yansıtma yazılarını okudu",
    AuditAction.CLASS_OVERVIEW_VIEWED: "Sınıf özetinde ilerleme özetini görüntüledi",
    AuditAction.STUDENT_ACCOUNT_CREATED: "Hesabını oluşturdu",
    AuditAction.STUDENT_PASSWORD_RESET: "Şifreni sıfırladı",
    AuditAction.STUDENT_ACCOUNT_DELETED: "Hesabını sildi",
    AuditAction.TEACHER_ACCOUNT_CREATED: "Öğretmen hesabını oluşturdu",
    AuditAction.MEMBER_APPROVED: "Sınıfa katılımını onayladı",
    AuditAction.MEMBER_REMOVED: "Seni sınıftan çıkardı",
    AuditAction.DATA_EXPORTED: "Verilerini indirdin",
    AuditAction.PROFILE_UPDATED: "Profil bilgilerini değiştirdi",
    AuditAction.ACCOUNT_DELETED: "Hesap silindi",
}
