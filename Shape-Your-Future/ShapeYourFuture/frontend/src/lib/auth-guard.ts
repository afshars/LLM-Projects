import { isApiError } from "./dom";
import { journey } from "../state/journey";

/**
 * Call this from a view's catch block. If the error was a 401, it
 * clears stored auth state and routes back to Login (Phase 12), and
 * returns true so the caller knows not to also render its own error.
 * For any other error it returns false and does nothing.
 */
export function handleAuthExpiry(err: unknown): boolean {
  if (isApiError(err) && err.kind === "auth") {
    journey.reset();
    return true;
  }
  return false;
}
