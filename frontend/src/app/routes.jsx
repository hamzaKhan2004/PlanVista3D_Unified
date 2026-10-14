import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "../presentation/layout/AppLayout";
import Home from "./Home";
import LoadingSpinner from "../presentation/ui/LoadingSpinner";

// Route-level code-splitting: heavy 3D CAD & generation bundles are loaded on demand
const GenerateImagePage = lazy(() => import("../features/image-generation/GenerateImagePage"));
const GenerateModelPage = lazy(() => import("../features/model-generation/GenerateModelPage"));
const ImageVisualizer = lazy(() => import("../features/image-generation/ImageVisualizer"));
const CadEditorPage = lazy(() => import("../features/cad-editor/CadEditorPage"));
const ProjectGallery = lazy(() => import("../features/project-gallery/ProjectGallery"));

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route
          path="generate-image"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading Roomify Studio..." />}>
              <GenerateImagePage />
            </Suspense>
          }
        />
        <Route
          path="generate-model"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading 3D Model Generator..." />}>
              <GenerateModelPage />
            </Suspense>
          }
        />
        <Route
          path="visualizer/:id"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading Visualizer..." />}>
              <ImageVisualizer />
            </Suspense>
          }
        />
        <Route
          path="cad-editor"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading PlanVista3D CAD Editor..." />}>
              <CadEditorPage />
            </Suspense>
          }
        />
        <Route
          path="cad-editor/:taskId"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading PlanVista3D CAD Editor..." />}>
              <CadEditorPage />
            </Suspense>
          }
        />
        <Route
          path="model-viewer/:taskId"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading 3D Viewer..." />}>
              <CadEditorPage />
            </Suspense>
          }
        />
        <Route
          path="projects"
          element={
            <Suspense fallback={<LoadingSpinner label="Loading Project Gallery..." />}>
              <ProjectGallery />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
