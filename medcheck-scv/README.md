# MedCheck SCV - Hospital Crawler

병원 홈페이지 URL 수집 크롤러 (비용 최적화 버전)

## 기능

- ✅ 공공데이터 API로 병원 정보 수집
- ✅ Checkpoint/Resume 지원 (중단 복구)
- ✅ AI 가격 분석 (Claude Haiku)
- ✅ 변경 감지 (해시 기반)
- ✅ Batch API 지원 (50% 비용 절감)

## 로컬 실행

```bash
# 의존성 설치
npm install

# 단일 시도 크롤링
node src/crawler.js --sido 서울

# 수도권 크롤링 (Resume 모드)
node src/crawler.js --region 수도권 --resume

# 전체 크롤링
node src/crawler.js --all

# Checkpoint 관리
node src/crawler.js --list-checkpoints
node src/crawler.js --clear-checkpoints
```

## Railway 배포

### 1. Railway 프로젝트 생성

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성 및 배포
railway init
railway up
```

### 2. 환경변수 설정 (Railway Dashboard)

| 변수 | 설명 | 필수 |
|------|------|------|
| `DATA_GO_KR_API_KEY` | 공공데이터 API 키 | ✅ |
| `ANTHROPIC_API_KEY` | Claude API 키 | ✅ |

### 3. Cron 설정

Railway Dashboard에서 Cron 트리거 설정:

```
# 매일 새벽 3시 실행
0 3 * * *
```

## 프로젝트 구조

```
medcheck-scv/
├── src/
│   ├── crawler.js              # 메인 크롤러 (Checkpoint 지원)
│   ├── utils/
│   │   ├── html-preprocessor.js  # HTML → 최소 텍스트 (90% 토큰 절감)
│   │   └── change-detector.js    # 해시 기반 변경 감지
│   ├── analyzers/
│   │   ├── price-analyzer.js     # Claude Haiku AI 분석
│   │   └── batch-processor.js    # Batch API (50% 할인)
│   └── config/
│       └── constants.js          # 설정값
├── data/
│   ├── checkpoints/              # 중간 저장
│   └── cache/                    # 해시 캐시
├── output/                       # CSV/JSON 출력
├── logs/                         # 사용량 로그
├── railway.json                  # Railway 설정
├── Procfile                      # 실행 명령
└── package.json
```

## 비용 최적화 전략

| 전략 | 절감 효과 |
|------|----------|
| **Haiku 모델** (Sonnet 대신) | 3배 절감 |
| **HTML 전처리** (불필요 태그 제거) | 90% 토큰 절감 |
| **변경 감지** (해시 비교) | 80% API 호출 절감 |
| **Batch API** (24시간 처리) | 50% 추가 할인 |

### 예상 월 비용

| 시나리오 | 비용 |
|----------|------|
| 기본 운영 (2,800개 병원) | ~$25/월 |
| 최적화 적용 | ~$5-10/월 |

## API 사용량 확인

```javascript
const { getUsageStats } = require('./src/analyzers/price-analyzer');
console.log(getUsageStats());
```

## 라이선스

ISC
