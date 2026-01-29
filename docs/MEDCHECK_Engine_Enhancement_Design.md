# MEDCHECK Engine 고도화 시스템 설계서
## 오탐 관리 + 꼼수 패턴 수집 + 마케팅 트렌드 모니터링

**Version 1.0 | 2026년 1월 | MADMEDCHECK Project**

---

## 1. 개요

### 1.1 배경

MEDCHECK Engine의 지속적인 고도화를 위해 세 가지 핵심 시스템이 필요합니다:

| 시스템 | 목적 | 핵심 가치 |
|--------|------|-----------|
| **오탐 관리** | False Positive 축적 → 패턴 개선 | 정확도 향상 |
| **꼼수 패턴 수집** | 판례 없는 신규 우회 케이스 수집 | 선제적 대응 |
| **마케팅 트렌드** | 새로운 광고 기법 모니터링 | 시장 적응력 |

### 1.2 핵심 원칙

```
피드백 → DB화 → 분석 → 패턴 개선 → 검증 → 배포
     ↑                                      ↓
     ←←←←←←←← 성능 모니터링 ←←←←←←←←←←←←←←←
```

**Flywheel 효과**: 사용량 증가 → 피드백 증가 → 정확도 향상 → 신뢰도 상승 → 사용량 증가

---

## 2. 오탐(False Positive) 관리 시스템

### 2.1 목표

- 오탐 사례를 체계적으로 축적
- 반복되는 오탐 패턴 자동 감지
- 예외 규칙 자동 제안 → 승인 → 패턴 업데이트
- 패턴 수정 전/후 성능 비교

### 2.2 데이터베이스 스키마

```sql
-- 오탐 사례 테이블
CREATE TABLE false_positive_cases (
  id TEXT PRIMARY KEY,
  
  -- 원본 정보
  analysis_id TEXT NOT NULL,           -- 분석 ID
  pattern_id TEXT NOT NULL,            -- 오탐 발생 패턴
  matched_text TEXT NOT NULL,          -- 매칭된 텍스트
  full_context TEXT,                   -- 전체 맥락 (앞뒤 100자)
  source_url TEXT,                     -- 원본 URL
  
  -- 피드백 정보
  feedback_id TEXT,                    -- 연결된 피드백
  reporter_type TEXT DEFAULT 'user',   -- user / expert / system
  report_reason TEXT,                  -- 오탐 사유 설명
  
  -- 분류
  false_positive_type TEXT,            -- 오탐 유형 (아래 참조)
  suggested_action TEXT,               -- 제안 조치
  
  -- 상태 관리
  status TEXT DEFAULT 'reported',      -- reported → reviewing → resolved / rejected
  resolution TEXT,                     -- 해결 방법 (exception_added / pattern_modified / rejected)
  resolution_note TEXT,
  
  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  resolved_at DATETIME,
  reviewer TEXT
);

-- 오탐 유형 인덱스
CREATE INDEX idx_fp_pattern ON false_positive_cases(pattern_id);
CREATE INDEX idx_fp_type ON false_positive_cases(false_positive_type);
CREATE INDEX idx_fp_status ON false_positive_cases(status);
```

### 2.3 오탐 유형 분류

| 유형 코드 | 설명 | 예시 | 대응 방법 |
|-----------|------|------|-----------|
| `context_dependent` | 맥락에 따라 다른 의미 | "100% 예약제" | 예외 규칙 추가 |
| `domain_specific` | 특정 진료과 용어 | "완전 절제" (외과) | 진료과별 예외 |
| `quotation` | 인용/참조 문맥 | "의료법에서 금지하는 '100% 완치'" | 인용 탐지 로직 |
| `negation` | 부정 문맥 | "100% 완치라고 하면 안 됩니다" | 부정어 탐지 |
| `education` | 교육/안내 문맥 | "이런 표현은 위반입니다: ..." | 교육 콘텐츠 예외 |
| `pattern_too_broad` | 패턴 자체가 너무 넓음 | 일반적 표현까지 잡음 | 패턴 수정 |
| `ocr_error` | OCR 오류로 인한 오탐 | 잘못 읽힌 텍스트 | OCR 품질 개선 |

### 2.4 예외 규칙 테이블

