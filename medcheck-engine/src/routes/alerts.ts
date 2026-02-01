// ================================================================
// MADMEDCHECK 가격 DB - Phase 3
// 가격 알림(Alerts) API
// ================================================================
// 위치: src/routes/alerts.ts
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const alerts = new Hono<{ Bindings: Env }>();

// ================================================================
// Zod 스키마
// ================================================================

const CreateAlertSchema = z.object({
  // 구독자 정보
  userEmail: z.string().email(),
  userPhone: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  
  // 알림 대상
  procedureId: z.string().optional(),
  procedureName: z.string().optional(),
  sigungu: z.string().optional(),
  hospitalId: z.string().optional(),
  hospitalName: z.string().optional(),
  
  // 알림 조건
  alertType: z.enum(['price_drop', 'price_rise', 'new_price', 'below_threshold', 'competitor']),
  
  // 가격 조건
  thresholdPrice: z.number().optional(),
  thresholdPricePerUnit: z.number().optional(),
  thresholdPercent: z.number().min(0).max(100).optional(),
  unitId: z.string().optional(),
  
  // 알림 설정
  alertChannel: z.enum(['email', 'sms', 'webhook', 'push']).default('email'),
  frequency: z.enum(['realtime', 'daily', 'weekly']).default('realtime'),
});

const AlertQuerySchema = z.object({
  userEmail: z.string().optional(),
  procedureId: z.string().optional(),
  sigungu: z.string().optional(),
  alertType: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

// ================================================================
// API 라우트
// ================================================================

/**
 * GET /alerts
 * 알림 목록 조회
 */
alerts.get(
  '/',
  zValidator('query', AlertQuerySchema),
  async (c) => {
    const db = c.env.DB;
    const query = c.req.valid('query');

    let sql = `
      SELECT 
        id,
        user_email,
        procedure_id,
        procedure_name,
        sigungu,
        hospital_id,
        hospital_name,
        alert_type,
        threshold_price,
        threshold_price_per_unit,
        threshold_percent,
        alert_channel,
        frequency,
        is_active,
        alert_count,
        last_alert_at,
        created_at
      FROM price_alerts
      WHERE 1=1
    `;
    
    const params: (string | number)[] = [];

    if (query.userEmail) {
      sql += ` AND user_email = ?`;
      params.push(query.userEmail);
    }
    if (query.procedureId) {
      sql += ` AND procedure_id = ?`;
      params.push(query.procedureId);
    }
    if (query.sigungu) {
      sql += ` AND sigungu = ?`;
      params.push(query.sigungu);
    }
    if (query.alertType) {
      sql += ` AND alert_type = ?`;
      params.push(query.alertType);
    }
    if (query.isActive !== undefined) {
      sql += ` AND is_active = ?`;
      params.push(query.isActive ? 1 : 0);
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await db.prepare(sql).bind(...params).all();

    return c.json({
      success: true,
      data: result.results,
      count: result.results?.length ?? 0,
    });
  }
);

/**
 * POST /alerts
 * 새 알림 구독
 */
alerts.post(
  '/',
  zValidator('json', CreateAlertSchema),
  async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');

    const id = `ALERT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      await db.prepare(`
        INSERT INTO price_alerts (
          id, user_email, user_phone, webhook_url,
          procedure_id, procedure_name, sigungu, hospital_id, hospital_name,
          alert_type, threshold_price, threshold_price_per_unit, threshold_percent, unit_id,
          alert_channel, frequency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        body.userEmail,
        body.userPhone ?? null,
        body.webhookUrl ?? null,
        body.procedureId ?? null,
        body.procedureName ?? null,
        body.sigungu ?? null,
        body.hospitalId ?? null,
        body.hospitalName ?? null,
        body.alertType,
        body.thresholdPrice ?? null,
        body.thresholdPricePerUnit ?? null,
        body.thresholdPercent ?? null,
        body.unitId ?? null,
        body.alertChannel,
        body.frequency
      ).run();

      return c.json({
        success: true,
        data: { id, ...body },
        message: '알림이 등록되었습니다.',
      }, 201);

    } catch (error) {
      console.error('Create alert error:', error);
      return c.json({
        success: false,
        error: 'CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * GET /alerts/:id
 * 알림 상세 조회
 */
alerts.get('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  const alert = await db.prepare(`
    SELECT * FROM price_alerts WHERE id = ?
  `).bind(id).first();

  if (!alert) {
    return c.json({
      success: false,
      error: 'NOT_FOUND',
      message: '알림을 찾을 수 없습니다.',
    }, 404);
  }

  // 최근 알림 이력
  const logs = await db.prepare(`
    SELECT 
      id, trigger_type, hospital_name, procedure_name,
      old_price, new_price, change_percent, status, sent_at, created_at
    FROM price_alert_logs
    WHERE alert_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(id).all();

  return c.json({
    success: true,
    data: {
      ...alert,
      recentLogs: logs.results,
    },
  });
});

/**
 * PUT /alerts/:id
 * 알림 수정
 */
alerts.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();

  // 존재 확인
  const existing = await db.prepare(`
    SELECT id FROM price_alerts WHERE id = ?
  `).bind(id).first();

  if (!existing) {
    return c.json({
      success: false,
      error: 'NOT_FOUND',
      message: '알림을 찾을 수 없습니다.',
    }, 404);
  }

  // 동적 업데이트
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  const fields = [
    'threshold_price', 'threshold_price_per_unit', 'threshold_percent',
    'alert_channel', 'frequency', 'is_active'
  ];

  for (const field of fields) {
    const camelCase = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (body[camelCase] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[camelCase]);
    }
  }

  if (updates.length === 0) {
    return c.json({
      success: false,
      error: 'NO_UPDATES',
      message: '수정할 내용이 없습니다.',
    }, 400);
  }

  updates.push('updated_at = datetime("now")');
  values.push(id);

  await db.prepare(`
    UPDATE price_alerts SET ${updates.join(', ')} WHERE id = ?
  `).bind(...values).run();

  return c.json({
    success: true,
    message: '알림이 수정되었습니다.',
  });
});

/**
 * DELETE /alerts/:id
 * 알림 삭제 (soft delete)
 */
alerts.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  await db.prepare(`
    UPDATE price_alerts SET is_active = 0, updated_at = datetime('now') WHERE id = ?
  `).bind(id).run();

  return c.json({
    success: true,
    message: '알림이 삭제되었습니다.',
  });
});

