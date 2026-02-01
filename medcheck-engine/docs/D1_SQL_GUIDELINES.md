# Cloudflare D1 SQL 작성 지침

## ⚠️ 필수 준수 사항

이 지침은 Cloudflare D1 데이터베이스 마이그레이션 작성 시 **반드시** 따라야 합니다.
D1은 SQLite 기반이지만 일부 기능이 제한됩니다.

---

## 🚫 절대 사용 금지

### 1. 트리거 (TRIGGER)
```sql
-- ❌ 금지: D1에서 CREATE TRIGGER IF NOT EXISTS 미지원
CREATE TRIGGER IF NOT EXISTS trigger_name ...

-- ❌ 금지: 트리거 자체가 불안정
CREATE TRIGGER trigger_name ...
```

**대안**: 애플리케이션 레벨에서 처리 (TypeScript 코드에서 updated_at 갱신)

### 2. 뷰 (VIEW)
```sql
-- ❌ 금지: D1에서 CREATE VIEW IF NOT EXISTS 미지원
CREATE VIEW IF NOT EXISTS view_name AS ...

-- ❌ 금지: 뷰 자체가 불안정
CREATE VIEW view_name AS ...
```

**대안**: 애플리케이션 레벨에서 쿼리 함수로 구현

### 3. CHECK 제약조건 (복잡한 경우)
```sql
-- ❌ 금지: 복잡한 CHECK 제약
column_name TEXT CHECK (column_name IN ('a', 'b', 'c', 'd', 'e', 'f', 'g'))

-- ✅ 허용: CHECK 없이 정의
column_name TEXT
```

**대안**: 애플리케이션 레벨에서 유효성 검사

### 4. FOREIGN KEY (권장하지 않음)
```sql
-- ⚠️ 비권장: D1에서 외래키 동작이 불안정
FOREIGN KEY (column) REFERENCES other_table(id) ON DELETE CASCADE
```

**대안**: 애플리케이션 레벨에서 참조 무결성 관리

### 5. 복합 INSERT VALUES
```sql
-- ❌ 금지: 여러 행을 한 INSERT로
INSERT INTO table (a, b) VALUES
  ('1', 'x'),
  ('2', 'y'),
  ('3', 'z');
```

**대안**: 개별 INSERT 문으로 분리
```sql
-- ✅ 허용: 각각 별도 INSERT
INSERT OR IGNORE INTO table (a, b) VALUES ('1', 'x');
INSERT OR IGNORE INTO table (a, b) VALUES ('2', 'y');
INSERT OR IGNORE INTO table (a, b) VALUES ('3', 'z');
```

---

## ✅ 안전하게 사용 가능

### 1. 테이블 생성
```sql
-- ✅ 허용
CREATE TABLE IF NOT EXISTS table_name (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  score REAL,
  data TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 2. 인덱스 생성
```sql
-- ✅ 허용
CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column);
CREATE INDEX IF NOT EXISTS idx_table_multi ON table_name(col1, col2);
CREATE INDEX IF NOT EXISTS idx_table_desc ON table_name(created_at DESC);
```

### 3. UNIQUE 제약
```sql
-- ✅ 허용: 테이블 정의 내에서
CREATE TABLE IF NOT EXISTS table_name (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  period TEXT NOT NULL,
  UNIQUE(code, period)
);
```

### 4. 기본 INSERT
```sql
-- ✅ 허용
INSERT OR IGNORE INTO table_name (col1, col2) VALUES ('value1', 'value2');
INSERT OR REPLACE INTO table_name (col1, col2) VALUES ('value1', 'value2');
```

### 5. 컬럼 추가
```sql
-- ✅ 허용
ALTER TABLE table_name ADD COLUMN new_column TEXT;
ALTER TABLE table_name ADD COLUMN new_column INTEGER DEFAULT 0;
```

---

## 📋 마이그레이션 파일 체크리스트

새 마이그레이션 파일 작성 후 **반드시** 확인:

```
[ ] CREATE TRIGGER 없음
[ ] CREATE VIEW 없음
[ ] 복잡한 CHECK 제약조건 없음
[ ] FOREIGN KEY 없음 (또는 최소화)
[ ] 복합 INSERT VALUES 없음 (각각 분리)
[ ] 모든 문장 끝에 세미콜론(;) 있음
[ ] CREATE TABLE IF NOT EXISTS 사용
[ ] CREATE INDEX IF NOT EXISTS 사용
```

---

## 📝 마이그레이션 파일 템플릿

```sql
-- 00X_migration_name.sql
-- 설명: [마이그레이션 목적]
-- 작성일: YYYY-MM-DD
-- D1 호환: ✅

