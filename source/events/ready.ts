import { GatewayDispatchEvents } from "@discordjs/core";
import pino from "../pino.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.Ready;

export default {
	name,
	fire({ data }) {
		pino.info(
			{
				applicationId: data.application.id,
				guildCount: data.guilds.length,
				userId: data.user.id,
			},
			"Discord gateway ready.",
		);
	},
} satisfies Event<typeof name>;
