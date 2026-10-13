import React, { createContext, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import {
  getCurrentUser,
  signIn as puterSignIn,
  signOut as puterSignOut,
} from "../../infrastructure/puter/puterAuth";

export const AuthContext = createContext({
  isSignedIn: false,
  userName: null,
  userId: null,
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
  userName: null,
  userId: null,
};

const AppLayout = () => {
  const [authState, setAuthState] = useState(DEFAULT_AUTH_STATE);
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

  const refreshAuth = async () => {
    try {
      const user = await getCurrentUser();
      setAuthState({
        isSignedIn: !!user,
        userName: user?.username || null,
        userId: user?.uuid || null,
      });
      return !!user;
    } catch {
      setAuthState(DEFAULT_AUTH_STATE);
      return false;
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const signIn = async () => {
    try {
      await puterSignIn();
      return await refreshAuth();
    } catch (e) {
      console.error("Sign in failed:", e);
      return false;
    }
  };

  const signOut = async () => {
    try {
      await puterSignOut();
      return await refreshAuth();
    } catch (e) {
      console.error("Sign out failed:", e);
      return false;
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
