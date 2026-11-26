// 프론트 Vercel 프로젝트의 빌드 환경에 해당 환경의 FastAPI 주소를 설정합니다.
// Dev:  https://ten-minutes-api-git-dev-voice-uxlab.vercel.app
// Prod: https://ten-minutes-api.vercel.app
const apiOrigin = process.env.API_PROXY_ORIGIN?.trim().replace(/\/+$/, "");

if (!apiOrigin) {
  throw new Error("Set API_PROXY_ORIGIN in the frontend Vercel environment.");
}

export const config = {
  rewrites: [
    // 카카오 로그인 시작과 콜백을 FastAPI로 전달합니다. 브라우저에는 프론트 주소가 유지됩니다.
    { source: "/auth/:path*", destination: `${apiOrigin}/auth/:path*` },

    // 로그인 상태 조회를 포함한 API 요청을 같은 프론트 주소에서 받을 수 있게 합니다.
    { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },

    // API 경로를 먼저 처리하고, 나머지 화면 경로를 React Router에 넘깁니다.
    { source: "/(.*)", destination: "/index.html" },
  ],
};
