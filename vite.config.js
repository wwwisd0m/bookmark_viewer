import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * - dev: base "/" (Vite 기본)
 * - build: base "./" → index의 스크립트가 ./assets/... (상대 경로)
 *   GitHub Pages 프로젝트 페이지(/repo/)와 npm run preview(/) 모두에서 동작.
 * 절대 경로 /bookmark_viewer/assets/ 는 preview 서버에 실제 파일이 없어 JS가 404·빈 화면이 됨.
 * 필요 시에만 BASE_PATH로 덮어쓰기 (예: 루트 도메인 전용 배포).
 */
export default defineConfig(({ command }) => {
  const envBase = process.env.BASE_PATH;
  const base =
    envBase != null && envBase !== ""
      ? envBase
      : command === "build"
        ? "./"
        : "/";
  return {
    plugins: [react()],
    base,
  };
});
