import process from "node:process";
import { info, setFailed, summary } from "@actions/core";
import {
	API,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	ApplicationIntegrationType,
	InteractionContextType,
	PermissionFlagsBits,
	type RESTPutAPIApplicationCommandsJSONBody,
} from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { z } from "zod/v4";
import { ATTACHMENT_SPAM_COMMAND_NAME, ATTACHMENT_SPAM_ENABLED_OPTION_NAME } from "./constants.js";

const envSchema = z.object({
	GITHUB_ACTIONS: z
		.string()
		.optional()
		.transform((value) => value === "true"),
	DISCORD_TOKEN: z.string().trim().min(1),
});

const { GITHUB_ACTIONS, DISCORD_TOKEN } = envSchema.parse(process.env);

const COMMANDS: RESTPutAPIApplicationCommandsJSONBody = [
	{
		name: ATTACHMENT_SPAM_COMMAND_NAME,
		description: "Enable or disable attachment spam protection.",
		type: ApplicationCommandType.ChatInput,
		options: [
			{
				type: ApplicationCommandOptionType.Boolean,
				name: ATTACHMENT_SPAM_ENABLED_OPTION_NAME,
				description: "Whether attachment spam protection should be enabled.",
				required: true,
			},
		],
		default_member_permissions: String(PermissionFlagsBits.ManageGuild),
		integration_types: [ApplicationIntegrationType.GuildInstall],
		contexts: [InteractionContextType.Guild],
	},
] as const;

const errors: unknown[] = [];
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const api = new API(rest);
info("Setting application commands...");

try {
	const applicationId = (await api.users.getCurrent()).id;
	await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, COMMANDS);
} catch (error) {
	errors.push(error);
}

const deploymentResults: string[][] = [];

if (errors.length > 0) {
	deploymentResults.push(["Discord", "Failed", `${errors.length} error(s).`]);
} else {
	deploymentResults.push(["Discord", "Success", `${COMMANDS.length} command(s).`]);
}

const result = summary.addHeading("Commands deployment").addTable([
	[
		{ data: "Platform", header: true },
		{ data: "Status", header: true },
		{ data: "Details", header: true },
	],
	...deploymentResults,
]);

if (errors.length > 0) {
	result.addDetails("Errors", `\`\`\`\n${errors.join("\n\n")}\n\`\`\``);
}

if (GITHUB_ACTIONS) {
	await result.write();
} else {
	info(result.stringify());
}

if (errors.length > 0) {
	setFailed("Command deployment failed.");
	process.exit(1);
}
