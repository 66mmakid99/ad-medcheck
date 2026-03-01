# MADMEDCHECK 작업지시문

**최종 업데이트:** 2026-03-02

---

## 완료된 작업

| Step | 작업 | 상태 | 완료일 |
|------|------|------|--------|
| 2 | 대시보드 UI 신규 API 연결 | ✅ 완료 | MedCheckApp.jsx + 17탭 구조로 전면 재구축 |
| 3 | 패턴 품질 개선 (네비게이션 FP 필터) | ✅ 완료 | result-postprocessor.ts 26개 네비게이션 텍스트 |
| 4 | SPA 사이트 대응 | ✅ 완료 | analysis-pipeline.ts SPA 감지 로직 |
| 5 | OCR 연결 | ✅ 완료 | Gemini Vision API 연동 |
| 6 | Cron 추가 (0 0, 0 9) | ✅ 완료 | wrangler.toml crons 설정 |
| 7 | 배치 완료 로그 | ✅ 완료 | crawler-handler.ts BATCH_COMPLETE 로그 |

---

## 미완료 작업

### Step 10: D1 성능 인덱스 (수동 실행 필요)

```bash
cd medcheck-engine
wrangler d1 execute medcheck-db --remote --command "CREATE INDEX IF NOT EXISTS idx_ah_hospital_date ON analysis_history(hospital_id, analyzed_at DESC);"
wrangler d1 execute medcheck-db --remote --command "CREATE INDEX IF NOT EXISTS idx_ah_status_date ON analysis_history(status, analyzed_at DESC);"
wrangler d1 execute medcheck-db --remote --command "CREATE INDEX IF NOT EXISTS idx_ah_grade ON analysis_history(grade, analyzed_at DESC);"
wrangler d1 execute medcheck-db --remote --command "CREATE INDEX IF NOT EXISTS idx_cq_status_priority ON crawl_queue(status, priority, created_at);"
```

> 이 인덱스는 `wrangler d1 execute --remote`로 프로덕션 D1에 직접 실행해야 합니다.
