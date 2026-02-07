import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const coldcallRoutes = new Hono<AppBindings>();

// 불완전 데이터 병원 목록
coldcallRoutes.get('/incomplete-hospitals', async (c) => {
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
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 콜드콜 발송 기록
coldcallRoutes.post('/log', async (c) => {
  try {
    const body = await c.req.json();
    const { hospitalId, emailType, recipientEmail, subject, completenessScore, missingFields } = body;

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
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { coldcallRoutes };
