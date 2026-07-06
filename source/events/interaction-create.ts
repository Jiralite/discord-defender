import { GatewayDispatchEvents, MessageFlags, RESTJSONErrorCodes } from "@discordjs/core";
import { DiscordAPIError } from "@discordjs/rest";
import { CHAT_INPUT_COMMANDS } from "../commands/index.js";
import pino from "../pino.js";
import { isChatInputCommand } from "../utility/functions.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.InteractionCreate;

export default {
	name,
	async fire({ api, data }) {
		if (!isChatInputCommand(data)) {
			return;
		}

		pino.info(data, `Chat input command: ${data.data.name}`);

		const command = CHAT_INPUT_COMMANDS.find(
			(chatInputCommand) => chatInputCommand.name === data.data.name,
		);

		if (!command) {
			pino.warn(data, "Received an unknown chat input command.");
			return;
		}

		try {
			await command.chatInput(data);
		} catch (error) {
			pino.error(error, `Failed to handle the "${data.data.name}" command.`);

			// We cannot respond to this.
			if (
				error instanceof DiscordAPIError &&
				(error.code === RESTJSONErrorCodes.UnknownInteraction ||
					error.code === RESTJSONErrorCodes.CannotSendAnEmptyMessage)
			) {
				return;
			}

			try {
				await api.interactions.reply(data.id, data.token, {
					content: "Something went wrong. Please try again later.",
					flags: MessageFlags.Ephemeral,
				});
			} catch (error) {
				pino.error(error, "Failed to respond from recovering an interaction error.");
			}
		}
	},
} satisfies Event<typeof name>;
