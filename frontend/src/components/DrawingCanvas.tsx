import React, { useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Stage, Layer, Line, Rect } from "react-konva";
import Konva from "konva";

export interface CanvasHandle {
  clear: () => void;
  toDataURL: () => string;
}

interface DrawingCanvasProps {
  width: number;
  height: number;
  theme: "light" | "dark";
}

const DrawingCanvas = forwardRef<CanvasHandle, DrawingCanvasProps>(({ width, height, theme }, ref) => {
  const [lines, setLines] = useState<Konva.Line[]>([]);
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);

  const strokeColor = theme === "light" ? "#000000" : "#FFFFFF";
  const backgroundColor = theme === "light" ? "#FFFFFF" : "#212529";

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    isDrawing.current = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    setLines([...lines, new Konva.Line({ points: [pos.x, pos.y], stroke: strokeColor, strokeWidth: 5, tension: 0.5, globalCompositeOperation: "source-over" })]);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;
    let lastLine = lines[lines.length - 1];
    if (lastLine) {
      lastLine.points(lastLine.points().concat([point.x, point.y]));
      setLines(lines.slice());
    }
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  useImperativeHandle(ref, () => ({
    clear() {
      setLines([]);
    },
    toDataURL() {
      return stageRef.current?.toDataURL({ mimeType: "image/png" }) || "";
    },
  }));

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ border: "1px solid #ced4da", borderRadius: "0.25rem" }}
      ref={stageRef}
    >
      <Layer>
        <Rect width={width} height={height} fill={backgroundColor} />
        {lines.map((line, i) => (
          <Line key={i} points={line.points()} stroke={line.stroke()} strokeWidth={line.strokeWidth()} tension={line.tension()} globalCompositeOperation={line.globalCompositeOperation()} />
        ))}
      </Layer>
    </Stage>
  );
});

export default DrawingCanvas;

