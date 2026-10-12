import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Sparkles,
  BoxSelect,
  Layers,
  FolderKanban,
  LogIn,
  LogOut,
} from "lucide-react";
import Button from "../ui/Button";

const Navbar = ({ authState, onSignIn, onSignOut }) => {
  const location = useLocation();
  const { isSignedIn, userName } = authState || {};

  const navLinks = [
    { label: "Overview", to: "/" },
    { label: "Generate Image", to: "/generate-image", icon: Sparkles },
    { label: "Generate Model", to: "/generate-model", icon: BoxSelect },
    { label: "CAD Editor", to: "/cad-editor", icon: Layers },
    { label: "Projects", to: "/projects", icon: FolderKanban },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#fdfbf7]/90 backdrop-blur-md border-b border-[#eae4dc]">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm group-hover:bg-orange-600 transition-colors">
              <Box className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl font-bold tracking-tight text-zinc-900 leading-none">
                PlanVista3D
              </span>
              <span className="text-[10px] tracking-wider uppercase text-zinc-500 font-medium">
                Unified Architectural Studio
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map(({ label, to, icon: Icon }) => {
              const isActive =
                location.pathname === to ||
                (to === "/cad-editor" && location.pathname.startsWith("/model-viewer"));
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

        {/* Auth & Actions */}
        <div className="flex items-center space-x-3">
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
      </nav>
    </header>
  );
};

export default Navbar;
