from typing import NamedTuple, Optional


class TarotCard(NamedTuple):
    id: int
    name: str
    upright: tuple[str, ...]


class TarotCardTaxonomy(NamedTuple):
    arcana: str
    suit: Optional[str]
    rank: str


MINOR_SUITS = ("WANDS", "CUPS", "SWORDS", "PENTACLES")
MAJOR_SLUGS = (
    "fool",
    "magician",
    "high-priestess",
    "empress",
    "emperor",
    "hierophant",
    "lovers",
    "chariot",
    "strength",
    "hermit",
    "wheel-of-fortune",
    "justice",
    "hanged-man",
    "death",
    "temperance",
    "devil",
    "tower",
    "star",
    "moon",
    "sun",
    "judgement",
    "world",
)
MINOR_RANKS = (
    "ACE",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "PAGE",
    "KNIGHT",
    "QUEEN",
    "KING",
)


DECK = (
(0, '바보', ('새 출발', '자유', '순수')),
(1, '마법사', ('의지', '실행력', '시작할 능력')),
(2, '여사제', ('직감', '비밀', '기다림')),
(3, '여황제', ('풍요', '사랑받음', '매력')),
(4, '황제', ('안정', '주도권', '책임')),
(5, '교황', ('전통', '약속', '조언자')),
(6, '연인', ('사랑', '선택', '끌림')),
(7, '전차', ('전진', '승리', '의지')),
(8, '힘', ('부드러운 용기', '인내', '자기 확신')),
(9, '은둔자', ('성찰', '혼자만의 시간', '내면의 답')),
(10, '운명의 수레바퀴', ('전환점', '흐름', '타이밍')),
(11, '정의', ('공정', '결과', '책임')),
(12, '매달린 사람', ('멈춤', '관점 전환', '희생')),
(13, '죽음', ('끝과 시작', '정리', '변화')),
(14, '절제', ('균형', '조율', '회복')),
(15, '악마', ('집착', '유혹', '얽매임')),
(16, '탑', ('갑작스런 붕괴', '진실 폭로', '충격')),
(17, '별', ('희망', '치유', '기대')),
(18, '달', ('불안', '모호함', '오해')),
(19, '태양', ('기쁨', '성공', '확신')),
(20, '심판', ('부활', '재회', '결단')),
(21, '세계', ('완성', '성취', '한 사이클의 끝')),
(22, '완드 에이스', ('새 열정', '시작의 불꽃', '기회')),
(23, '완드 2', ('계획', '선택', '더 넓은 세상')),
(24, '완드 3', ('확장', '결실을 기다림', '전망')),
(25, '완드 4', ('축하', '안정', '결실')),
(26, '완드 5', ('경쟁', '갈등', '의견 충돌')),
(27, '완드 6', ('승리', '인정', '자신감')),
(28, '완드 7', ('방어', '버티기', '소신')),
(29, '완드 8', ('빠른 진행', '연락', '급전개')),
(30, '완드 9', ('경계', '인내', '마지막 버티기')),
(31, '완드 10', ('과부하', '책임', '짐')),
(32, '완드 시종', ('설렘', '새 소식', '호기심')),
(33, '완드 기사', ('열정적 돌진', '모험', '밀어붙임')),
(34, '완드 여왕', ('자신감', '매력', '당당함')),
(35, '완드 왕', ('리더십', '비전', '대담함')),
(36, '컵 에이스', ('새 감정', '사랑의 시작', '마음 열림')),
(37, '컵 2', ('서로 끌림', '교감', '연결')),
(38, '컵 3', ('우정', '축하', '즐거움')),
(39, '컵 4', ('무관심', '권태', '놓친 기회')),
(40, '컵 5', ('상실', '후회', '슬픔')),
(41, '컵 6', ('추억', '순수', '옛사람')),
(42, '컵 7', ('환상', '많은 선택지', '망상')),
(43, '컵 8', ('떠남', '더 나은 것 찾기', '미련 버림')),
(44, '컵 9', ('소원 성취', '만족', '기쁨')),
(45, '컵 10', ('행복한 관계', '가족', '정서적 완성')),
(46, '컵 시종', ('설레는 연락', '감수성', '고백')),
(47, '컵 기사', ('로맨틱한 접근', '고백', '제안')),
(48, '컵 여왕', ('공감', '직관', '따뜻함')),
(49, '컵 왕', ('감정 조절', '포용', '성숙')),
(50, '소드 에이스', ('명료함', '진실', '결단')),
(51, '소드 2', ('교착', '결정 회피', '외면')),
(52, '소드 3', ('상처', '이별의 아픔', '배신')),
(53, '소드 4', ('휴식', '회복', '잠시 멈춤')),
(54, '소드 5', ('이기적 승리', '상처뿐인 다툼')),
(55, '소드 6', ('떠남', '이동', '회복을 향한 길')),
(56, '소드 7', ('속임수', '숨김', '혼자 꾀부림')),
(57, '소드 8', ('스스로 갇힘', '무력감', '제약')),
(58, '소드 9', ('불안', '걱정', '잠 못 드는 밤')),
(59, '소드 10', ('바닥', '끝', '고통의 정점')),
(60, '소드 시종', ('호기심', '탐색', '눈치')),
(61, '소드 기사', ('돌진', '직설', '급한 결정')),
(62, '소드 여왕', ('명료함', '독립', '정직')),
(63, '소드 왕', ('이성', '판단', '원칙')),
(64, '펜타클 에이스', ('새 기회', '현실적 시작', '안정의 씨앗')),
(65, '펜타클 2', ('균형 잡기', '저글링', '유연함')),
(66, '펜타클 3', ('협력', '실력 인정', '함께 만들기')),
(67, '펜타클 4', ('지킴', '안정', '소유욕')),
(68, '펜타클 5', ('결핍', '소외', '힘든 시기')),
(69, '펜타클 6', ('나눔', '주고받음', '도움')),
(70, '펜타클 7', ('기다림', '투자', '중간 점검')),
(71, '펜타클 8', ('노력', '성실', '실력 쌓기')),
(72, '펜타클 9', ('자립', '여유', '자기만족')),
(73, '펜타클 10', ('안정된 가정', '장기적 결실', '유산')),
(74, '펜타클 시종', ('배움', '성실한 시작', '새 기회')),
(75, '펜타클 기사', ('꾸준함', '신중함', '책임감')),
(76, '펜타클 여왕', ('현실적 배려', '풍요', '안정감')),
(77, '펜타클 왕', ('성공', '안정', '든든함')),
)


