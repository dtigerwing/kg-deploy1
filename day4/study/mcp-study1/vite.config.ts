import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = process.env.API_PORT ?? env.API_PORT ?? "8787";
  return {
    plugins: [react()],
    // 메인 앱과 그래프 데모 페이지를 함께 빌드합니다.
    build: {
      rollupOptions: {
        input: { main: "index.html", graph: "graph-preview.html" },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
  };
});
