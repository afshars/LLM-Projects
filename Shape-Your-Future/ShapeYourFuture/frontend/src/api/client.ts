import { authStorage } from "./auth-storage";
import type {
  ApiError,
  ChangePasswordRequest,
  DailyEntry,
  DailyEntryPatch,
  DailyEntryRecent,
  ProfileOut,
  TokenResponse,
  UpdateProfileRequest,
  ConfirmedTactic,
  ContinueConversationRequest,
  ConversationLang,
  ConversationListResponse,
  ConversationTurnResponse,
  StartConversationRequest,
  TacticSuggestion,
} from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

/** Turns a fetch Response (already known non-ok) + optional parsed body into a normalized ApiError.
 * `llm`: the route calls the LLM, so a 5xx there is "llm_unavailable"
 * (missing/invalid key, unusable model output) instead of a plain "server". */
function classifyError(status: number, body: unknown, llm = false): ApiError {
  const message = extractMessage(body, status);
  if (status === 401) return { kind: "auth", status, message };
  if (status === 404) return { kind: "not_found", status, message };
  if (status === 409) return { kind: "conflict", status, message };
  if (status === 429) return { kind: "rate_limit", status, message };
  if (status === 400 || status === 422) return { kind: "validation", status, message };
  if (status >= 500) return { kind: llm ? "llm_unavailable" : "server", status, message };
  return { kind: "unknown", status, message };
}

/** FastAPI errors are either {detail: string} (HTTPException) or
 * {detail: [{loc, msg, type}, ...]} (pydantic validation, 422). */
function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  }
  return `Request failed (${status})`;
}

/** `path` + `?a=1&b=2`, skipping undefined values. */
function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `${path}?${text}` : path;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: Record<string, string>;
  authenticated?: boolean;
  /** Set on routes that call the LLM (~20 req/min): a 5xx becomes kind "llm_unavailable". */
  llm?: boolean;
}

