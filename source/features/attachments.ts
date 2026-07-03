import { createHash } from "node:crypto";
import type { APIAttachment, GatewayMessageCreateDispatchData, Snowflake } from "@discordjs/core";
import { PermissionFlagsBits, RESTJSONErrorCodes } from "@discordjs/core";
import { DiscordAPIError } from "@discordjs/rest";
import { GUILD_CACHE } from "../caches/guilds.js";
import { client } from "../discord.js";
import { GuildMember } from "../models/discord/guild-member.js";
import pino from "../pino.js";
import {
	ATTACHMENT_DUPLICATE_THRESHOLD,
	ATTACHMENT_FINGERPRINT_CONCURRENCY,
	ATTACHMENT_FINGERPRINT_FULL_MAX_BYTES,
	ATTACHMENT_FINGERPRINT_MAX_PER_MESSAGE,
	ATTACHMENT_FINGERPRINT_PARTIAL_BYTES,
	ATTACHMENT_FINGERPRINT_TIMEOUT_MS,
	ATTACHMENT_SPAM_THRESHOLD,
	ATTACHMENT_WINDOW_SECONDS,
} from "../utility/configuration.js";
import { MEDIA_EXTENSIONS } from "../utility/constants.js";
import { can } from "../utility/permissions.js";

interface Counter {
	count: number;
	expiresAt: number;
}

interface ModerationActionContext {
	action: "ban" | "unban";
	guildId: Snowflake;
	userId: Snowflake;
}

const uploadCounters = new Map<string, Counter>();
const duplicateCounters = new Map<string, Counter>();
const queuedFingerprintFetches: (() => void)[] = [];

let activeFingerprintFetches = 0;

