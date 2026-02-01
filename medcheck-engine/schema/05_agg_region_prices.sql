-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 2
-- agg_region_prices (지역별 가격 집계)
-- ================================================================
-- 목적: 지역별, 시술별 가격 통계 (평균, 중앙값, 최저/최고)
-- 활용: Fair Price(적정 시세) 계산, 지역 시세 비교
-- ================================================================

-- ================================================================
-- 지역별 시술 가격 집계 뷰 (실시간)
-- ================================================================

CREATE VIEW IF NOT EXISTS v_region_procedure_prices AS
SELECT 
  fp.sigungu,
  fp.procedure_id,
  p.name as procedure_name,
  fp.unit_id,
  u.unit_name_ko as unit_name,
  
  -- 샘플 정보
  COUNT(*) as sample_count,
  COUNT(DISTINCT fp.hospital_id) as hospital_count,
  
  -- 가격 통계
  ROUND(AVG(fp.price_per_unit)) as avg_price_per_unit,
  ROUND(MIN(fp.price_per_unit)) as min_price_per_unit,
  ROUND(MAX(fp.price_per_unit)) as max_price_per_unit,
  
  -- 총액 통계
  ROUND(AVG(fp.total_price)) as avg_total_price,
  ROUND(MIN(fp.total_price)) as min_total_price,
  ROUND(MAX(fp.total_price)) as max_total_price,
  
  -- 수량 통계
  ROUND(AVG(fp.quantity), 1) as avg_quantity,
  
  -- 이벤트 비율
  ROUND(SUM(CASE WHEN fp.is_event = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as event_rate_pct,
  
  -- 데이터 신선도
  MAX(fp.collected_at) as latest_data,
  MIN(fp.collected_at) as oldest_data

FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
WHERE fp.is_active = 1
GROUP BY fp.sigungu, fp.procedure_id, fp.unit_id
HAVING COUNT(*) >= 3;  -- 최소 3개 샘플 이상

-- ================================================================
-- 시도별 시술 가격 집계 뷰
-- ================================================================

CREATE VIEW IF NOT EXISTS v_sido_procedure_prices AS
SELECT 
  fp.sido,
  fp.procedure_id,
  p.name as procedure_name,
  fp.unit_id,
  u.unit_name_ko as unit_name,
  
  COUNT(*) as sample_count,
  COUNT(DISTINCT fp.hospital_id) as hospital_count,
  COUNT(DISTINCT fp.sigungu) as sigungu_count,
  
  ROUND(AVG(fp.price_per_unit)) as avg_price_per_unit,
  ROUND(MIN(fp.price_per_unit)) as min_price_per_unit,
  ROUND(MAX(fp.price_per_unit)) as max_price_per_unit,
  
  ROUND(AVG(fp.total_price)) as avg_total_price

FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
WHERE fp.is_active = 1
GROUP BY fp.sido, fp.procedure_id, fp.unit_id
HAVING COUNT(*) >= 5;

-- ================================================================
-- 전국 시술 가격 집계 뷰
-- ================================================================

CREATE VIEW IF NOT EXISTS v_national_procedure_prices AS
SELECT 
  fp.procedure_id,
  p.name as procedure_name,
  fp.unit_id,
  u.unit_name_ko as unit_name,
  
  COUNT(*) as sample_count,
  COUNT(DISTINCT fp.hospital_id) as hospital_count,
  COUNT(DISTINCT fp.sigungu) as region_count,
  
  ROUND(AVG(fp.price_per_unit)) as avg_price_per_unit,
  ROUND(MIN(fp.price_per_unit)) as min_price_per_unit,
  ROUND(MAX(fp.price_per_unit)) as max_price_per_unit,
  
  -- 사분위수 근사값 (SQLite는 PERCENTILE 미지원, 근사치)
  ROUND(AVG(fp.price_per_unit) * 0.75) as est_q1_price,  -- 근사 25%
  ROUND(AVG(fp.price_per_unit)) as est_median_price,      -- 근사 중앙값
  ROUND(AVG(fp.price_per_unit) * 1.25) as est_q3_price,  -- 근사 75%
  
  ROUND(AVG(fp.total_price)) as avg_total_price,
  ROUND(AVG(fp.quantity), 1) as avg_quantity

FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
WHERE fp.is_active = 1 AND fp.is_event = 0  -- 정가 기준
GROUP BY fp.procedure_id, fp.unit_id
HAVING COUNT(*) >= 10;

-- ================================================================
-- Fair Price (적정 시세) 뷰
-- ================================================================
-- GoodRx 스타일: 지역 평균의 80~120% 범위를 "적정 시세"로 정의

CREATE VIEW IF NOT EXISTS v_fair_prices AS
SELECT 
  sigungu,
  procedure_id,
  procedure_name,
  unit_id,
  unit_name,
  sample_count,
  hospital_count,
  avg_price_per_unit,
  min_price_per_unit,
  max_price_per_unit,
  
  -- Fair Price 범위 (평균의 80% ~ 120%)
  ROUND(avg_price_per_unit * 0.8) as fair_price_low,
  ROUND(avg_price_per_unit) as fair_price_mid,
  ROUND(avg_price_per_unit * 1.2) as fair_price_high,
  
  -- 가격 판단 기준
  ROUND(avg_price_per_unit * 0.7) as very_cheap_threshold,  -- 매우 저렴
  ROUND(avg_price_per_unit * 0.85) as cheap_threshold,       -- 저렴
  ROUND(avg_price_per_unit * 1.15) as expensive_threshold,   -- 비쌈
  ROUND(avg_price_per_unit * 1.3) as very_expensive_threshold -- 매우 비쌈

FROM v_region_procedure_prices
WHERE sample_count >= 5;

-- ================================================================
-- 병원 가격 포지셔닝 뷰
-- ================================================================
-- 병원의 가격이 지역 평균 대비 어디에 위치하는지

CREATE VIEW IF NOT EXISTS v_hospital_price_position AS
SELECT 
  fp.hospital_id,
  fp.hospital_name,
  fp.sigungu,
  fp.procedure_id,
  p.name as procedure_name,
  fp.total_price,
  fp.quantity,
  fp.price_per_unit,
  u.unit_name_ko as unit_name,
  fp.is_event,
  
  -- 지역 통계
  rp.avg_price_per_unit as region_avg,
  rp.min_price_per_unit as region_min,
  rp.max_price_per_unit as region_max,
  rp.sample_count as region_sample_count,
  
  -- 포지션 계산
  ROUND((fp.price_per_unit - rp.avg_price_per_unit) / rp.avg_price_per_unit * 100, 1) as vs_region_avg_pct,
  
  -- 가격 등급
  CASE 
    WHEN fp.price_per_unit < rp.avg_price_per_unit * 0.7 THEN '💰 매우 저렴'
    WHEN fp.price_per_unit < rp.avg_price_per_unit * 0.85 THEN '😊 저렴'
    WHEN fp.price_per_unit < rp.avg_price_per_unit * 1.15 THEN '✅ 적정'
    WHEN fp.price_per_unit < rp.avg_price_per_unit * 1.3 THEN '⚠️ 비쌈'
    ELSE '🚨 매우 비쌈'
  END as price_grade,
  
  -- 순위
  (SELECT COUNT(*) + 1 FROM fact_prices fp2 
   WHERE fp2.sigungu = fp.sigungu 
     AND fp2.procedure_id = fp.procedure_id 
     AND fp2.price_per_unit < fp.price_per_unit
     AND fp2.is_active = 1) as price_rank

FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
LEFT JOIN v_region_procedure_prices rp 
  ON fp.sigungu = rp.sigungu 
  AND fp.procedure_id = rp.procedure_id
  AND fp.unit_id = rp.unit_id
WHERE fp.is_active = 1;

-- ================================================================
-- 가격 트렌드 뷰 (월별)
-- ================================================================

CREATE VIEW IF NOT EXISTS v_price_trends AS
SELECT 
  strftime('%Y-%m', fp.collected_at) as year_month,
  fp.sigungu,
  fp.procedure_id,
  p.name as procedure_name,
  fp.unit_id,
  u.unit_name_ko as unit_name,
  
  COUNT(*) as sample_count,
  ROUND(AVG(fp.price_per_unit)) as avg_price_per_unit,
  ROUND(MIN(fp.price_per_unit)) as min_price_per_unit,
  ROUND(MAX(fp.price_per_unit)) as max_price_per_unit

FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
WHERE fp.is_active = 1
GROUP BY strftime('%Y-%m', fp.collected_at), fp.sigungu, fp.procedure_id, fp.unit_id
ORDER BY year_month DESC;

-- ================================================================
-- 가격 변동 이력 상세 뷰
-- ================================================================

CREATE VIEW IF NOT EXISTS v_price_history_detail AS
SELECT 
  h.id,
  h.price_id,
  fp.hospital_name,
  fp.procedure_name_matched as procedure_name,
  fp.sigungu,
  
  h.old_total_price,
  h.new_total_price,
  h.price_change_amount,
  h.price_change_rate,
  
  h.old_price_per_unit,
  h.new_price_per_unit,
  
  h.change_type,
  h.changed_at

FROM fact_price_history h
JOIN fact_prices fp ON h.price_id = fp.id
ORDER BY h.changed_at DESC;
