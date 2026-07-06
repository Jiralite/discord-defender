import type { APIChatInputApplicationCommandInteraction } from "@discordjs/core";
import attachmentSpam from "./chat-inputs/attachment-spam.js";

export interface Command {
	name: string;
	chatInput(interaction: APIChatInputApplicationCommandInteraction): Promise<void> | void;
}

export const CHAT_INPUT_COMMANDS = [attachmentSpam] as const satisfies readonly Command[];
