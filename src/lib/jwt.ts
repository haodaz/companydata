import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'companydata_dev_only_secret_change_me';
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

export interface SessionPayload extends JWTPayload {
  id: string;
  email: string;
  role: string;
}

export async function signToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(encodedSecret);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    return payload as SessionPayload;
  } catch (error) {
    return null;
  }
}
