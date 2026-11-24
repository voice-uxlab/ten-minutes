import { spreads } from "../shared/spreads.ts";
const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
) => ({
  type: "function",
  name,
  description,
  parameters: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
});
export const tools = [
  tool(
    "review_question",
    "고민과 필요한 관점을 정리하고 말로 질문의 취지를 확인할 준비를 한다. 배치는 네 유형 중 사연에 맞춰 내부적으로 정하고 장수는 항상 3장으로 고정하며 사용자에게 고르게 하지 않는다. 선택지 비교는 choices에 실제 두 선택을 넣는다.",
    {
      question: { type: "string" },
      spreadId: { type: "string", enum: Object.keys(spreads) },
      choices: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
      },
      timeframe: { type: "string" },
    },
    ["question", "spreadId"],
  ),
  tool(
    "confirm_question",
    "사용자가 질문에 동의했거나 이미 해당 상황으로 봐달라고 명확히 요청했으면 번호 선택을 시작한다. 같은 요청을 다시 승인받지 않는다.",
  ),
  tool(
    "select_numbers",
    "번호를 들을 때마다 누적한다. 일부만 말해도 즉시 호출하고 remaining만큼 더 요청한다. replace는 명시적인 수정에만 사용한다.",
    {
      picks: { type: "array", items: { type: "integer" } },
      replace: { type: "boolean" },
    },
    ["picks"],
  ),
  tool(
    "confirm_cards",
    "필요한 번호가 모두 모이고 사용자가 번호를 확인했을 때만 확정한다.",
  ),
  tool(
    "reveal_card",
    "확정한 카드를 자리 순서대로 공개한다. 실제 카드 이름과 정역은 결과만 따른다.",
    { slot: { type: "integer", minimum: 1, maximum: 3 } },
    ["slot"],
  ),
  tool(
    "show_reading",
    "현재 공개한 카드 한 장의 해석 근거를 받는다. slot 1, 2, 3을 각각 사용한다. 해당 카드 설명 후 사용자 생각을 묻고 실제 답변을 받은 다음에만 다음 reveal_card를 호출한다. 세 장의 개별 해석이 끝나면 slot:0으로 짧게 마무리한다.",
    {
      slot: { type: "integer", minimum: 0, maximum: 3 },
      slots: {
        type: "array",
        items: { type: "integer", minimum: 1, maximum: 3 },
        minItems: 1,
        maxItems: 1,
      },
    },
  ),
  tool(
    "end_call",
    "사용자가 종료를 요청하거나 마지막 인사를 마치면 통화를 끝낸다.",
  ),
];
export const flowInstructions = `
[음성 중심 리딩 진행 규칙]
각 단계는 음성만으로 완료한다. review_question으로 현재 사연을 정리한다. 이미 해당 상황으로 리딩을 요청했으면 그 요청을 근거로 confirm_question을 이어서 호출한다. 주제가 불분명할 때만 한 번 확인한다. 번호 확인 뒤 실제 긍정 발화가 오면 confirm_cards를 호출한다. 버튼 입력을 기다리지 않는다. 확인 후 reveal_card와 show_reading을 이어서 실행하며 카드마다 사용자 조작을 요구하지 않는다. 도구 결과와 현재 진행 상태를 Live에게 전달하여 필요한 질문과 리딩을 음성으로 안내한다.
상황과 주제가 드러나면 더 캐묻지 말고 목적에 맞는 배치를 내부적으로 정한다. 정말 필요한 경우에만 핵심 확인 질문 하나를 한다. 리딩 방식·배치 선택 메뉴를 제시하지 않는다. 항상 78장 중 서로 다른 3장을 고른다. 아래 네 유형만 사용한다.
${Object.entries(spreads)
  .map(
    ([id, s]) => `${id}: ${s.positions.length}장, ${s.positions.join(" / ")}`,
  )
  .join("\n")}
시간 흐름은 timeline, 문제 해결은 situation, 관계는 relationship, 두 선택 비교는 decision을 사용한다. 관계 질문은 상대의 속마음을 사실로 알아내는 대신 사용자의 관심사를 존중하며 관찰된 관계와 자신의 선택을 탐색한다. 기간은 사용자가 묻는 경우 확인한다.
review_question으로 이미 들은 고민을 정리한다. “두 선택에서 어떤 차이가 있는지 같이 보자”처럼 이야기하며 배치 이름·자리 목록·설정 설명을 하지 않는다. 이미 명확히 요청한 고민이면 추가 확인 없이 confirm_question으로 이어가 필요한 번호 수만 안내한다. 모호해서 확인한 경우에는 그 답을 받은 뒤 진행한다. 사용자가 리딩 방식을 묻지 않으면 방법을 설명하지 않는다.
번호를 들을 때마다 select_numbers. 결과 remaining만큼만 더 물으며 중복·범위 밖·이미 뽑은 번호는 채우지 않는다. 사용자의 숫자를 추측하지 않는다. 모이면 번호를 읽고 확인 후 confirm_cards. 화면에서 이미 확인했다는 안내가 오면 다시 확정하지 않는다.
반드시 reveal_card(1) → show_reading(slot:1) → 1번 카드 해석과 질문 → 사용자 답변 듣기 → reveal_card(2) → show_reading(slot:2) → 2번 해석과 질문 → 사용자 답변 듣기 → reveal_card(3) → show_reading(slot:3) → 3번 해석과 질문 → 사용자 답변 듣기 순서다. 설명을 하기 전에 다음 카드를 열거나 세 장을 한꺼번에 설명하지 않는다. 한 응답에서 다음 카드 공개까지 몰아서 호출하지 않는다. 각 카드 설명은 자리 의미에 맞춰 이름과 핵심 근거·결론을 1~2문장으로 말한다. 화면 조작은 요구하지 않지만, 카드마다 사용자의 반응을 듣고 호응한 뒤 이어간다. 음성 재생이 끝나도 사용자 답변 없이 다음 카드로 넘어가지 않는다. 마지막 slot:0은 반복 해석 없이 전체 질문의 결론 한 문장만 말한다.
context.master.policy를 따른다. 각 카드의 knowledge.core 또는 reversed를 출발점으로 자리 질문·사용자가 제공한 사실·다른 카드와 연결하고 해석의 이유를 설명한다. 상징과 맥락 가설을 사실로 단정하지 않는다. 역방향을 무조건 불운이나 반대로 읽지 않는다. 맞지 않는다는 반응에는 불일치를 인정한다.
카드 지식은 RWS 참고이며 현재 표시된 그림을 직접 보고 있다고 말하지 않는다. 카드·방향·배치를 지어내거나 마음에 드는 결과가 나올 때까지 바꾸지 않는다. 추가 카드는 제안하거나 뽑지 않는다. 후속 질문은 선택한 세 장으로 답한다.
도구가 오류를 반환하면 해결한 뒤 진행한다. 마스터·배치·카드·남은 장수는 현재 함수 결과를 기준으로 한다.
`;
