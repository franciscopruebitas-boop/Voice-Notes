import { useRef, useState, useEffect } from "react";
import DrawingCanvas, { type CanvasHandle } from "./components/DrawingCanvas";
import "./App.css";

function App() {
  const canvasRef = useRef<CanvasHandle>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Obtener la URL del backend desde las variables de entorno de Vite
  let backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
  // Asegurarse de que la URL del backend no termine con una barra
  if (backendUrl.endsWith("/")) {
    backendUrl = backendUrl.slice(0, -1);
  }

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    document.body.className = theme;
    return () => window.removeEventListener("resize", handleResize);
  }, [theme]);

  const handleClear = () => canvasRef.current?.clear();
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  const handleSpeak = async () => {
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

  const canvasWidth = dimensions.width * 0.95;
  const canvasHeight = dimensions.height * 0.75;

  return (
    <div className="App">
      <div className="theme-toggle-container">
        <button className="btn btn-outline-secondary" onClick={toggleTheme}>
          {theme === "light" ? "Modo Oscuro" : "Modo Claro"}
        </button>
      </div>
      <h1 className="app-title">Anotador por Voz</h1>
      <p className="app-description">Escribe en el recuadro y presiona "Hablar".</p>
      <div className="canvas-container">
        <DrawingCanvas ref={canvasRef} width={canvasWidth} height={canvasHeight} theme={theme} />
      </div>
      <div className="button-container">
        <button className="btn btn-primary" onClick={handleSpeak} disabled={isLoading}>
          {isLoading ? "Procesando..." : "Hablar"}
        </button>
        <button className="btn btn-secondary" onClick={handleClear}>
          Limpiar
        </button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
    </div>
  );
}

export default App;

