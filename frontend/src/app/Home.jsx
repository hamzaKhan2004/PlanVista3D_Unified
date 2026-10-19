import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Box,
  ArrowRight,
  Layers,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import Button from "../presentation/ui/Button";
import UploadFloorPlan from "../features/image-generation/UploadFloorPlan";
import ProjectCard from "../presentation/projects/ProjectCard";
import { useAuth } from "../presentation/layout/AppLayout";
import { createProject, getProjects } from "../infrastructure/puter/puterStorage";
import { loadModelProjects } from "../infrastructure/storage/projectStorage";

const Home = () => {
  const navigate = useNavigate();
  const { isSignedIn, userId, isLoading: isAuthLoading } = useAuth();
  const [recentProjects, setRecentProjects] = useState([]);

  const handleUploadComplete = async (base64Image) => {
    try {
      const newId = Date.now().toString();
      const name = `Residence ${newId.slice(-4)}`;

      const newItem = {
        id: newId,
        name,
        sourceImage: base64Image,
        renderedImage: undefined,
        ownerId: userId || undefined,
        timestamp: Date.now(),
      };

      const saved = await createProject({
        item: newItem,
        visibility: "private",
      });

      if (!saved) {
        console.error("Failed to create project");
        return false;
      }

      navigate(`/visualizer/${newId}`, {
        state: {
          initialImage: saved.sourceImage,
          name,
        },
      });

      return true;
    } catch (error) {
      console.error("Upload error:", error);
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (isAuthLoading) return;

    if (!isSignedIn || !userId) {
      setRecentProjects([]);
      return;
    }

    const fetchRecent = async () => {
      try {
        const puterItems = await getProjects();
        const formattedPuter = (puterItems || [])
          .filter((i) => !i.ownerId || i.ownerId === userId)
          .slice(0, 4)
          .map((i) => ({
            ...i,
            type: "image_2d",
          }));

        const localModels = (loadModelProjects(userId) || []).slice(0, 4).map((i) => ({
          ...i,
          type: "model_3d",
        }));

        if (!isMounted) return;

        const combined = [...formattedPuter, ...localModels]
          .sort((a, b) => (new Date(b.updatedAt || b.timestamp || 0).getTime()) - (new Date(a.updatedAt || a.timestamp || 0).getTime()))
          .slice(0, 6);

        setRecentProjects(combined);
      } catch (err) {
        console.error("Could not fetch recent projects:", err);
      }
    };

    fetchRecent();

    return () => {
      isMounted = false;
    };
  }, [isSignedIn, userId, isAuthLoading]);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center relative overflow-hidden">
        {/* Ambient architectural glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[720px] h-[340px] bg-gradient-to-b from-orange-500/10 dark:from-[#ff7417]/15 via-orange-400/5 dark:via-[#ffb691]/5 to-transparent blur-3xl pointer-events-none -z-10" />

        {/* Live Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 dark:bg-[#2b2a27] border border-orange-200 dark:border-[#39342f] text-orange-700 dark:text-[#ffb691] text-xs font-semibold mb-6 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-orange-500 dark:bg-[#ff7417] animate-pulse" />
          <span className="font-mono tracking-wider uppercase text-[11px]">Unified Architectural Studio 2.0</span>
        </div>

        <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold text-zinc-900 dark:text-[#f5f0e8] tracking-tight max-w-4xl mx-auto leading-[1.05]">
          Build beautiful spaces at the speed of thought.
        </h1>

        <p className="text-lg sm:text-xl text-zinc-600 dark:text-[#b4ada3] max-w-2xl mx-auto mt-6 leading-relaxed">
          PlanVista3D combines generative AI architectural visualization with customizable CAD 3D geometric modeling in one unified studio.
        </p>

        {/* Dual Mode Cards Call-To-Action */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-14 text-left">
          {/* Card 1: 3D AI Visualizer */}
          <div className="card-warm relative overflow-hidden group hover:border-orange-300 dark:hover:border-[#ff7417]/50 transition-all flex flex-col justify-between p-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-[#ff7417]/20 text-orange-600 dark:text-[#ff7417] flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
                Photorealistic AI Render
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#b4ada3] leading-relaxed">
                Transform flat 2D floor plans into top-down, daylighted, photorealistic 3D visualizations with furniture mapping and before-and-after slider comparisons.
              </p>
              <ul className="text-xs text-zinc-500 dark:text-[#e6e2de] space-y-1.5 pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-[#ffb691]" /> Supports PNG, JPG, WEBP floor plans
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-[#ffb691]" /> Removes clutter & dimensions automatically
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-[#ffb691]" /> Interactive Before/After slider & export
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link to="/generate-image">
                <Button variant="primary" size="md" fullWidth className="flex items-center justify-center gap-2">
                  <span>Start AI Visualization</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Card 2: Geometric 3D CAD Reconstruction & Customization */}
          <div className="card-warm relative overflow-hidden group hover:border-purple-300 dark:hover:border-[#9333ea]/50 transition-all flex flex-col justify-between p-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-[#9333ea]/20 text-purple-600 dark:text-[#ddb8ff] flex items-center justify-center">
                <Box className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
                Customizable 3D CAD Studio
              </h2>
              <p className="text-sm text-zinc-600 dark:text-[#b4ada3] leading-relaxed">
                Extrude geometric building meshes from CAD DXF vectors or segmented raster blueprints. Inspect scene hierarchy, customize materials and transforms with undo/redo, and export .GLB.
              </p>
              <ul className="text-xs text-zinc-500 dark:text-[#e6e2de] space-y-1.5 pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-[#ddb8ff]" /> AutoCAD DXF & OpenCV raster segmentation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-[#ddb8ff]" /> Parametric wall height, thickness, floors
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-[#ddb8ff]" /> Interactive CAD properties & undo/redo editing
                </li>
              </ul>
            </div>

            <div className="pt-8 flex flex-col sm:flex-row gap-2">
              <Link to="/generate-model" className="flex-1">
                <Button variant="secondary" size="md" fullWidth className="flex items-center justify-center gap-2 border-purple-200 dark:border-[#9333ea]/30 hover:bg-purple-50/50 dark:hover:bg-[#9333ea]/15">
                  <span className="text-purple-700 dark:text-[#ddb8ff]">Generate 3D Model</span>
                  <ArrowRight className="w-4 h-4 text-purple-700 dark:text-[#ddb8ff]" />
                </Button>
              </Link>
              <Link to="/cad-editor" className="sm:w-auto">
                <Button variant="outline" size="md" className="flex items-center justify-center gap-1.5 text-xs text-zinc-700 dark:text-[#e6e2de] dark:border-[#39342f] dark:hover:bg-[#2b2a27]">
                  <Layers className="w-3.5 h-3.5" />
                  <span>CAD Workspace</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Inline Quick Upload Box */}
        <div id="quick-upload" className="max-w-2xl mx-auto mt-20 text-left">
          <div className="text-center mb-6">
            <span className="text-xs uppercase font-bold tracking-wider text-zinc-400 dark:text-[#a88b7d]">
              Quick Upload
            </span>
            <h3 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8] mt-1">
              Upload your floor plan to get started
            </h3>
          </div>
          <UploadFloorPlan onComplete={handleUploadComplete} />
        </div>
      </section>

      {/* Recent Projects Showcase */}
      {recentProjects.length > 0 && (
        <section className="py-16 bg-[#f8f5ee] dark:bg-[#141311] border-t border-[#eae4dc] dark:border-[#39342f]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between pb-8">
              <div>
                <h2 className="font-serif text-3xl font-bold text-zinc-900 dark:text-[#f5f0e8]">
                  Recent Studio Work
                </h2>
                <p className="text-xs text-zinc-500 dark:text-[#b4ada3] mt-1">
                  Explore latest architectural visual renders and geometric CAD meshes.
                </p>
              </div>
              <Link to="/projects">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 dark:border-[#39342f] dark:text-[#e6e2de] dark:hover:bg-[#211f1d]">
                  <span>View All Projects</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentProjects.map((p) => (
                <ProjectCard key={p.id || p.taskId} project={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;
