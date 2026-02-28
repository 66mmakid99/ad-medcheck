/**
 * Supabase check_violation_results 저장 유틸
 * fetch() 기반 REST API 호출 (Cloudflare Workers 호환)
 */

export interface CheckViolationData {
  hospital_id?: string;
  hospital_name?: string;
  url: string;
  grade: string;
  clean_score: number;
  violation_count: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  violations: unknown[];
  analysis_mode: string;
  processing_time_ms: number;
}

/**
 * check_violation_results 테이블에 분석 결과 저장
 * 실패해도 예외를 던지지 않고 { saved: false } 반환
 */
export async function saveCheckViolationResult(
  supabaseUrl: string,
  supabaseKey: string,
  data: CheckViolationData,
): Promise<{ saved: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/check_violation_results`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          hospital_id: data.hospital_id || null,
          hospital_name: data.hospital_name || null,
          url: data.url,
          grade: data.grade,
          clean_score: data.clean_score,
          violation_count: data.violation_count,
          critical_count: data.critical_count,
          major_count: data.major_count,
          minor_count: data.minor_count,
          violations: data.violations,
          analysis_mode: data.analysis_mode,
          processing_time_ms: data.processing_time_ms,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[supabase-saver] INSERT failed: ${res.status} ${body}`);
      return { saved: false, error: `${res.status}: ${body}` };
    }

    const rows = await res.json() as Array<{ id: string }>;
    return { saved: true, id: rows[0]?.id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[supabase-saver] Exception: ${msg}`);
    return { saved: false, error: msg };
  }
}
