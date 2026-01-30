/**
 * MedCheck Engine - Cloudflare Workers
 * v1.3.0 - 시술가격 v2 (부위별 단가 + 스크린샷 + 매핑 승인)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import {
  analyzeRoutes,
  patternsRoutes,
  healthRoutes,
  feedbackRoutes,
  validationRoutes,
  falsePositivesRoutes,
  patternExceptionsRoutes,
  exceptionSuggestionsRoutes,
  patternVersionsRoutes,
  allExceptionsRoutes,
} from './api/routes';
import { violationDetector } from './modules/violation-detector';
import type { D1Database } from './db/d1';

// ============================================
// 타입 정의
// ============================================

type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  LOG_LEVEL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// ============================================
// Health & Info
// ============================================

app.get('/', (c) => {
  return c.json({
    name: 'MedCheck Engine',
    version: '1.3.0',
    status: 'running',
    features: ['analyze', 'patterns', 'false-positives', 'exceptions', 'tricks', 'pricing-v2', 'screenshots', 'mapping', 'alerts']
  });
});

app.get('/v1/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.3.0' });
});

// ============================================
// 🔄 크롤링 상태 API (실시간 모니터링)
// ============================================

// In-memory 크롤링 상태 저장 (Workers는 stateless이므로 KV 또는 D1 사용 권장)
const crawlStatus: Record<string, any> = {};

// 크롤링 상태 업데이트 (크롤러에서 호출)
app.post('/v1/crawl-status', async (c) => {
  try {
    const body = await c.req.json();
    const { jobId, jobType, status, progress, total, found, failed, currentItem, startedAt, message } = body;
    
    if (!jobId) return c.json({ success: false, error: 'jobId required' }, 400);
    
    // D1에 저장 (영구 저장)
    await c.env.DB.prepare(`
      INSERT INTO crawl_jobs (id, job_type, status, progress, total, found, failed, current_item, started_at, updated_at, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        total = excluded.total,
        found = excluded.found,
        failed = excluded.failed,
        current_item = excluded.current_item,
        updated_at = datetime('now'),
        message = excluded.message
    `).bind(jobId, jobType || 'unknown', status || 'running', progress || 0, total || 0, found || 0, failed || 0, currentItem || null, startedAt || new Date().toISOString(), message || null).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 크롤링 상태 조회 (대시보드에서 호출)
app.get('/v1/crawl-status', async (c) => {
  try {
    const jobId = c.req.query('jobId');
    const status = c.req.query('status');
    
    let query = `SELECT * FROM crawl_jobs WHERE 1=1`;
    const params: any[] = [];
    
    if (jobId) { query += ' AND id = ?'; params.push(jobId); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    
    query += ' ORDER BY updated_at DESC LIMIT 20';
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 최근 활성 크롤링 작업
app.get('/v1/crawl-status/active', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM crawl_jobs 
      WHERE status IN ('running', 'paused') 
        OR (status = 'completed' AND updated_at > datetime('now', '-1 hour'))
      ORDER BY updated_at DESC LIMIT 10
    `).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 🔄 크롤링 세션 관리 API
// ============================================

// POST - 새 세션 생성
app.post('/v1/crawl-sessions', async (c) => {
  try {
    const { sessionType, targetSido, targetRegion, filterConditions } = await c.req.json();
    const sessionId = `CS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const filterConditionsJson = filterConditions ? JSON.stringify(filterConditions) : null;
    
    await c.env.DB.prepare(`
      INSERT INTO crawl_sessions (id, session_type, target_sido, target_region, filter_conditions, started_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(sessionId, sessionType, targetSido, targetRegion || '', filterConditionsJson).run();
    
    return c.json({ success: true, data: { sessionId } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET - 세션 목록 조회
app.get('/v1/crawl-sessions', async (c) => {
  try {
    const status = c.req.query('status');
    const sessionType = c.req.query('sessionType');
    
    let query = 'SELECT * FROM crawl_sessions WHERE 1=1';
    const params: any[] = [];
    
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (sessionType) { query += ' AND session_type = ?'; params.push(sessionType); }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// PUT - 세션 완료
app.put('/v1/crawl-sessions/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const { status, message, outputFile } = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE crawl_sessions
      SET status = ?, completed_at = datetime('now'), message = ?, output_file_path = ?
      WHERE id = ?
    `).bind(status || 'completed', message, outputFile, sessionId).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 🏥 수집된 병원 관리 API
// ============================================

// POST - 병원 데이터 일괄 저장
app.post('/v1/collected-hospitals', async (c) => {
  try {
    const { crawlSessionId, hospitals } = await c.req.json();
    
    for (const hospital of hospitals) {
      await c.env.DB.prepare(`
        INSERT INTO collected_hospitals
        (crawl_session_id, name, address, phone, homepage_url, sido, region,
         department, category, filtering_status, source, crawl_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.name, hospital.address, hospital.phone, hospital.homepage_url,
        hospital.sido, hospital.region, hospital.department, hospital.category,
        hospital.filtering_status, hospital.source || 'public_api', hospital.crawl_order || 0
      ).run();
    }
    
    return c.json({ success: true, count: hospitals.length });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET - 병원 목록 조회
app.get('/v1/collected-hospitals', async (c) => {
  try {
    const crawlSessionId = c.req.query('crawlSessionId');
    const status = c.req.query('status');
    const hasUrl = c.req.query('hasUrl');
    const category = c.req.query('category');
    const region = c.req.query('region');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    
    let query = 'SELECT * FROM collected_hospitals WHERE 1=1';
    const params: any[] = [];
    
    if (crawlSessionId) { query += ' AND crawl_session_id = ?'; params.push(crawlSessionId); }
    if (status) { query += ' AND filtering_status = ?'; params.push(status); }
    if (hasUrl === 'true') { query += ' AND homepage_url IS NOT NULL'; }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (region) { query += ' AND region LIKE ?'; params.push(`%${region}%`); }
    
    query += ' ORDER BY crawl_order ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results, offset, limit });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST - 병원 배치 분석
app.post('/v1/collected-hospitals/analyze', async (c) => {
  try {
    const { crawlSessionId, hospitalIds, enableAI } = await c.req.json();
    
    const hospitals = await c.env.DB.prepare(`
      SELECT * FROM collected_hospitals
      WHERE id IN (${hospitalIds.map(() => '?').join(',')}) AND homepage_url IS NOT NULL
    `).bind(...hospitalIds).all();
    
    const results = [];
    
    for (const hospital of (hospitals.results as any[])) {
      // 기존 /v1/analyze-url API 재사용
      const res = await fetch('https://medcheck-engine.mmakid.workers.dev/v1/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: hospital.homepage_url, enableAI })
      });
      const data = await res.json();
      
      await c.env.DB.prepare(`
        INSERT INTO hospital_analysis_results
        (crawl_session_id, hospital_id, url_analyzed, grade, violation_count, summary, violations, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.id, hospital.homepage_url,
        data.data?.grade || '-', data.data?.violationCount || 0,
        data.data?.summary || '', JSON.stringify(data.data?.violations || []),
        data.success ? 'success' : 'error'
      ).run();
      
      results.push({ hospitalId: hospital.id, ...data.data });
    }
    
    return c.json({ success: true, data: results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// [기존 API 유지 - 분석, 오탐, 예외, 꼼수]
// (이전 코드 그대로 유지)
// ============================================

// ... (기존 코드)

// ============================================
// 💰 시술가격 v2 API
// ============================================

// 시술 목록
app.get('/v1/procedures', async (c) => {
  try {
    const category = c.req.query('category');
    const subcategory = c.req.query('subcategory');
    const hasPrice = c.req.query('hasPrice');
    
    let query = 'SELECT * FROM procedures WHERE 1=1';
    const params: any[] = [];
    
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (subcategory) { query += ' AND subcategory = ?'; params.push(subcategory); }
    if (hasPrice === 'true') { query += ' AND price_count > 0'; }
    
    query += ' ORDER BY category, subcategory, name';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results, count: results.results.length });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 시술 상세 (부위별 가격 포함)
app.get('/v1/procedures/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const proc = await c.env.DB.prepare(`SELECT * FROM procedures WHERE id = ?`).bind(id).first();
    if (!proc) return c.json({ success: false, error: 'Not found' }, 404);
    
    // 부위별 가격
    const pricesByArea = await c.env.DB.prepare(`
      SELECT target_area_code, ta.name as target_area_name,
        COUNT(*) as record_count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(shot_count) as avg_shots,
        AVG(price_per_shot) as avg_price_per_shot
      FROM price_records_v2 pr
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      WHERE pr.procedure_id = ?
      GROUP BY target_area_code
      ORDER BY ta.display_order
    `).bind(id).all();
    
    // 최근 가격 기록 (스크린샷 포함)
    const recentPrices = await c.env.DB.prepare(`
      SELECT pr.*, h.name as hospital_name, h.region,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE pr.procedure_id = ?
      ORDER BY pr.collected_at DESC LIMIT 20
    `).bind(id).all();
    
    // 별칭 목록
    const aliases = await c.env.DB.prepare(`
      SELECT * FROM procedure_aliases WHERE procedure_id = ? AND is_verified = 1
    `).bind(id).all();
    
    return c.json({ 
      success: true, 
      data: { 
        ...proc, 
        pricesByArea: pricesByArea.results,
        recentPrices: recentPrices.results,
        aliases: aliases.results
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 부위 목록
app.get('/v1/target-areas', async (c) => {
  try {
    const category = c.req.query('category');
    let query = 'SELECT * FROM target_areas WHERE 1=1';
    const params: any[] = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY display_order';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 가격 통계 (v2)
app.get('/v2/prices/stats', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT procedure_id) as procedures_with_price,
        COUNT(DISTINCT hospital_id) as hospitals,
        AVG(price) as overall_avg,
        AVG(completeness_score) as avg_completeness,
        SUM(CASE WHEN screenshot_id IS NOT NULL THEN 1 ELSE 0 END) as with_screenshot
      FROM price_records_v2
    `).first();
    
    const byArea = await c.env.DB.prepare(`
      SELECT target_area_code, ta.name as area_name, 
        COUNT(*) as count, AVG(price) as avg_price, AVG(price_per_shot) as avg_per_shot
      FROM price_records_v2 pr
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      GROUP BY target_area_code
      ORDER BY count DESC
    `).all();
    
    const byCompleteness = await c.env.DB.prepare(`
      SELECT 
        CASE 
          WHEN completeness_score >= 80 THEN 'complete'
          WHEN completeness_score >= 50 THEN 'partial'
          ELSE 'incomplete'
        END as level,
        COUNT(*) as count
      FROM price_records_v2
      GROUP BY level
    `).all();
    
    const pendingMappings = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM mapping_candidates WHERE status = 'pending_review'
    `).first();
    
    return c.json({ 
      success: true, 
      data: { summary, byArea: byArea.results, byCompleteness: byCompleteness.results, pendingMappings: (pendingMappings as any)?.count || 0 }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 💰 가격 등록 (v2 - 자동 매핑 + 스크린샷)
app.post('/v2/prices', async (c) => {
  try {
    const body = await c.req.json();
    const { 
      procedureId, procedureName, category, subcategory,
      hospitalId, hospitalName, hospitalDomain, hospitalRegion,
      price, originalText, 
      targetAreaCode, targetAreaDetail,
      shotCount, volumeCc, cartridgeType, sessionCount,
      sourceUrl, sourceType,
      screenshotId, ocrRawText, ocrConfidence,
      isEvent, eventName, eventEndDate,
      includesAnesthesia, includesFollowup, includesItems
    } = body;
    
    if (!price) return c.json({ success: false, error: 'price is required' }, 400);
    if (!procedureId && !procedureName) return c.json({ success: false, error: 'procedureId or procedureName required' }, 400);
    
    // 1️⃣ 시술 ID 확보 (매핑 로직)
    const mapping = await resolveProcedureMapping(c.env.DB, { procedureId, procedureName, category, subcategory, price });
    
    // 2️⃣ 병원 ID 확보
    const hospitalResult = await resolveHospital(c.env.DB, { hospitalId, hospitalName, hospitalDomain, hospitalRegion, sourceUrl });
    
    // 3️⃣ 부위 코드 확인
    const areaCode = targetAreaCode || 'UNKNOWN';
    
    // 4️⃣ 단가 계산
    const pricePerShot = shotCount ? Math.round(price / shotCount) : null;
    const pricePerCc = volumeCc ? Math.round(price / volumeCc) : null;
    const pricePerSession = sessionCount ? Math.round(price / sessionCount) : null;
    
    // 5️⃣ 완성도 점수 계산
    const { score, missingFields } = calculateCompleteness({
      price, targetAreaCode, shotCount, screenshotId, isEvent, includesItems
    });
    
    // 6️⃣ 가격 저장
    const priceId = `PR-${Date.now()}`;
    await c.env.DB.prepare(`
      INSERT INTO price_records_v2 
      (id, procedure_id, hospital_id, price, price_type, original_text,
       target_area_code, target_area_detail, shot_count, volume_cc, cartridge_type, session_count,
       price_per_shot, price_per_cc, price_per_session,
       source_url, screenshot_id, ocr_raw_text, ocr_confidence,
       is_event, event_name, event_end_date,
       includes_anesthesia, includes_followup, includes_items,
       completeness_score, missing_fields, source_type)
      VALUES (?, ?, ?, ?, 'fixed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      priceId, mapping.procedureId, hospitalResult.hospitalId, price, originalText || null,
      areaCode, targetAreaDetail || null, shotCount || null, volumeCc || null, cartridgeType || null, sessionCount || 1,
      pricePerShot, pricePerCc, pricePerSession,
      sourceUrl || null, screenshotId || null, ocrRawText || null, ocrConfidence || null,
      isEvent ? 1 : 0, eventName || null, eventEndDate || null,
      includesAnesthesia ? 1 : null, includesFollowup ? 1 : null, includesItems ? JSON.stringify(includesItems) : null,
      score, JSON.stringify(missingFields), sourceType || 'crawl'
    ).run();
    
    // 7️⃣ 시술 통계 업데이트
    if (mapping.procedureId && !mapping.isCandidate) {
      await updateProcedureStats(c.env.DB, mapping.procedureId);
    }
    
    // 8️⃣ 병원 통계 업데이트
    if (hospitalResult.hospitalId) {
      await c.env.DB.prepare(`
        UPDATE hospitals SET total_prices = total_prices + 1, last_crawled = datetime('now') WHERE id = ?
      `).bind(hospitalResult.hospitalId).run();
    }
    
    // 9️⃣ 가격 변동 체크 & 알림
    if (hospitalResult.hospitalId && mapping.procedureId) {
      await checkPriceChangeAndAlert(c.env.DB, {
        hospitalId: hospitalResult.hospitalId,
        procedureId: mapping.procedureId,
        targetAreaCode: areaCode,
        newPrice: price,
        shotCount,
        pricePerShot,
        screenshotId
      });
    }
    
    return c.json({ 
      success: true, 
      data: { 
        priceId,
        procedureId: mapping.procedureId,
        hospitalId: hospitalResult.hospitalId,
        mapping: {
          method: mapping.method,
          isNewProcedure: mapping.isNew,
          isCandidate: mapping.isCandidate,
          confidence: mapping.confidence
        },
        completeness: { score, missingFields }
      } 
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 가격 목록 (v2)
app.get('/v2/prices', async (c) => {
  try {
    const procedureId = c.req.query('procedureId');
    const hospitalId = c.req.query('hospitalId');
    const targetArea = c.req.query('targetArea');
    const minCompleteness = c.req.query('minCompleteness');
    const limit = parseInt(c.req.query('limit') || '50');
    
    let query = `
      SELECT pr.*, p.name as procedure_name, p.category, 
        h.name as hospital_name, h.region,
        ta.name as target_area_name,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      LEFT JOIN procedures p ON pr.procedure_id = p.id
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (procedureId) { query += ' AND pr.procedure_id = ?'; params.push(procedureId); }
    if (hospitalId) { query += ' AND pr.hospital_id = ?'; params.push(hospitalId); }
    if (targetArea) { query += ' AND pr.target_area_code = ?'; params.push(targetArea); }
    if (minCompleteness) { query += ' AND pr.completeness_score >= ?'; params.push(parseInt(minCompleteness)); }
    
    query += ' ORDER BY pr.collected_at DESC LIMIT ?';
    params.push(limit);
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 가격 비교 (부위별 + 샷당 단가)
app.get('/v2/prices/compare/:procedureId', async (c) => {
  try {
    const procedureId = c.req.param('procedureId');
    const targetArea = c.req.query('targetArea');
    const region = c.req.query('region');
    
    let query = `
      SELECT pr.*, h.name as hospital_name, h.region,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE pr.procedure_id = ?
    `;
    const params: any[] = [procedureId];
    
    if (targetArea) { query += ' AND pr.target_area_code = ?'; params.push(targetArea); }
    if (region) { query += ' AND h.region LIKE ?'; params.push(`%${region}%`); }
    
    query += ' ORDER BY pr.price_per_shot ASC NULLS LAST, pr.price ASC';
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    
    // 통계
    const prices = (results.results as any[]);
    const withShots = prices.filter(p => p.price_per_shot);
    
    const stats = prices.length > 0 ? {
      totalRecords: prices.length,
      priceRange: { min: Math.min(...prices.map(p => p.price)), max: Math.max(...prices.map(p => p.price)) },
      priceAvg: Math.round(prices.reduce((a, b) => a + b.price, 0) / prices.length),
      shotPriceRange: withShots.length > 0 ? {
        min: Math.min(...withShots.map(p => p.price_per_shot)),
        max: Math.max(...withShots.map(p => p.price_per_shot)),
        avg: Math.round(withShots.reduce((a, b) => a + b.price_per_shot, 0) / withShots.length)
      } : null,
      withScreenshot: prices.filter(p => p.screenshot_url).length
    } : null;
    
    return c.json({ success: true, data: { hospitals: results.results, stats } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 📸 스크린샷 API
// ============================================

// 스크린샷 저장
app.post('/v1/screenshots', async (c) => {
  try {
    const body = await c.req.json();
    const { hospitalId, sourceUrl, fullScreenshotPath, fullScreenshotUrl, cropAreas, pageTitle, viewportWidth, viewportHeight } = body;
    
    if (!hospitalId || !sourceUrl) return c.json({ success: false, error: 'hospitalId and sourceUrl required' }, 400);
    
    // 이전 스크린샷 조회 (변경 감지용)
    const previous = await c.env.DB.prepare(`
      SELECT id, page_hash FROM price_screenshots 
      WHERE hospital_id = ? AND source_url = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(hospitalId, sourceUrl).first() as any;
    
    // 해시 계산 (간단히 URL + 시간)
    const pageHash = hashString(fullScreenshotUrl + Date.now());
    const isChanged = previous && previous.page_hash !== pageHash ? 1 : 0;
    
    const screenshotId = `SS-${Date.now()}`;
    await c.env.DB.prepare(`
      INSERT INTO price_screenshots 
      (id, hospital_id, source_url, full_screenshot_path, full_screenshot_url, screenshot_at,
       crop_areas, page_hash, is_changed, previous_screenshot_id, change_detected_at,
       page_title, viewport_width, viewport_height)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      screenshotId, hospitalId, sourceUrl, fullScreenshotPath || null, fullScreenshotUrl || null,
      cropAreas ? JSON.stringify(cropAreas) : null,
      pageHash, isChanged, previous?.id || null, isChanged ? new Date().toISOString() : null,
      pageTitle || null, viewportWidth || null, viewportHeight || null
    ).run();
    
    return c.json({ 
      success: true, 
      data: { screenshotId, isChanged, previousScreenshotId: previous?.id }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 스크린샷 조회
app.get('/v1/screenshots/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const screenshot = await c.env.DB.prepare(`
      SELECT s.*, h.name as hospital_name
      FROM price_screenshots s
      LEFT JOIN hospitals h ON s.hospital_id = h.id
      WHERE s.id = ?
    `).bind(id).first();
    
    if (!screenshot) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: screenshot });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 병원별 스크린샷 히스토리
app.get('/v1/hospitals/:hospitalId/screenshots', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const results = await c.env.DB.prepare(`
      SELECT * FROM price_screenshots WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(hospitalId).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 🔄 매핑 후보 API
// ============================================

// 매핑 후보 목록
app.get('/v1/mapping-candidates', async (c) => {
  try {
    const status = c.req.query('status') || 'pending_review';
    const results = await c.env.DB.prepare(`
      SELECT mc.*, p.name as suggested_procedure_name
      FROM mapping_candidates mc
      LEFT JOIN procedures p ON mc.suggested_procedure_id = p.id
      WHERE mc.status = ?
      ORDER BY mc.total_cases DESC, mc.text_similarity DESC
    `).bind(status).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 매핑 후보 상세
app.get('/v1/mapping-candidates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const candidate = await c.env.DB.prepare(`
      SELECT mc.*, p.name as suggested_procedure_name, p.avg_price as procedure_avg_price
      FROM mapping_candidates mc
      LEFT JOIN procedures p ON mc.suggested_procedure_id = p.id
      WHERE mc.id = ?
    `).bind(id).first();
    
    if (!candidate) return c.json({ success: false, error: 'Not found' }, 404);
    
    // 관련 가격 기록
    const relatedPrices = await c.env.DB.prepare(`
      SELECT pr.*, h.name as hospital_name
      FROM price_records_v2 pr
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      JOIN collected_procedure_names cpn ON pr.id = cpn.price_record_id
      WHERE cpn.raw_name = ?
      ORDER BY pr.collected_at DESC LIMIT 10
    `).bind((candidate as any).alias_name).all();
    
    return c.json({ success: true, data: { ...candidate, relatedPrices: relatedPrices.results } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 📊 분석결과 API (대시보드용)
// ============================================

// 분석결과 목록
app.get('/v1/analysis-results', async (c) => {
  try {
    const crawlSessionId = c.req.query('crawlSessionId');
    const grade = c.req.query('grade');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = `
      SELECT har.*, ch.name as hospital_name, ch.address, ch.homepage_url
      FROM hospital_analysis_results har
      LEFT JOIN collected_hospitals ch ON har.hospital_id = ch.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (crawlSessionId) { query += ' AND har.crawl_session_id = ?'; params.push(crawlSessionId); }
    if (grade) { query += ' AND har.grade = ?'; params.push(grade); }
    if (status) { query += ' AND har.status = ?'; params.push(status); }

    query += ' ORDER BY har.analyzed_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(query).bind(...params).all();

    // violations JSON 파싱
    const data = (results.results as any[]).map(r => ({
      ...r,
      violations: r.violations ? JSON.parse(r.violations) : []
    }));

    return c.json({ success: true, data, count: data.length });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 분석결과 통계
app.get('/v1/analysis-results/stats', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN grade = 'A' THEN 1 ELSE 0 END) as gradeA,
        SUM(CASE WHEN grade = 'B' THEN 1 ELSE 0 END) as gradeB,
        SUM(CASE WHEN grade = 'C' THEN 1 ELSE 0 END) as gradeC,
        SUM(CASE WHEN grade = 'D' THEN 1 ELSE 0 END) as gradeD,
        SUM(CASE WHEN violation_count > 0 THEN 1 ELSE 0 END) as violations,
        SUM(CASE WHEN violation_count = 0 THEN 1 ELSE 0 END) as clean,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM hospital_analysis_results
    `).first();

    const recentByDate = await c.env.DB.prepare(`
      SELECT DATE(analyzed_at) as date, COUNT(*) as count, SUM(violation_count) as violations
      FROM hospital_analysis_results
      WHERE analyzed_at > datetime('now', '-7 days')
      GROUP BY DATE(analyzed_at)
      ORDER BY date DESC
    `).all();

    return c.json({ success: true, data: { ...summary, recentByDate: recentByDate.results } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 분석결과 상세
app.get('/v1/analysis-results/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(`
      SELECT har.*, ch.name as hospital_name, ch.address, ch.phone, ch.homepage_url, ch.department
      FROM hospital_analysis_results har
      LEFT JOIN collected_hospitals ch ON har.hospital_id = ch.id
      WHERE har.id = ?
    `).bind(id).first();

    if (!result) return c.json({ success: false, error: 'Not found' }, 404);

    // violations JSON 파싱
    const data = {
      ...result,
      violations: (result as any).violations ? JSON.parse((result as any).violations) : []
    };

    // 관련 가격 정보 조회
    const prices = await c.env.DB.prepare(`
      SELECT * FROM price_records_v2
      WHERE hospital_id = (SELECT hospital_id FROM hospital_analysis_results WHERE id = ?)
      ORDER BY collected_at DESC LIMIT 10
    `).bind(id).all();

    return c.json({ success: true, data: { ...data, prices: prices.results } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 분석결과 저장 (파이프라인에서 호출)
app.post('/v1/analysis-results', async (c) => {
  try {
    const body = await c.req.json();
    const { crawlSessionId, hospitalId, hospitalName, urlAnalyzed, grade, violationCount, summary, violations, status } = body;

    const id = `HAR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await c.env.DB.prepare(`
      INSERT INTO hospital_analysis_results
      (id, crawl_session_id, hospital_id, url_analyzed, grade, violation_count, summary, violations, status, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      id, crawlSessionId || null, hospitalId || null, urlAnalyzed || '',
      grade || '-', violationCount || 0, summary || '', JSON.stringify(violations || []),
      status || 'success'
    ).run();

    return c.json({ success: true, data: { id } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// API 라우트 마운트
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);
app.route('/v1/exception-suggestions', exceptionSuggestionsRoutes);

// 패턴별 라우트 (중첩)
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);
app.route('/v1/patterns/:patternId/versions', patternVersionsRoutes);

// ============================================
// 🔔 가격 변동 알림 API
// ============================================

// 알림 목록
app.get('/v1/price-alerts', async (c) => {
  try {
    const subscriberId = c.req.query('subscriberId');
    const isRead = c.req.query('isRead');
    const limit = parseInt(c.req.query('limit') || '50');
    
    let query = `
      SELECT pa.*, 
        p.name as procedure_name,
        h_comp.name as competitor_name,
        h_sub.name as subscriber_name
      FROM price_change_alerts pa
      LEFT JOIN procedures p ON pa.procedure_id = p.id
      LEFT JOIN hospitals h_comp ON pa.competitor_hospital_id = h_comp.id
      LEFT JOIN hospitals h_sub ON pa.subscriber_hospital_id = h_sub.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (subscriberId) { query += ' AND pa.subscriber_hospital_id = ?'; params.push(subscriberId); }
    if (isRead === 'false') { query += ' AND pa.is_read = 0'; }
    
    query += ' ORDER BY pa.created_at DESC LIMIT ?';
    params.push(limit);
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 알림 상세 (스크린샷 비교 포함)
app.get('/v1/price-alerts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const alert = await c.env.DB.prepare(`
      SELECT pa.*, 
        p.name as procedure_name,
        h_comp.name as competitor_name, h_comp.region as competitor_region,
        h_sub.name as subscriber_name,
        ta.name as target_area_name,
        ps_prev.full_screenshot_url as previous_screenshot_full_url,
        ps_prev.crop_areas as previous_crop_areas,
        ps_curr.full_screenshot_url as current_screenshot_full_url,
        ps_curr.crop_areas as current_crop_areas
      FROM price_change_alerts pa
      LEFT JOIN procedures p ON pa.procedure_id = p.id
      LEFT JOIN hospitals h_comp ON pa.competitor_hospital_id = h_comp.id
      LEFT JOIN hospitals h_sub ON pa.subscriber_hospital_id = h_sub.id
      LEFT JOIN target_areas ta ON pa.target_area_code = ta.code
      LEFT JOIN price_screenshots ps_prev ON pa.previous_screenshot_id = ps_prev.id
      LEFT JOIN price_screenshots ps_curr ON pa.current_screenshot_id = ps_curr.id
      WHERE pa.id = ?
    `).bind(id).first();
    
    if (!alert) return c.json({ success: false, error: 'Not found' }, 404);
    
    // 읽음 처리
    await c.env.DB.prepare(`UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now') WHERE id = ?`).bind(id).run();
    
    return c.json({ success: true, data: alert });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 알림 읽음 처리 (벌크)
app.post('/v1/price-alerts/mark-read', async (c) => {
  try {
    const body = await c.req.json();
    const { ids, subscriberId, all } = body;
    
    if (all && subscriberId) {
      await c.env.DB.prepare(`
        UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now') 
        WHERE subscriber_hospital_id = ? AND is_read = 0
      `).bind(subscriberId).run();
    } else if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await c.env.DB.prepare(`
        UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now') 
        WHERE id IN (${placeholders})
      `).bind(...ids).run();
    }
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 🏥 경쟁사 모니터링 설정 API
// ============================================

// 설정 조회
app.get('/v1/competitor-settings/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    let settings = await c.env.DB.prepare(`
      SELECT * FROM competitor_settings WHERE hospital_id = ?
    `).bind(hospitalId).first();
    
    if (!settings) {
      // 기본 설정 반환
      settings = { hospital_id: hospitalId, auto_detect: 1, same_region: 1, same_category: 1, max_competitors: 10 };
    }
    
    // 현재 경쟁사 목록
    const myHospital = await c.env.DB.prepare(`SELECT * FROM hospitals WHERE id = ?`).bind(hospitalId).first() as any;
    
    let competitors: any[] = [];
    if (settings && (settings as any).competitor_ids) {
      const ids = JSON.parse((settings as any).competitor_ids);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const result = await c.env.DB.prepare(`SELECT * FROM hospitals WHERE id IN (${placeholders})`).bind(...ids).all();
        competitors = result.results;
      }
    } else if ((settings as any).auto_detect && myHospital) {
      // 자동 탐지
      const result = await c.env.DB.prepare(`
        SELECT * FROM hospitals 
        WHERE id != ? AND region = ? AND category = ?
        ORDER BY total_prices DESC
        LIMIT ?
      `).bind(hospitalId, myHospital.region, myHospital.category, (settings as any).max_competitors || 10).all();
      competitors = result.results;
    }
    
    return c.json({ success: true, data: { settings, competitors } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 설정 저장
app.post('/v1/competitor-settings/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const body = await c.req.json();
    const { competitorIds, autoDetect, sameRegion, sameCategory, maxCompetitors, region, category } = body;
    
    // Upsert
    await c.env.DB.prepare(`
      INSERT INTO competitor_settings (id, hospital_id, competitor_ids, auto_detect, same_region, same_category, max_competitors, region, category, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(hospital_id) DO UPDATE SET
        competitor_ids = excluded.competitor_ids,
        auto_detect = excluded.auto_detect,
        same_region = excluded.same_region,
        same_category = excluded.same_category,
        max_competitors = excluded.max_competitors,
        region = excluded.region,
        category = excluded.category,
        updated_at = datetime('now')
    `).bind(
      `CS-${hospitalId}`, hospitalId, 
      competitorIds ? JSON.stringify(competitorIds) : null,
      autoDetect ? 1 : 0, sameRegion ? 1 : 0, sameCategory ? 1 : 0,
      maxCompetitors || 10, region || null, category || null
    ).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 📊 가격 히스토리 API
// ============================================

app.get('/v1/price-history/:hospitalId/:procedureId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const procedureId = c.req.param('procedureId');
    const targetArea = c.req.query('targetArea');
    
    let query = `
      SELECT ph.*, ps.full_screenshot_url as screenshot_url
      FROM price_history ph
      LEFT JOIN price_screenshots ps ON ph.screenshot_id = ps.id
      WHERE ph.hospital_id = ? AND ph.procedure_id = ?
    `;
    const params: any[] = [hospitalId, procedureId];
    
    if (targetArea) { query += ' AND ph.target_area_code = ?'; params.push(targetArea); }
    
    query += ' ORDER BY ph.recorded_at DESC LIMIT 50';
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 📧 콜드콜 API
// ============================================

// 불완전 데이터 병원 목록
app.get('/v1/coldcall/incomplete-hospitals', async (c) => {
  try {
    const threshold = parseInt(c.req.query('threshold') || '60');
    
    const results = await c.env.DB.prepare(`
      SELECT h.*, 
        AVG(pr.completeness_score) as avg_completeness,
        COUNT(pr.id) as price_count,
        GROUP_CONCAT(DISTINCT pr.missing_fields) as all_missing_fields
      FROM hospitals h
      JOIN price_records_v2 pr ON h.id = pr.hospital_id
      GROUP BY h.id
      HAVING avg_completeness < ?
      ORDER BY price_count DESC
    `).bind(threshold).all();
    
    return c.json({ success: true, data: results.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// 콜드콜 발송 기록
app.post('/v1/coldcall/log', async (c) => {
  try {
    const body = await c.req.json();
    const { hospitalId, emailType, recipientEmail, subject, completenessScore, missingFields } = body;
    
    // 30일 내 발송 이력 체크
    const recent = await c.env.DB.prepare(`
      SELECT id FROM coldcall_logs 
      WHERE hospital_id = ? AND email_type = ? AND sent_at > datetime('now', '-30 days')
    `).bind(hospitalId, emailType).first();
    
    if (recent) {
      return c.json({ success: false, error: 'Already sent within 30 days' }, 400);
    }
    
    const logId = `CC-${Date.now()}`;
    await c.env.DB.prepare(`
      INSERT INTO coldcall_logs (id, hospital_id, email_type, recipient_email, subject, completeness_score, missing_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(logId, hospitalId, emailType, recipientEmail || null, subject || null, completenessScore || null, missingFields ? JSON.stringify(missingFields) : null).run();
    
    return c.json({ success: true, data: { logId } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 유틸리티 함수
// ============================================

// 시술 매핑 로직
async function resolveProcedureMapping(db: D1Database, data: any): Promise<{
  procedureId: string;
  method: string;
  isNew: boolean;
  isCandidate: boolean;
  confidence: number;
}> {
  const { procedureId, procedureName, category, subcategory, price } = data;
  
  // 1. ID가 있으면 바로 사용
  if (procedureId) {
    return { procedureId, method: 'direct', isNew: false, isCandidate: false, confidence: 100 };
  }
  
  if (!procedureName) {
    throw new Error('procedureId or procedureName required');
  }
  
  const normalized = normalizeName(procedureName);
  
  // 2. 정확히 일치하는 시술 검색
  const exactMatch = await db.prepare(`
    SELECT id FROM procedures WHERE name = ? OR LOWER(name) = ?
  `).bind(procedureName, normalized).first() as any;
  
  if (exactMatch) {
    return { procedureId: exactMatch.id, method: 'exact', isNew: false, isCandidate: false, confidence: 100 };
  }
  
  // 3. 별칭에서 검색
  const aliasMatch = await db.prepare(`
    SELECT procedure_id, confidence FROM procedure_aliases 
    WHERE alias_name = ? OR normalized_name = ?
    ORDER BY confidence DESC LIMIT 1
  `).bind(procedureName, normalized).first() as any;
  
  if (aliasMatch && aliasMatch.confidence >= 80) {
    return { procedureId: aliasMatch.procedure_id, method: 'alias', isNew: false, isCandidate: false, confidence: aliasMatch.confidence };
  }
  
  // 4. 복합 시술 체크
  const comboMatch = await db.prepare(`
    SELECT id FROM procedure_packages WHERE package_name = ? OR normalized_name = ?
  `).bind(procedureName, normalized).first() as any;
  
  if (comboMatch) {
    // 복합 시술은 별도 처리 (TODO)
    return { procedureId: `PKG-${comboMatch.id}`, method: 'package', isNew: false, isCandidate: false, confidence: 90 };
  }
  
  // 5. 매핑 후보 확인/생성
  const existingCandidate = await db.prepare(`
    SELECT * FROM mapping_candidates WHERE normalized_name = ?
  `).bind(normalized).first() as any;
  
  if (existingCandidate) {
    // 기존 후보 업데이트
    await db.prepare(`
      UPDATE mapping_candidates SET 
        total_cases = total_cases + 1,
        last_seen_at = datetime('now'),
        price_samples = json_insert(COALESCE(price_samples, '[]'), '$[#]', ?),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(price, existingCandidate.id).run();
    
    // 승인 조건 체크
    await checkMappingApprovalConditions(db, existingCandidate.id);
    
    // 후보가 이미 승인된 경우
    if (existingCandidate.status === 'approved' && existingCandidate.approved_alias_id) {
      const alias = await db.prepare(`SELECT procedure_id FROM procedure_aliases WHERE id = ?`).bind(existingCandidate.approved_alias_id).first() as any;
      if (alias) {
        return { procedureId: alias.procedure_id, method: 'alias', isNew: false, isCandidate: false, confidence: 90 };
      }
    }
    
    // 임시 ID 반환 (미분류)
    return { procedureId: `UNMAPPED-${existingCandidate.id}`, method: 'candidate', isNew: false, isCandidate: true, confidence: 0 };
  }
  
  // 6. 새 후보 생성
  const candidateId = `MC-${Date.now()}`;
  await db.prepare(`
    INSERT INTO mapping_candidates 
    (id, alias_name, normalized_name, total_cases, first_seen_at, last_seen_at, price_samples, price_avg, price_min, price_max, status)
    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?, ?, ?, ?, 'collecting')
  `).bind(candidateId, procedureName, normalized, JSON.stringify([price]), price, price, price).run();
  
  // 원본 시술명 저장
  await db.prepare(`
    INSERT INTO collected_procedure_names (id, raw_name, normalized_name, mapping_status, first_seen_at)
    VALUES (?, ?, ?, 'candidate', datetime('now'))
  `).bind(`CPN-${Date.now()}`, procedureName, normalized).run();
  
  return { procedureId: `UNMAPPED-${candidateId}`, method: 'new_candidate', isNew: true, isCandidate: true, confidence: 0 };
}

// 병원 확보 로직
async function resolveHospital(db: D1Database, data: any): Promise<{ hospitalId: string | null; isNew: boolean }> {
  const { hospitalId, hospitalName, hospitalDomain, hospitalRegion, sourceUrl } = data;
  
  if (hospitalId) return { hospitalId, isNew: false };
  if (!hospitalName && !hospitalDomain) return { hospitalId: null, isNew: false };
  
  // 도메인으로 검색
  if (hospitalDomain) {
    const byDomain = await db.prepare(`SELECT id FROM hospitals WHERE domain = ?`).bind(hospitalDomain).first() as any;
    if (byDomain) return { hospitalId: byDomain.id, isNew: false };
  }
  
  // 이름으로 검색
  if (hospitalName) {
    const byName = await db.prepare(`SELECT id FROM hospitals WHERE name = ?`).bind(hospitalName).first() as any;
    if (byName) return { hospitalId: byName.id, isNew: false };
  }
  
  // 신규 생성
  const newId = `HOSP-AUTO-${Date.now()}`;
  const domain = hospitalDomain || extractDomain(sourceUrl);
  const region = hospitalRegion || extractRegion(sourceUrl || hospitalDomain || '');
  
  await db.prepare(`
    INSERT INTO hospitals (id, name, domain, region, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(newId, hospitalName || domain || 'Unknown', domain, region).run();
  
  return { hospitalId: newId, isNew: true };
}

// 완성도 계산
function calculateCompleteness(data: any): { score: number; missingFields: string[] } {
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

// 시술 통계 업데이트
async function updateProcedureStats(db: D1Database, procedureId: string) {
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

// 매핑 승인 조건 체크
async function checkMappingApprovalConditions(db: D1Database, candidateId: string) {
  const candidate = await db.prepare(`SELECT * FROM mapping_candidates WHERE id = ?`).bind(candidateId).first() as any;
  if (!candidate) return;
  
  // 설정값 조회
  const settings = await db.prepare(`SELECT setting_key, setting_value FROM mapping_approval_settings`).all();
  const config: any = {};
  for (const s of settings.results as any[]) {
    config[s.setting_key] = s.setting_value;
  }
  
  const updates: string[] = [];
  
  // 5건 이상?
  if (candidate.total_cases >= (config.min_cases || 5)) updates.push('meets_case_threshold = 1');
  
  // 7일 경과?
  const daysDiff = (Date.now() - new Date(candidate.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff >= (config.min_days || 7)) updates.push('meets_time_threshold = 1');
  
  // 모든 조건 충족 시 상태 변경
  if (updates.length >= 2 && candidate.status === 'collecting') {
    updates.push("status = 'pending_review'");
  }
  
  if (updates.length > 0) {
    await db.prepare(`UPDATE mapping_candidates SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(candidateId).run();
  }
}

// 가격 변동 체크 & 알림 생성
async function checkPriceChangeAndAlert(db: D1Database, data: any) {
  const { hospitalId, procedureId, targetAreaCode, newPrice, shotCount, pricePerShot, screenshotId } = data;
  
  // 이전 가격 조회
  const previous = await db.prepare(`
    SELECT * FROM price_history 
    WHERE hospital_id = ? AND procedure_id = ? AND target_area_code = ?
    ORDER BY recorded_at DESC LIMIT 1
  `).bind(hospitalId, procedureId, targetAreaCode).first() as any;
  
  // 히스토리 저장
  const historyId = `PH-${Date.now()}`;
  const priceChange = previous ? newPrice - previous.price : null;
  const priceChangePercent = previous ? Math.round((priceChange! / previous.price) * 100) : null;
  
  await db.prepare(`
    INSERT INTO price_history (id, hospital_id, procedure_id, target_area_code, price, shot_count, price_per_shot, screenshot_id, previous_history_id, price_change, price_change_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(historyId, hospitalId, procedureId, targetAreaCode, newPrice, shotCount, pricePerShot, screenshotId, previous?.id || null, priceChange, priceChangePercent).run();
  
  // 변동 감지 시 알림 생성
  if (previous && priceChangePercent && Math.abs(priceChangePercent) >= 10) {
    // 이 병원을 모니터링하는 구독자 조회
    const subscribers = await db.prepare(`
      SELECT cs.hospital_id, pws.* FROM competitor_settings cs
      LEFT JOIN price_watch_settings pws ON cs.hospital_id = pws.hospital_id
      WHERE cs.competitor_ids LIKE ? OR (cs.auto_detect = 1)
    `).bind(`%${hospitalId}%`).all();
    
    for (const sub of subscribers.results as any[]) {
      const alertId = `PCA-${Date.now()}-${sub.hospital_id}`;
      
      // 구독자의 같은 시술 가격
      const subPrice = await db.prepare(`
        SELECT price, price_per_shot FROM price_records_v2 
        WHERE hospital_id = ? AND procedure_id = ? AND target_area_code = ?
        ORDER BY collected_at DESC LIMIT 1
      `).bind(sub.hospital_id, procedureId, targetAreaCode).first() as any;
      
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
        subPrice?.price || null, subPrice ? newPrice - subPrice.price : null, subPrice ? Math.round(((newPrice - subPrice.price) / subPrice.price) * 100) : null,
        priceChangePercent < 0 ? 'price_drop' : 'price_rise',
        Math.abs(priceChangePercent) >= 20 ? 'urgent' : 'warning'
      ).run();
    }
  }
}

// 헬퍼 함수들
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^\w가-힣]/g, '');
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url.split('/')[0];
  }
}

function extractRegion(text: string): string | null {
  const regions = ['강남', '서초', '청담', '압구정', '신사', '분당', '판교', '일산', '부산', '대구', '인천', '광주', '대전'];
  for (const r of regions) {
    if (text.includes(r)) return `서울 ${r}`;
  }
  return null;
}

// 404
app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` } }, 404);
});

export default app;
