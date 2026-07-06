import {
	type APIChatInputApplicationCommandGuildInteraction,
	type APIChatInputApplicationCommandInteraction,
	type APIInteraction,
	ApplicationCommandType,
	InteractionType,
} from "@discordjs/core";

export function isChatInputCommand(
	interaction: APIInteraction,
): interaction is APIChatInputApplicationCommandInteraction {
	return (
		interaction.type === InteractionType.ApplicationCommand &&
		interaction.data.type === ApplicationCommandType.ChatInput
	);
}

export function isGuildChatInputCommand(
	interaction: APIInteraction,
): interaction is APIChatInputApplicationCommandGuildInteraction {
	return isChatInputCommand(interaction) && "guild_id" in interaction;
}