-- ============================================
-- 1. 테이블명
-- ============================================

CREATE TABLE IF NOT EXISTS table_name (
  id TEXT PRIMARY KEY,
  
  -- 필수 컬럼
  name TEXT NOT NULL,
  
  -- 선택 컬럼
  description TEXT,
  count INTEGER DEFAULT 0,
  score REAL,
  
  -- 상태 (CHECK 대신 애플리케이션에서 검증)
  status TEXT DEFAULT 'pending',
  
  -- JSON 데이터
  metadata TEXT,
  
  -- 타임스탬프
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- UNIQUE 제약
  UNIQUE(name, status)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_table_name ON table_name(name);
CREATE INDEX IF NOT EXISTS idx_table_status ON table_name(status);
CREATE INDEX IF NOT EXISTS idx_table_created ON table_name(created_at DESC);

-- ============================================
-- 2. 다음 테이블
-- ============================================

-- ... (같은 패턴 반복)

-- ============================================
-- 초기 데이터 (필요시)
-- ============================================

INSERT OR IGNORE INTO table_name (id, name, status) VALUES ('id1', 'name1', 'active');
INSERT OR IGNORE INTO table_name (id, name, status) VALUES ('id2', 'name2', 'active');
```

---

## 🔧 D1에서 제외된 기능 대체 방법

### 트리거 대체: TypeScript에서 처리
```typescript
// updated_at 자동 갱신
async function updateRecord(db: D1Database, id: string, data: any) {
  await db.prepare(`
    UPDATE table_name 
    SET col1 = ?, col2 = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(data.col1, data.col2, id).run();
}
```

### 뷰 대체: 쿼리 함수로 구현
```typescript
// v_pattern_performance_summary 뷰 대체
async function getPatternPerformanceSummary(db: D1Database) {
  return await db.prepare(`
    SELECT 
      pp.pattern_id,
      pp.accuracy,
      pp.total_matches,
      pp.is_flagged
    FROM pattern_performance pp
    WHERE pp.period_type = 'all_time'
    ORDER BY pp.is_flagged DESC, pp.accuracy ASC
  `).all();
}
```

### CHECK 제약 대체: 애플리케이션 검증
```typescript
// feedback_type 검증
const VALID_FEEDBACK_TYPES = ['true_positive', 'false_positive', 'false_negative', 'severity_adjust'];

function validateFeedbackType(type: string): boolean {
  return VALID_FEEDBACK_TYPES.includes(type);
}

// 저장 전 검증
if (!validateFeedbackType(input.feedback_type)) {
  throw new Error('Invalid feedback_type');
}
```

### FOREIGN KEY 대체: 애플리케이션에서 참조 확인
```typescript
// 참조 무결성 체크
async function createFeedback(db: D1Database, data: FeedbackInput) {
  // 부모 레코드 존재 확인
  const analysis = await db.prepare(
    'SELECT id FROM analysis_results WHERE id = ?'
  ).bind(data.analysis_id).first();
  
  if (!analysis) {
    throw new Error('Analysis not found');
  }
  
  // 피드백 생성
  await db.prepare(`INSERT INTO feedback ...`).bind(...).run();
}
```

---

## ⚡ 빠른 검증 명령어

마이그레이션 작성 후 로컬에서 먼저 테스트:

```bash
# 1. 로컬 DB에 적용
wrangler d1 migrations apply medcheck-db --local

# 2. 성공하면 원격에 적용
wrangler d1 migrations apply medcheck-db --remote
```

---

## 📌 요약

| 기능 | D1 지원 | 대안 |
|------|---------|------|
| CREATE TABLE IF NOT EXISTS | ✅ | - |
| CREATE INDEX IF NOT EXISTS | ✅ | - |
| UNIQUE 제약 | ✅ | - |
| INSERT OR IGNORE | ✅ | - |
| ALTER TABLE ADD COLUMN | ✅ | - |
| CREATE TRIGGER | ❌ | TypeScript 코드 |
| CREATE VIEW | ❌ | 쿼리 함수 |
| CHECK 제약 (복잡) | ⚠️ | 애플리케이션 검증 |
| FOREIGN KEY | ⚠️ | 애플리케이션 검증 |
| 복합 INSERT VALUES | ❌ | 개별 INSERT |

---

**이 지침을 CLAUDE.md 또는 프로젝트 docs/에 추가하여 항상 참조하세요.**
