import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

/**
 * Supabase REST API 직접 호출 (SDK 없이)
 */
export async function supabaseQuery(table, { select = '*', order, limit, offset, filters } = {}) {
  const params = new URLSearchParams();
  params.set('select', select);
  if (order) params.set('order', order);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  let url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;

  // filters: [{ column: 'grade', op: 'eq', value: 'F' }]
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
  const data = await res.json();
  const total = res.headers.get('content-range')?.split('/')?.[1];

  return { data, total: total ? parseInt(total, 10) : data.length };
}
