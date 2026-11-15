import { authStorage } from "../api/auth-storage";
import { profileStore } from "../state/profile";
import { journey } from "../state/journey";
import { confirmDialog } from "./ui";

/** The one way to log out. Asks first (ConfirmDialog, "logout" copy), then:
 * clears the stored token, wipes the profile store and resets the journey
 * (which also drops form drafts, the dashboard data and the Coach suggestion) and
 * lands on the login screen. Resolves true if the user logged out. */
export async function confirmLogout(returnFocusTo?: HTMLElement | null): Promise<boolean> {
  const done = await confirmDialog({
    kind: "logout",
    returnFocusTo,
    onConfirm: () => {
      authStorage.clearToken();
      profileStore.reset();
      journey.reset();
    },
  });
  // The button that opened the dialog is gone or hidden now: focus the view.
  if (done) document.getElementById("view")?.focus({ preventScroll: true });
  return done;
}
