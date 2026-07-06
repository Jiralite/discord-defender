import { Collection } from "@discordjs/collection";
import type {
	APIGuild,
	APIGuildChannel,
	GatewayGuildCreateDispatchData,
	GuildChannelType,
	Snowflake,
	ThreadChannelType,
} from "@discordjs/core";
import { GuildMember } from "./guild-member.js";
import { Role } from "./role.js";

type GuildChannel = APIGuildChannel<Exclude<GuildChannelType, ThreadChannelType>> & {
	guild_id: Snowflake;
};

export class Guild {
	public readonly id: Snowflake;

	public ownerId!: Snowflake;

	public readonly roles: Collection<Snowflake, Role>;

	public readonly members: Collection<Snowflake, GuildMember>;

	public readonly channels: Collection<Snowflake, GuildChannel>;

	public unavailable: boolean;

	public constructor(
		data: Pick<
			GatewayGuildCreateDispatchData,
			"channels" | "id" | "members" | "owner_id" | "roles" | "unavailable"
		>,
	) {
		this.id = data.id;
		this.roles = data.roles.reduce(
			(roles, role) => roles.set(role.id, new Role(role)),
			new Collection<Snowflake, Role>(),
		);
		this.members = data.members.reduce(
			(members, member) => members.set(member.user.id, new GuildMember(member)),
			new Collection<Snowflake, GuildMember>(),
		);
		this.channels = data.channels.reduce(
			(channels, channel) => channels.set(channel.id, { ...channel, guild_id: data.id }),
			new Collection<Snowflake, GuildChannel>(),
		);
		this.unavailable = data.unavailable ?? false;

		this.patch(data);
	}

	public patch(data: Pick<APIGuild, "owner_id">) {
		this.ownerId = data.owner_id;
	}
}