function getExtension(input: string | undefined) {
	if (!input) {
		return null;
	}

	const sanitized = input.split(/[#?]/)[0] ?? input;
	const index = sanitized.lastIndexOf(".");

	if (index === -1 || index === sanitized.length - 1) {
		return null;
	}

	return sanitized.slice(index + 1).toLowerCase();
}

function getExtensionFromURL(url: string) {
	try {
		const parsed = new URL(url);
		return getExtension(parsed.pathname);
	} catch {
		return getExtension(url);
	}
}

export function normaliseAttachmentURL(url: string) {
	try {
		const parsed = new URL(url);

		if (parsed.hostname.toLowerCase() === "media.discordapp.net") {
			parsed.hostname = "cdn.discordapp.com";
		}

		parsed.hash = "";
		parsed.search = "";
		return parsed.href;
	} catch {
		return url.split(/[#?]/)[0] ?? url;
	}
}

function sha256Hex(input: Uint8Array | string) {
	const hash = createHash("sha256");
	hash.update(input);
	return hash.digest("hex");
}

async function readStreamLimited(stream: ReadableStream<Uint8Array> | null, maxBytes: number) {
	if (!stream || maxBytes <= 0) {
		return new Uint8Array();
	}

	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;

	while (received < maxBytes) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		if (!value || value.length === 0) {
			continue;
		}

		if (received + value.length > maxBytes) {
			chunks.push(value.subarray(0, maxBytes - received));
			received = maxBytes;

			try {
				await reader.cancel();
			} catch {
				// Ignore stream cancellation failures.
			}

			break;
		}

		chunks.push(value);
		received += value.length;
	}

	const out = new Uint8Array(received);
	let offset = 0;

	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}

	return out;
}

async function fetchBytes(
	url: string,
	options: { maxBytes: number; range: string; requireRange: boolean; timeoutMs: number },
) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
	timeout.unref?.();

	try {
		const response = await fetch(url, {
			headers: {
				Range: options.range,
				"User-Agent": "DiscordBot (https://discord.js.org, 2.5.0)",
			},
			signal: controller.signal,
		});

		if (options.requireRange && response.status !== 206) {
			throw new Error(`Expected 206 Partial Content, got ${response.status}.`);
		}

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return await readStreamLimited(response.body, options.maxBytes);
	} finally {
		clearTimeout(timeout);
	}
}

function drainFingerprintFetchQueue() {
	while (
		activeFingerprintFetches < ATTACHMENT_FINGERPRINT_CONCURRENCY &&
		queuedFingerprintFetches.length > 0
	) {
		const run = queuedFingerprintFetches.shift();

		run?.();
	}
}

async function queueFingerprintFetch(
	url: string,
	options: { maxBytes: number; range: string; requireRange: boolean; timeoutMs: number },
) {
	return new Promise<Uint8Array>((resolve, reject) => {
		queuedFingerprintFetches.push(() => {
			activeFingerprintFetches += 1;

			void fetchBytes(url, options)
				.then(resolve, reject)
				.finally(() => {
					activeFingerprintFetches -= 1;
					drainFingerprintFetchQueue();
				});
		});

		drainFingerprintFetchQueue();
	});
}

export async function createAttachmentHash(attachment: APIAttachment) {
	const requestURL = attachment.url;
	const stableURL = normaliseAttachmentURL(requestURL);
	const fallback = () =>
		sha256Hex(
			`${stableURL}|${attachment.size}|${attachment.content_type ?? ""}|${attachment.filename}`,
		);

	if (attachment.size <= 0) {
		return fallback();
	}

	try {
		if (attachment.size <= ATTACHMENT_FINGERPRINT_FULL_MAX_BYTES) {
			const body = await queueFingerprintFetch(requestURL, {
				range: `bytes=0-${attachment.size - 1}`,
				maxBytes: attachment.size,
				timeoutMs: ATTACHMENT_FINGERPRINT_TIMEOUT_MS,
				requireRange: true,
			});

			return sha256Hex(body);
		}

		const prefix = await queueFingerprintFetch(requestURL, {
			range: `bytes=0-${ATTACHMENT_FINGERPRINT_PARTIAL_BYTES - 1}`,
			maxBytes: ATTACHMENT_FINGERPRINT_PARTIAL_BYTES,
			timeoutMs: ATTACHMENT_FINGERPRINT_TIMEOUT_MS,
			requireRange: true,
		});
		const suffixStart = Math.max(0, attachment.size - ATTACHMENT_FINGERPRINT_PARTIAL_BYTES);
		const suffix = await queueFingerprintFetch(requestURL, {
			range: `bytes=${suffixStart}-${attachment.size - 1}`,
			maxBytes: ATTACHMENT_FINGERPRINT_PARTIAL_BYTES,
			timeoutMs: ATTACHMENT_FINGERPRINT_TIMEOUT_MS,
			requireRange: true,
		});
		const hash = createHash("sha256");

		hash.update(String(attachment.size));
		hash.update(prefix);
		hash.update(suffix);

		return hash.digest("hex");
	} catch (error) {
		pino.debug({ error, attachmentId: attachment.id }, "Falling back to attachment metadata hash.");
		return fallback();
	}
}

function pruneExpired(now = Date.now()) {
	for (const [key, counter] of uploadCounters) {
		if (counter.expiresAt <= now) {
			uploadCounters.delete(key);
		}
	}

	for (const [key, counter] of duplicateCounters) {
		if (counter.expiresAt <= now) {
			duplicateCounters.delete(key);
		}
	}
}

function incrementCounter(
	counters: Map<string, Counter>,
	key: string,
	amount: number,
	now = Date.now(),
) {
	const existing = counters.get(key);
	const expiresAt = now + ATTACHMENT_WINDOW_SECONDS * 1_000;

	if (!existing || existing.expiresAt <= now) {
		const count = amount;
		counters.set(key, { count, expiresAt });
		return count;
	}

	existing.count += amount;
	existing.expiresAt = expiresAt;
	return existing.count;
}

async function totalAttachmentDuplicates(
	guildId: Snowflake,
	userId: Snowflake,
	attachments: readonly APIAttachment[],
) {
	let maxDuplicateCount = 0;
	const attachmentHashes: string[] = [];

	for (const attachment of attachments.slice(0, ATTACHMENT_FINGERPRINT_MAX_PER_MESSAGE)) {
		const hash = await createAttachmentHash(attachment);
		attachmentHashes.push(hash);

		const total = incrementCounter(
			duplicateCounters,
			`guild:${guildId}:user:${userId}:attachmenthash:${hash}`,
			1,
		);

		if (total > maxDuplicateCount) {
			maxDuplicateCount = total;
		}
	}

	return { attachmentHashes, maxDuplicateCount };
}

function clearAttachmentCounters(guildId: Snowflake, userId: Snowflake) {
	uploadCounters.delete(`guild:${guildId}:user:${userId}:attachments`);

	const duplicateKeyPrefix = `guild:${guildId}:user:${userId}:attachmenthash:`;

	for (const key of duplicateCounters.keys()) {
		if (key.startsWith(duplicateKeyPrefix)) {
			duplicateCounters.delete(key);
		}
	}
}

async function fetchMemberForPermissions(guildId: Snowflake, userId: Snowflake) {
	try {
		const member = await client.api.guilds.getMember(guildId, userId);

		return new GuildMember(member);
	} catch (error) {
		pino.debug(
			{
				error,
				guildId,
				userId,
			},
			"Failed to fetch guild member for attachment spam permission check.",
		);
		return null;
	}
}

async function canMemberManageGuild(guildId: Snowflake, userId: Snowflake, member?: GuildMember) {
	const guild = GUILD_CACHE.get(guildId);

	if (!guild) {
		return null;
	}

	const resolvedMember =
		member ?? guild.members.get(userId) ?? (await fetchMemberForPermissions(guildId, userId));

	if (!resolvedMember) {
		return null;
	}

	return can({
		guild,
		member: resolvedMember,
		permission: PermissionFlagsBits.ManageGuild,
	});
}

function isPermissionError(error: unknown) {
	return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MissingPermissions;
}

async function runModerationAction(
	context: ModerationActionContext,
	action: () => Promise<unknown>,
) {
	let lastError: unknown;

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			await action();
			return;
		} catch (error) {
			lastError = error;

			if (isPermissionError(error) || attempt === 3) {
				throw error;
			}

			pino.debug(
				{
					error,
					attempt,
					action: context.action,
					guildId: context.guildId,
					userId: context.userId,
				},
				"Retrying failed moderation action.",
			);
		}
	}

	throw lastError;
}

