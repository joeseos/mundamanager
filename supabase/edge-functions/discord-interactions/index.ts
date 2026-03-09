// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function verifyRequest(req: Request, body: string): boolean {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;

  return nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8Array(signature),
    hexToUint8Array(DISCORD_PUBLIC_KEY)
  );
}

Deno.serve(async (req) => {
  const body = await req.text();

  // Verify Discord signature
  if (!verifyRequest(req, body)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Handle Discord's ping verification (required for setting the endpoint URL)
  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  // Handle slash commands
  if (interaction.type === 2) {
    const commandName = interaction.data.name;
    const guildId = interaction.guild_id;

    if (commandName === "gangs") {
      // Find campaign linked to this Discord server
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, campaign_name")
        .eq("discord_guild_id", guildId)
        .single();

      if (!campaign) {
        return Response.json({
          type: 4,
          data: {
            content: "No campaign is linked to this Discord server.",
            flags: 64, // Ephemeral
          },
        });
      }

      // Get all gangs in this campaign with user profiles
      const { data: campaignGangs } = await supabase
        .from("campaign_gangs")
        .select("gang_id")
        .eq("campaign_id", campaign.id);

      if (!campaignGangs || campaignGangs.length === 0) {
        return Response.json({
          type: 4,
          data: {
            content: `No gangs found in **${campaign.campaign_name}**.`,
            flags: 64,
          },
        });
      }

      const gangIds = campaignGangs.map((cg) => cg.gang_id);

      const { data: gangs } = await supabase
        .from("gangs")
        .select("id, name, gang_type, rating, wealth, user_id")
        .in("id", gangIds);

      if (!gangs || gangs.length === 0) {
        return Response.json({
          type: 4,
          data: {
            content: `No gangs found in **${campaign.campaign_name}**.`,
            flags: 64,
          },
        });
      }

      // Get usernames
      const userIds = [...new Set(gangs.map((g) => g.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.username]) ?? []);

      // Build embed fields
      const gangLines = gangs.map((g) => {
        const username = profileMap.get(g.user_id) ?? "Unknown";
        const rating = g.rating ?? "?";
        const wealth = g.wealth ?? "?";
        return `**${g.name}** (${g.gang_type ?? "Unknown"})\n👤 ${username} · ⭐ Rating: ${rating} · 💰 Wealth: ${wealth}`;
      });

      const embed = {
        title: `Gangs — ${campaign.campaign_name}`,
        description: gangLines.join("\n\n"),
        color: 0xd4a017,
        footer: { text: `${gangs.length} gang${gangs.length !== 1 ? "s" : ""} · MundaManager` },
      };

      return Response.json({
        type: 4,
        data: {
          embeds: [embed],
          flags: 64, // Ephemeral — only visible to the user
        },
      });
    }
  }

  return Response.json({ type: 4, data: { content: "Unknown command." } });
});