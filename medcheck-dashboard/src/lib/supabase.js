import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

/**
 * Supabase REST API 직접 호출 (SDK 없이)
 * 에러 시 빈 배열 반환 (절대 throw 안 함)
 */
export async function supabaseQuery(table, { select = '*', order, limit, offset, filters } = {}) {
  try {
    const params = new URLSearchParams();
    params.set('select', select);
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));

    let url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    };

    if (filters?.length) {
      for (const f of filters) {
        url += `&${f.column}=${f.op}.${f.value}`;
      }
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.warn(`Supabase ${res.status}: ${table}`, await res.text().catch(() => ''));
      return { data: [], total: 0, error: `HTTP ${res.status}` };
    }

    const data = await res.json();

    // Supabase 에러 응답은 object (not array) — 안전하게 처리
    if (!Array.isArray(data)) {
      console.warn('Supabase non-array response:', data);
      return { data: [], total: 0, error: data?.message || 'invalid response' };
    }

    const total = res.headers.get('content-range')?.split('/')?.[1];
    return { data, total: total ? parseInt(total, 10) : data.length };
  } catch (e) {
    console.warn('Supabase query failed:', e);
    return { data: [], total: 0, error: e.message };
  }
}
