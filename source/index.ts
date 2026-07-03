import { client, gateway } from "./discord.js";
import channelCreate from "./events/channel-create.js";
import channelDelete from "./events/channel-delete.js";
import channelUpdate from "./events/channel-update.js";
import guildCreate from "./events/guild-create.js";
import guildDelete from "./events/guild-delete.js";
import guildMemberAdd from "./events/guild-member-add.js";
import guildMemberRemove from "./events/guild-member-remove.js";
import guildMemberUpdate from "./events/guild-member-update.js";
import guildRoleCreate from "./events/guild-role-create.js";
import guildRoleDelete from "./events/guild-role-delete.js";
import guildRoleUpdate from "./events/guild-role-update.js";
import guildUpdate from "./events/guild-update.js";
import messageCreate from "./events/message-create.js";
import ready from "./events/ready.js";
import pino from "./pino.js";

for (const event of [
	channelCreate,
	channelDelete,
	channelUpdate,
	guildCreate,
	guildDelete,
	guildMemberAdd,
	guildMemberRemove,
	guildMemberUpdate,
	guildRoleCreate,
	guildRoleDelete,
	guildRoleUpdate,
	guildUpdate,
	messageCreate,
	ready,
]) {
	client.on(event.name, event.fire);
}

client.on("error", (error) => pino.error(error));

void gateway.connect();
