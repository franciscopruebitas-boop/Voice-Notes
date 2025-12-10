import { useEffect, useRef, useState } from "react";
import "./App.css";

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  color: string;
  size: number;
  erase: boolean;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(5);
  const [eraseMode, setEraseMode] = useState(false);

  const [history, setHistory] = useState<Stroke[]>([]);
  const [_redo, setRedo] = useState<Stroke[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);


  // Obtener la URL del backend desde las variables de entorno de Vite
 
  let backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
 
  // Asegurarse de que la URL del backend no termine con una barra
 
  if (backendUrl.endsWith("/")) {
    backendUrl = backendUrl.slice(0, -1);
  }


  // =============================
  //      GET POINTER POSITION
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
  //       RESIZE CANVAS
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
  //       REDRAW HISTORY
  // =============================
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    history.forEach((stroke) => {
      ctx.lineWidth = stroke.size;
      ctx.strokeStyle = stroke.erase ? "#fff" : stroke.color;
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";

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
  //   INITIAL SETUP + LOAD
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
  //        DRAWING EVENTS
  // =============================
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    setIsDrawing(true);
    setRedo([]); // clear redo stack

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
      const updated = [...h];
      updated[updated.length - 1].points.push(pos);
      return updated;
    });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // =============================
  //         TOOLBAR
  // =============================
 
  {error && <p style={{ color: "red" }}>⚠️ {error}</p>}
  {isLoading && <p>⏳ Procesando...</p>}


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

  const newNote = () => clearAll();

  const exportImage = () => {
    const canvas = canvasRef.current!;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "nota.png";
    a.click();
  };

  const sendToAPI = async () => {
    if (!canvasRef.current) return;
    const imageDataUrl = canvasRef.current.toDataURL();
    if (!imageDataUrl) {
      setError("No se pudo obtener la imagen del lienzo.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error del servidor: ${errorText}`);
      }
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error desconocido.");
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

      <div className="toolbar">
        <button onClick={undo}>↩️ Undo</button>
        <button onClick={redoAction}>↪️ Redo</button>
        <button onClick={newNote}>🆕 Nueva nota</button>

        <button
          onClick={() => setEraseMode(!eraseMode)}
          className={eraseMode ? "active" : ""}
        >
          🧽 Borrar
        </button>

        <label>
          🎨 Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
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

        <button onClick={exportImage}>📥 Exportar</button>
        <button onClick={sendToAPI}>🔊 Leer</button>
      </div>
    </div>
  );
}

export default App;
