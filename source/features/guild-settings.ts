import type { Snowflake } from "@discordjs/core";
import { database } from "../database.js";

export async function isAttachmentSpamEnabled(guildId: Snowflake): Promise<boolean> {
	const guildSettings = await database
		.selectFrom("guilds")
		.select("attachment_spam")
		.where("guild_id", "=", guildId)
		.executeTakeFirst();

	return Boolean(guildSettings?.attachment_spam);
}

export async function setAttachmentSpamEnabled(guildId: Snowflake, enabled: boolean) {
	await database
		.insertInto("guilds")
		.values({ guild_id: guildId, attachment_spam: enabled })
		.onConflict((onConflict) =>
			onConflict.column("guild_id").doUpdateSet({ attachment_spam: enabled }),
		)
		.execute();
}
