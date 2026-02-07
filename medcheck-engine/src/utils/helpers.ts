import type { D1Database } from '../db/d1';

export async function resolveProcedureMapping(db: D1Database, data: {
  procedureId?: string;
  procedureName?: string;
  category?: string;
  subcategory?: string;
  price?: number;
}): Promise<{
  procedureId: string;
  method: string;
  isNew: boolean;
  isCandidate: boolean;
  confidence: number;
}> {
  const { procedureId, procedureName, category, subcategory, price } = data;

  if (procedureId) {
    return { procedureId, method: 'direct', isNew: false, isCandidate: false, confidence: 100 };
  }

  if (!procedureName) {
    throw new Error('procedureId or procedureName required');
  }

  const normalized = normalizeName(procedureName);

  const exactMatch = await db.prepare(`
    SELECT id FROM procedures WHERE name = ? OR LOWER(name) = ?
  `).bind(procedureName, normalized).first() as Record<string, unknown> | null;

  if (exactMatch) {
    return { procedureId: exactMatch.id as string, method: 'exact', isNew: false, isCandidate: false, confidence: 100 };
  }

  const aliasMatch = await db.prepare(`
    SELECT procedure_id, confidence FROM procedure_aliases
    WHERE alias_name = ? OR normalized_name = ?
    ORDER BY confidence DESC LIMIT 1
  `).bind(procedureName, normalized).first() as Record<string, unknown> | null;

  if (aliasMatch && (aliasMatch.confidence as number) >= 80) {
    return { procedureId: aliasMatch.procedure_id as string, method: 'alias', isNew: false, isCandidate: false, confidence: aliasMatch.confidence as number };
  }

  const comboMatch = await db.prepare(`
    SELECT id FROM procedure_packages WHERE package_name = ? OR normalized_name = ?
  `).bind(procedureName, normalized).first() as Record<string, unknown> | null;

  if (comboMatch) {
    return { procedureId: `PKG-${comboMatch.id}`, method: 'package', isNew: false, isCandidate: false, confidence: 90 };
  }

  const existingCandidate = await db.prepare(`
    SELECT * FROM mapping_candidates WHERE normalized_name = ?
  `).bind(normalized).first() as Record<string, unknown> | null;

  if (existingCandidate) {
    await db.prepare(`
      UPDATE mapping_candidates SET
        total_cases = total_cases + 1,
        last_seen_at = datetime('now'),
        price_samples = json_insert(COALESCE(price_samples, '[]'), '$[#]', ?),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(price, existingCandidate.id).run();

    await checkMappingApprovalConditions(db, existingCandidate.id as string);

    if (existingCandidate.status === 'approved' && existingCandidate.approved_alias_id) {
      const alias = await db.prepare(`SELECT procedure_id FROM procedure_aliases WHERE id = ?`).bind(existingCandidate.approved_alias_id).first() as Record<string, unknown> | null;
      if (alias) {
        return { procedureId: alias.procedure_id as string, method: 'alias', isNew: false, isCandidate: false, confidence: 90 };
      }
    }

    return { procedureId: `UNMAPPED-${existingCandidate.id}`, method: 'candidate', isNew: false, isCandidate: true, confidence: 0 };
  }

  const candidateId = `MC-${Date.now()}`;
  await db.prepare(`
    INSERT INTO mapping_candidates
    (id, alias_name, normalized_name, total_cases, first_seen_at, last_seen_at, price_samples, price_avg, price_min, price_max, status)
    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?, ?, ?, ?, 'collecting')
  `).bind(candidateId, procedureName, normalized, JSON.stringify([price]), price, price, price).run();

  await db.prepare(`
    INSERT INTO collected_procedure_names (id, raw_name, normalized_name, mapping_status, first_seen_at)
    VALUES (?, ?, ?, 'candidate', datetime('now'))
  `).bind(`CPN-${Date.now()}`, procedureName, normalized).run();

  return { procedureId: `UNMAPPED-${candidateId}`, method: 'new_candidate', isNew: true, isCandidate: true, confidence: 0 };
}

export async function resolveHospital(db: D1Database, data: {
  hospitalId?: string;
  hospitalName?: string;
  hospitalDomain?: string;
  hospitalRegion?: string;
  sourceUrl?: string;
}): Promise<{ hospitalId: string | null; isNew: boolean }> {
  const { hospitalId, hospitalName, hospitalDomain, hospitalRegion, sourceUrl } = data;

  if (hospitalId) return { hospitalId, isNew: false };
  if (!hospitalName && !hospitalDomain) return { hospitalId: null, isNew: false };

  if (hospitalDomain) {
    const byDomain = await db.prepare(`SELECT id FROM hospitals WHERE domain = ?`).bind(hospitalDomain).first() as Record<string, unknown> | null;
    if (byDomain) return { hospitalId: byDomain.id as string, isNew: false };
  }

  if (hospitalName) {
    const byName = await db.prepare(`SELECT id FROM hospitals WHERE name = ?`).bind(hospitalName).first() as Record<string, unknown> | null;
    if (byName) return { hospitalId: byName.id as string, isNew: false };
  }

  const newId = `HOSP-AUTO-${Date.now()}`;
  const domain = hospitalDomain || extractDomain(sourceUrl);
  const region = hospitalRegion || extractRegion(sourceUrl || hospitalDomain || '');

  await db.prepare(`
    INSERT INTO hospitals (id, name, domain, region, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(newId, hospitalName || domain || 'Unknown', domain, region).run();

  return { hospitalId: newId, isNew: true };
}

export function calculateCompleteness(data: {
  price?: number;
  targetAreaCode?: string;
  shotCount?: number;
  screenshotId?: string;
  isEvent?: boolean;
  includesItems?: string[];
}): { score: number; missingFields: string[] } {
  const missing: string[] = [];
  let score = 0;

  if (data.price) score += 30; else missing.push('price');
  if (data.targetAreaCode && data.targetAreaCode !== 'UNKNOWN') score += 25; else missing.push('target_area');
  if (data.shotCount) score += 20; else missing.push('shot_count');
  if (data.screenshotId) score += 15; else missing.push('screenshot');
  if (data.isEvent !== undefined) score += 5;
  if (data.includesItems) score += 5;

  return { score, missingFields: missing };
}

export async function updateProcedureStats(db: D1Database, procedureId: string) {
  await db.prepare(`
    UPDATE procedures SET
      price_count = (SELECT COUNT(*) FROM price_records_v2 WHERE procedure_id = ?),
      avg_price = (SELECT AVG(price) FROM price_records_v2 WHERE procedure_id = ?),
      min_price = (SELECT MIN(price) FROM price_records_v2 WHERE procedure_id = ?),
      max_price = (SELECT MAX(price) FROM price_records_v2 WHERE procedure_id = ?),
      last_updated = datetime('now')
    WHERE id = ?
  `).bind(procedureId, procedureId, procedureId, procedureId, procedureId).run();
}

export async function checkMappingApprovalConditions(db: D1Database, candidateId: string) {
  const candidate = await db.prepare(`SELECT * FROM mapping_candidates WHERE id = ?`).bind(candidateId).first() as Record<string, unknown> | null;
  if (!candidate) return;

  const settings = await db.prepare(`SELECT setting_key, setting_value FROM mapping_approval_settings`).all();
  const config: Record<string, string> = {};
  for (const s of settings.results as Array<{ setting_key: string; setting_value: string }>) {
    config[s.setting_key] = s.setting_value;
  }

  const updates: string[] = [];

  if ((candidate.total_cases as number) >= (parseInt(config.min_cases) || 5)) updates.push('meets_case_threshold = 1');

  const daysDiff = (Date.now() - new Date(candidate.first_seen_at as string).getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff >= (parseInt(config.min_days) || 7)) updates.push('meets_time_threshold = 1');

  if (updates.length >= 2 && candidate.status === 'collecting') {
    updates.push("status = 'pending_review'");
  }

  if (updates.length > 0) {
    await db.prepare(`UPDATE mapping_candidates SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(candidateId).run();
  }
}

export async function checkPriceChangeAndAlert(db: D1Database, data: {
  hospitalId: string;
  procedureId: string;
  targetAreaCode: string;
  newPrice: number;
  shotCount?: number;
  pricePerShot?: number | null;
  screenshotId?: string;
}) {
  const { hospitalId, procedureId, targetAreaCode, newPrice, shotCount, pricePerShot, screenshotId } = data;

  const previous = await db.prepare(`
    SELECT * FROM price_history
    WHERE hospital_id = ? AND procedure_id = ? AND target_area_code = ?
    ORDER BY recorded_at DESC LIMIT 1
  `).bind(hospitalId, procedureId, targetAreaCode).first() as Record<string, unknown> | null;

  const historyId = `PH-${Date.now()}`;
  const priceChange = previous ? newPrice - (previous.price as number) : null;
  const priceChangePercent = previous ? Math.round((priceChange! / (previous.price as number)) * 100) : null;

  await db.prepare(`
    INSERT INTO price_history (id, hospital_id, procedure_id, target_area_code, price, shot_count, price_per_shot, screenshot_id, previous_history_id, price_change, price_change_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(historyId, hospitalId, procedureId, targetAreaCode, newPrice, shotCount, pricePerShot, screenshotId, previous?.id || null, priceChange, priceChangePercent).run();

  if (previous && priceChangePercent && Math.abs(priceChangePercent) >= 10) {
    const subscribers = await db.prepare(`
      SELECT cs.hospital_id, pws.* FROM competitor_settings cs
      LEFT JOIN price_watch_settings pws ON cs.hospital_id = pws.hospital_id
      WHERE cs.competitor_ids LIKE ? OR (cs.auto_detect = 1)
    `).bind(`%${hospitalId}%`).all();

    for (const sub of subscribers.results as Array<Record<string, unknown>>) {
      const alertId = `PCA-${Date.now()}-${sub.hospital_id}`;

      const subPrice = await db.prepare(`
        SELECT price, price_per_shot FROM price_records_v2
        WHERE hospital_id = ? AND procedure_id = ? AND target_area_code = ?
        ORDER BY collected_at DESC LIMIT 1
      `).bind(sub.hospital_id, procedureId, targetAreaCode).first() as Record<string, unknown> | null;

      await db.prepare(`
        INSERT INTO price_change_alerts
        (id, subscriber_hospital_id, competitor_hospital_id, procedure_id,
         previous_price, current_price, price_change, price_change_percent,
         target_area_code, previous_shot_count, current_shot_count,
         previous_price_per_shot, current_price_per_shot,
         previous_screenshot_id, current_screenshot_id,
         subscriber_same_procedure_price, price_gap, price_gap_percent,
         alert_type, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        alertId, sub.hospital_id, hospitalId, procedureId,
        previous.price, newPrice, priceChange, priceChangePercent,
        targetAreaCode, previous.shot_count, shotCount,
        previous.price_per_shot, pricePerShot,
        previous.screenshot_id, screenshotId,
        subPrice?.price || null, subPrice ? newPrice - (subPrice.price as number) : null, subPrice ? Math.round(((newPrice - (subPrice.price as number)) / (subPrice.price as number)) * 100) : null,
        priceChangePercent < 0 ? 'price_drop' : 'price_rise',
        Math.abs(priceChangePercent) >= 20 ? 'urgent' : 'warning'
      ).run();
    }
  }
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^\w가-힣]/g, '');
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url.split('/')[0];
  }
}

export function extractRegion(text: string): string | null {
  const regions = ['강남', '서초', '청담', '압구정', '신사', '분당', '판교', '일산', '부산', '대구', '인천', '광주', '대전'];
  for (const r of regions) {
    if (text.includes(r)) return `서울 ${r}`;
  }
  return null;
}
