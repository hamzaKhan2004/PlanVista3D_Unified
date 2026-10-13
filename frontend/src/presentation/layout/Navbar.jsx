import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Sparkles,
  BoxSelect,
  Layers,
  FolderKanban,
  LogIn,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react";
import Button from "../ui/Button";

const Navbar = ({ authState, onSignIn, onSignOut, theme, onToggleTheme }) => {
  const location = useLocation();
  const { isSignedIn, userName } = authState || {};
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);

  const navLinks = [
    { label: "Overview", to: "/" },
    { label: "Generate Image", to: "/generate-image", icon: Sparkles },
    { label: "Generate Model", to: "/generate-model", icon: BoxSelect },
    { label: "CAD Editor", to: "/cad-editor", icon: Layers },
    { label: "Projects", to: "/projects", icon: FolderKanban },
  ];

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  const isLinkActive = (to) =>
    location.pathname === to ||
    (to === "/cad-editor" && location.pathname.startsWith("/model-viewer")) ||
    (to === "/cad-editor" && location.pathname.startsWith("/cad-editor/"));

  return (
    <header className="sticky top-0 z-50 bg-[#fdfbf7]/90 backdrop-blur-md border-b border-[#eae4dc]" ref={drawerRef}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm group-hover:bg-orange-600 transition-colors">
              <Box className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl font-bold tracking-tight text-zinc-900 leading-none">
                PlanVista3D
              </span>
              <span className="text-[10px] tracking-wider uppercase text-zinc-500 font-medium hidden sm:block">
                Unified Architectural Studio
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map(({ label, to, icon: Icon }) => {
              const isActive = isLinkActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "text-orange-600 bg-orange-50/80 font-semibold"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60"
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4 opacity-75" />}
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right Side: Theme Toggle + Auth + Mobile Toggle */}
        <div className="flex items-center space-x-2">
          {/* Desktop Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
            id="theme-toggle-desktop"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-zinc-600" />
            )}
          </button>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center space-x-3">
            {isSignedIn ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs text-zinc-500 font-medium">Signed in as</span>
                  <span className="text-sm font-semibold text-zinc-800 truncate max-w-[140px]">
                    {userName || "Puter User"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 text-xs text-zinc-700 hover:text-red-600 hover:border-red-200"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSignIn}
                  className="flex items-center gap-1.5 text-zinc-700"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log In</span>
                </Button>
                <Link to="/generate-image">
                  <Button variant="primary" size="sm">
                    Start Building
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            className="md:hidden p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            id="mobile-menu-toggle"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        id="mobile-nav-drawer"
      >
        <div className="border-t border-[#eae4dc] bg-[#fdfbf7] px-4 py-3 space-y-1">
          {navLinks.map(({ label, to, icon: Icon }) => {
            const isActive = isLinkActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "text-orange-700 bg-orange-50 font-semibold"
                    : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100/70"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${isActive ? "text-orange-500" : "text-zinc-400"}`} />}
                {label}
              </Link>
            );
          })}

          {/* Mobile Theme Toggle Row */}
          <div className="flex items-center justify-between py-2 px-1 border-t border-[#eae4dc] dark:border-zinc-800">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Appearance</span>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              id="theme-toggle-mobile"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>

          {/* Mobile Auth Section */}
          <div className="pt-3 mt-1 border-t border-[#eae4dc] dark:border-zinc-800">
            {isSignedIn ? (
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-zinc-500 font-medium">Signed in as</span>
                  <span className="text-sm font-semibold text-zinc-800 truncate max-w-[180px]">
                    {userName || "Puter User"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSignIn}
                  className="flex items-center justify-center gap-1.5 text-zinc-700 w-full"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log In with Puter</span>
                </Button>
                <Link to="/generate-image" className="w-full">
                  <Button variant="primary" size="sm" fullWidth className="flex items-center justify-center">
                    Start Building
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
