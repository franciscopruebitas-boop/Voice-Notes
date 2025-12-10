import { useEffect, useRef, useState } from "react";
import "./App.css";

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  color: string;
  size: number;
  erase: boolean;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);
  const [eraseMode, setEraseMode] = useState(false);

  const [history, setHistory] = useState<Stroke[]>([]);
  const [redoStack, setRedo] = useState<Stroke[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  let backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
  if (backendUrl.endsWith("/")) backendUrl = backendUrl.slice(0, -1);

  // =============================
  //     GET POINTER POSITION
  // =============================
  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // =============================
  //      RESIZE CANVAS
  // =============================
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement!;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    const ctx = canvas.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctxRef.current = ctx;
    redrawCanvas();
  };

  // =============================
  //      REDRAW HISTORY
  // =============================
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    history.forEach((stroke) => {
      ctx.lineWidth = stroke.size;
      ctx.strokeStyle = stroke.color;
      ctx.globalCompositeOperation =
        stroke.erase ? "destination-out" : "source-over";

      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "source-over";
  };

  // =============================
  //     INITIAL SETUP
  // =============================
  useEffect(() => {
    const saved = localStorage.getItem("drawing");
    if (saved) setHistory(JSON.parse(saved));

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  useEffect(() => {
    redrawCanvas();
    localStorage.setItem("drawing", JSON.stringify(history));
  }, [history]);

  // =============================
  //    DRAWING HANDLERS
  // =============================
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    setIsDrawing(true);
    setRedo([]);

    const newStroke: Stroke = {
      points: [pos],
      color,
      size,
      erase: eraseMode,
    };

    setHistory((h) => [...h, newStroke]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPos(e);
    setHistory((h) => {
      const copy = [...h];
      copy[copy.length - 1].points.push(pos);
      return copy;
    });
  };

  const stopDrawing = () => setIsDrawing(false);

  // =============================
  //        TOOLBAR
  // =============================
  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setRedo((r) => [...r, last]);
      return h.slice(0, -1);
    });
  };

  const redoAction = () => {
    setRedo((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setHistory((h) => [...h, last]);
      return r.slice(0, -1);
    });
  };

  const clearAll = () => {
    setHistory([]);
    setRedo([]);
  };

  // =============================
  //   OCR IMPROVED CANVAS (1024px)
  // =============================
  const getOCRCanvas = (): string => {
    const off = document.createElement("canvas");
    off.width = 1024;
    off.height = 1024;

    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, off.width, off.height);

    // Reescalar strokes proporcionales
    history.forEach((stroke) => {
      ctx.lineWidth = stroke.size * 2; // más grueso para mejor OCR
      ctx.strokeStyle = stroke.erase ? "white" : "black";
      ctx.globalCompositeOperation =
        stroke.erase ? "destination-out" : "source-over";

      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const sx = (p.x / canvasRef.current!.width) * 1024;
        const sy = (p.y / canvasRef.current!.height) * 1024;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "source-over";
    return off.toDataURL("image/png");
  };

  // =============================
  //        SEND TO API
  // =============================
  const sendToAPI = async () => {
    const imageDataUrl = getOCRCanvas();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      new Audio(url).play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <h1 className="title">✍️ Voice Notes</h1>

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Procesando...</p>}

      <div className="toolbar">
        <button onClick={undo}>↩️ Undo</button>
        <button onClick={redoAction}>↪️ Redo</button>
        <button onClick={clearAll}>🆕 Nueva nota</button>

        <button
          onClick={() => setEraseMode(!eraseMode)}
          className={eraseMode ? "active" : ""}
        >
          🧽 Borrar
        </button>

        <label>
          🎨 Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>

        <label>
          📏 Grosor ({size}px)
          <input
            type="range"
            min="2"
            max="40"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>

        <button onClick={sendToAPI}>🔊 Leer</button>
      </div>
    </div>
  );
}
