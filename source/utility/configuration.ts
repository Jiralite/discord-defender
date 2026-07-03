import process from "node:process";
import { z } from "zod/v4";

export const PRODUCTION = process.env.NODE_ENV === "production";

function optionalInteger(fallback: number, minimum = 1) {
	return z.preprocess((value) => {
		if (typeof value === "string" && value.trim() === "") {
			return undefined;
		}

		return value;
	}, z.coerce.number().int().min(minimum).default(fallback));
}

const envSchema = z.object({
	DISCORD_TOKEN: z.string().trim().min(1),
	ATTACHMENT_SPAM_THRESHOLD: optionalInteger(25, 2),
	ATTACHMENT_DUPLICATE_THRESHOLD: optionalInteger(3, 2),
	ATTACHMENT_WINDOW_SECONDS: optionalInteger(15),
	ATTACHMENT_FINGERPRINT_FULL_MAX_BYTES: optionalInteger(2 * 1_024 * 1_024),
	ATTACHMENT_FINGERPRINT_PARTIAL_BYTES: optionalInteger(256 * 1_024),
	ATTACHMENT_FINGERPRINT_TIMEOUT_MS: optionalInteger(2_500),
	ATTACHMENT_FINGERPRINT_MAX_PER_MESSAGE: optionalInteger(4),
	ATTACHMENT_FINGERPRINT_CONCURRENCY: optionalInteger(8),
	SENTRY_DATA_SOURCE_NAME: z.url().optional(),
	SENTRY_RELEASE: z.string().trim().min(1).optional(),
});

const productionEnvSchema = envSchema.extend({
	SENTRY_DATA_SOURCE_NAME: z.url(),
	SENTRY_RELEASE: z.string().trim().min(1),
});

const configuration = (PRODUCTION ? productionEnvSchema : envSchema).parse(process.env);

export const {
	DISCORD_TOKEN,
	ATTACHMENT_DUPLICATE_THRESHOLD,
	ATTACHMENT_FINGERPRINT_FULL_MAX_BYTES,
	ATTACHMENT_FINGERPRINT_CONCURRENCY,
	ATTACHMENT_FINGERPRINT_MAX_PER_MESSAGE,
	ATTACHMENT_FINGERPRINT_PARTIAL_BYTES,
	ATTACHMENT_FINGERPRINT_TIMEOUT_MS,
	ATTACHMENT_SPAM_THRESHOLD,
	ATTACHMENT_WINDOW_SECONDS,
	SENTRY_DATA_SOURCE_NAME,
	SENTRY_RELEASE,
} = configuration;
