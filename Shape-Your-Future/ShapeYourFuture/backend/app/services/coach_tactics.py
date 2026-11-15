"""
The three small LLM-backed steps behind POST /coach/tactic/suggest, plus the grounding gate.

  classify_blocker (LLM)  -> which of the five blocker types (busy / distracted / energy / external / internal)
  map_family       (code) -> blocker -> stage, from blocker_map.BLOCKER_TACTIC_FAMILY (deterministic, not the model)
  pick_tactic      (LLM)  -> ONE tactic id, offered only the tactics of that stage
  validate_tactic  (code) -> the id must exist in tactics.py, else the first tactic of the stage

Nothing here writes to the database: the route only returns the proposal, and the user's explicit confirm is what saves it.
"""
from app.graphs.state import ProgressState
from app.llm.blocker_map import BLOCKER_TACTIC_FAMILY
from app.llm import provider
from app.llm.lang import lang_line, normalize_lang
from app.llm.tactics import find_tactic, format_tactics_for_prompt, tactics_for_stage
from app.schemas.chains import BlockerClassification, TacticPick

SYSTEM_CLASSIFY = (
    "تو یک طبقه‌بند مانع هستی. بر اساس متن کاربر، دقیقاً یکی از این پنج "
    "نوع را برگردان: busy (کار زیاد)، distracted (حواس‌پرتی)، energy "
    "(افت انرژی)، external (مانع بیرونی)، internal (مانع ذهنی/تصمیمی). "
    "یک عدد confidence بین ۰ و ۱ و یک عبارت کوتاه evidence هم بده. "
    "فقط طبقه‌بندی کن، توصیه نده."
)

SYSTEM_TACTIC = (
    "از فهرست تاکتیک‌های زیر (فقط همین فهرست، هیچ‌چیز دیگری نساز)، دقیقاً "
    "یکی را که با وضعیت کاربر بیشترین تناسب را دارد انتخاب کن و id آن را "
    "برگردان، به‌همراه یک عدد confidence."
)

def classify_blocker(state: ProgressState) -> ProgressState:
    if not state.get("blockers_text", "").strip():
        return {"blocker_type": None, "blocker_confidence": None}

    llm = provider.get_cheap_llm().with_structured_output(BlockerClassification)
    result: BlockerClassification = llm.invoke(
        [
            ("system", SYSTEM_CLASSIFY),
            ("human", state["blockers_text"]),
        ]
    )
    return {
        "blocker_type": result.blocker_type,
        "blocker_confidence": result.confidence,
        "needs_clarification": result.confidence < 0.6,
    }


def map_family(state: ProgressState) -> ProgressState:
    mapping = BLOCKER_TACTIC_FAMILY[state["blocker_type"]]
    return {"recommended_stage": mapping["stage"], "reason_fa": mapping["reason_fa"]}


def pick_tactic(state: ProgressState) -> ProgressState:
    stage = state["recommended_stage"]
    prompt_list = format_tactics_for_prompt(stage, lang=normalize_lang(state.get("lang")))

    llm = provider.get_cheap_llm().with_structured_output(TacticPick)
    result: TacticPick = llm.invoke(
        [
            ("system", f"{SYSTEM_TACTIC}\n\n{prompt_list}\n{lang_line(state.get('lang'))}"),
            ("human", state["blockers_text"]),
        ]
    )
    return {"recommended_tactic_id": result.tactic_id, "tactic_confidence": result.confidence}


def validate_tactic(state: ProgressState) -> ProgressState:
    """Deterministic Grounding Gate - never trust the LLM's id blindly."""
    tid = state.get("recommended_tactic_id")
    tactic = find_tactic(tid) if tid is not None else None
    if tactic is None:
        # fall back to the first tactic in the recommended stage
        fallback = tactics_for_stage(state["recommended_stage"])[0]
        return {"recommended_tactic_id": fallback.id}
    return {"recommended_tactic_id": tactic.id}