```sql
-- 패턴 예외 규칙
CREATE TABLE pattern_exceptions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,            -- 대상 패턴
  
  -- 예외 조건
  exception_type TEXT NOT NULL,        -- keyword / regex / context / domain
  exception_value TEXT NOT NULL,       -- 예외 값
  
  -- 예: type=keyword, value="예약제" → "100% 예약제"는 예외
  -- 예: type=context, value="부정" → 부정 문맥이면 예외
  -- 예: type=domain, value="외과" → 외과 진료과면 예외
  
  -- 출처
  source_type TEXT,                    -- feedback / expert / auto
  source_id TEXT,                      -- 피드백 ID 등
  
  -- 상태
  status TEXT DEFAULT 'active',        -- active / deprecated / testing
  
  -- 효과 측정
  applied_count INTEGER DEFAULT 0,     -- 적용된 횟수
  prevented_fp_count INTEGER DEFAULT 0, -- 방지한 오탐 수
  
  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  version TEXT                         -- 적용된 패턴 버전
);

CREATE INDEX idx_exc_pattern ON pattern_exceptions(pattern_id);
CREATE INDEX idx_exc_status ON pattern_exceptions(status);
```

### 2.5 패턴 버전 관리

```sql
-- 패턴 버전 이력
CREATE TABLE pattern_versions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  version TEXT NOT NULL,               -- 1.0, 1.1, 1.2, ...
  
  -- 변경 내용
  change_type TEXT NOT NULL,           -- initial / pattern_update / exception_add / threshold_adjust
  change_description TEXT NOT NULL,
  change_reason TEXT,
  
  -- 변경 전/후
  previous_pattern TEXT,               -- 이전 정규식
  new_pattern TEXT,                    -- 새 정규식
  previous_threshold REAL,
  new_threshold REAL,
  
  -- 연관 데이터
  related_feedback_ids TEXT,           -- JSON 배열
  related_fp_case_ids TEXT,            -- JSON 배열
  
  -- 성능 지표 (변경 후 측정)
  metrics_before TEXT,                 -- JSON: {precision, recall, f1}
  metrics_after TEXT,                  -- JSON: {precision, recall, f1}
  
  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  approved_by TEXT,
  approved_at DATETIME
);

CREATE INDEX idx_pv_pattern ON pattern_versions(pattern_id);
CREATE INDEX idx_pv_version ON pattern_versions(version);
```

### 2.6 자동화 프로세스

#### 오탐 자동 감지 및 알림

```javascript
// 오탐 임계값 설정
const FP_THRESHOLDS = {
  ALERT: 3,      // 3건 이상 → 알림
  REVIEW: 5,     // 5건 이상 → 검토 권고
  AUTO_SUGGEST: 10  // 10건 이상 → 자동 예외 제안
};

// 정기 분석 (매일)
async function analyzeFrequentFalsePositives() {
  const fpCounts = await db.query(`
    SELECT 
      pattern_id,
      matched_text,
      COUNT(*) as count,
      GROUP_CONCAT(id) as case_ids
    FROM false_positive_cases
    WHERE status = 'reported'
      AND created_at > datetime('now', '-30 days')
    GROUP BY pattern_id, matched_text
    HAVING count >= ?
    ORDER BY count DESC
  `, [FP_THRESHOLDS.ALERT]);

  for (const fp of fpCounts) {
    if (fp.count >= FP_THRESHOLDS.AUTO_SUGGEST) {
      await suggestException(fp);
    } else if (fp.count >= FP_THRESHOLDS.REVIEW) {
      await createReviewTask(fp);
    } else {
      await sendAlert(fp);
    }
  }
}
```

#### 예외 규칙 자동 제안

```javascript
async function suggestException(fpData) {
  // 공통 패턴 분석
  const commonContext = analyzeCommonContext(fpData.case_ids);
  
  const suggestion = {
    pattern_id: fpData.pattern_id,
    exception_type: determineExceptionType(commonContext),
    exception_value: extractExceptionValue(commonContext),
    confidence: calculateConfidence(fpData.count),
    source_type: 'auto',
    status: 'suggested'
  };
  
  // 제안 저장
  await db.insert('exception_suggestions', suggestion);
  
  // 관리자 알림
  await notifyAdmin({
    type: 'exception_suggestion',
    pattern_id: fpData.pattern_id,
    matched_text: fpData.matched_text,
    fp_count: fpData.count,
    suggestion: suggestion
  });
}
```

### 2.7 API 엔드포인트

