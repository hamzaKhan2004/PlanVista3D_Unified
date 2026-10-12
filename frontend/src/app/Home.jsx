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
import { createProject, getProjects } from "../infrastructure/puter/puterStorage";
import { loadModelProjects } from "../infrastructure/storage/projectStorage";

const Home = () => {
  const navigate = useNavigate();
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
    const fetchRecent = async () => {
      try {
        const puterItems = await getProjects();
        const formattedPuter = (puterItems || []).slice(0, 4).map((i) => ({
          ...i,
          type: "image_2d",
        }));

        const localModels = (loadModelProjects() || []).slice(0, 4).map((i) => ({
          ...i,
          type: "model_3d",
        }));

        const combined = [...formattedPuter, ...localModels]
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, 6);

        setRecentProjects(combined);
      } catch (err) {
        console.error("Could not fetch recent projects:", err);
      }
    };

    fetchRecent();
  }, []);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Live Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold mb-6 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span>Unified Architectural Studio 2.0</span>
        </div>

        <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold text-zinc-900 tracking-tight max-w-4xl mx-auto leading-[1.05]">
          Build beautiful spaces at the speed of thought.
        </h1>

        <p className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto mt-6 leading-relaxed">
          PlanVista3D combines generative AI architectural visualization with customizable CAD 3D geometric modeling in one unified studio.
        </p>

        {/* Dual Mode Cards Call-To-Action */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-14 text-left">
          {/* Card 1: 3D AI Visualizer */}
          <div className="card-warm relative overflow-hidden group hover:border-orange-300 transition-all flex flex-col justify-between p-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-900">
                Photorealistic AI Render
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Transform flat 2D floor plans into top-down, daylighted, photorealistic 3D visualizations with furniture mapping and before-and-after slider comparisons.
              </p>
              <ul className="text-xs text-zinc-500 space-y-1.5 pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Supports PNG, JPG, WEBP floor plans
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Removes clutter & dimensions automatically
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Interactive Before/After slider & export
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
          <div className="card-warm relative overflow-hidden group hover:border-purple-300 transition-all flex flex-col justify-between p-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Box className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-900">
                Customizable 3D CAD Studio
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Extrude geometric building meshes from CAD DXF vectors or segmented raster blueprints. Inspect scene hierarchy, customize materials and transforms with undo/redo, and export .GLB.
              </p>
              <ul className="text-xs text-zinc-500 space-y-1.5 pt-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> AutoCAD DXF & OpenCV raster segmentation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Parametric wall height, thickness, floors
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Interactive CAD properties & undo/redo editing
                </li>
              </ul>
            </div>

            <div className="pt-8 flex flex-col sm:flex-row gap-2">
              <Link to="/generate-model" className="flex-1">
                <Button variant="secondary" size="md" fullWidth className="flex items-center justify-center gap-2 border-purple-200 hover:bg-purple-50/50">
                  <span className="text-purple-700">Generate 3D Model</span>
                  <ArrowRight className="w-4 h-4 text-purple-700" />
                </Button>
              </Link>
              <Link to="/cad-editor" className="sm:w-auto">
                <Button variant="outline" size="md" className="flex items-center justify-center gap-1.5 text-xs text-zinc-700">
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
            <span className="text-xs uppercase font-bold tracking-wider text-zinc-400">
              Quick Upload
            </span>
            <h3 className="font-serif text-3xl font-bold text-zinc-900 mt-1">
              Upload your floor plan to get started
            </h3>
          </div>
          <UploadFloorPlan onComplete={handleUploadComplete} />
        </div>
      </section>

      {/* Recent Projects Showcase */}
      {recentProjects.length > 0 && (
        <section className="py-16 bg-[#f8f5ee] border-t border-[#eae4dc]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between pb-8">
              <div>
                <h2 className="font-serif text-3xl font-bold text-zinc-900">
                  Recent Studio Work
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Explore latest architectural visual renders and geometric CAD meshes.
                </p>
              </div>
              <Link to="/projects">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
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
