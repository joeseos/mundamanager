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

    type BattleParticipantRow = { gang_id: string; role?: string };
    const participantRows: BattleParticipantRow[] = Array.isArray(participants)
      ? participants
      : [];

    const normaliseRole = (role: string | undefined) =>
      (role ?? "none").toLowerCase();

    let attackerGangIds: string[] = [];
    let defenderGangIds: string[] = [];
    let opponentGangIds: string[] = [];

    if (participantRows.length > 0) {
      const seenAtt = new Set<string>();
      const seenDef = new Set<string>();
      const seenOpp = new Set<string>();
      for (const p of participantRows) {
        const id = p.gang_id;
        if (!id) continue;
        const r = normaliseRole(p.role);
        if (r === "attacker") {
          if (!seenAtt.has(id)) {
            seenAtt.add(id);
            attackerGangIds.push(id);
          }
        } else if (r === "defender") {
          if (!seenDef.has(id)) {
            seenDef.add(id);
            defenderGangIds.push(id);
          }
        } else {
          if (!seenOpp.has(id)) {
            seenOpp.add(id);
            opponentGangIds.push(id);
          }
        }
      }
    } else {
      if (battle.attacker_id) attackerGangIds = [battle.attacker_id];
      if (battle.defender_id) defenderGangIds = [battle.defender_id];
    }

    const gangNamesLines = (ids: string[]) =>
      ids
        .map((id) => gangMap.get(id)?.name)
        .filter(Boolean)
        .join("\n");

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

    const attackerValue = gangNamesLines(attackerGangIds);
    if (attackerValue) {
      fields.push({
        name:
          attackerGangIds.length > 1 ? "⚔️ Attackers" : "⚔️ Attacker",
        value: attackerValue,
        inline: false,
      });
    }

    const defenderValue = gangNamesLines(defenderGangIds);
    if (defenderValue) {
      fields.push({
        name:
          defenderGangIds.length > 1 ? "🛡️ Defenders" : "🛡️ Defender",
        value: defenderValue,
        inline: false,
      });
    }

    const opponentValue = gangNamesLines(opponentGangIds);
    if (opponentValue) {
      fields.push({
        name:
          opponentGangIds.length > 1 ? "🗡️ Opponents" : "🗡️ Opponent",
        value: opponentValue,
        inline: false,
      });
    }

    if (participantRows.length > 0) {
      const participantLines = participantRows
        .map((p) => {
          const gang = gangMap.get(p.gang_id);
          if (!gang) return null;
          return `**${gang.name}** (${gang.gang_type ?? "Unknown"}) — Rating: ${gang.rating ?? "?"}`;
        })
        .filter(Boolean);

      if (participantLines.length > 0) {
        fields.push({
          name:
            participantLines.length > 1
              ? "👥 Participants"
              : "👥 Participant",
          value: participantLines.join("\n"),
          inline: false,
        });
      }
    }

    if (winnerGang) {
      fields.push({ name: "🏆 Winner", value: winnerGang.name, inline: false });
    } else if (battle.winner_id == null || battle.winner_id === "") {
      fields.push({
        name: "🏆 Winner",
        value: "This battle ended in a draw.",
        inline: false,
      });
    }

    if (territoryName) {
      fields.push({ name: "🏭 Territory Claimed", value: territoryName, inline: true });
    }

    if (battle.cycle) {
      fields.push({ name: "🔄 Cycle", value: `${battle.cycle}`, inline: true });
    }

    if (battle.scenario) {
      fields.push({ name: "📋 Scenario", value: battle.scenario, inline: true });
    }

    if (battle.note) {
      fields.push({ name: "📝 Report", value: battle.note, inline: false });
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