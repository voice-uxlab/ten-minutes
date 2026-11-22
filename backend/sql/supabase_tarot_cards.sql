-- Ten Minutes tarot card reference data for Supabase/PostgreSQL.
-- The Korean keywords are project-curated summaries of conventional
-- Rider-Waite-Smith upright and reversed interpretations.
-- This file is idempotent: it can be safely executed more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tarot_cards (
    id SMALLINT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name_ko VARCHAR(64) NOT NULL,
    arcana VARCHAR(8) NOT NULL,
    suit VARCHAR(16),
    rank VARCHAR(16) NOT NULL,
    upright_keywords TEXT[] NOT NULL,
    reversed_keywords TEXT[] NOT NULL,
    CONSTRAINT ck_tarot_cards_id CHECK (id BETWEEN 0 AND 77),
    CONSTRAINT ck_tarot_cards_arcana CHECK (arcana IN ('MAJOR', 'MINOR')),
    CONSTRAINT ck_tarot_cards_suit CHECK (
        (arcana = 'MAJOR' AND suit IS NULL)
        OR
        (arcana = 'MINOR' AND suit IN ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES'))
    )
);

INSERT INTO public.tarot_cards (
    id,
    code,
    name_ko,
    arcana,
    suit,
    rank,
    upright_keywords,
    reversed_keywords
)
VALUES
    (0, 'major-00-fool', '바보', 'MAJOR', NULL, '0', ARRAY['새 출발', '자유', '순수']::text[], ARRAY['무모함', '경솔', '방황']::text[]),
    (1, 'major-01-magician', '마법사', 'MAJOR', NULL, '1', ARRAY['의지', '실행력', '시작할 능력']::text[], ARRAY['속임수', '재능 낭비', '말뿐']::text[]),
    (2, 'major-02-high-priestess', '여사제', 'MAJOR', NULL, '2', ARRAY['직감', '비밀', '기다림']::text[], ARRAY['숨겨진 의도', '직감 무시', '혼란']::text[]),
    (3, 'major-03-empress', '여황제', 'MAJOR', NULL, '3', ARRAY['풍요', '사랑받음', '매력']::text[], ARRAY['집착', '의존', '자기 소홀']::text[]),
    (4, 'major-04-emperor', '황제', 'MAJOR', NULL, '4', ARRAY['안정', '주도권', '책임']::text[], ARRAY['통제', '고집', '권위 남용']::text[]),
    (5, 'major-05-hierophant', '교황', 'MAJOR', NULL, '5', ARRAY['전통', '약속', '조언자']::text[], ARRAY['틀 깨기', '불신', '형식적 관계']::text[]),
    (6, 'major-06-lovers', '연인', 'MAJOR', NULL, '6', ARRAY['사랑', '선택', '끌림']::text[], ARRAY['엇갈림', '잘못된 선택', '불균형']::text[]),
    (7, 'major-07-chariot', '전차', 'MAJOR', NULL, '7', ARRAY['전진', '승리', '의지']::text[], ARRAY['폭주', '방향 상실', '좌절']::text[]),
    (8, 'major-08-strength', '힘', 'MAJOR', NULL, '8', ARRAY['부드러운 용기', '인내', '자기 확신']::text[], ARRAY['자기 의심', '감정 폭발', '무력감']::text[]),
    (9, 'major-09-hermit', '은둔자', 'MAJOR', NULL, '9', ARRAY['성찰', '혼자만의 시간', '내면의 답']::text[], ARRAY['고립', '회피', '외로움']::text[]),
    (10, 'major-10-wheel-of-fortune', '운명의 수레바퀴', 'MAJOR', NULL, '10', ARRAY['전환점', '흐름', '타이밍']::text[], ARRAY['엇나간 타이밍', '정체', '반복']::text[]),
    (11, 'major-11-justice', '정의', 'MAJOR', NULL, '11', ARRAY['공정', '결과', '책임']::text[], ARRAY['불공정', '핑계', '회피']::text[]),
    (12, 'major-12-hanged-man', '매달린 사람', 'MAJOR', NULL, '12', ARRAY['멈춤', '관점 전환', '희생']::text[], ARRAY['헛된 희생', '질질 끌기', '답답함']::text[]),
    (13, 'major-13-death', '죽음', 'MAJOR', NULL, '13', ARRAY['끝과 시작', '정리', '변화']::text[], ARRAY['미련', '변화 거부', '끝내지 못함']::text[]),
    (14, 'major-14-temperance', '절제', 'MAJOR', NULL, '14', ARRAY['균형', '조율', '회복']::text[], ARRAY['불균형', '과함', '조급함']::text[]),
    (15, 'major-15-devil', '악마', 'MAJOR', NULL, '15', ARRAY['집착', '유혹', '얽매임']::text[], ARRAY['벗어남', '각성', '끊어냄']::text[]),
    (16, 'major-16-tower', '탑', 'MAJOR', NULL, '16', ARRAY['갑작스런 붕괴', '진실 폭로', '충격']::text[], ARRAY['피한 위기', '두려움', '서서히 무너짐']::text[]),
    (17, 'major-17-star', '별', 'MAJOR', NULL, '17', ARRAY['희망', '치유', '기대']::text[], ARRAY['실망', '자신감 상실', '막연함']::text[]),
    (18, 'major-18-moon', '달', 'MAJOR', NULL, '18', ARRAY['불안', '모호함', '오해']::text[], ARRAY['진실이 드러남', '불안 해소', '혼란 정리']::text[]),
    (19, 'major-19-sun', '태양', 'MAJOR', NULL, '19', ARRAY['기쁨', '성공', '확신']::text[], ARRAY['일시적 흐림', '과신', '지연']::text[]),
    (20, 'major-20-judgement', '심판', 'MAJOR', NULL, '20', ARRAY['부활', '재회', '결단']::text[], ARRAY['자기 비판', '미련', '결정 미루기']::text[]),
    (21, 'major-21-world', '세계', 'MAJOR', NULL, '21', ARRAY['완성', '성취', '한 사이클의 끝']::text[], ARRAY['미완성', '마무리 부족', '지연']::text[]),
    (22, 'wands-ace', '완드 에이스', 'MINOR', 'WANDS', 'ACE', ARRAY['새 열정', '시작의 불꽃', '기회']::text[], ARRAY['지연', '의욕 저하', '헛불']::text[]),
    (23, 'wands-2', '완드 2', 'MINOR', 'WANDS', '2', ARRAY['계획', '선택', '더 넓은 세상']::text[], ARRAY['망설임', '두려움', '안주']::text[]),
    (24, 'wands-3', '완드 3', 'MINOR', 'WANDS', '3', ARRAY['확장', '결실을 기다림', '전망']::text[], ARRAY['지연', '좌절된 기대', '좁은 시야']::text[]),
    (25, 'wands-4', '완드 4', 'MINOR', 'WANDS', '4', ARRAY['축하', '안정', '결실']::text[], ARRAY['불안정', '갈등', '미뤄진 축하']::text[]),
    (26, 'wands-5', '완드 5', 'MINOR', 'WANDS', '5', ARRAY['경쟁', '갈등', '의견 충돌']::text[], ARRAY['갈등 회피', '내부 다툼', '해소']::text[]),
    (27, 'wands-6', '완드 6', 'MINOR', 'WANDS', '6', ARRAY['승리', '인정', '자신감']::text[], ARRAY['자만', '인정받지 못함', '추락']::text[]),
    (28, 'wands-7', '완드 7', 'MINOR', 'WANDS', '7', ARRAY['방어', '버티기', '소신']::text[], ARRAY['지침', '포기', '압도됨']::text[]),
    (29, 'wands-8', '완드 8', 'MINOR', 'WANDS', '8', ARRAY['빠른 진행', '연락', '급전개']::text[], ARRAY['지연', '엇갈린 연락', '성급함']::text[]),
    (30, 'wands-9', '완드 9', 'MINOR', 'WANDS', '9', ARRAY['경계', '인내', '마지막 버티기']::text[], ARRAY['지침', '피해의식', '방어적 태도']::text[]),
    (31, 'wands-10', '완드 10', 'MINOR', 'WANDS', '10', ARRAY['과부하', '책임', '짐']::text[], ARRAY['짐 내려놓기', '번아웃', '위임']::text[]),
    (32, 'wands-page', '완드 시종', 'MINOR', 'WANDS', 'PAGE', ARRAY['설렘', '새 소식', '호기심']::text[], ARRAY['조급함', '변덕', '나쁜 소식']::text[]),
    (33, 'wands-knight', '완드 기사', 'MINOR', 'WANDS', 'KNIGHT', ARRAY['열정적 돌진', '모험', '밀어붙임']::text[], ARRAY['성급함', '변덕', '바람기']::text[]),
    (34, 'wands-queen', '완드 여왕', 'MINOR', 'WANDS', 'QUEEN', ARRAY['자신감', '매력', '당당함']::text[], ARRAY['질투', '자기 의심', '까칠함']::text[]),
    (35, 'wands-king', '완드 왕', 'MINOR', 'WANDS', 'KING', ARRAY['리더십', '비전', '대담함']::text[], ARRAY['독단', '성급함', '허세']::text[]),
    (36, 'cups-ace', '컵 에이스', 'MINOR', 'CUPS', 'ACE', ARRAY['새 감정', '사랑의 시작', '마음 열림']::text[], ARRAY['감정 억압', '공허함', '닫힌 마음']::text[]),
    (37, 'cups-2', '컵 2', 'MINOR', 'CUPS', '2', ARRAY['서로 끌림', '교감', '연결']::text[], ARRAY['엇갈림', '불균형', '관계 균열']::text[]),
    (38, 'cups-3', '컵 3', 'MINOR', 'CUPS', '3', ARRAY['우정', '축하', '즐거움']::text[], ARRAY['과음', '삼각관계', '소외감']::text[]),
    (39, 'cups-4', '컵 4', 'MINOR', 'CUPS', '4', ARRAY['무관심', '권태', '놓친 기회']::text[], ARRAY['새 관심', '각성', '다시 보기']::text[]),
    (40, 'cups-5', '컵 5', 'MINOR', 'CUPS', '5', ARRAY['상실', '후회', '슬픔']::text[], ARRAY['회복', '수용', '다시 일어섬']::text[]),
    (41, 'cups-6', '컵 6', 'MINOR', 'CUPS', '6', ARRAY['추억', '순수', '옛사람']::text[], ARRAY['과거에 갇힘', '미련', '성장']::text[]),
    (42, 'cups-7', '컵 7', 'MINOR', 'CUPS', '7', ARRAY['환상', '많은 선택지', '망상']::text[], ARRAY['현실 자각', '결단', '환상이 깨짐']::text[]),
    (43, 'cups-8', '컵 8', 'MINOR', 'CUPS', '8', ARRAY['떠남', '더 나은 것 찾기', '미련 버림']::text[], ARRAY['떠나지 못함', '두려움', '방황']::text[]),
    (44, 'cups-9', '컵 9', 'MINOR', 'CUPS', '9', ARRAY['소원 성취', '만족', '기쁨']::text[], ARRAY['욕심', '허세', '불만족']::text[]),
    (45, 'cups-10', '컵 10', 'MINOR', 'CUPS', '10', ARRAY['행복한 관계', '가족', '정서적 완성']::text[], ARRAY['불화', '이상과 현실의 차이', '깨진 기대']::text[]),
    (46, 'cups-page', '컵 시종', 'MINOR', 'CUPS', 'PAGE', ARRAY['설레는 연락', '감수성', '고백']::text[], ARRAY['감정적 미숙', '서운함', '변덕']::text[]),
    (47, 'cups-knight', '컵 기사', 'MINOR', 'CUPS', 'KNIGHT', ARRAY['로맨틱한 접근', '고백', '제안']::text[], ARRAY['말뿐인 로맨스', '변심', '환상']::text[]),
    (48, 'cups-queen', '컵 여왕', 'MINOR', 'CUPS', 'QUEEN', ARRAY['공감', '직관', '따뜻함']::text[], ARRAY['감정 과잉', '의존', '자기 희생']::text[]),
    (49, 'cups-king', '컵 왕', 'MINOR', 'CUPS', 'KING', ARRAY['감정 조절', '포용', '성숙']::text[], ARRAY['감정 억압', '조종', '냉담']::text[]),
    (50, 'swords-ace', '소드 에이스', 'MINOR', 'SWORDS', 'ACE', ARRAY['명료함', '진실', '결단']::text[], ARRAY['혼란', '잘못된 판단', '말의 상처']::text[]),
    (51, 'swords-2', '소드 2', 'MINOR', 'SWORDS', '2', ARRAY['교착', '결정 회피', '외면']::text[], ARRAY['결단', '정보 과다', '진실 직면']::text[]),
    (52, 'swords-3', '소드 3', 'MINOR', 'SWORDS', '3', ARRAY['상처', '이별의 아픔', '배신']::text[], ARRAY['회복', '용서', '아픔이 옅어짐']::text[]),
    (53, 'swords-4', '소드 4', 'MINOR', 'SWORDS', '4', ARRAY['휴식', '회복', '잠시 멈춤']::text[], ARRAY['번아웃', '불안', '무리한 복귀']::text[]),
    (54, 'swords-5', '소드 5', 'MINOR', 'SWORDS', '5', ARRAY['이기적 승리', '상처뿐인 다툼']::text[], ARRAY['화해', '후회', '갈등 정리']::text[]),
    (55, 'swords-6', '소드 6', 'MINOR', 'SWORDS', '6', ARRAY['떠남', '이동', '회복을 향한 길']::text[], ARRAY['떠나지 못함', '미해결', '되돌아감']::text[]),
    (56, 'swords-7', '소드 7', 'MINOR', 'SWORDS', '7', ARRAY['속임수', '숨김', '혼자 꾀부림']::text[], ARRAY['진실 고백', '들통', '양심']::text[]),
    (57, 'swords-8', '소드 8', 'MINOR', 'SWORDS', '8', ARRAY['스스로 갇힘', '무력감', '제약']::text[], ARRAY['벗어남', '새 관점', '해방']::text[]),
    (58, 'swords-9', '소드 9', 'MINOR', 'SWORDS', '9', ARRAY['불안', '걱정', '잠 못 드는 밤']::text[], ARRAY['불안 해소', '최악은 아님', '도움 요청']::text[]),
    (59, 'swords-10', '소드 10', 'MINOR', 'SWORDS', '10', ARRAY['바닥', '끝', '고통의 정점']::text[], ARRAY['회복 시작', '최악은 지남', '재기']::text[]),
    (60, 'swords-page', '소드 시종', 'MINOR', 'SWORDS', 'PAGE', ARRAY['호기심', '탐색', '눈치']::text[], ARRAY['뒷말', '경솔한 말', '의심']::text[]),
    (61, 'swords-knight', '소드 기사', 'MINOR', 'SWORDS', 'KNIGHT', ARRAY['돌진', '직설', '급한 결정']::text[], ARRAY['무모함', '공격적 태도', '말실수']::text[]),
    (62, 'swords-queen', '소드 여왕', 'MINOR', 'SWORDS', 'QUEEN', ARRAY['명료함', '독립', '정직']::text[], ARRAY['냉정함', '날카로운 말', '고립']::text[]),
    (63, 'swords-king', '소드 왕', 'MINOR', 'SWORDS', 'KING', ARRAY['이성', '판단', '원칙']::text[], ARRAY['냉혹함', '통제', '권위적 태도']::text[]),
    (64, 'pentacles-ace', '펜타클 에이스', 'MINOR', 'PENTACLES', 'ACE', ARRAY['새 기회', '현실적 시작', '안정의 씨앗']::text[], ARRAY['놓친 기회', '계획 부족', '불안정']::text[]),
    (65, 'pentacles-2', '펜타클 2', 'MINOR', 'PENTACLES', '2', ARRAY['균형 잡기', '저글링', '유연함']::text[], ARRAY['과부하', '우선순위 혼란', '불균형']::text[]),
    (66, 'pentacles-3', '펜타클 3', 'MINOR', 'PENTACLES', '3', ARRAY['협력', '실력 인정', '함께 만들기']::text[], ARRAY['팀워크 부족', '평가절하', '엇박자']::text[]),
    (67, 'pentacles-4', '펜타클 4', 'MINOR', 'PENTACLES', '4', ARRAY['지킴', '안정', '소유욕']::text[], ARRAY['집착', '인색함', '놓아주기']::text[]),
    (68, 'pentacles-5', '펜타클 5', 'MINOR', 'PENTACLES', '5', ARRAY['결핍', '소외', '힘든 시기']::text[], ARRAY['회복', '도움의 손길', '바닥 탈출']::text[]),
    (69, 'pentacles-6', '펜타클 6', 'MINOR', 'PENTACLES', '6', ARRAY['나눔', '주고받음', '도움']::text[], ARRAY['불균형한 관계', '빚', '조건부 호의']::text[]),
    (70, 'pentacles-7', '펜타클 7', 'MINOR', 'PENTACLES', '7', ARRAY['기다림', '투자', '중간 점검']::text[], ARRAY['조급함', '헛수고', '방향 재검토']::text[]),
    (71, 'pentacles-8', '펜타클 8', 'MINOR', 'PENTACLES', '8', ARRAY['노력', '성실', '실력 쌓기']::text[], ARRAY['지루한 반복', '완벽주의', '대충함']::text[]),
    (72, 'pentacles-9', '펜타클 9', 'MINOR', 'PENTACLES', '9', ARRAY['자립', '여유', '자기만족']::text[], ARRAY['의존', '과소비', '외로운 독립']::text[]),
    (73, 'pentacles-10', '펜타클 10', 'MINOR', 'PENTACLES', '10', ARRAY['안정된 가정', '장기적 결실', '유산']::text[], ARRAY['가족 갈등', '불안정', '재정 문제']::text[]),
    (74, 'pentacles-page', '펜타클 시종', 'MINOR', 'PENTACLES', 'PAGE', ARRAY['배움', '성실한 시작', '새 기회']::text[], ARRAY['게으름', '계획만 함', '비현실']::text[]),
    (75, 'pentacles-knight', '펜타클 기사', 'MINOR', 'PENTACLES', 'KNIGHT', ARRAY['꾸준함', '신중함', '책임감']::text[], ARRAY['정체', '지루함', '느린 진전']::text[]),
    (76, 'pentacles-queen', '펜타클 여왕', 'MINOR', 'PENTACLES', 'QUEEN', ARRAY['현실적 배려', '풍요', '안정감']::text[], ARRAY['일 중독', '자기 소홀', '물질 집착']::text[]),
    (77, 'pentacles-king', '펜타클 왕', 'MINOR', 'PENTACLES', 'KING', ARRAY['성공', '안정', '든든함']::text[], ARRAY['고집', '물질주의', '통제']::text[])
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name_ko = EXCLUDED.name_ko,
    arcana = EXCLUDED.arcana,
    suit = EXCLUDED.suit,
    rank = EXCLUDED.rank,
    upright_keywords = EXCLUDED.upright_keywords,
    reversed_keywords = EXCLUDED.reversed_keywords;

COMMIT;

-- Expected result: total_count=78, major_count=22, minor_count=56.
SELECT
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE arcana = 'MAJOR') AS major_count,
    COUNT(*) FILTER (WHERE arcana = 'MINOR') AS minor_count
FROM public.tarot_cards;
