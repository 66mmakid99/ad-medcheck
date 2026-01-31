# 실행계획서: 자동 개선 시스템 Phase 1 (피드백 인프라)

**작성일**: 2026-01-31
**작성자**: Claude
**버전**: 1.0
**예상 작업**: 6단계

---

## 1. 개요

### 1.1 목적
분석 엔진이 **데이터 기반으로 자동 개선**되는 시스템 구축
- 피드백 수집 → 성능 추적 → 자동 학습 파이프라인의 기초 인프라

### 1.2 범위
| 모듈 | 대상 | 설명 |
|------|------|------|
| 의료광고 위반 탐지 | 156개 패턴 | 오탐/미탐/심각도 피드백 |
| 시술단가 추출 | 가격 파싱 | 가격 정확도/매핑 피드백 |

### 1.3 기존 시스템 분석

#### 현재 feedback.ts (452줄)
- ✅ 기본 피드백 저장 (false_positive, false_negative)
- ✅ CRUD API 완비
- ❌ 패턴별/맥락별 성능 추적 없음
- ❌ 자동 학습 기능 없음
- ❌ 가격 추출 피드백 없음

#### 현재 DB 스키마
- `feedback` 테이블 존재 (기본 피드백)
- 성능 추적 테이블 없음

---

## 2. 작업 상세

### 2.1 Phase 1-1: DB 스키마 설계

**파일**: `medcheck-engine/migrations/008_feedback_system.sql`

#### 테이블 설계

```sql
-- 1. 확장된 분석 피드백 테이블
analysis_feedback_v2
  - id (PK)
  - analysis_id
  - violation_id (특정 위반 항목)
  - feedback_type: 'true_positive' | 'false_positive' | 'false_negative' | 'severity_adjust'
  - pattern_id (오탐/정탐 시)
  - original_severity
  - corrected_severity
  - context_text (주변 맥락 300자)
  - context_type: 'negation' | 'question' | 'quotation' | 'disclaimer' | 'normal'
  - hospital_department (진료과목)
  - user_note
  - created_at

-- 2. 패턴별 성능 집계 테이블
pattern_performance
  - id (PK)
  - pattern_id (FK)
  - period_start
  - period_end
  - total_matches
  - true_positives
  - false_positives
  - false_negatives
  - accuracy (계산: TP / (TP + FP))
  - precision
  - recall
  - is_flagged (정확도 80% 미만 시)
  - last_calculated

-- 3. 맥락별 성능 테이블
context_performance
  - id (PK)
  - pattern_id
  - context_type
  - total_matches
  - true_positives
  - false_positives
  - accuracy
  - confidence_modifier (이 맥락에서의 신뢰도 배수)
  - last_calculated

-- 4. 진료과목별 성능 테이블
department_performance
  - id (PK)
  - pattern_id
  - department_code
  - department_name
  - total_matches
  - true_positives
  - false_positives
  - accuracy
  - last_calculated

-- 5. 가격 추출 피드백 테이블
price_extraction_feedback
  - id (PK)
  - extracted_price_id (FK)
  - feedback_type: 'correct' | 'wrong_price' | 'wrong_procedure' | 'wrong_mapping'
  - original_price
  - corrected_price
  - original_procedure
  - corrected_procedure
  - user_note
  - created_at

-- 6. 자동 학습 로그 테이블
auto_learning_log
  - id (PK)
  - learning_type: 'exception_generated' | 'confidence_adjusted' | 'pattern_suggested' | 'mapping_learned'
  - target_id (패턴 ID 또는 매핑 ID)
  - input_data (JSON: 학습에 사용된 데이터)
  - output_data (JSON: 학습 결과)
  - confidence_score
  - status: 'pending' | 'approved' | 'rejected' | 'auto_applied'
  - applied_at
  - created_at

-- 7. 예외 규칙 후보 테이블
exception_candidates
  - id (PK)
  - pattern_id
  - exception_pattern (정규식 또는 키워드)
  - exception_type: 'context' | 'keyword' | 'department'
  - source_feedback_ids (JSON: 근거가 된 피드백 ID들)
  - sample_texts (JSON: 예시 텍스트들)
  - occurrence_count
  - confidence
  - status: 'collecting' | 'pending_review' | 'approved' | 'rejected'
  - approved_by
  - created_at
```

### 2.2 Phase 1-2: 피드백 API 확장

**파일**: `medcheck-engine/src/api/routes/feedback.ts`

