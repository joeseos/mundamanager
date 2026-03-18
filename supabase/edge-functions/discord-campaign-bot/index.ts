// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const battle = payload.record;

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("campaign_name, discord_channel_id")
      .eq("id", battle.campaign_id)
      .single();

    if (!campaign?.discord_channel_id) {
      return new Response("No Discord channel configured", { status: 200 });
    }

    // Get gang data
    const participants =
      typeof battle.participants === "string"
        ? JSON.parse(battle.participants)
        : battle.participants ?? [];

    const gangIds = participants.map((p: { gang_id: string }) => p.gang_id);
    for (const id of [battle.attacker_id, battle.defender_id, battle.winner_id]) {
      if (id && !gangIds.includes(id)) gangIds.push(id);
    }

    const { data: gangs } = await supabase
      .from("gangs")
      .select("id, name, gang_type, rating, reputation")
      .in("id", gangIds);

    const gangMap = new Map(gangs?.map((g) => [g.id, g]) ?? []);

    const winnerGang = battle.winner_id ? gangMap.get(battle.winner_id) : null;

    // Resolve territory name via campaign_territory_id
    let territoryName: string | null = null;
    if (battle.campaign_territory_id) {
      const { data: territory } = await supabase
        .from("campaign_territories")
        .select("territory_name")
        .eq("id", battle.campaign_territory_id)
        .single();
      territoryName = territory?.territory_name ?? null;
    }

    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (battle.attacker_id) {
      const attackerName = gangMap.get(battle.attacker_id)?.name ?? "Unknown";
      fields.push({ name: "⚔️ Attacker", value: attackerName, inline: true });
    }

    if (battle.defender_id) {
      const defenderName = gangMap.get(battle.defender_id)?.name ?? "Unknown";
      fields.push({ name: "🛡️ Defender", value: defenderName, inline: true });
    }

    if (winnerGang) {
      fields.push({ name: "🏆 Winner", value: winnerGang.name, inline: false });
    }

    if (battle.scenario) {
      fields.push({ name: "📋 Scenario", value: battle.scenario, inline: true });
    }

    if (battle.cycle) {
      fields.push({ name: "🔄 Cycle", value: `${battle.cycle}`, inline: true });
    }

    if (territoryName) {
      fields.push({ name: "🏭 Territory Claimed", value: territoryName, inline: true });
    }

    if (participants.length > 0) {
      const participantLines = participants
        .map((p: { gang_id: string; role: string }) => {
          const gang = gangMap.get(p.gang_id);
          if (!gang) return null;
          return `**${gang.name}** (${gang.gang_type ?? "Unknown"}) — Rating: ${gang.rating ?? "?"}`;
        })
        .filter(Boolean);

      if (participantLines.length > 0) {
        fields.push({
          name: "👥 Participants",
          value: participantLines.join("\n"),
          inline: false,
        });
      }
    }

    if (battle.note) {
      fields.push({ name: "📝 Notes", value: battle.note, inline: false });
    }

    const embed = {
      title: `Battle Report — ${campaign.campaign_name}`,
      color: 0xd4a017,
      fields,
      timestamp: battle.created_at,
      footer: { text: "MundaManager" },
    };

    // Send via Bot API instead of webhook
    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${campaign.discord_channel_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      }
    );

    if (!discordRes.ok) {
      const error = await discordRes.text();
      console.error("Discord API failed:", error);
      return new Response("Discord API failed", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response("Internal error", { status: 500 });
  }
});