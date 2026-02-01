#!/bin/bash
# ================================================================
# MADMEDCHECK 가격 DB - Phase 1 마이그레이션
# ================================================================
# 사용법: bash migrate.sh
# ================================================================

echo "🚀 MADMEDCHECK 가격 DB Phase 1 마이그레이션 시작..."
echo ""

# 1. dim_units 테이블 생성
echo "1️⃣ dim_units (단위 마스터) 테이블 생성 중..."
wrangler d1 execute madmedcheck-db --file=./schema/01_dim_units.sql
echo "✅ dim_units 완료"
echo ""

# 2. fact_prices 테이블 생성
echo "2️⃣ fact_prices (가격 팩트) 테이블 생성 중..."
wrangler d1 execute madmedcheck-db --file=./schema/02_fact_prices.sql
echo "✅ fact_prices 완료"
echo ""

# 3. 확인
echo "3️⃣ 테이블 생성 확인..."
wrangler d1 execute madmedcheck-db --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
echo ""

echo "4️⃣ dim_units 초기 데이터 확인..."
wrangler d1 execute madmedcheck-db --command="SELECT id, unit_code, unit_name_ko FROM dim_units;"
echo ""

echo "🎉 마이그레이션 완료!"
echo ""
echo "다음 단계:"
echo "  1. wrangler dev 로 로컬 테스트"
echo "  2. wrangler deploy 로 배포"
