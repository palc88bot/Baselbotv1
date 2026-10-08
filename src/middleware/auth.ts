import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email: string; isOperatorSecret?: boolean };
}

/**
 * Strict Fail-Closed Operator Authentication Middleware
 * 
 * Rules:
 * 1. Missing or invalid Authorization header -> 401 Unauthorized
 * 2. Invalid or expired token -> 401 Unauthorized
 * 3. User email not in ADMIN_EMAILS (if allowlist configured) -> 403 Forbidden
 * 4. Supports OPERATOR_SECRET / ADMIN_API_KEY environment variables for VPS / headless operations
 * 5. NO bypasses, NO fallback to unauthenticated mock sessions
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const secretHeader = req.headers['x-operator-secret'] as string | undefined;
  const configuredSecret = (process.env.OPERATOR_SECRET || process.env.ADMIN_API_KEY || '').trim();

  // 1. Check for configured Operator Secret (for headless / VPS / Botkeep.cloud deployments)
  if (configuredSecret.length > 0) {
    if (secretHeader && secretHeader === configuredSecret) {
      req.user = {
        uid: 'operator-system',
        email: process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'operator@botkeep.cloud',
        isOperatorSecret: true,
      };
      return next();
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.substring(7).trim();
      if (rawToken === configuredSecret) {
        req.user = {
          uid: 'operator-system',
          email: process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'operator@botkeep.cloud',
          isOperatorSecret: true,
        };
        return next();
      }
    }
  }

  // 2. Strict Fail-closed check: Authorization header must be present and well-formed
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization header. A valid Bearer token is required.',
      code: 'auth/missing-token',
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Empty token provided.',
      code: 'auth/empty-token',
    });
  }

  // 3. Strict Cryptographic Verification via Firebase Admin SDK
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // 🔒 Enforce Admin Allowlist if configured in server environment
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    if (adminEmailsEnv.trim().length > 0) {
      const allowedList = adminEmailsEnv
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const userEmail = (decodedToken.email || '').toLowerCase();
      if (!allowedList.includes(userEmail)) {
        console.warn(`⛔ Access Denied: User ${userEmail} is not in ADMIN_EMAILS allowlist.`);
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have operator authorization for this trading engine.',
          code: 'auth/forbidden-operator',
        });
      }
    }

    return next();
  } catch (error: any) {
    console.warn('⛔ Token verification failed:', error?.message || error);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid, expired, or rejected authentication token.',
      code: error?.code || 'auth/invalid-token',
    });
  }
};
