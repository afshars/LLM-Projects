import type { uiEn } from "./en";

/** Persian copy for lib/ui. Typed against the English shape so a missing
 * key is a compile error. */
export const uiFa: typeof uiEn = {
  async: {
    loading: "در حال بارگذاری…",
    retry: "دوباره تلاش کن",
    retrying: "در حال تلاش دوباره…",
  },
  appError: {
    title: "مشکلی پیش آمد",
    crashMessage: "این صفحه نمایش داده نشد. دوباره تلاش کن یا صفحه را دوباره بارگذاری کن.",
    retry: "دوباره تلاش کن",
    reload: "صفحه را دوباره بارگذاری کن",
    dismiss: "بستن",
  },
  empty: {
    nextStep: "قدم بعدی:",
    missingAction: "هنوز چیزی برای نمایش نیست.",
  },
  review: {
    title: "پیش از ذخیره، بررسی کن",
    notSaved: "تا تأیید نکنی، هیچ چیزی ذخیره نمی‌شود.",
    notSavedHint: "هر مورد نادرست را ویرایش یا حذف کن، بعد تأیید کن.",
    itemsLabel: "موردهای پیشنهادی",
    remove: "حذف",
    removeAria: (label: string) => `حذف: ${label}`,
    removed: (label: string, left: string) => `حذف شد: ${label}. ${left} مورد باقی مانده است.`,
    allRemoved: "همه‌ی موردها را حذف کردی، پس چیزی برای ذخیره نمانده. برای شروع دوباره، لغو کن.",
    confirm: "تأیید و ذخیره",
    cancel: "لغو",
    saving: "در حال ذخیره…",
  },
  confidence: {
    label: "اطمینان",
    low: "کم",
    medium: "متوسط",
    high: "زیاد",
    unknown: "نامشخص",
  },
  dialog: {
    cancel: "انصراف",
    working: "در حال انجام…",
    generic: {
      title: "مطمئنی؟",
      message: "برای ادامه، تأیید کن.",
      confirm: "تأیید",
    },
    delete: {
      title: (subject?: string) => (subject ? `«${subject}» حذف شود؟` : "این مورد حذف شود؟"),
      message: "این کار قابل بازگشت نیست.",
      confirm: "حذف",
    },
    archive: {
      title: (subject?: string) => (subject ? `«${subject}» بایگانی شود؟` : "این مورد بایگانی شود؟"),
      message: "از فهرست فعال‌ات خارج می‌شود.",
      confirm: "بایگانی",
    },
    logout: {
      title: "از حساب خارج می‌شوی؟",
      message: "برای ادامه باید دوباره وارد شوی.",
      confirm: "خروج",
    },
  },
};
