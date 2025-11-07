"use client";
import {
  useGlobalChat,
  useInfiniteCanvas,
  useInspiration,
} from "@/hooks/use-canvas";
import React from "react";
import TextSideBar from "./text-sidebar";
import { cn } from "@/lib/utils";
import ShapesRenderer from "./shapes";
import { RectanglePreview } from "./shapes/rectangle/preview";
import { ElipsePreview } from "./shapes/elipse/preview";
import { FramePreview } from "./shapes/frame/preview";
import { ArrowPreview } from "./shapes/arrow/preview";
import { LinePreview } from "./shapes/line/preview";
import { FreeDrawStrokePreview } from "./shapes/stroke/preview";
import { SelectionOverlay } from "./shapes/selection";
import Autosave from "./autosave";
import InspirationSidebar from "./shapes/inspiration-sidebar";
import ChatWindow from "./shapes/generatedui/chat";

const InfiniteCanvas = () => {
  const {
    viewport,
    shapes,
    currentTool,
    selectedShapes,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    attachCanvasRef,
    getDraftShape,
    getFreeDrawPoints,
    isSidebarOpen,
    hasSelectedText,
  } = useInfiniteCanvas();

  const { isInspirationOpen, closeInspiration, toggleInspiration } =
    useInspiration();

  const {
    activeGeneratedUUid,
    generateWorkflow,
    isChatOpen,
    exportDesign,
    toggleChat,
    closeChat,
  } = useGlobalChat();

  const draftShape = getDraftShape();
  const freeDrawPoints = getFreeDrawPoints();

  return (
    <>
      <TextSideBar isOpen={isSidebarOpen && hasSelectedText} />
      <InspirationSidebar
        isOpen={isInspirationOpen}
        onClose={closeInspiration}
      />

      {activeGeneratedUUid && (
        <ChatWindow
          generatedUIId={activeGeneratedUUid}
          isOpen={isChatOpen}
          onClose={closeChat}
        />
      )}

      <div className="absolute top-4 right-4 z-50">
        <Autosave />
      </div>
      <div
        ref={attachCanvasRef}
        role="application"
        aria-label="Infinite drawing Canvas"
        className={cn(
          "relative w-full h-screen overflow-hidden select-none z-0",

          {
            "cursor-grabbing": viewport.mode === "panning",
            "cursor-grab": viewport.mode === "shiftPanning",
            "cursor-crosshair":
              currentTool !== "select" && viewport.mode === "idle",
            "cursor-default":
              currentTool === "select" && viewport.mode === "idle",
          }
        )}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          console.log("🎯 Canvas div clicked!", e.target);
          onPointerDown(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      >
        <div
          className="absolute origin-top-left pointer-events-none z-10"
          style={{
            transform: `translate(${viewport.translate.x}px, ${viewport.translate.y}px) scale(${viewport.scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* Render persisted shapes */}
          {shapes.map((shape) => (
            <ShapesRenderer
              key={shape.id}
              shape={shape}
              toggleInspiration={toggleInspiration}
              generateWorkflow={generateWorkflow}
              exportDesign={exportDesign}
              toggleChat={toggleChat}
            />
          ))}

          {shapes.map((shape) => (
            <SelectionOverlay
              key={`selection-${shape.id}`}
              shape={shape}
              isSelected={!!selectedShapes[shape.id]}
            />
          ))}

          {/* Render draft shape while drawing */}
          {draftShape && draftShape.type === "rect" && (
            <RectanglePreview
              startWorld={draftShape.startWorld}
              currentWorld={draftShape.currentWorld}
            />
          )}
          {draftShape && draftShape.type === "ellipse" && (
            <ElipsePreview
              startWorld={draftShape.startWorld}
              currentWorld={draftShape.currentWorld}
            />
          )}
          {draftShape && draftShape.type === "frame" && (
            <FramePreview
              startWorld={draftShape.startWorld}
              currentWorld={draftShape.currentWorld}
            />
          )}
          {draftShape && draftShape.type === "arrow" && (
            <ArrowPreview
              startWorld={draftShape.startWorld}
              currentWorld={draftShape.currentWorld}
            />
          )}
          {draftShape && draftShape.type === "line" && (
            <LinePreview
              startWorld={draftShape.startWorld}
              currentWorld={draftShape.currentWorld}
            />
          )}

          {/* Render freedraw points while drawing */}
          {currentTool === "freedraw" && freeDrawPoints.length > 0 && (
            <FreeDrawStrokePreview points={freeDrawPoints} />
          )}
        </div>
      </div>
    </>
  );
};

export default InfiniteCanvas;
