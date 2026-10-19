import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import {
  isSignedIn as puterIsSignedIn,
  getCurrentUser,
  signIn as puterSignIn,
  signOut as puterSignOut,
} from "../../infrastructure/puter/puterAuth";
import { invalidateProjectCache } from "../../lib/puter/puter.action";
import { clearLocalModelProjectsCache } from "../../lib/api/modelApi";

export const AuthContext = createContext({
  isSignedIn: false,
  isLoading: true,
  status: "loading", // "loading" | "authenticated" | "unauthenticated" | "error"
  userName: null,
  userId: null,
  user: null,
  error: null,
  refreshAuth: async () => {},
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const DEFAULT_AUTH_STATE = {
  isSignedIn: false,
  isLoading: true,
  status: "loading",
  userName: null,
  userId: null,
  user: null,
  error: null,
};

const AppLayout = () => {
  const [authState, setAuthState] = useState(DEFAULT_AUTH_STATE);
  const isRefreshingRef = useRef(false);

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("planvista_theme");
      return saved === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.setAttribute("data-theme", "light");
      }
      localStorage.setItem("planvista_theme", theme);
    } catch (e) {
      console.warn("Theme persistence error:", e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const refreshAuth = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      // Synchronous token presence check: never opens popup or causes network overhead if unauthenticated
      const signedIn = puterIsSignedIn();

      if (!signedIn) {
        setAuthState({
          isSignedIn: false,
          isLoading: false,
          status: "unauthenticated",
          userName: null,
          userId: null,
          user: null,
          error: null,
        });
        return false;
      }

      // Valid session exists, resolve user profile
      const user = await getCurrentUser();
      if (user) {
        setAuthState({
          isSignedIn: true,
          isLoading: false,
          status: "authenticated",
          userName: user.username || "Puter User",
          userId: user.uuid || null,
          user,
          error: null,
        });
        return true;
      } else {
        setAuthState({
          isSignedIn: false,
          isLoading: false,
          status: "unauthenticated",
          userName: null,
          userId: null,
          user: null,
          error: null,
        });
        return false;
      }
    } catch (err) {
      console.warn("Puter auth resolution error:", err);
      setAuthState({
        isSignedIn: false,
        isLoading: false,
        status: "error",
        userName: null,
        userId: null,
        user: null,
        error: err?.message || "Failed to resolve Puter session",
      });
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const signIn = async () => {
    try {
      await puterSignIn();
      invalidateProjectCache();
      return await refreshAuth();
    } catch (e) {
      // User closed the window or blocked popup
      console.warn("Puter sign in cancelled or blocked:", e);
      return false;
    }
  };

  const signOut = async () => {
    try {
      await puterSignOut();
    } catch (e) {
      console.warn("Puter sign out warning:", e);
    } finally {
      // Clear all cached project state on logout to prevent cross-account contamination
      invalidateProjectCache();
      clearLocalModelProjectsCache();
      setAuthState({
        isSignedIn: false,
        isLoading: false,
        status: "unauthenticated",
        userName: null,
        userId: null,
        user: null,
        error: null,
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <AuthContext.Provider value={{ ...authState, refreshAuth, signIn, signOut }}>
        <div className="min-h-screen bg-[#fdfbf7] dark:bg-[#141311] text-[#1a1a1a] dark:text-[#e6e2de] flex flex-col font-sans transition-colors duration-200">
          <Navbar
            authState={authState}
            onSignIn={signIn}
            onSignOut={signOut}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
};

export default AppLayout;
