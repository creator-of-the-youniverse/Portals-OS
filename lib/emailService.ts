/**
 * lib/emailService.ts
 *
 * Transactional email delivery service abstraction for THE YOUNIVERSE.
 *
 * Requirements:
 *  - Fail-closed when production email configuration is missing.
 *  - Never log raw tokens or secrets.
 *  - Support provider configuration check.
 */

export interface SendVerificationEmailParams {
  email: string;
  handle: string;
  token: string;
}

export interface EmailDeliveryResult {
  sent: boolean;
  reason?: "delivered" | "missing_api_key" | "unconfigured" | "delivery_failed";
  error?: string;
}

/**
 * Returns true if running in a production or deployed preview environment.
 */
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  return (
    process.env.NODE_ENV === "production" ||
    vercelEnv === "production" ||
    vercelEnv === "preview"
  );
}

/**
 * Returns true if an active email delivery provider is configured.
 */
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Generates the user-facing verification URL.
 */
export function buildVerificationUrl(token: string): string {
  const baseUrl =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5174");
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/auth/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Dispatches an email verification link to the user.
 *
 * Fails closed if production provider is unconfigured.
 */
export async function sendVerificationEmail(
  params: SendVerificationEmailParams,
  fetchFn: typeof fetch = fetch
): Promise<EmailDeliveryResult> {
  const { email, handle, token } = params;
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM || "onboarding@itsyouonline.com";

  if (!apiKey) {
    console.warn(
      `[emailService] RESEND_API_KEY is not set. Verification link could not be delivered to ${email}.`
    );
    return {
      sent: false,
      reason: "missing_api_key",
      error: "Email delivery service is not configured.",
    };
  }

  const verificationUrl = buildVerificationUrl(token);

  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: `Verify your Youniverse handle @${handle}`,
        html: `
          <div style="font-family: sans-serif; background: #000; color: #fff; padding: 24px; border-radius: 8px;">
            <h2 style="color: #06b6d4;">Welcome to THE YOUNIVERSE</h2>
            <p>You claimed <strong>@${handle}</strong>.</p>
            <p>Click below to verify your email and activate your sovereign operating system:</p>
            <p style="margin: 24px 0;">
              <a href="${verificationUrl}" style="background: #8b5cf6; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Verify Email & Enter OS
              </a>
            </p>
            <p style="color: #666; font-size: 12px;">This link will expire in 24 hours. If you did not claim this handle, you can ignore this message.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown upstream error");
      console.error("[emailService] Upstream provider rejected delivery:", res.status);
      return {
        sent: false,
        reason: "delivery_failed",
        error: `Provider responded with status ${res.status}`,
      };
    }

    return {
      sent: true,
      reason: "delivered",
    };
  } catch (err: any) {
    console.error("[emailService] Network failure during email delivery");
    return {
      sent: false,
      reason: "delivery_failed",
      error: err?.message || "Network error",
    };
  }
}