#### 신규 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/v1/feedback/violation` | 위반 탐지 피드백 (확장) |
| POST | `/v1/feedback/price` | 가격 추출 피드백 |
| GET | `/v1/feedback/stats` | 전체 피드백 통계 |
| GET | `/v1/feedback/stats/pattern/:patternId` | 패턴별 통계 |
| GET | `/v1/feedback/pending` | 검토 대기 피드백 |

#### 확장 피드백 타입

```typescript
// 위반 탐지 피드백 (확장)
interface ViolationFeedbackRequest {
  analysisId: string;
  violationId?: string;           // 특정 위반 항목
  feedbackType: 'true_positive' | 'false_positive' | 'false_negative' | 'severity_adjust';
  patternId?: string;
  originalSeverity?: string;
  correctedSeverity?: string;     // severity_adjust 시
  contextText?: string;           // 주변 텍스트 (자동 캡처)
  contextType?: 'negation' | 'question' | 'quotation' | 'disclaimer' | 'normal';
  hospitalDepartment?: string;    // 진료과목
  missedText?: string;            // false_negative 시
  suggestedPattern?: string;      // 새 패턴 제안
  userNote?: string;
}

// 가격 추출 피드백
interface PriceFeedbackRequest {
  extractedPriceId: number;
  feedbackType: 'correct' | 'wrong_price' | 'wrong_procedure' | 'wrong_mapping';
  originalPrice?: number;
  correctedPrice?: number;
  originalProcedure?: string;
  correctedProcedure?: string;
  correctedProcedureId?: string;  // 올바른 시술 ID
  userNote?: string;
}
```

### 2.3 Phase 1-3: 성능 추적 서비스

**파일**: `medcheck-engine/src/services/performance-tracker.ts` (신규)

#### 핵심 기능

```typescript
class PerformanceTracker {
  // 1. 피드백 기반 성능 집계 (일별 배치)
  async aggregatePatternPerformance(periodDays: number = 30): Promise<void>

  // 2. 맥락별 성능 분석
  async analyzeContextPerformance(patternId: string): Promise<ContextPerformanceResult>

  // 3. 진료과목별 성능 분석
  async analyzeDepartmentPerformance(patternId: string): Promise<DepartmentPerformanceResult>

  // 4. 저성능 패턴 자동 플래그
  async flagLowPerformancePatterns(threshold: number = 0.8): Promise<FlaggedPattern[]>

  // 5. 성능 리포트 생성
  async generatePerformanceReport(): Promise<PerformanceReport>

  // 6. 신뢰도 배수 계산 (맥락별)
  calculateConfidenceModifier(patternId: string, contextType: string): number
}
```

#### 성능 계산 로직

```typescript
// 정확도 계산
accuracy = truePositives / (truePositives + falsePositives)

// 정밀도 (Precision)
precision = truePositives / (truePositives + falsePositives)

// 재현율 (Recall)
recall = truePositives / (truePositives + falseNegatives)

// F1 Score
f1 = 2 * (precision * recall) / (precision + recall)

// 맥락별 신뢰도 배수
// 예: 부정문에서 정확도 40% → modifier = 0.4
// 분석 시 해당 맥락이면 confidence * modifier 적용
```

### 2.4 Phase 1-4: 자동 학습 기초 모듈

**파일**: `medcheck-engine/src/services/auto-learner.ts` (신규)

#### 핵심 기능

```typescript
class AutoLearner {
  // 1. 예외 규칙 후보 자동 생성
  async generateExceptionCandidates(patternId: string): Promise<ExceptionCandidate[]>

  // 2. 공통 맥락 추출 (오탐 분석)
  extractCommonContext(falsePositiveFeedbacks: Feedback[]): string | null

  // 3. 신뢰도 자동 조정
  async adjustPatternConfidence(patternId: string): Promise<ConfidenceAdjustment>

  // 4. 새 패턴 후보 추출 (미탐 분석)
  async extractPatternCandidates(falseNegativeFeedbacks: Feedback[]): Promise<PatternCandidate[]>

  // 5. 매핑 패턴 학습
  async learnMappingPattern(approvedMappings: MappingApproval[]): Promise<MappingRule[]>

  // 6. 학습 결과 적용 판단
  shouldAutoApply(candidate: LearningCandidate): boolean
}
```

#### 자동 적용 기준

| 학습 유형 | 자동 적용 조건 | 검토 필요 조건 |
|----------|---------------|---------------|
| 예외 규칙 | 신뢰도 95%+ & 사례 10건+ | 신뢰도 80%+ |
| 신뢰도 조정 | 변동폭 ±10% 이내 | 변동폭 10%+ |
| 매핑 학습 | 일치 패턴 5건+ | 3건+ |
| 새 패턴 | - (항상 검토) | 모든 경우 |

