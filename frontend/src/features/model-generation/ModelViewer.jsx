import React from "react";
import CadEditorPage from "../cad-editor/CadEditorPage";

/**
 * ModelViewer serves as a compatibility wrapper pointing to the full customizable CadEditorPage workspace.
 */
const ModelViewer = (props) => {
  return <CadEditorPage {...props} />;
};

export default ModelViewer;
