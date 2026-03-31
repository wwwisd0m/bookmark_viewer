import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GitHub Pages: https://<user>.github.io/bookmark_viewer/
 * base가 /로 빌드되면 JS가 /assets/...로 로드되어 404 → 빈 화면.
 * 로컬 dev는 "/", 프로덕션 빌드는 저장소 경로(또는 BASE_PATH) 사용.
 */
export default defineConfig(({ command }) => {
  const envBase = process.env.BASE_PATH;
  const base =
    envBase != null && envBase !== ""
      ? envBase
      : command === "build"
        ? "/bookmark_viewer/"
        : "/";
  return {
    plugins: [react()],
    base,
  };
});
