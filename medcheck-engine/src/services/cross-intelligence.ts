/**
 * 크로스 인텔리전스 모듈
 * MADMEDSALES ↔ MADMEDCHECK 양방향 데이터 교환
 *
 * Phase 4: 영업과 컴플라이언스가 서로 강화
 *
 * MADMEDSALES → MADMEDCHECK: 확정 장비/시술명 → 동적 네거티브 리스트
 * MADMEDCHECK → MADMEDSALES: 위반 등급 → 영업 우선순위/각도
 */

import type { AuditResult, AuditedViolation } from '../types/violation-types';

// ============================================
// Supabase 간이 클라이언트
// ============================================

async function supabaseQuery(
  supabaseUrl: string,
  supabaseKey: string,
  table: string,
  method: 'GET' | 'POST' | 'PATCH',
  params?: {
    select?: string;
    filter?: Record<string, string>;
    body?: any;
    upsert?: boolean;
  },
): Promise<any> {
  let url = `${supabaseUrl}/rest/v1/${table}`;
  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  if (method === 'GET') {
    const searchParams = new URLSearchParams();
    if (params?.select) searchParams.set('select', params.select);
    if (params?.filter) {
      for (const [key, value] of Object.entries(params.filter)) {
        searchParams.set(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  if (params?.upsert) {
    headers['Prefer'] = 'resolution=merge-duplicates';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' && params?.body ? JSON.stringify(params.body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase ${method} ${table}: ${response.status} - ${errText.substring(0, 200)}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ============================================
// MADMEDSALES → MADMEDCHECK: 동적 네거티브 리스트
// ============================================

/**
 * MADMEDSALES에서 확정된 장비/시술/의사 이름을 가져와 네거티브 리스트에 추가
 */
export async function syncSalesDataForMedcheck(
  hospitalId: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<{
  confirmedDevices: string[];
  confirmedTreatments: string[];
}> {
  try {
    const data = await supabaseQuery(supabaseUrl, supabaseKey, 'medcode_hospital_profiles', 'GET', {
      select: 'confirmed_devices,confirmed_treatments,confirmed_doctors',
      filter: { hospital_id: `eq.${hospitalId}` },
    });

    if (!data || data.length === 0) {
      return { confirmedDevices: [], confirmedTreatments: [] };
    }

    const profile = data[0];
    const devices = (profile.confirmed_devices || []).map((d: any) => d.name || d);
    const treatments = (profile.confirmed_treatments || []).map((t: any) => t.name || t);
    const doctors = (profile.confirmed_doctors || []).map((d: any) => d.name || d);

    return {
      confirmedDevices: [...devices, ...doctors],
      confirmedTreatments: treatments,
    };
  } catch (error) {
    console.warn(`[CrossIntel] Sales sync failed for ${hospitalId}:`, (error as Error).message);
    return { confirmedDevices: [], confirmedTreatments: [] };
  }
}

// ============================================
// MADMEDCHECK → MADMEDSALES: 위반 등급으로 영업 우선순위
// ============================================

/**
 * 분석 결과를 Supabase 공유 테이블에 저장 (영업 측에서 활용)
 */
export async function syncMedcheckDataForSales(
  hospitalId: string,
  hospitalName: string,
  auditResult: AuditResult,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  try {
    const violationCategories = categorizeViolations(auditResult.finalViolations);
    const priority = derivePriority(auditResult);
    const angle = generateSalesAngle(auditResult, violationCategories);

    await supabaseQuery(supabaseUrl, supabaseKey, 'medcode_hospital_profiles', 'POST', {
      upsert: true,
      body: {
        hospital_id: hospitalId,
        hospital_name: hospitalName,
        compliance_grade: auditResult.grade.grade,
        clean_score: auditResult.grade.cleanScore,
        violation_count: auditResult.finalCount,
        violation_categories: violationCategories,
        gray_zone_count: auditResult.grayZones.length,
        compliance_updated_at: new Date().toISOString(),
        cold_email_priority: priority,
        cold_email_angle: angle,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn(`[CrossIntel] Medcheck sync failed for ${hospitalId}:`, (error as Error).message);
  }
}

// ============================================
// 영업 우선순위 자동 생성
// ============================================

function derivePriority(audit: AuditResult): 'hot' | 'warm' | 'cold' | 'skip' {
  const { grade, cleanScore } = audit.grade;

  // D/F 등급 → hot (가장 도움이 필요한 병원)
  if (grade === 'D' || grade === 'F') return 'hot';

  // C 등급 → warm
  if (grade === 'C') return 'warm';

  // B 등급 + gray zone 있음 → warm
  if (grade === 'B' && audit.grayZones.length > 0) return 'warm';

  // A/S 등급 → cold (이미 잘하고 있음)
  if (grade === 'A' || grade === 'S') return 'cold';

  return 'cold';
}

function generateSalesAngle(
  audit: AuditResult,
  categories: Record<string, number>,
): string {
  const { grade } = audit.grade;
  const angles: string[] = [];

  if (grade === 'D' || grade === 'F') {
    angles.push('광고 리스크 관리 시급');
    if (categories['치료효과보장'] || categories['부작용부정']) {
      angles.push('법적 제재 가능성 높음, 즉시 개선 필요');
    }
  }

  if (categories['전후사진']) {
    angles.push('전후사진 규정 위반 → 컴플라이언스 컨설팅 제안');
  }

  if (categories['최상급표현']) {
    angles.push('과장 광고 → 브랜드 신뢰도 관리 제안');
  }

  if (categories['환자유인']) {
    angles.push('가격 할인 의존 → 프리미엄 포지셔닝 전환 제안');
  }

  if (audit.grayZones.length > 0) {
    angles.push(`법 우회 ${audit.grayZones.length}건 감지 → 선제적 대응 필요`);
  }

  if (grade === 'B' || grade === 'C') {
    angles.push('컴플라이언스 개선 + 장비 효율화 패키지 제안');
  }

  return angles.length > 0 ? angles.join(' / ') : '일반 영업 접근';
}

// ============================================
// 유틸리티
// ============================================

function categorizeViolations(violations: AuditedViolation[]): Record<string, number> {
  const categories: Record<string, number> = {};
  for (const v of violations) {
    const cat = v.category || 'unknown';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  return categories;
}

/**
 * Supabase 캐시에서 크롤링 데이터 가져오기
 * (MADMEDSALES가 이미 크롤링한 경우 재사용)
 */
export async function getCachedCrawl(
  url: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<{ text: string } | null> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const data = await supabaseQuery(supabaseUrl, supabaseKey, 'medcode_crawl_cache', 'GET', {
      select: 'markdown_text,crawled_at',
      filter: {
        url: `eq.${url}`,
        crawled_at: `gte.${sevenDaysAgo}`,
      },
    });

    if (data && data.length > 0 && data[0].markdown_text) {
      return { text: data[0].markdown_text };
    }
    return null;
  } catch {
    return null;
  }
}
