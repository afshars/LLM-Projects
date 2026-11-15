"""
Deterministic (not LLM) mapping from a blocker_type to a tactic stage +
human-readable rationale. This table encodes the "different blocker types
need different solution families" idea - it is a lookup, not a judgment,
so it belongs in code, not in a prompt.
"""

BLOCKER_TACTIC_FAMILY: dict[str, dict[str, str]] = {
    "busy": {
        "stage": "highlight",
        "reason_fa": "زیاد بودن کارها؛ نیاز به حذف یا واگذاری از طریق اولویت‌بندی مجدد",
    },
    "distracted": {
        "stage": "laser",
        "reason_fa": "افت تمرکز؛ نیاز به حذف حواس‌پرتی",
    },
    "energy": {
        "stage": "energize",
        "reason_fa": "افت انرژی بدن/ذهن؛ نیاز به بازیابی انرژی",
    },
    "external": {
        "stage": "reflect",
        "reason_fa": "مانع بیرونی؛ نیاز به تنظیم مجدد برنامه برای فردا",
    },
    "internal": {
        "stage": "highlight",
        "reason_fa": "مانع ذهنی/تصمیمی؛ نیاز به کوچک‌کردن قدم بعدی",
    },
}
