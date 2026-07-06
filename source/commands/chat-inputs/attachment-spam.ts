import {
	type APIChatInputApplicationCommandInteraction,
	ApplicationCommandOptionType,
	MessageFlags,
} from "@discordjs/core";
import { client } from "../../discord.js";
import { setAttachmentSpamEnabled } from "../../features/guild-settings.js";
import {
	ATTACHMENT_SPAM_COMMAND_NAME,
	ATTACHMENT_SPAM_ENABLED_OPTION_NAME,
} from "../../utility/constants.js";
import { isGuildChatInputCommand } from "../../utility/functions.js";
import type { Command } from "../index.js";

export default {
	name: ATTACHMENT_SPAM_COMMAND_NAME,
	async chatInput(interaction: APIChatInputApplicationCommandInteraction) {
		if (!isGuildChatInputCommand(interaction)) {
			await client.api.interactions.reply(interaction.id, interaction.token, {
				content: "This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});

			return;
		}

		const enabledOption = interaction.data.options?.find(
			(option) => option.name === ATTACHMENT_SPAM_ENABLED_OPTION_NAME,
		);

		if (enabledOption?.type !== ApplicationCommandOptionType.Boolean) {
			await client.api.interactions.reply(interaction.id, interaction.token, {
				content: "Something went wrong. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});

			return;
		}

		const enabled = enabledOption.value;
		await setAttachmentSpamEnabled(interaction.guild_id, enabled);

		await client.api.interactions.reply(interaction.id, interaction.token, {
			content: `Attachment spam protection has been ${enabled ? "enabled" : "disabled"}.`,
			flags: MessageFlags.Ephemeral,
		});
	},
} as const satisfies Command;
