# 공개 에셋 팩 다운로드 가이드

달이네 냇가 엔진은 **CC0 라이선스** 공개 에셋을 우선 사용합니다.
아래 팩들을 다운로드한 후 `anime asset import` 명령어로 DB에 등록하세요.

---

## 추천 에셋 소스

### 1. Kenney.nl (전체 CC0)

| 팩 이름 | 내용 | URL |
|---------|------|-----|
| Nature Backgrounds | 자연/숲/하늘 배경 | https://kenney.nl/assets/nature-backgrounds |
| Background Elements Redux | 레이어드 자연 배경 요소 | https://kenney.nl/assets/background-elements-redux |
| Cartoon Environment | 카툰 스타일 자연 | https://kenney.nl/assets/cartoon-environment |
| Holiday Backgrounds | 계절별 배경 | https://kenney.nl/assets/holiday-backgrounds |
| Nature Kit | 나무/풀/돌/물 요소 | https://kenney.nl/assets/nature-kit |
| Props Pack | 소품들 | https://kenney.nl/assets/props-pack |

```bash
# 다운로드 후 임포트
anime asset import ./downloads/kenney-nature-backgrounds/ --tags "background,nature,kenney,cc0"
anime asset import ./downloads/kenney-nature-kit/ --tags "prop,nature,kenney,cc0"
```

### 2. OpenGameArt.org (CC0/CC-BY)

| 팩 이름 | 라이선스 | URL |
|---------|----------|-----|
| Free Cute Backgrounds | CC0 | https://opengameart.org/content/free-cute-backgrounds |
| Illustrated Forest | CC0 | https://opengameart.org/content/illustrated-forest-background |
| Forest/Creek Backgrounds | CC-BY | https://opengameart.org/content/platformer-art-forest-backgrounds |
| Watercolor Backgrounds | CC0 | https://opengameart.org/content/watercolor-forest-backgrounds |

```bash
# CC-BY 에셋은 license 명시 필요
anime asset import ./downloads/opengameart-forest/ --tags "background,forest,cc-by" --license cc-by
```

### 3. itch.io (무료 팩)

| 팩 이름 | 라이선스 | URL |
|---------|----------|-----|
| Free Animated Forest | CC0 | https://edermunizz.itch.io/free-pixel-forest |
| Sunny Land | CC0 | https://ansimuz.itch.io/sunny-land |

---

## 달이네 냇가 필요 에셋 목록

### 배경 (Season 1)

| 에셋 ID | 설명 | 태그 |
|---------|------|------|
| `bg_creek_spring` | 봄 냇가 — 벚꽃, 징검다리 | background, creek, spring |
| `bg_creek_summer` | 여름 냇가 — 진한 초록, 물 반짝임 | background, creek, summer |
| `bg_creek_autumn` | 가을 냇가 — 단풍, 갈색 | background, creek, autumn |
| `bg_creek_winter` | 겨울 냇가 — 눈 쌓인 냇가 | background, creek, winter |
| `bg_house_interior` | 수달 가족 집 내부 | background, interior, house |
| `bg_mountain_wide` | 뒷산 와이드샷 | background, mountain, wide |

### 소품 (Props)

| 에셋 ID | 설명 | 태그 |
|---------|------|------|
| `prop_stepping_stone` | 징검다리 돌 | prop, creek, stone |
| `prop_raft` | 아빠의 뗏목 | prop, raft, wood |
| `prop_basket` | 엄마의 바구니 | prop, basket |
| `prop_pebble` | 돌이의 조약돌 | prop, stone, small |
| `prop_wildflower` | 달이 머리 야생화 | prop, flower, yellow |

---

## `anime asset download-pack` 사용법 (Phase 3 구현 예정)

```bash
# 자동 다운로드 + DB 등록 (Phase 3에서 구현)
anime asset download-pack kenney-nature-backgrounds
anime asset download-pack kenney-nature-kit
anime asset download-pack opengameart-watercolor-forest

# 현재 등록된 팩 목록 확인
anime asset list-packs
```

---

## 임시 에셋 생성 (Phase 0 테스트용)

```bash
# ComfyUI로 배경 생성 (ComfyUI 실행 중일 때)
anime asset gen \
  --prompt "Korean countryside creek in spring, cartoon flat style, children animation, bright watercolor, stepping stones, cherry blossoms, soft green hills" \
  --negative "realistic, photographic, dark, scary, urban" \
  --width 1920 --height 1080 \
  --style cartoon_flat \
  -o assets/backgrounds/creek_spring.png

# 테스트용 SVG 배경 생성 스크립트 (ComfyUI 없을 때)
pnpm --filter @22b/anime-renderer run prepare-assets
```