```
# 오탐 관리
POST   /v1/false-positives              # 오탐 신고
GET    /v1/false-positives              # 오탐 목록 (필터: pattern_id, status, type)
GET    /v1/false-positives/:id          # 오탐 상세
PATCH  /v1/false-positives/:id          # 상태 변경 (reviewing, resolved, rejected)

# 예외 규칙
GET    /v1/patterns/:id/exceptions      # 패턴의 예외 목록
POST   /v1/patterns/:id/exceptions      # 예외 추가
DELETE /v1/patterns/:id/exceptions/:eid # 예외 제거
GET    /v1/exception-suggestions        # 자동 제안된 예외 목록
POST   /v1/exception-suggestions/:id/approve  # 제안 승인
POST   /v1/exception-suggestions/:id/reject   # 제안 거절

# 패턴 버전
GET    /v1/patterns/:id/versions        # 버전 이력
POST   /v1/patterns/:id/versions        # 새 버전 생성
GET    /v1/patterns/:id/versions/:v/compare  # 버전 비교
POST   /v1/patterns/:id/rollback/:v     # 특정 버전으로 롤백
```

---

## 3. 꼼수 패턴 수집 시스템

### 3.1 목표

- **판례 없는 신규 우회 케이스**를 별도 수집
- 법적 근거 확정 전에도 모니터링 가능
- 판례 확정 시 즉시 정식 패턴화
- 마케팅 트렌드 분석 자료로 활용

### 3.2 꼼수 패턴 유형

| 코드 | 유형 | 설명 | 예시 |
|------|------|------|------|
| `TRICK-001` | **기술적 우회** | 로그인/인증으로 일부만 숨김 | Before는 로그인, After만 공개 |
| `TRICK-002` | **형식적 우회** | 광고 아닌 척 | 후기/체험기 위장 광고 |
| `TRICK-003` | **이미지 우회** | 텍스트 대신 이미지 | 위반 문구를 이미지로 |
| `TRICK-004` | **외부 링크** | 본 사이트 아닌 곳에 | SNS/블로그에 위반 콘텐츠 |
| `TRICK-005` | **시간차 우회** | 특정 시간만 표시 | 심사 때만 숨김 |
| `TRICK-006` | **표현 변형** | 금지어 변형 | "완치" → "완.치", "완 치" |
| `TRICK-007` | **암시적 표현** | 직접 언급 않고 암시 | "많은 분들이...", "자연스러운 결과" |
| `TRICK-008` | **비교 우회** | 직접 비교 않고 우회 | "타 병원과 다른 결과" |
| `TRICK-009` | **동영상 우회** | 영상 내 위반 | 유튜브 썸네일/영상에 위반 문구 |
| `TRICK-010` | **AI 생성** | AI로 위반 콘텐츠 생성 | GPT로 작성한 체험기 |

### 3.3 데이터베이스 스키마

```sql
-- 꼼수 패턴 수집
CREATE TABLE trick_patterns (
  id TEXT PRIMARY KEY,
  
  -- 기본 정보
  trick_code TEXT NOT NULL,            -- TRICK-001, TRICK-002, ...
  trick_name TEXT NOT NULL,            -- 기술적 우회: Before/After 분리
  description TEXT,                    -- 상세 설명
  
  -- 발견 정보
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  discovered_by TEXT,                  -- user_id 또는 'crawler'
  source_url TEXT,                     -- 발견된 URL
  
  -- 증거 자료
  evidence_type TEXT,                  -- screenshot / html / video / text
  evidence_data TEXT,                  -- 증거 데이터 (URL 또는 base64)
  evidence_description TEXT,           -- 증거 설명
  
  -- 기술적 상세
  technical_method TEXT,               -- 어떻게 우회하는지 기술적 설명
  detection_difficulty TEXT,           -- easy / medium / hard / very_hard
  detection_method TEXT,               -- 탐지 방법 (있다면)
  
  -- 법적 상태
  legal_status TEXT DEFAULT 'gray',    -- gray / likely_violation / confirmed_violation / legal
  legal_basis TEXT,                    -- 관련 법조항 (있다면)
  precedent_exists BOOLEAN DEFAULT FALSE,  -- 판례 존재 여부
  precedent_reference TEXT,            -- 판례 참조
  
  -- 빈도 및 영향
  occurrence_count INTEGER DEFAULT 1,  -- 발견 횟수
  affected_domains TEXT,               -- JSON: 발견된 도메인 목록
  risk_level TEXT DEFAULT 'medium',    -- low / medium / high / critical
  
  -- 패턴화 상태
  pattern_status TEXT DEFAULT 'collecting',  -- collecting → analyzing → pattern_ready → deployed
  related_pattern_id TEXT,             -- 정식 패턴화된 경우 패턴 ID
  
  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  
  -- 태그
  tags TEXT                            -- JSON 배열: ["성형", "피부과", "신규"] 등
);

CREATE INDEX idx_trick_code ON trick_patterns(trick_code);
CREATE INDEX idx_trick_legal ON trick_patterns(legal_status);
CREATE INDEX idx_trick_pattern_status ON trick_patterns(pattern_status);
```

