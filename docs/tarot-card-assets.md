# Tarot Card Assets

Voice Tarot 앱에서 사용하는 타로 카드 정적 리소스의 구조와 파일명 규칙을 정리한 문서입니다.

## 파일 구조

```text
apps/voice-tarot/
└─ public/
   ├─ assets/
   │  └─ ...
   └─ cards/
      └─ tarot/
         ├─ cards.json
         └─ *.webp
```

카드 이미지의 웹 경로는 다음 형식을 사용합니다.

```text
/cards/tarot/{filename}.webp
```

예시:

```text
/cards/tarot/major-00-fool.webp
```

## 카드 리소스 규격

- 총 카드 수: 78장
- 메이저 아르카나: 22장
- 마이너 아르카나: 56장
- 원본 이미지: 한국어 파일명의 3배율 PNG
- 배포 이미지: 영문 kebab-case WebP
- 이미지 크기: `768 × 1285`
- 카드 본체 주변의 불필요한 여백 제거
- 카드 본체의 투명도 유지
- WebP 품질: `84`
- WebP 압축 effort: `6`

## 파일명 규칙

### 메이저 아르카나

```text
major-{번호}-{이름}.webp
```

예시:

```text
major-00-fool.webp
major-01-magician.webp
major-21-world.webp
```

### 마이너 아르카나

```text
minor-{문양}-{등급}.webp
```

문양은 다음 네 가지를 사용합니다.

```text
wands
cups
swords
pentacles
```

예시:

```text
minor-wands-ace.webp
minor-cups-10.webp
minor-swords-queen.webp
minor-pentacles-king.webp
```

등급은 다음 규칙을 사용합니다.

```text
ace
2 ~ 10
page
knight
queen
king
```

## 카드 매핑 데이터

`public/cards/tarot/cards.json`은 카드 목록과 이미지 경로를 제공하는 앱용 데이터입니다.

각 카드에는 다음 정보가 포함됩니다.

- `id`: 앱에서 사용하는 안정적인 카드 ID
- `name`: 표시용 영문 카드명
- `arcana`: `major` 또는 `minor`
- `number`: 메이저 아르카나 번호
- `suit`: 마이너 아르카나 문양
- `rank`: 마이너 아르카나 등급
- `sourceFile`: 원본 PNG 파일명
- `file`: 결과 WebP 파일명
- `path`: 웹앱에서 사용하는 정적 경로

사용 예시:

```js
const response = await fetch('/cards/tarot/cards.json');
const { cards } = await response.json();

const imageUrl = cards[0].path;
```

## 경로 및 이름 규칙

- 카드 이미지 경로는 `/cards/tarot/`를 사용합니다.
- `tarot-centered`라는 이전 폴더명은 사용하지 않습니다.
- 파일명은 영문 kebab-case를 사용합니다.
- `cards.json`의 `file`과 `path`는 실제 WebP 파일명 및 경로와 일치해야 합니다.
- 카드 ID는 앱에서 참조될 수 있으므로 임의로 변경하지 않습니다.

## 원본과 배포 리소스

원본 PNG는 카드 이미지 제작 및 변환을 위한 원본 데이터입니다.

앱에서는 다음 배포 리소스만 사용합니다.

```text
public/cards/tarot/cards.json
public/cards/tarot/*.webp
```

원본 이미지와 배포 이미지를 구분하여 관리하면 앱 실행에 필요한 파일과 제작용 파일을 명확하게 분리할 수 있습니다.
