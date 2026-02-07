/**
 * Constants - 설정값 및 상수
 */

// API Keys (환경변수 필수)
const API_KEYS = {
  ANTHROPIC: process.env.ANTHROPIC_API_KEY,
  DATA_GO_KR: process.env.DATA_GO_KR_API_KEY
};

// Claude 모델 설정
const MODELS = {
  // 비용 최적화 (Haiku 우선)
  HAIKU: 'claude-haiku-4-5-20241022',
  // 고품질 분석 필요시
  SONNET: 'claude-sonnet-4-20250514',
  // 기본 모델
  DEFAULT: 'claude-haiku-4-5-20241022'
};

// 비용 정보 (per 1M tokens, USD)
const COST_PER_MILLION = {
  'claude-haiku-4-5-20241022': { input: 1, output: 5 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 }
};

// Batch API 할인율
const BATCH_DISCOUNT = 0.5;  // 50% 할인

// Checkpoint 설정
const CHECKPOINT = {
  INTERVAL: 10,           // 10페이지마다 저장
  EXPIRY_HOURS: 24,       // 24시간 후 만료
  DIR: 'data/checkpoints'
};

// 캐시 설정
const CACHE = {
  DIR: 'data/cache',
  HASH_FILE: 'page_hashes.json'
};

// HTML 전처리 설정
const PREPROCESSOR = {
  MAX_LENGTH: 3000,       // 최대 문자 수 (약 1000 토큰)
  PRESERVE_TABLES: true,
  EXTRACT_PRICE_SECTIONS: true
};

// 가격 키워드
const PRICE_KEYWORDS = [
  '가격', '비용', '요금', 'price', '원', '만원', '₩',
  '시술', '이벤트', '할인', '특가', '프로모션',
  '보톡스', '필러', '레이저', '리프팅', '피부', '미백',
  '토닝', '스킨', '케어', '관리', '패키지'
];

// 시도 코드
const SIDO_CODES = {
  '서울': '110000',
  '경기': '410000',
  '인천': '280000',
  '부산': '260000',
  '대구': '270000'
};

// 지역 그룹
const REGIONS = {
  '수도권': ['서울', '경기', '인천'],
  '전국': ['서울', '경기', '인천', '부산', '대구']
};

module.exports = {
  API_KEYS,
  MODELS,
  COST_PER_MILLION,
  BATCH_DISCOUNT,
  CHECKPOINT,
  CACHE,
  PREPROCESSOR,
  PRICE_KEYWORDS,
  SIDO_CODES,
  REGIONS
};
