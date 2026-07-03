import { GatewayDispatchEvents } from "@discordjs/core";
import { handleAttachmentSpam } from "../features/attachments.js";
import type { Event } from "./index.js";

const name = GatewayDispatchEvents.MessageCreate;

export default {
	name,
	async fire({ data }) {
		await handleAttachmentSpam(data);
	},
} satisfies Event<typeof name>;
