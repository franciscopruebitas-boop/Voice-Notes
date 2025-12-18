import { useEffect, useRef, useState } from "react";
import "./App.css";

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  size: number;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [size, setSize] = useState(5);

  const [history, setHistory] = useState<Stroke[]>([]);
  const [_redoStack, setRedoStack] = useState<Stroke[]>([]);

  const [showSizeMenu, setShowSizeMenu] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [_error, setError] = useState<string | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  // ================================
  //  Backend URL
  // ================================
  let backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:10000";
  if (backendUrl.endsWith("/")) backendUrl = backendUrl.slice(0, -1);

  // ================================
  // Get Pointer Position
  // ================================
  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ================================
  // Resize Canvas
  // ================================
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement!;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    const ctx = canvas.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctxRef.current = ctx;

    redrawCanvas();
  };

  // ================================
  // Redraw all strokes
  // ================================
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff";

    history.forEach((stroke) => {
      ctx.lineWidth = stroke.size;
      ctx.beginPath();

      stroke.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });

      ctx.stroke();
    });
  };

  // ================================
  // Init
  // ================================
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

  // ================================
  // Drawing
  // ================================
  const startDrawing = (e: any) => {
    const pos = getPos(e);
    setIsDrawing(true);
    setRedoStack([]);

    const newStroke: Stroke = {
      points: [pos],
      size,
    };

    setHistory((h) => [...h, newStroke]);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPos(e);

    setHistory((h) => {
      const updated = [...h];
      updated[updated.length - 1].points.push(pos);
      return updated;
    });
  };

  const stopDrawing = () => setIsDrawing(false);

  // ================================
  // Undo / Redo
  // ================================
  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setRedoStack((r) => [...r, last]);
      return h.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setHistory((h) => [...h, last]);
      return r.slice(0, -1);
    });
  };

  const clearAll = () => {
    setHistory([]);
    setRedoStack([]);
  };

  const exportImage = () => {
    const canvas = canvasRef.current!;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "nota.png";
    a.click();
  };

  // ================================
  // Send image to backend
  // ================================
  const sendToAPI = async () => {
    if (!canvasRef.current) return;
    const imageDataUrl = canvasRef.current.toDataURL();

    if (!imageDataUrl) {
      setError("No se pudo leer el lienzo.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      if (!res.ok) throw new Error(await res.text());

      const audioBlob = await res.blob();
      new Audio(URL.createObjectURL(audioBlob)).play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`app theme-${theme}`}>
      <h1 className="title">✍️ Voice Notes (Dark)</h1>

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

      <div className="toolbar">
        <button onClick={undo}>↩️</button>
        <button onClick={redo}>↪️</button>
        <button onClick={clearAll}>🆕</button>

        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? "🌙 Oscuro" : "☀️ Claro"}
        </button>

        <button onClick={() => setShowSizeMenu(!showSizeMenu)}>📏</button>

        {showSizeMenu && (
          <input
            type="range"
            min={2}
            max={40}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        )}

        <button onClick={exportImage}>⬇️</button>
        <button onClick={sendToAPI}>🔊</button>
      </div>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">⌛ Procesando…</p>}
    </div>
  );
}

export default App;
