/**
 * Tests run against a real Postgres database, because the behaviour under test
 * — row locking, conditional updates, unique constraints — only exists there.
 * An in-memory fake would pass while the real thing failed.
 *
 * Point TEST_DATABASE_URL at a scratch database before running.
 */
import { beforeAll } from "vitest";

beforeAll(() => {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  process.env.AUTH_SECRET ??= "test-secret-value-that-is-long-enough-to-pass";
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
});
