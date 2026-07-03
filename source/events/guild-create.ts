import { GatewayDispatchEvents } from "@discordjs/core";
import { GUILD_CACHE } from "../caches/guilds.js";
import { Guild } from "../models/discord/guild.js";
import pino from "../pino.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.GuildCreate;

export default {
	name,
	fire({ data }) {
		const cachedGuild = GUILD_CACHE.get(data.id);

		if (cachedGuild) {
			if (cachedGuild.unavailable && !data.unavailable) {
				pino.info({ guildId: data.id }, "Guild is available.");
				cachedGuild.unavailable = false;
			}

			return;
		}

		const guild = new Guild(data);
		GUILD_CACHE.set(guild.id, guild);
	},
} satisfies Event<typeof name>;
