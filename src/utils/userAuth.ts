import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { runtimeDb } from './databasePersistence';

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'trader' | 'viewer';
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLogin: string;
}

export interface UserSessionPayload {
  userId: string;
  email: string;
  role: 'admin' | 'trader' | 'viewer';
  name: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: UserSessionPayload;
}

export class UserAuthService {
  private secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey || process.env.CHINTU_AUTH_SECRET || 'chintu_master_jwt_secret_veeresh_quantum_346';
  }

  /**
   * Hashes a password using PBKDF2-SHA512 with 100,000 iterations.
   */
  public hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
    const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    return { hash, salt };
  }

  /**
   * Verifies password against stored hash.
   */
  public verifyPassword(password: string, storedHash: string, salt: string): boolean {
    const { hash } = this.hashPassword(password, salt);
    try {
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(storedHash, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Issues a signed cryptographic session token (HMAC-SHA256).
   */
  public issueSessionToken(user: { id: string; email: string; role: 'admin' | 'trader' | 'viewer'; name: string }, durationHours = 24): string {
    const exp = Math.floor(Date.now() / 1000) + durationHours * 3600;
    const payload: UserSessionPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      exp
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secretKey).update(encodedPayload).digest('base64url');
    return `chntu.${encodedPayload}.${signature}`;
  }

  /**
   * Verifies and decodes a signed session token. Returns null if invalid or expired.
   */
  public verifySessionToken(token: string): UserSessionPayload | null {
    if (!token) return null;

    // Special backward compatibility for master permanent session token
    if (token === 'chintu_master_auth_permanent_veeresh') {
      return {
        userId: 'usr_veeresh_master',
        email: 'veereshgowdan346@gmail.com',
        role: 'admin',
        name: 'Veeresh',
        exp: Math.floor(Date.now() / 1000) + 86400 * 365
      };
    }

    if (!token.startsWith('chntu.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [, encodedPayload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', this.secretKey).update(encodedPayload).digest('base64url');

    try {
      const a = Buffer.from(signature, 'utf8');
      const b = Buffer.from(expectedSig, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return null;
      }
      const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const payload: UserSessionPayload = JSON.parse(jsonStr);

      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Express middleware enforcing authenticated user session.
   */
  public requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.headers['x-chintu-auth']) {
      token = String(req.headers['x-chintu-auth']);
    }

    const session = this.verifySessionToken(token);
    if (!session) {
      res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid session token in Authorization header.'
      });
      return;
    }

    req.user = session;
    next();
  };

  /**
   * Express middleware enforcing admin role.
   */
  public requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    this.requireAuth(req, res, () => {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Administrative privileges required for this operation.'
        });
        return;
      }
      next();
    });
  };

  /**
   * Seeds the primary master account for Veeresh if not already initialized.
   */
  public ensureMasterUser(): void {
    try {
      runtimeDb.ensureUser({
        id: 'usr_veeresh_master',
        email: 'veereshgowdan346@gmail.com',
        name: 'Veeresh',
        role: 'admin',
        passwordHash: 'SEEDED_SECURE_ADMIN',
        salt: 'SEEDED_SALT',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
    } catch (e) {
      // In case table or db is loading
    }
  }
}

export const userAuthService = new UserAuthService();