### 3.4 꼼수 발견 사례 테이블

```sql
-- 꼼수 발견 사례 (개별 건)
CREATE TABLE trick_cases (
  id TEXT PRIMARY KEY,
  trick_pattern_id TEXT NOT NULL,      -- 연결된 꼼수 패턴
  
  -- 발견 정보
  source_url TEXT NOT NULL,
  source_domain TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  discovered_by TEXT,                  -- crawler / user / expert
  
  -- 증거
  screenshot_url TEXT,
  html_snapshot TEXT,
  extracted_content TEXT,
  
  -- 상세
  specific_method TEXT,                -- 이 사례의 구체적 방법
  notes TEXT,
  
  -- 상태
  verified BOOLEAN DEFAULT FALSE,
  verified_by TEXT,
  verified_at DATETIME,
  
  FOREIGN KEY (trick_pattern_id) REFERENCES trick_patterns(id)
);

CREATE INDEX idx_tc_pattern ON trick_cases(trick_pattern_id);
CREATE INDEX idx_tc_domain ON trick_cases(source_domain);
```

### 3.5 Before/After 우회 케이스 상세 설계

```sql
-- Before/After 우회 전용 테이블 (TRICK-001 상세)
CREATE TABLE before_after_tricks (
  id TEXT PRIMARY KEY,
  trick_case_id TEXT NOT NULL,
  
  -- Before 페이지 정보
  before_url TEXT,
  before_access_type TEXT,             -- public / login_required / member_only / blocked
  before_content_visible BOOLEAN,
  before_screenshot_url TEXT,
  
  -- After 페이지 정보
  after_url TEXT,
  after_access_type TEXT,
  after_content_visible BOOLEAN,
  after_screenshot_url TEXT,
  
  -- 분석
  intentional_separation BOOLEAN,      -- 의도적 분리로 판단되는지
  separation_method TEXT,              -- login / paywall / member / time_based
  analysis_note TEXT,
  
  -- 탐지 로직 제안
  suggested_detection TEXT,            -- 탐지 방법 제안
  
  FOREIGN KEY (trick_case_id) REFERENCES trick_cases(id)
);
```

### 3.6 API 엔드포인트

```
# 꼼수 패턴 관리
GET    /v1/tricks                       # 꼼수 패턴 목록
POST   /v1/tricks                       # 새 꼼수 패턴 등록
GET    /v1/tricks/:id                   # 꼼수 패턴 상세
PATCH  /v1/tricks/:id                   # 꼼수 패턴 수정
GET    /v1/tricks/:id/cases             # 해당 꼼수의 발견 사례 목록

# 꼼수 사례 등록
POST   /v1/tricks/:id/cases             # 새 사례 등록
POST   /v1/tricks/report                # 신규 꼼수 신고 (패턴 미확정)

# 통계
GET    /v1/tricks/stats                 # 꼼수 통계 (유형별, 도메인별)
GET    /v1/tricks/trends                # 꼼수 트렌드 (시계열)

# 패턴화
POST   /v1/tricks/:id/convert-to-pattern  # 꼼수 → 정식 패턴 변환
```

### 3.7 꼼수 → 정식 패턴 변환 프로세스

