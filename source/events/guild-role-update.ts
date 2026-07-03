import { GatewayDispatchEvents } from "@discordjs/core";
import { GUILD_CACHE } from "../caches/guilds.js";
import pino from "../pino.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.GuildRoleUpdate;

export default {
	name,
	fire({ data }) {
		const guild = GUILD_CACHE.get(data.guild_id);

		if (!guild) {
			pino.warn({ data }, `Received a ${name} packet for an uncached guild.`);
			return;
		}

		const role = guild.roles.get(data.role.id);

		if (!role) {
			pino.warn({ data }, `Received a ${name} packet for an uncached role.`);
			return;
		}

		role.patch(data.role);
	},
} satisfies Event<typeof name>;
