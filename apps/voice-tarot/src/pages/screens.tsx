import { Link } from "react-router-dom";
const rows = [
  ["Live 비교 통화", "/live-lab", "GPT-Live 자막 → Typecast 출력과 지연 확인"],
  ["로그인", "/login", "네이버·카카오 진입, 닉네임 체험"],
  ["닉네임 설정", "/onboarding", "닉네임과 연령 확인"],
  ["홈", "/", "Typecast 목소리, 마이크 권한, 음성 처리·녹음 동의, 상담 시작"],
  [
    "상담",
    "/sessions/:id",
    "연결 → 고민 → 질문 확인 → 번호 선택·확인 → 공개 → 해석·종합 → 종료",
  ],
  [
    "리포트",
    "/sessions/:id/report",
    "요약, 카드, 흐름별 노트, 공유 이미지, 남은 카드 이어보기",
  ],
  ["이용권", "/tickets", "체험용 이용권 추가 (실제 결제 없음)"],
  ["결과", "/payments/result", "데모 지급 결과, 새로고침 시 중복 지급 없음"],
];
export function Screens() {
  return (
    <section className="page">
      <h1>화면 확인표</h1>
      <p>
        상담은 홈의 시범 통화로 각 단계를 확인할 수 있어요. 실제 상담 ID는 통화
        시작 시 만들어져요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th className="p-2">화면</th>
              <th className="p-2">확인할 내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, path, description]) => (
              <tr key={path} className="border-b border-white/20">
                <td className="p-2">
                  {path.includes(":id") ? (
                    name
                  ) : (
                    <Link className="underline" to={path}>
                      {name}
                    </Link>
                  )}
                  <small className="block break-all">{path}</small>
                </td>
                <td className="p-2">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        상담 추가 상태: 연결 중·권한 거부·연결 실패·재연결·번호 부족·카드별 해석
        동의·시간 만료·리포트 생성 중.
      </p>
      <Link to="/">홈에서 시범 통화 시작하기</Link>
    </section>
  );
}
