/**
 * Types mirror the actual backend Pydantic schemas discovered in the
 * repo (app/api/routes/auth.py, app/api/routes/profile.py,
 * app/schemas/daily_entry.py, app/schemas/coach.py and the
 * request models declared inside the route modules).
 * No fields are invented - only what the backend actually returns.
 */

// ---------------- Auth ----------------

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// ---------------- Account profile (/profile/me) ----------------
// Mirrors app/api/routes/profile.py. Not to be confused with UserProfileOut
// above (/user-intelligence/profile: active hours, focus durations, ...).

export interface ProfileOut {
  username: string;
  /** Falls back to `username` server side, so it is never empty. */
  display_name: string;
  bio: string | null;
  /** "preset" | "custom" (typed as string by the backend). */
  avatar_kind: string;
  /** Preset name, or a `data:image/...;base64,...` URI for a custom avatar. */
  avatar_value: string;
}

/** PUT /profile/me REPLACES both fields: a key left out (or null / blank
 * after trimming) clears that field. That is why both keys are required
 * here - send the current value for the one you are not changing.
 * display_name max 50 chars, bio max 240 chars (400/422 otherwise). */
export interface UpdateProfileRequest {
  display_name: string | null;
  bio: string | null;
}

/** PUT /profile/me/password. `new_password` must satisfy the same policy as
 * registration (app/core/security.validate_password_strength). Answers 204
 * (no body); a wrong `current_password` answers 400. Rate limit: 5/min. */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// ---------------- Errors ----------------

/** `conflict` = HTTP 409.
 * `rate_limit` = HTTP 429 (60/min on most routes, ~20/min on the LLM routes,
 * 5-10/min on auth and password change).
 * `llm_unavailable` = a 5xx from a route that calls the LLM (only
 * /coach/tactic/suggest now): missing or
 * invalid LLM key, or unusable model output. UI copy: "AI is unavailable,
 * try again". Any other 5xx stays `server`. */
export type ApiErrorKind =
  | "network"
  | "validation"
  | "auth"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "llm_unavailable"
  | "server"
  | "unknown";

// ---------------------------------------------------------------------------
// Daily entry (/daily-entry): the daily loop. One row per user per day; the screens only send the keys they change.
// ---------------------------------------------------------------------------

/** The three distraction defaults of Laser. A plain yes/no each: no points. */
export const LASER_KEYS = ["notifications_off", "remove_apps", "internet_distance"] as const;
export type LaserKey = (typeof LASER_KEYS)[number];
export type LaserChecks = Record<LaserKey, boolean>;

/** The four daily energy checks of Energize. A plain yes/no each: no points, no streaks. */
export const ENERGIZE_KEYS = ["walk", "real_food", "caffeine", "rest"] as const;
export type EnergizeKey = (typeof ENERGIZE_KEYS)[number];
export type EnergizeChecks = Record<EnergizeKey, boolean>;

/** Same limit as the backend (schemas/daily_entry.py MAX_HIGHLIGHT_LENGTH). */
export const HIGHLIGHT_MAX_LENGTH = 200;
/** Same limit as the backend (MAX_CHANGE_LENGTH): "What do I change tomorrow?". */
export const CHANGE_MAX_LENGTH = 500;
/** Reflect's energy answer is a whole number from ENERGY_MIN to ENERGY_MAX (backend: StrictInt, ge=1, le=10). */
export const ENERGY_MIN = 1;
export const ENERGY_MAX = 10;

/** GET/PUT /daily-entry/today. `exists: false` = nothing saved for this day yet (every other field is its empty default). */
export interface DailyEntry {
  date: string;
  exists: boolean;
  highlight: string | null;
  highlight_done: boolean;
  /** "HH:MM" (24 h) or null. */
  scheduled_time: string | null;
  laser: LaserChecks;
  energize: EnergizeChecks;
  /** 1..10 or null. */
  energy: number | null;
  reflection_note: string | null;
  change_for_tomorrow: string | null;
  /** The tactic the user confirmed in Coach for this day (null when none). Set only by POST /coach/tactic/confirm. */
  tactic: CoachTactic | null;
  /** The user's answer on Reflect: did they apply that tactic? null = not answered (always null without a tactic). */
  tactic_applied: boolean | null;
}

