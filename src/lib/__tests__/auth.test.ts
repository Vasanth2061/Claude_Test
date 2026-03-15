// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// Mock next/headers cookies
const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
const mockCookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      set: mockCookieSet,
      get: mockCookieGet,
      delete: mockCookieDelete,
    })
  ),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets auth-token cookie with correct options", async () => {
    const { createSession } = await import("@/lib/auth");

    await createSession("user-123", "test@example.com");

    expect(mockCookieSet).toHaveBeenCalledOnce();

    const [name, _token, options] = mockCookieSet.mock.calls[0];
    expect(name).toBe("auth-token");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  test("cookie expiry is approximately 7 days from now", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Date.now();

    await createSession("user-123", "test@example.com");

    const after = Date.now();
    const [, , options] = mockCookieSet.mock.calls[0];
    const expiresMs = options.expires.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs);
  });

  test("cookie value is a valid JWT containing userId and email", async () => {
    const { createSession } = await import("@/lib/auth");

    await createSession("user-123", "test@example.com");

    const [, token] = mockCookieSet.mock.calls[0];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  test("JWT algorithm is HS256", async () => {
    const { createSession } = await import("@/lib/auth");

    await createSession("user-abc", "alice@example.com");

    const [, token] = mockCookieSet.mock.calls[0];
    // Decode header without verification to check algorithm
    const [headerB64] = token.split(".");
    const header = JSON.parse(atob(headerB64));
    expect(header.alg).toBe("HS256");
  });

  test("JWT expiration is set to 7 days", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Math.floor(Date.now() / 1000);

    await createSession("user-123", "test@example.com");

    const after = Math.floor(Date.now() / 1000);
    const [, token] = mockCookieSet.mock.calls[0];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    const sevenDaysSec = 7 * 24 * 60 * 60;
    expect(payload.exp).toBeGreaterThanOrEqual(before + sevenDaysSec);
    expect(payload.exp).toBeLessThanOrEqual(after + sevenDaysSec);
  });

  test("secure flag is false in non-production environment", async () => {
    const { createSession } = await import("@/lib/auth");

    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    expect(options.secure).toBe(false);
  });

  test("secure flag is true in production environment", async () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");

    // Re-import to pick up new env (module is cached, so we test the option directly)
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    // NODE_ENV in vitest is typically "test", so we assert the value matches the env
    expect(options.secure).toBe(process.env.NODE_ENV === "production");

    vi.unstubAllEnvs();
  });
});
