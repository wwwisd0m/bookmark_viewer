import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages 프로젝트 사이트: Actions에서 BASE_PATH=/저장소이름/ 로 설정 */
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? "/",
});
