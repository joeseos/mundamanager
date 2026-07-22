// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  secretKeys.secret
);

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!

const DISCORD_CHANNEL_TYPES = { TEXT: 0, FORUM: 15 } as const;

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (!auth || auth !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const battle = payload.record;

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("campaign_name, discord_channel_id, discord_channel_type")
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

    const winnerIds: string[] = Array.isArray(participants)
      ? participants
          .filter((p: any) => p?.is_winner === true && !!p?.gang_id)
          .map((p: any) => p.gang_id as string)
      : [];

    const { data: gangs } = await supabase
      .from("gangs")
      .select("id, name, gang_type, rating, reputation")
      .in("id", gangIds);

    const gangMap = new Map(gangs?.map((g) => [g.id, g]) ?? []);

    type BattleParticipantRow = { gang_id: string; role?: string; is_winner?: boolean };
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

    const winnerNames = winnerIds
      .map((id) => gangMap.get(id)?.name)
      .filter(Boolean) as string[];

    if (winnerNames.length === 1) {
      fields.push({ name: "🏆 Winner", value: winnerNames[0], inline: false });
    } else if (winnerNames.length > 1) {
      fields.push({
        name: "🏆 Winners",
        value: winnerNames.join("\n"),
        inline: false,
      });
    } else {
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

    const DISCORD_DESC_MAX = 4096;
    const DISCORD_TOTAL_MAX = 6000;

    // The battle info goes in the first embed as fields. The report goes in a
    // second embed's description (4096-char limit) so it renders below the info
    // and can hold far more than a 1024-char embed field. The footer + timestamp
    // live on whichever embed is last so they stay at the very bottom of the post.
    const infoEmbed: Record<string, unknown> = {
      title: `Battle Report — ${campaign.campaign_name}`,
      color: 0xd4a017,
      fields,
    };

    const embeds: Record<string, unknown>[] = [infoEmbed];

    if (battle.note) {
      const reportTitle = "📝 Report";
      const footerText = "MundaManager";
      // Characters consumed by everything except the report description, across
      // both embeds (info title + field names/values + report title + footer).
      const infoChars =
        (infoEmbed.title as string).length +
        fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0) +
        reportTitle.length +
        footerText.length;
      // Budget left for the description under both the 4096 and the 6000 caps.
      const budget = Math.min(DISCORD_DESC_MAX, DISCORD_TOTAL_MAX - infoChars);
      let description = battle.note;
      if (description.length > budget) {
        let cut = description.slice(0, Math.max(0, budget - 1));
        // Avoid splitting a UTF-16 surrogate pair (e.g. an emoji) at the cut,
        // which would leave a lone high surrogate that renders as "�".
        if (cut.length > 0 && /[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
        description = cut.trimEnd() + "…";
      }
      // The report is the last embed, so it carries the footer + timestamp.
      embeds.push({
        title: reportTitle,
        description,
        color: 0xd4a017,
        timestamp: battle.created_at,
        footer: { text: footerText },
      });
    } else {
      // No report → footer + timestamp stay on the battle-info embed.
      infoEmbed.timestamp = battle.created_at;
      infoEmbed.footer = { text: "MundaManager" };
    }

    let discordRes: Response

    if (campaign.discord_channel_type === DISCORD_CHANNEL_TYPES.FORUM) {
      const date = new Date().toISOString().slice(0, 10)
      discordRes = await fetch(
        `https://discord.com/api/v10/channels/${campaign.discord_channel_id}/threads`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `${campaign.campaign_name} — Battle Report (${date})`,
            auto_archive_duration: 10080,
            message: { embeds },
          }),
        }
      )
    } else {
      discordRes = await fetch(
        `https://discord.com/api/v10/channels/${campaign.discord_channel_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ embeds }),
        }
      )
    }

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