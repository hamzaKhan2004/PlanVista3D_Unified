import React from "react";
import { Box, Heart } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-[#eae4dc] bg-[#f7f4ee]/60 py-10 text-xs text-zinc-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center">
            <Box className="w-3.5 h-3.5" />
          </div>
          <span className="font-serif font-bold text-zinc-800 text-sm">PlanVista3D Unified</span>
          <span className="text-zinc-400">|</span>
          <span>Architectural 3D Reconstruction & AI Visualization</span>
        </div>

        <div className="flex items-center space-x-6 text-zinc-600">
          <Link to="/" className="hover:text-zinc-900 transition-colors">Overview</Link>
          <Link to="/generate-image" className="hover:text-zinc-900 transition-colors">AI Visualization</Link>
          <Link to="/generate-model" className="hover:text-zinc-900 transition-colors">3D CAD Modeling</Link>
          <Link to="/cad-editor" className="hover:text-zinc-900 transition-colors">CAD Editor</Link>
          <Link to="/projects" className="hover:text-zinc-900 transition-colors">Gallery</Link>
        </div>

        <div className="flex items-center text-zinc-400">
          <span>Engineered with React 19, Three.js & Blender 5.0</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
