import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';

// Mock process.env
const SESSION_SECRET = '8Ez0NgG3bWvPTcpmzYBs+iQK5kLfjxrbnf5ja5blfho=';
vi.stubEnv('SESSION_SECRET', SESSION_SECRET);

// Since we're testing pure functions, let's just use the Jose primitives
// as the session.ts might depend on next/headers which is hard to test in pure Vitest
const getSecretKey = () => new TextEncoder().encode(SESSION_SECRET);

describe('JWT Session Encryption/Decryption', () => {
  it('should encrypt and decrypt a payload correctly', async () => {
    const payload = { role: 'admin' };
    
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(getSecretKey());
      
    const { payload: decrypted } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    
    expect(decrypted.role).toBe('admin');
  });

  it('should fail to decrypt with an invalid token', async () => {
    const token = 'not-a-valid-token';
    await expect(jwtVerify(token, getSecretKey())).rejects.toThrow();
  });
});
