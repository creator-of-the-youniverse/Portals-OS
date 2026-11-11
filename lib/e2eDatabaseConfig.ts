/**
 * lib/e2eDatabaseConfig.ts
 *
 * Phase 13B.1.35 Dedicated Local E2E Database Isolation & Target Verification.
 *
 * Enforces strict boundaries:
 *  1. Only local loopback (127.0.0.1 or localhost) is permitted.
 *  2. Target database MUST be strictly 'founding_angels_e2e_test'.
 *  3. Remote Neon URLs (*.neon.tech) and active .env fallbacks are rejected immediately.
 *  4. Passwords and credentials are NEVER logged or exposed.
 */

export interface ValidatedDatabaseTarget {
  protocol: string;
  hostname: string;
  port: number;
  database: string;
  isLoopback: boolean;
}

/**
 * Validates that a connection string strictly points to the local disposable E2E database.
 * Throws immediately with an explicit error if any boundary is breached.
 */
export function validateE2EDatabaseTarget(connectionString?: string): ValidatedDatabaseTarget {
  if (!connectionString || typeof connectionString !== "string" || connectionString.trim() === "") {
    throw new Error("FATAL: Database connection string is required for E2E environment.");
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString.trim());
  } catch {
    throw new Error("FATAL: Malformed database connection string.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`FATAL: Unapproved database protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";

  if (!isLoopback) {
    throw new Error(`FATAL: Database host is NOT local loopback (prohibited remote target): ${hostname}`);
  }

  if (hostname.includes("neon.tech")) {
    throw new Error("FATAL: Remote Neon connection string detected in local E2E environment.");
  }

  const databaseName = parsed.pathname.replace(/^\/+/, "").split("?")[0];
  if (databaseName !== "founding_angels_e2e_test") {
    throw new Error(`FATAL: Database name is NOT founding_angels_e2e_test (got: ${databaseName})`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;

  return {
    protocol: parsed.protocol,
    hostname,
    port,
    database: databaseName,
    isLoopback,
  };
}

/**
 * Redacts credentials from a database URL for safe logging/reporting.
 */
export function redactDatabaseUrl(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    const auth = parsed.username ? (parsed.password ? `${parsed.username}:[REDACTED]@` : `${parsed.username}@`) : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return "[MALFORMED_URL]";
  }
}

