import { GatewayDispatchEvents } from "@discordjs/core";
import { GUILD_CACHE } from "../caches/guilds.js";
import pino from "../pino.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.GuildDelete;

export default {
	name,
	fire({ data }) {
		const guild = GUILD_CACHE.get(data.id);

		if (data.unavailable) {
			if (guild) {
				pino.info({ guildId: data.id }, "Guild is unavailable.");
				guild.unavailable = true;
			}

			return;
		}

		GUILD_CACHE.delete(data.id);
	},
} satisfies Event<typeof name>;