```
┌─────────────────────────────────────────────────────────────┐
│                    꼼수 패턴 라이프사이클                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 수집 (collecting)                                        │
│     └─ 현장에서 발견, 사례 축적                              │
│                 ↓                                           │
│  2. 분석 (analyzing)                                         │
│     └─ 패턴 공통점 분석, 탐지 방법 연구                      │
│                 ↓                                           │
│  3. 패턴 준비 (pattern_ready)                               │
│     └─ 정규식/AI 탐지 로직 개발, 테스트                      │
│                 ↓                                           │
│  [판례 확정 대기]                                            │
│     └─ legal_status: gray → confirmed_violation             │
│                 ↓                                           │
│  4. 배포 (deployed)                                         │
│     └─ 정식 패턴으로 전환, pattern_id 연결                   │
│                                                             │
│  ※ 판례 없어도 "주의" 레벨로 표시 가능                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 마케팅 트렌드 모니터링

### 4.1 목표

- 의료 마케팅 트렌드 실시간 파악
- 새로운 광고 기법 조기 발견
- 업계 동향 리포트 생성

### 4.2 모니터링 대상

| 채널 | 모니터링 항목 |
|------|--------------|
| 병원 웹사이트 | 새로운 광고 표현, 레이아웃 변화 |
| 네이버 블로그 | 의료 체험기 트렌드, 키워드 |
| 인스타그램 | 의료 광고 해시태그, 릴스 |
| 유튜브 | 의료 관련 썸네일, 제목 |
| 의료 커뮤니티 | 마케팅 논의, 꼼수 공유 |

### 4.3 트렌드 데이터베이스

```sql
-- 마케팅 트렌드
CREATE TABLE marketing_trends (
  id TEXT PRIMARY KEY,
  
  -- 트렌드 정보
  trend_name TEXT NOT NULL,
  trend_type TEXT,                     -- expression / format / channel / technique
  description TEXT,
  
  -- 발견
  first_seen_at DATETIME,
  first_seen_source TEXT,
  
  -- 빈도
  occurrence_count INTEGER DEFAULT 1,
  trending_score REAL,                 -- 상승 속도 점수
  
  -- 분석
  risk_assessment TEXT,                -- 위반 가능성 분석
  related_trick_id TEXT,               -- 관련 꼼수 패턴
  
  -- 상태
  status TEXT DEFAULT 'monitoring',    -- monitoring / rising / peaked / declining
  
  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  
  -- 샘플
  sample_urls TEXT                     -- JSON 배열
);

-- 트렌드 시계열 데이터
CREATE TABLE trend_timeseries (
  id TEXT PRIMARY KEY,
  trend_id TEXT NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INTEGER,
  sample_count INTEGER,
  notes TEXT,
  
  FOREIGN KEY (trend_id) REFERENCES marketing_trends(id)
);
```

### 4.4 주간/월간 리포트

```javascript
// 주간 트렌드 리포트 생성
async function generateWeeklyTrendReport() {
  const report = {
    period: { start: weekStart, end: weekEnd },
    
    // 신규 꼼수
    newTricks: await db.query(`
      SELECT * FROM trick_patterns 
      WHERE created_at > ? 
      ORDER BY risk_level DESC
    `, [weekStart]),
    
    // 급상승 트렌드
    risingTrends: await db.query(`
      SELECT * FROM marketing_trends 
      WHERE status = 'rising'
      ORDER BY trending_score DESC
      LIMIT 10
    `),
    
    // 오탐 통계
    fpStats: await db.query(`
      SELECT 
        pattern_id,
        COUNT(*) as count,
        false_positive_type
      FROM false_positive_cases
      WHERE created_at > ?
      GROUP BY pattern_id, false_positive_type
    `, [weekStart]),
    
    // 패턴 변경 이력
    patternChanges: await db.query(`
      SELECT * FROM pattern_versions
      WHERE created_at > ?
    `, [weekStart]),
    
    // 권장 조치
    recommendations: generateRecommendations()
  };
  
  return report;
}
```

---

## 5. 통합 대시보드 추가 화면

### 5.1 오탐 관리 화면

```
┌─────────────────────────────────────────────────────────────┐
│  📊 오탐 관리                                    [기간 선택]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 전체    │ │ 처리중  │ │ 자동제안 │ │ 해결됨  │          │
│  │ 234건   │ │ 28건    │ │ 5건     │ │ 189건   │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 패턴별 오탐 현황                                      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ P-56-01-001  "100% 완치"        ████████░░  28건    │   │
│  │ P-56-15-001  "암시적 표현"       ██████░░░░  19건    │   │
│  │ P-56-03-001  "최고/최상"         ████░░░░░░  12건    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⚠️ 자동 예외 제안 (5건)                              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ • "100% 예약제" - P-56-01-001에 예외 추가 제안       │   │
│  │   오탐 12건 / 신뢰도 94%              [승인] [거절]   │   │
│  │                                                       │   │
│  │ • "부작용 상담" - P-56-02-001에 예외 추가 제안       │   │
│  │   오탐 8건 / 신뢰도 87%               [승인] [거절]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 꼼수 패턴 수집 화면

