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

const DEFAULT_AUTH_STATE = {
  isSignedIn: false,
  userName: null,
  userId: null,
};

const AppLayout = () => {
  const [authState, setAuthState] = useState(DEFAULT_AUTH_STATE);

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
    <AuthContext.Provider value={{ ...authState, refreshAuth, signIn, signOut }}>
      <div className="min-h-screen bg-[#fdfbf7] text-[#1a1a1a] flex flex-col font-sans">
        <Navbar authState={authState} onSignIn={signIn} onSignOut={signOut} />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </AuthContext.Provider>
  );
};

export default AppLayout;