/**
 * POST /alerts/check
 * 알림 조건 체크 (배치용)
 * 새 가격이 들어왔을 때 매칭되는 알림 확인
 */
alerts.post('/check', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    priceId: string;
  }>();

  if (!body.priceId) {
    return c.json({
      success: false,
      error: 'MISSING_PRICE_ID',
    }, 400);
  }

  // 해당 가격 정보 조회
  const price = await db.prepare(`
    SELECT * FROM fact_prices WHERE id = ?
  `).bind(body.priceId).first<any>();

  if (!price) {
    return c.json({
      success: false,
      error: 'PRICE_NOT_FOUND',
    }, 404);
  }

  // 매칭되는 알림 찾기
  const matchingAlerts = await db.prepare(`
    SELECT 
      pa.id,
      pa.user_email,
      pa.alert_type,
      pa.alert_channel,
      pa.threshold_price_per_unit,
      pa.threshold_percent
    FROM price_alerts pa
    WHERE pa.is_active = 1
      AND (pa.procedure_id IS NULL OR pa.procedure_id = ?)
      AND (pa.sigungu IS NULL OR pa.sigungu = ?)
      AND (pa.hospital_id IS NULL OR pa.hospital_id = ?)
      AND (
        (pa.alert_type = 'new_price')
        OR (pa.alert_type = 'below_threshold' AND ? <= pa.threshold_price_per_unit)
      )
  `).bind(
    price.procedure_id,
    price.sigungu,
    price.hospital_id,
    price.price_per_unit
  ).all();

  // 알림 로그 생성
  const logs: string[] = [];
  for (const alert of matchingAlerts.results || []) {
    const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    await db.prepare(`
      INSERT INTO price_alert_logs (
        id, alert_id, trigger_type, trigger_price_id,
        hospital_name, procedure_name, sigungu,
        new_price, new_price_per_unit,
        channel, recipient, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      logId,
      (alert as any).id,
      (alert as any).alert_type,
      body.priceId,
      price.hospital_name,
      price.procedure_name_matched,
      price.sigungu,
      price.total_price,
      price.price_per_unit,
      (alert as any).alert_channel,
      (alert as any).user_email
    ).run();

    logs.push(logId);

    // 알림 카운트 증가
    await db.prepare(`
      UPDATE price_alerts 
      SET alert_count = alert_count + 1, last_alert_at = datetime('now')
      WHERE id = ?
    `).bind((alert as any).id).run();
  }

  return c.json({
    success: true,
    data: {
      priceId: body.priceId,
      matchedAlerts: matchingAlerts.results?.length ?? 0,
      logIds: logs,
    },
  });
});

/**
 * GET /alerts/logs
 * 알림 발송 이력
 */
alerts.get('/logs/recent', async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query('limit') || '50');

  const result = await db.prepare(`
    SELECT 
      pal.id,
      pal.alert_id,
      pa.user_email,
      pal.trigger_type,
      pal.hospital_name,
      pal.procedure_name,
      pal.sigungu,
      pal.old_price,
      pal.new_price,
      pal.change_percent,
      pal.channel,
      pal.status,
      pal.sent_at,
      pal.created_at
    FROM price_alert_logs pal
    JOIN price_alerts pa ON pal.alert_id = pa.id
    ORDER BY pal.created_at DESC
    LIMIT ?
  `).bind(limit).all();

  return c.json({
    success: true,
    data: result.results,
  });
});

export default alerts;
