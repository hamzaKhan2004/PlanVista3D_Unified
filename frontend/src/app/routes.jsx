import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "../presentation/layout/AppLayout";
import Home from "./Home";
import GenerateImagePage from "../features/image-generation/GenerateImagePage";
import GenerateModelPage from "../features/model-generation/GenerateModelPage";
import ImageVisualizer from "../features/image-generation/ImageVisualizer";
import CadEditorPage from "../features/cad-editor/CadEditorPage";
import ProjectGallery from "../features/project-gallery/ProjectGallery";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="generate-image" element={<GenerateImagePage />} />
        <Route path="generate-model" element={<GenerateModelPage />} />
        <Route path="visualizer/:id" element={<ImageVisualizer />} />
        <Route path="cad-editor" element={<CadEditorPage />} />
        <Route path="cad-editor/:taskId" element={<CadEditorPage />} />
        <Route path="model-viewer/:taskId" element={<CadEditorPage />} />
        <Route path="projects" element={<ProjectGallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