/** The browser's IANA time zone (e.g. "Asia/Tehran"); the backend uses it to find the user's calendar day. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, authenticated = true, llm = false } = options;

  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const zone = browserTimeZone();
  if (zone) headers["X-Timezone"] = zone;

  if (authenticated) {
    const token = authStorage.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  } catch {
    const err: ApiError = { kind: "network", status: null, message: "Could not reach the server. Check your connection." };
    throw err;
  }

  if (!response.ok) {
    let parsedBody: unknown = null;
    try {
      parsedBody = await response.json();
    } catch {
      // no JSON body - fall through with null
    }
    throw classifyError(response.status, parsedBody, llm);
  }

  // 204 No Content (delete goal, delete busy block, change password): there
  // is no body to parse, so callers of those methods get `undefined`.
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    // A 2xx whose body is not JSON (a proxy's HTML page, a truncated response): report it like any other
    // server failure instead of leaking a raw SyntaxError to the caller.
    const err: ApiError = { kind: llm ? "llm_unavailable" : "server", status: response.status, message: `Invalid response (${response.status})` };
    throw err;
  }
}

export const apiClient = {
  // ---------------- Auth ----------------

  register(username: string, password: string): Promise<TokenResponse> {
    return request<TokenResponse>("/auth/register", {
      method: "POST",
      body: { username, password },
      authenticated: false,
    });
  },

  login(username: string, password: string): Promise<TokenResponse> {
    // The backend expects application/x-www-form-urlencoded (OAuth2PasswordRequestForm),
    // NOT JSON - see app/api/routes/auth.py.
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      form: { username, password },
      authenticated: false,
    });
  },

  // ---------------- Account profile (/profile/me) ----------------

  /** GET /profile/me */
  getProfile(): Promise<ProfileOut> {
    return request<ProfileOut>("/profile/me", { method: "GET" });
  },

  /** PUT /profile/me - REPLACES display_name and bio (a null/blank value
   * clears that field), so always pass both. */
  updateProfile(body: UpdateProfileRequest): Promise<ProfileOut> {
    return request<ProfileOut>("/profile/me", {
      method: "PUT",
      body: { display_name: body.display_name, bio: body.bio },
    });
  },

  /** PUT /profile/me/password - 204 without a body. A wrong current
   * password answers 400; rate limit 5/min. */
  changePassword(body: ChangePasswordRequest): Promise<void> {
    return request<void>("/profile/me/password", {
      method: "PUT",
      body: { current_password: body.current_password, new_password: body.new_password },
    });
  },

  // ---------------- Daily entry (the daily loop) ----------------

  /** GET /daily-entry/today - an empty default (`exists: false`) when nothing is saved yet; never creates a row.
   * `day` is the client's local calendar day (YYYY-MM-DD); the server accepts it within one day of its own date. */
  getDailyEntryToday(day?: string): Promise<DailyEntry> {
    return request<DailyEntry>(withQuery("/daily-entry/today", { day }), { method: "GET" });
  },

  /** PUT /daily-entry/today - upsert. The body is sent as given: absent key = unchanged, null = clear (so it is NOT
   * passed through compact()). The backend is extra="forbid", so callers send only keys of DailyEntryPatch. */
  saveDailyEntryToday(patch: DailyEntryPatch, day?: string): Promise<DailyEntry> {
    return request<DailyEntry>(withQuery("/daily-entry/today", { day }), { method: "PUT", body: patch });
  },

  /** GET /daily-entry/recent - the last 7 days as "Highlight done yes/no" (Reflect). Read-only; no counts. */
  getDailyEntryRecent(day?: string): Promise<DailyEntryRecent> {
    return request<DailyEntryRecent>(withQuery("/daily-entry/recent", { day }), { method: "GET" });
  },

  // ---------------- Coach: one tactic ----------------

  /** POST /coach/tactic/suggest - the AI proposes ONE tactic. Nothing is saved. */
  suggestTactic(obstacle: string, lang: string): Promise<TacticSuggestion> {
    return request<TacticSuggestion>("/coach/tactic/suggest", { method: "POST", body: { obstacle, lang }, llm: true });
  },

  /** POST /coach/tactic/confirm - the user accepted it; this is the only call that saves. */
  confirmTactic(tacticId: number, blockerType: string | null, day?: string): Promise<ConfirmedTactic> {
    return request<ConfirmedTactic>(withQuery("/coach/tactic/confirm", { day }), { method: "POST", body: { tactic_id: tacticId, blocker_type: blockerType } });
  },

  /** GET /coach/tactic/today - the tactic confirmed today (tactic null when none). */
  getConfirmedTactic(day?: string): Promise<ConfirmedTactic> {
    return request<ConfirmedTactic>(withQuery("/coach/tactic/today", { day }), { method: "GET" });
  },

  // ---------------- AI conversation (Coach page chat) ----------------

  /** POST /conversation/start - a new empty thread; the backend only takes `lang`. */
  startConversation(lang: ConversationLang = "fa"): Promise<ConversationTurnResponse> {
    const body: StartConversationRequest = { lang };
    return request<ConversationTurnResponse>("/conversation/start", { method: "POST", body, llm: true });
  },

  /** POST /conversation/continue - one user message, the coach's reply in `question_fa`. 404 if the id is unknown or
   * belongs to another user. Sends the user's calendar day, so the coach knows which day's Highlight is "today". */
  continueConversation(conversationId: string, message: string, lang: ConversationLang = "fa", day?: string): Promise<ConversationTurnResponse> {
    const body: ContinueConversationRequest = { conversation_id: conversationId, message, lang };
    return request<ConversationTurnResponse>(withQuery("/conversation/continue", { day }), { method: "POST", body, llm: true });
  },

  /** GET /conversation - the history list: threads with at least one message, newest first. No LLM call. */
  listConversations(): Promise<ConversationListResponse> {
    return request<ConversationListResponse>("/conversation", { method: "GET" });
  },

  /** GET /conversation/{id} - the stored transcript (`messages`), so a reload redraws the chat. */
  getConversation(conversationId: string): Promise<ConversationTurnResponse> {
    return request<ConversationTurnResponse>(`/conversation/${encodeURIComponent(conversationId)}`, { method: "GET" });
  },
};
