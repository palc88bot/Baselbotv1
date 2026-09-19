import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // 🔒 Enforce Admin Allowlist if configured
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    if (adminEmailsEnv.trim().length > 0) {
      const allowedList = adminEmailsEnv.split(',').map((e) => e.trim().toLowerCase());
      const userEmail = (decodedToken.email || '').toLowerCase();
      if (!allowedList.includes(userEmail)) {
        console.warn(`⛔ Access Denied: User ${userEmail} is not in ADMIN_EMAILS allowlist.`);
        return res.status(403).json({ error: 'Forbidden: You do not have operator authorization for this trading engine.' });
      }
    }

    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
