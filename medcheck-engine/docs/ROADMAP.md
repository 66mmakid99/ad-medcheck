# MedCheck Engine 로드맵

**최종 업데이트:** 2026-03-02
**현재 버전:** v2.0.0

---

## 완료된 마일스톤

### Phase 1: Core 엔진 (완료)
- [x] 프로젝트 구조 + TypeScript 설정
- [x] 기본 타입 정의 (ViolationResult, ModuleInput/Output)
- [x] 텍스트 전처리 (parser, normalizer)
- [x] 패턴 매칭 엔진 (pattern-matcher.ts)
- [x] 규칙 엔진 (rule-engine.ts)
- [x] Cloudflare Workers 배포

### Phase 2: 위반 패턴 DB (완료)
- [x] 156개 패턴 정의 (32개 카테고리)
- [x] 법적 근거 매핑 (의료법 제56조)
- [x] 예외 규칙 시스템
- [x] 오탐 관리 API

### Phase 3: AI 하이브리드 분석 (완료)
- [x] Claude Haiku 맥락 분석
- [x] Gemini Flash 분석 파이프라인
- [x] OCR 이미지 분석 (Gemini Vision)
- [x] 정확도 테스트 프레임워크 (23 케이스, 100%)

### Phase 4: 자동화 파이프라인 (완료)
- [x] 네이버 → 구글 → 분석 자동 파이프라인
- [x] Cron 스케줄러 (0:00, 9:00 UTC)
- [x] 실시간 대시보드 (5s polling)
- [x] CSV 내보내기

### Phase 5: 상용 서비스 (완료)
- [x] 가격 분석 v2 (부위별 단가, 스크린샷 증빙)
- [x] 가격 변동 알림
- [x] 경쟁사 모니터링
- [x] 17탭 대시보드 (React 19 + Vite 7 + Tailwind 4)

### Phase 6: 자동 개선 시스템 (완료)
- [x] Phase 1: 피드백 인프라 + 성능 추적
- [x] Phase 2: 자동 적용 로직 (임계값 기반)
- [x] HITL 큐 (저신뢰도 검토)
- [x] 설정 API + SettingsTab

---

## 진행 중

### Phase 7: 품질 강화
- [ ] A/B 테스트 프레임워크 (자동 개선 Phase 3)
- [ ] 꼼수 패턴 수집 (카테고리 19)
- [ ] AI 하이브리드 정확도 벤치마크
- [ ] 자동화 테스트 (Vitest)

---

## 미래 계획

- madmedscv 통합 (OCR/크롤러 이관)
- 마케팅 트렌드 모니터링
- B2B SaaS 포탈