async function softban(guildId: Snowflake, userId: Snowflake, reason: string) {
	await runModerationAction({ action: "ban", guildId, userId }, () =>
		client.api.guilds.banUser(guildId, userId, { delete_message_seconds: 86_400 }, { reason }),
	);
	await runModerationAction({ action: "unban", guildId, userId }, () =>
		client.api.guilds.unbanUser(guildId, userId, { reason }),
	);
}

export async function handleAttachmentSpam(message: GatewayMessageCreateDispatchData) {
	if (!message.guild_id || message.author.bot) {
		return;
	}

	const mediaAttachments = message.attachments.filter((attachment) => {
		const contentType = attachment.content_type?.toLowerCase() ?? "";

		if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
			return true;
		}

		const extension = getExtension(attachment.filename) ?? getExtensionFromURL(attachment.url);
		return MEDIA_EXTENSIONS.some((mediaExtension) => mediaExtension === extension);
	});

	if (mediaAttachments.length === 0) {
		return;
	}

	pruneExpired();

	const guildId = message.guild_id;
	const userId = message.author.id;
	const member = message.member
		? new GuildMember({ roles: message.member.roles, user: message.author })
		: undefined;
	const memberCanManageGuild = await canMemberManageGuild(guildId, userId, member);

	if (memberCanManageGuild !== false) {
		pino.debug(
			{
				guildId,
				permissionsKnown: memberCanManageGuild !== null,
				userId,
			},
			"Skipped attachment spam scan for member with guild management permissions or unknown permissions.",
		);
		return;
	}

	const totalAttachmentCount = incrementCounter(
		uploadCounters,
		`guild:${guildId}:user:${userId}:attachments`,
		mediaAttachments.length,
	);
	const duplicateResult =
		totalAttachmentCount < ATTACHMENT_SPAM_THRESHOLD
			? await totalAttachmentDuplicates(guildId, userId, mediaAttachments)
			: { attachmentHashes: [] as string[], maxDuplicateCount: 0 };
	const totalAttachmentExceeded = totalAttachmentCount >= ATTACHMENT_SPAM_THRESHOLD;
	const duplicateExceeded = duplicateResult.maxDuplicateCount >= ATTACHMENT_DUPLICATE_THRESHOLD;

	if (!(totalAttachmentExceeded || duplicateExceeded)) {
		return;
	}

	const reason = duplicateExceeded
		? `Attachment spam: ${duplicateResult.maxDuplicateCount} duplicate media attachments in ${ATTACHMENT_WINDOW_SECONDS}s.`
		: `Attachment spam: ${totalAttachmentCount} media attachments in ${ATTACHMENT_WINDOW_SECONDS}s.`;

	try {
		await softban(guildId, userId, reason);
		clearAttachmentCounters(guildId, userId);

		pino.info(
			{
				attachmentHashes: duplicateResult.attachmentHashes,
				channelId: message.channel_id,
				guildId,
				maxDuplicateCount: duplicateResult.maxDuplicateCount,
				totalAttachmentCount,
				userId,
			},
			"Softbanned member for attachment spam.",
		);
	} catch (error) {
		clearAttachmentCounters(guildId, userId);

		pino.error(
			{
				error,
				channelId: message.channel_id,
				guildId,
				totalAttachmentCount,
				userId,
			},
			"Failed to softban member for attachment spam.",
		);
	}
}
