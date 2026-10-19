import puter from "@heyputer/puter.js";

/**
 * Checks synchronously whether an active Puter authentication token exists.
 * Does NOT open any popups or trigger network requests.
 * @returns {boolean}
 */
export const isSignedIn = () => {
  try {
    if (typeof puter === "undefined" || !puter) return false;
    if (typeof puter.auth?.isSignedIn === "function") {
      return Boolean(puter.auth.isSignedIn());
    }
    return Boolean(puter.authToken || puter.auth?.token);
  } catch {
    return false;
  }
};

/**
 * Retrieves the current Puter user details safely.
 * If unauthenticated, returns null immediately without opening any Puter dialog.
 * @returns {Promise<Object|null>}
 */
export const getCurrentUser = async () => {
  try {
    if (!isSignedIn()) return null;
    return await puter.auth.getUser();
  } catch (err) {
    // 401 Unauthorized or closed window
    return null;
  }
};

/**
 * Explicit user sign-in action.
 * Must be triggered by a direct user gesture (e.g. clicking 'Log In').
 * @returns {Promise<Object>}
 */
export const signIn = async () => {
  return await puter.auth.signIn();
};

/**
 * Signs the user out of the Puter session.
 * @returns {Promise<void>}
 */
export const signOut = async () => {
  try {
    if (puter?.auth?.signOut) {
      await puter.auth.signOut();
    }
  } catch (err) {
    console.warn("Puter signOut warning:", err);
  }
};