/** PUT /daily-entry/today body. A key that is absent stays as it is; for text / time / energy an explicit null clears it. */
export interface DailyEntryPatch {
  highlight?: string | null;
  highlight_done?: boolean;
  scheduled_time?: string | null;
  laser?: Partial<LaserChecks>;
  energize?: Partial<EnergizeChecks>;
  energy?: number | null;
  reflection_note?: string | null;
  change_for_tomorrow?: string | null;
  /** Only valid when the day has a confirmed tactic (the server answers 422 otherwise). */
  tactic_applied?: boolean;
}

/** One day of GET /daily-entry/recent. `highlight_done` is null when that day had no Highlight (so a day without one
 * is never shown as a failed one). Deliberately nothing else: no counts, rates or streaks. */
export interface RecentDay {
  date: string;
  highlight: string | null;
  highlight_done: boolean | null;
}

/** GET /daily-entry/recent: exactly 7 days, oldest first, the last one is the requested day. */
export interface DailyEntryRecent {
  days: RecentDay[];
}

/** Normalized shape every ApiClient method throws on failure. */
export interface ApiError {
  kind: ApiErrorKind;
  status: number | null;
  /** Raw server text - never render it; use errorMessage() from lib/dom.ts. */
  message: string;
}

// ---------------- Coach: ONE tactic for today's obstacle ----------------
// POST /coach/tactic/suggest saves nothing; POST /coach/tactic/confirm stores it on today's entry.

/** Both languages come with the tactic, so a language switch needs no new request. */
export interface CoachTactic {
  id: number;
  stage: string;
  title_en: string;
  title_fa: string;
  description_en: string;
  description_fa: string;
}

export interface TacticSuggestion {
  /** True when the obstacle was too vague to pick a tactic: `tactic` is null, ask the user to say more. */
  needs_clarification: boolean;
  blocker_type: string | null;
  tactic: CoachTactic | null;
}

export interface ConfirmedTactic {
  tactic: CoachTactic | null;
  blocker_type: string | null;
}

export const OBSTACLE_MAX_LENGTH = 1000;

// ---------------- Conversation / AI chat (Coach page, right-hand pane) ----------------
// Mirror app/schemas/conversation.py. The chat is a plain conversation: no plan, no extracted profile. It stores its own
// messages and never changes today's entry.

/** Languages the backend understands (anything else falls back to "fa"). */
export type ConversationLang = "fa" | "en";

/** The composer's limit; the backend answers 422 for a longer message. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

export interface StartConversationRequest {
  lang?: ConversationLang;
}

export interface ContinueConversationRequest {
  conversation_id: string;
  message: string;
  lang?: ConversationLang;
}

/** The response of start, continue AND GET /conversation/{id}. `question_fa` holds the assistant's text in the `lang`
 * that was sent (the "_fa" suffix is historical). The state fields are fixed empty values on this chat. */
export interface ConversationTurnResponse {
  conversation_id: string;
  /** Null on start and on GET (no new message). */
  question_fa: string | null;
  done: boolean;
  current_topic: string | null;
  detected_intent: string | null;
  /** "discovery" | "ready" | "closed"; this chat always says "discovery". */
  conversation_stage: string;
  known_information: Record<string, Record<string, string>>;
  missing_information: string[];
  /** GET /conversation/{id} only: the stored transcript, oldest first. */
  messages?: ChatHistoryMessage[] | null;
}

/** One row of GET /conversation (the history list). */
export interface ConversationSummary {
  conversation_id: string;
  /** The first thing the user said, trimmed to 60 characters. Never empty. */
  title: string;
  /** ISO datetime of the last message. */
  updated_at: string;
  message_count: number;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  /** ISO datetime. */
  at: string | null;
}

export type ChatRole = "user" | "assistant" | "system";

/** "pending" = the user's bubble awaiting the answer, "sent" = confirmed, "error" = request failed. */
export type ChatMessageStatus = "pending" | "sent" | "error";

/** Frontend view model of one bubble, built from the user's input and ConversationTurnResponse.question_fa. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string; // ISO datetime
  status: ChatMessageStatus;
}
