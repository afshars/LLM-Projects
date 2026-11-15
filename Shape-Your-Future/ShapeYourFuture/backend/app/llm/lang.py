"""
Every free-text field the LLM writes (reply_fa, proposal_fa, next_action_fa,
question_fa, strength_fa, ...) is written in whichever language the user's
UI is currently set to - Persian by default, English when the frontend
sends lang="en". The field names keep their historical "_fa" suffix (it's
just a name at this point, changing it would touch the DB schema and every
response consumer for no real benefit) but the *content* follows `lang`.
"""

LANG_INSTRUCTION = {
    "fa": "به فارسی پاسخ بده.",
    "en": "Respond in English.",
}


def lang_line(lang: str | None) -> str:
    return LANG_INSTRUCTION.get(lang, LANG_INSTRUCTION["fa"])


def normalize_lang(lang: str | None) -> str:
    return lang if lang in LANG_INSTRUCTION else "fa"