```
┌─────────────────────────────────────────────────────────────┐
│  🎭 꼼수 패턴 수집                            [+ 신규 등록]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  필터: [전체 ▼] [법적상태 ▼] [위험도 ▼]                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔴 TRICK-001: Before/After 기술적 분리               │   │
│  │    상태: 수집 중 | 사례: 47건 | 법적: 판례 미확정     │   │
│  │    ───────────────────────────────────────────────    │   │
│  │    최근 발견: gangnam-plastic.com (2시간 전)         │   │
│  │    방법: Before는 로그인 필수, After만 공개           │   │
│  │                                        [상세] [사례]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟡 TRICK-002: 체험기 위장 광고                       │   │
│  │    상태: 분석 중 | 사례: 123건 | 법적: 위반 가능성 높음│   │
│  │    ───────────────────────────────────────────────    │   │
│  │    탐지 로직 개발 중 (진행률 60%)                     │   │
│  │                                        [상세] [사례]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 TRICK-007: 암시적 효과 표현                       │   │
│  │    상태: 배포됨 | 사례: 489건 | 법적: 위반 확정       │   │
│  │    ───────────────────────────────────────────────    │   │
│  │    → 정식 패턴 P-56-15-001로 전환 완료               │   │
│  │                                        [상세] [패턴]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Before/After 케이스 상세 화면

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 TRICK-001 상세: Before/After 기술적 분리                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  법적 상태: 🟡 판례 미확정 (Gray Area)                       │
│  위험도: 🔴 높음                                             │
│  발견 사례: 47건                                             │
│                                                             │
│  ┌───────────────────┬───────────────────┐                 │
│  │ Before 페이지     │ After 페이지      │                 │
│  ├───────────────────┼───────────────────┤                 │
│  │ 🔒 로그인 필요    │ 🌐 공개           │                 │
│  │                   │                   │                 │
│  │ [스크린샷]        │ [스크린샷]        │                 │
│  │ "시술 전 사진은   │ "시술 후 놀라운   │                 │
│  │  회원만 열람"     │  변화를 확인!"    │                 │
│  │                   │                   │                 │
│  └───────────────────┴───────────────────┘                 │
│                                                             │
│  📋 분석 노트:                                               │
│  - 의도적 분리로 판단됨                                      │
│  - Before 없이 After만 노출하여 비교 광고 규정 우회 시도     │
│  - 현재 명확한 판례 없음, 모니터링 지속 필요                 │
│                                                             │
│  🔧 탐지 방법 제안:                                          │
│  - 같은 도메인 내 로그인 여부로 구분되는 콘텐츠 탐지         │
│  - "시술 전/후", "Before/After" 키워드 + 접근성 차이 분석   │
│                                                             │
│  📊 발견 도메인 (Top 5):                                     │
│  1. gangnam-plastic.com (12건)                              │
│  2. beauty-derma.kr (8건)                                   │
│  3. skin-clinic.com (7건)                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 구현 로드맵

### Phase 5: 오탐 관리 시스템 (2주)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| Week 17 | DB 스키마 추가, API 개발 | 오탐/예외 테이블, API |
| Week 18 | 자동 분석, 대시보드 | 자동 제안 로직, UI |

### Phase 6: 꼼수 패턴 수집 (2주)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| Week 19 | DB 스키마, 기본 API | 꼼수 테이블, CRUD API |
| Week 20 | Before/After 상세, 대시보드 | 전용 분석 UI |

### Phase 7: 트렌드 모니터링 (2주)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| Week 21 | 트렌드 DB, 수집 로직 | 트렌드 테이블, 크롤러 연동 |
| Week 22 | 리포트 생성, 대시보드 | 주간/월간 리포트, UI |

---

## 7. 핵심 메시지

> 오탐 축적 → 패턴 개선 → 정확도 향상
> 
> 꼼수 수집 → 트렌드 파악 → 선제적 대응
> 
> 이것이 MEDCHECK Engine의 **지속적 경쟁 우위**입니다.

---

*MEDCHECK Engine 고도화 시스템 설계서 v1.0 | 2026년 1월*