def card_by_id(card_id: int) -> TarotCard:
    raw = DECK[card_id]
    return TarotCard(*raw)


def card_taxonomy(card_id: int) -> TarotCardTaxonomy:
    if not 0 <= card_id < len(DECK):
        raise ValueError(f"card_id must be between 0 and {len(DECK) - 1}")
    if card_id < 22:
        return TarotCardTaxonomy(arcana="MAJOR", suit=None, rank=str(card_id))
    minor_index = card_id - 22
    suit = MINOR_SUITS[minor_index // len(MINOR_RANKS)]
    rank = MINOR_RANKS[minor_index % len(MINOR_RANKS)]
    return TarotCardTaxonomy(arcana="MINOR", suit=suit, rank=rank)


def card_code(card_id: int) -> str:
    taxonomy = card_taxonomy(card_id)
    if taxonomy.arcana == "MAJOR":
        return f"major-{card_id:02d}-{MAJOR_SLUGS[card_id]}"
    return f"{taxonomy.suit.lower()}-{taxonomy.rank.lower()}"


def card_image_path(card_id: int) -> str:
    taxonomy = card_taxonomy(card_id)
    if taxonomy.arcana == "MAJOR":
        filename = f"{card_id:02d}-{MAJOR_SLUGS[card_id]}.png"
        return f"major/{filename}"
    filename = f"{card_id:02d}-{taxonomy.rank.lower()}.png"
    return f"{taxonomy.suit.lower()}/{filename}"


DUMMY_CARD_IMAGE_PATHS = (
    "/static/cards/star.png",
    "/static/cards/sun.png",
    "/static/cards/temperance.png",
)


def dummy_image_path_for(card_id: int) -> str:
    """Return a temporary front image until the licensed 78-card deck is ready."""
    known_images = {
        14: "/static/cards/temperance.png",
        17: "/static/cards/star.png",
        19: "/static/cards/sun.png",
    }
    return known_images.get(card_id, DUMMY_CARD_IMAGE_PATHS[card_id % len(DUMMY_CARD_IMAGE_PATHS)])
