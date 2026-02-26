/**
 * Auth API Routes - 회원가입/인증
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';

interface Env {
  DB: D1Database;
}

const authRoutes = new Hono<{ Bindings: Env }>();

// Simple password hashing (SHA-256 + salt for Workers environment)
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || crypto.randomUUID();
  const data = new TextEncoder().encode(s + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: `${s}:${hash}`, salt: s };
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt] = storedHash.split(':');
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

function generateSessionId(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

/**
 * POST /v1/auth/signup
 */
authRoutes.post('/signup', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    hospitalName?: string;
    contactName?: string;
  }>();

  const { email, password, hospitalName, contactName } = body;

  if (!email || !password) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'email과 password는 필수입니다.' },
    }, 400);
  }

  if (password.length < 6) {
    return c.json({
      success: false,
      error: { code: 'WEAK_PASSWORD', message: '비밀번호는 6자 이상이어야 합니다.' },
    }, 400);
  }

  try {
    // 이메일 중복 확인
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existing) {
      return c.json({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: '이미 등록된 이메일입니다.' },
      }, 409);
    }

    const { hash } = await hashPassword(password);

    const result = await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, hospital_name, contact_name)
      VALUES (?, ?, ?, ?)
    `).bind(email, hash, hospitalName || null, contactName || null).run();

    const userId = result.meta?.last_row_id;

    // 세션 생성
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, userId, expiresAt).run();

    return c.json({
      success: true,
      data: {
        userId,
        email,
        sessionToken: sessionId,
        expiresAt,
      },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'SIGNUP_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/auth/login
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'email과 password는 필수입니다.' },
    }, 400);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, hospital_name, contact_name, role FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
      }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash as string);
    if (!valid) {
      return c.json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
      }, 401);
    }

    // 세션 생성
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, user.id, expiresAt).run();

    return c.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        hospitalName: user.hospital_name,
        role: user.role,
        sessionToken: sessionId,
        expiresAt,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'LOGIN_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/auth/me
 */
authRoutes.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '인증 토큰이 필요합니다.' },
    }, 401);
  }

  try {
    const session = await c.env.DB.prepare(`
      SELECT s.user_id, s.expires_at, u.email, u.hospital_name, u.contact_name, u.role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).bind(token).first();

    if (!session) {
      return c.json({
        success: false,
        error: { code: 'INVALID_SESSION', message: '유효하지 않은 세션입니다.' },
      }, 401);
    }

    if (new Date(session.expires_at as string) < new Date()) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
      return c.json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: '세션이 만료되었습니다.' },
      }, 401);
    }

    return c.json({
      success: true,
      data: {
        userId: session.user_id,
        email: session.email,
        hospitalName: session.hospital_name,
        contactName: session.contact_name,
        role: session.role,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'AUTH_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  }

  return c.json({ success: true, data: { message: '로그아웃되었습니다.' } });
});

export { authRoutes };