### 2.5 Phase 1-5: index.ts 통합

**파일**: `medcheck-engine/src/index.ts`

#### 추가 라우트

```typescript
// 기존 feedbackRoutes 유지
app.route('/v1/feedback', feedbackRoutes);

// 신규 API 추가
// 성능 통계
app.get('/v1/performance/patterns', ...)
app.get('/v1/performance/patterns/:id', ...)
app.get('/v1/performance/report', ...)

// 학습 관리
app.get('/v1/learning/candidates', ...)
app.post('/v1/learning/candidates/:id/approve', ...)
app.post('/v1/learning/candidates/:id/reject', ...)
```

### 2.6 Phase 1-6: 마이그레이션 및 테스트

#### 마이그레이션 적용
```bash
cd medcheck-engine
npx wrangler d1 migrations apply medcheck-db --local
npx wrangler d1 migrations apply medcheck-db --remote
```

#### 테스트 시나리오

| # | 테스트 | 검증 항목 |
|---|--------|----------|
| 1 | 위반 피드백 저장 | DB 저장, 응답 형식 |
| 2 | 가격 피드백 저장 | DB 저장, 응답 형식 |
| 3 | 패턴 성능 조회 | 집계 데이터 정확성 |
| 4 | 맥락별 성능 조회 | 계산 로직 검증 |
| 5 | 저성능 패턴 플래그 | threshold 기준 검증 |
| 6 | 예외 후보 생성 | 공통 맥락 추출 검증 |
| 7 | 빌드 테스트 | TypeScript 컴파일 |

---

## 3. 파일 변경 목록

### 신규 파일
| 파일 | 설명 | 예상 줄수 |
|------|------|----------|
| `migrations/008_feedback_system.sql` | DB 스키마 | ~200줄 |
| `src/services/performance-tracker.ts` | 성능 추적 | ~350줄 |
| `src/services/auto-learner.ts` | 자동 학습 기초 | ~300줄 |

### 수정 파일
| 파일 | 수정 내용 | 변경량 |
|------|----------|--------|
| `src/api/routes/feedback.ts` | 확장 API 추가 | +300줄 |
| `src/index.ts` | 라우트 통합 | +100줄 |
| `src/types/index.ts` | 타입 추가 | +100줄 |

### 총 예상
- 신규: ~850줄
- 수정: ~500줄
- **총: ~1,350줄**

---

## 4. 의존성

### 외부 의존성
- 없음 (기존 스택 사용)

### 내부 의존성
| 모듈 | 의존 대상 |
|------|----------|
| performance-tracker | feedback.ts, D1 |
| auto-learner | performance-tracker, D1 |

---

## 5. 롤백 계획

### DB 롤백
```sql
-- 008_feedback_system.sql 롤백
DROP TABLE IF EXISTS analysis_feedback_v2;
DROP TABLE IF EXISTS pattern_performance;
DROP TABLE IF EXISTS context_performance;
DROP TABLE IF EXISTS department_performance;
DROP TABLE IF EXISTS price_extraction_feedback;
DROP TABLE IF EXISTS auto_learning_log;
DROP TABLE IF EXISTS exception_candidates;
```

### 코드 롤백
- Git revert 사용
- 기존 feedback.ts 복원 (452줄 버전)

---

## 6. 완료 기준

### 필수 기준
- [ ] 모든 테이블 생성 완료
- [ ] 피드백 API 응답 정상
- [ ] TypeScript 빌드 성공
- [ ] 로컬 테스트 통과

### 품질 기준
- [ ] 코드 중복 최소화
- [ ] 에러 핸들링 완비
- [ ] 타입 안전성 확보

---

## 7. 실행 순서

```
1. migrations/008_feedback_system.sql 작성
   ↓
2. src/types/index.ts 타입 추가
   ↓
3. src/services/performance-tracker.ts 구현
   ↓
4. src/services/auto-learner.ts 구현
   ↓
5. src/api/routes/feedback.ts 확장
   ↓
6. src/index.ts 라우트 통합
   ↓
7. 마이그레이션 적용 (로컬)
   ↓
8. 빌드 테스트
   ↓
9. API 테스트
   ↓
10. 마이그레이션 적용 (리모트)
   ↓
11. CLAUDE.md 업데이트
```

---

**승인**: 실행계획서 검토 후 작업 시작
