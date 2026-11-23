-- Ten Minutes tarot card reference data for Supabase/PostgreSQL.
-- The Korean keywords are project-curated summaries of conventional
-- Rider-Waite-Smith upright interpretations.
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
    CONSTRAINT ck_tarot_cards_id CHECK (id BETWEEN 0 AND 77),
    CONSTRAINT ck_tarot_cards_arcana CHECK (arcana IN ('MAJOR', 'MINOR')),
    CONSTRAINT ck_tarot_cards_suit CHECK (
        (arcana = 'MAJOR' AND suit IS NULL)
        OR
        (arcana = 'MINOR' AND suit IN ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES'))
    )
);

ALTER TABLE public.tarot_cards
    DROP COLUMN IF EXISTS reversed_keywords;

ALTER TABLE public.tarot_cards ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tarot_cards (
    id,
    code,
    name_ko,
    arcana,
    suit,
    rank,
    upright_keywords
)
VALUES
    (0, 'major-00-fool', '바보', 'MAJOR', NULL, '0', ARRAY['새 출발', '자유', '순수']::text[]),
    (1, 'major-01-magician', '마법사', 'MAJOR', NULL, '1', ARRAY['의지', '실행력', '시작할 능력']::text[]),
    (2, 'major-02-high-priestess', '여사제', 'MAJOR', NULL, '2', ARRAY['직감', '비밀', '기다림']::text[]),
    (3, 'major-03-empress', '여황제', 'MAJOR', NULL, '3', ARRAY['풍요', '사랑받음', '매력']::text[]),
    (4, 'major-04-emperor', '황제', 'MAJOR', NULL, '4', ARRAY['안정', '주도권', '책임']::text[]),
    (5, 'major-05-hierophant', '교황', 'MAJOR', NULL, '5', ARRAY['전통', '약속', '조언자']::text[]),
    (6, 'major-06-lovers', '연인', 'MAJOR', NULL, '6', ARRAY['사랑', '선택', '끌림']::text[]),
    (7, 'major-07-chariot', '전차', 'MAJOR', NULL, '7', ARRAY['전진', '승리', '의지']::text[]),
    (8, 'major-08-strength', '힘', 'MAJOR', NULL, '8', ARRAY['부드러운 용기', '인내', '자기 확신']::text[]),
    (9, 'major-09-hermit', '은둔자', 'MAJOR', NULL, '9', ARRAY['성찰', '혼자만의 시간', '내면의 답']::text[]),
    (10, 'major-10-wheel-of-fortune', '운명의 수레바퀴', 'MAJOR', NULL, '10', ARRAY['전환점', '흐름', '타이밍']::text[]),
    (11, 'major-11-justice', '정의', 'MAJOR', NULL, '11', ARRAY['공정', '결과', '책임']::text[]),
    (12, 'major-12-hanged-man', '매달린 사람', 'MAJOR', NULL, '12', ARRAY['멈춤', '관점 전환', '희생']::text[]),
    (13, 'major-13-death', '죽음', 'MAJOR', NULL, '13', ARRAY['끝과 시작', '정리', '변화']::text[]),
    (14, 'major-14-temperance', '절제', 'MAJOR', NULL, '14', ARRAY['균형', '조율', '회복']::text[]),
    (15, 'major-15-devil', '악마', 'MAJOR', NULL, '15', ARRAY['집착', '유혹', '얽매임']::text[]),
    (16, 'major-16-tower', '탑', 'MAJOR', NULL, '16', ARRAY['갑작스런 붕괴', '진실 폭로', '충격']::text[]),
    (17, 'major-17-star', '별', 'MAJOR', NULL, '17', ARRAY['희망', '치유', '기대']::text[]),
    (18, 'major-18-moon', '달', 'MAJOR', NULL, '18', ARRAY['불안', '모호함', '오해']::text[]),
    (19, 'major-19-sun', '태양', 'MAJOR', NULL, '19', ARRAY['기쁨', '성공', '확신']::text[]),
    (20, 'major-20-judgement', '심판', 'MAJOR', NULL, '20', ARRAY['부활', '재회', '결단']::text[]),
    (21, 'major-21-world', '세계', 'MAJOR', NULL, '21', ARRAY['완성', '성취', '한 사이클의 끝']::text[]),
    (22, 'wands-ace', '완드 에이스', 'MINOR', 'WANDS', 'ACE', ARRAY['새 열정', '시작의 불꽃', '기회']::text[]),
    (23, 'wands-2', '완드 2', 'MINOR', 'WANDS', '2', ARRAY['계획', '선택', '더 넓은 세상']::text[]),
    (24, 'wands-3', '완드 3', 'MINOR', 'WANDS', '3', ARRAY['확장', '결실을 기다림', '전망']::text[]),
    (25, 'wands-4', '완드 4', 'MINOR', 'WANDS', '4', ARRAY['축하', '안정', '결실']::text[]),
    (26, 'wands-5', '완드 5', 'MINOR', 'WANDS', '5', ARRAY['경쟁', '갈등', '의견 충돌']::text[]),
    (27, 'wands-6', '완드 6', 'MINOR', 'WANDS', '6', ARRAY['승리', '인정', '자신감']::text[]),
    (28, 'wands-7', '완드 7', 'MINOR', 'WANDS', '7', ARRAY['방어', '버티기', '소신']::text[]),
    (29, 'wands-8', '완드 8', 'MINOR', 'WANDS', '8', ARRAY['빠른 진행', '연락', '급전개']::text[]),
    (30, 'wands-9', '완드 9', 'MINOR', 'WANDS', '9', ARRAY['경계', '인내', '마지막 버티기']::text[]),
    (31, 'wands-10', '완드 10', 'MINOR', 'WANDS', '10', ARRAY['과부하', '책임', '짐']::text[]),
    (32, 'wands-page', '완드 시종', 'MINOR', 'WANDS', 'PAGE', ARRAY['설렘', '새 소식', '호기심']::text[]),
    (33, 'wands-knight', '완드 기사', 'MINOR', 'WANDS', 'KNIGHT', ARRAY['열정적 돌진', '모험', '밀어붙임']::text[]),
    (34, 'wands-queen', '완드 여왕', 'MINOR', 'WANDS', 'QUEEN', ARRAY['자신감', '매력', '당당함']::text[]),
    (35, 'wands-king', '완드 왕', 'MINOR', 'WANDS', 'KING', ARRAY['리더십', '비전', '대담함']::text[]),
    (36, 'cups-ace', '컵 에이스', 'MINOR', 'CUPS', 'ACE', ARRAY['새 감정', '사랑의 시작', '마음 열림']::text[]),
    (37, 'cups-2', '컵 2', 'MINOR', 'CUPS', '2', ARRAY['서로 끌림', '교감', '연결']::text[]),
    (38, 'cups-3', '컵 3', 'MINOR', 'CUPS', '3', ARRAY['우정', '축하', '즐거움']::text[]),
    (39, 'cups-4', '컵 4', 'MINOR', 'CUPS', '4', ARRAY['무관심', '권태', '놓친 기회']::text[]),
    (40, 'cups-5', '컵 5', 'MINOR', 'CUPS', '5', ARRAY['상실', '후회', '슬픔']::text[]),
    (41, 'cups-6', '컵 6', 'MINOR', 'CUPS', '6', ARRAY['추억', '순수', '옛사람']::text[]),
    (42, 'cups-7', '컵 7', 'MINOR', 'CUPS', '7', ARRAY['환상', '많은 선택지', '망상']::text[]),
    (43, 'cups-8', '컵 8', 'MINOR', 'CUPS', '8', ARRAY['떠남', '더 나은 것 찾기', '미련 버림']::text[]),
    (44, 'cups-9', '컵 9', 'MINOR', 'CUPS', '9', ARRAY['소원 성취', '만족', '기쁨']::text[]),
    (45, 'cups-10', '컵 10', 'MINOR', 'CUPS', '10', ARRAY['행복한 관계', '가족', '정서적 완성']::text[]),
    (46, 'cups-page', '컵 시종', 'MINOR', 'CUPS', 'PAGE', ARRAY['설레는 연락', '감수성', '고백']::text[]),
    (47, 'cups-knight', '컵 기사', 'MINOR', 'CUPS', 'KNIGHT', ARRAY['로맨틱한 접근', '고백', '제안']::text[]),
    (48, 'cups-queen', '컵 여왕', 'MINOR', 'CUPS', 'QUEEN', ARRAY['공감', '직관', '따뜻함']::text[]),
    (49, 'cups-king', '컵 왕', 'MINOR', 'CUPS', 'KING', ARRAY['감정 조절', '포용', '성숙']::text[]),
    (50, 'swords-ace', '소드 에이스', 'MINOR', 'SWORDS', 'ACE', ARRAY['명료함', '진실', '결단']::text[]),
    (51, 'swords-2', '소드 2', 'MINOR', 'SWORDS', '2', ARRAY['교착', '결정 회피', '외면']::text[]),
    (52, 'swords-3', '소드 3', 'MINOR', 'SWORDS', '3', ARRAY['상처', '이별의 아픔', '배신']::text[]),
    (53, 'swords-4', '소드 4', 'MINOR', 'SWORDS', '4', ARRAY['휴식', '회복', '잠시 멈춤']::text[]),
    (54, 'swords-5', '소드 5', 'MINOR', 'SWORDS', '5', ARRAY['이기적 승리', '상처뿐인 다툼']::text[]),
    (55, 'swords-6', '소드 6', 'MINOR', 'SWORDS', '6', ARRAY['떠남', '이동', '회복을 향한 길']::text[]),
    (56, 'swords-7', '소드 7', 'MINOR', 'SWORDS', '7', ARRAY['속임수', '숨김', '혼자 꾀부림']::text[]),
    (57, 'swords-8', '소드 8', 'MINOR', 'SWORDS', '8', ARRAY['스스로 갇힘', '무력감', '제약']::text[]),
    (58, 'swords-9', '소드 9', 'MINOR', 'SWORDS', '9', ARRAY['불안', '걱정', '잠 못 드는 밤']::text[]),
    (59, 'swords-10', '소드 10', 'MINOR', 'SWORDS', '10', ARRAY['바닥', '끝', '고통의 정점']::text[]),
    (60, 'swords-page', '소드 시종', 'MINOR', 'SWORDS', 'PAGE', ARRAY['호기심', '탐색', '눈치']::text[]),
    (61, 'swords-knight', '소드 기사', 'MINOR', 'SWORDS', 'KNIGHT', ARRAY['돌진', '직설', '급한 결정']::text[]),
    (62, 'swords-queen', '소드 여왕', 'MINOR', 'SWORDS', 'QUEEN', ARRAY['명료함', '독립', '정직']::text[]),
    (63, 'swords-king', '소드 왕', 'MINOR', 'SWORDS', 'KING', ARRAY['이성', '판단', '원칙']::text[]),
    (64, 'pentacles-ace', '펜타클 에이스', 'MINOR', 'PENTACLES', 'ACE', ARRAY['새 기회', '현실적 시작', '안정의 씨앗']::text[]),
    (65, 'pentacles-2', '펜타클 2', 'MINOR', 'PENTACLES', '2', ARRAY['균형 잡기', '저글링', '유연함']::text[]),
    (66, 'pentacles-3', '펜타클 3', 'MINOR', 'PENTACLES', '3', ARRAY['협력', '실력 인정', '함께 만들기']::text[]),
    (67, 'pentacles-4', '펜타클 4', 'MINOR', 'PENTACLES', '4', ARRAY['지킴', '안정', '소유욕']::text[]),
    (68, 'pentacles-5', '펜타클 5', 'MINOR', 'PENTACLES', '5', ARRAY['결핍', '소외', '힘든 시기']::text[]),
    (69, 'pentacles-6', '펜타클 6', 'MINOR', 'PENTACLES', '6', ARRAY['나눔', '주고받음', '도움']::text[]),
    (70, 'pentacles-7', '펜타클 7', 'MINOR', 'PENTACLES', '7', ARRAY['기다림', '투자', '중간 점검']::text[]),
    (71, 'pentacles-8', '펜타클 8', 'MINOR', 'PENTACLES', '8', ARRAY['노력', '성실', '실력 쌓기']::text[]),
    (72, 'pentacles-9', '펜타클 9', 'MINOR', 'PENTACLES', '9', ARRAY['자립', '여유', '자기만족']::text[]),
    (73, 'pentacles-10', '펜타클 10', 'MINOR', 'PENTACLES', '10', ARRAY['안정된 가정', '장기적 결실', '유산']::text[]),
    (74, 'pentacles-page', '펜타클 시종', 'MINOR', 'PENTACLES', 'PAGE', ARRAY['배움', '성실한 시작', '새 기회']::text[]),
    (75, 'pentacles-knight', '펜타클 기사', 'MINOR', 'PENTACLES', 'KNIGHT', ARRAY['꾸준함', '신중함', '책임감']::text[]),
    (76, 'pentacles-queen', '펜타클 여왕', 'MINOR', 'PENTACLES', 'QUEEN', ARRAY['현실적 배려', '풍요', '안정감']::text[]),
    (77, 'pentacles-king', '펜타클 왕', 'MINOR', 'PENTACLES', 'KING', ARRAY['성공', '안정', '든든함']::text[])
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name_ko = EXCLUDED.name_ko,
    arcana = EXCLUDED.arcana,
    suit = EXCLUDED.suit,
    rank = EXCLUDED.rank,
    upright_keywords = EXCLUDED.upright_keywords;

COMMIT;

-- Expected result: total_count=78, major_count=22, minor_count=56.
SELECT
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE arcana = 'MAJOR') AS major_count,
    COUNT(*) FILTER (WHERE arcana = 'MINOR') AS minor_count
FROM public.tarot_cards;
