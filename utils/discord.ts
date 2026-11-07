// The Discord bot edge function (Deno) imports this file too, so it must not import anything.

export const DISCORD_CHANNEL_TYPES = { TEXT: 0, FORUM: 15 } as const;

/** Posts embeds as a message in a text channel, or as a new post titled `postTitle` in a forum channel. */
export function postDiscordEmbeds(
  botToken: string,
  channel: { id: string; type: number },
  postTitle: string,
  embeds: Record<string, unknown>[]
): Promise<Response> {
  const forum = channel.type === DISCORD_CHANNEL_TYPES.FORUM;
  return fetch(`https://discord.com/api/v10/channels/${channel.id}/${forum ? 'threads' : 'messages'}`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      forum ? { name: postTitle, auto_archive_duration: 10080, message: { embeds } } : { embeds }
    ),
  });
}
