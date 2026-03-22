import { task, logger } from "@trigger.dev/sdk/v3";
import {
  supabase,
  resolveProvinceId,
  resolveCandidateId,
  resolveRawPollId,
} from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types (aligned with DB schema)
// ---------------------------------------------------------------------------

export interface RawPoll {
  nesdc_id: string;
  title: string;                    // stored in region or election_type context
  organization: string;             // mapped to DB "pollster"
  survey_period_start: string;      // mapped to DB "survey_start"
  survey_period_end: string;        // mapped to DB "survey_end"
  sample_size: number;
  margin_of_error: number;
  method: string;
  url: string;                      // not in raw_polls schema, ignored
  raw_html: string | null;
  crawled_at: string;               // mapped to DB "collected_at"
}

export interface StructuredPollResult {
  poll_nesdc_id: string;
  province_code: string;
  province_name: string;
  poll_date: string;
  source: string;
  sample_size: number;
  margin_of_error: number;
  candidates: Array<{
    name: string;
    party: string;
    percentage: number;
    is_leading: boolean;
  }>;
}

export interface StoreRawPollsResult {
  newPollIds: string[];
}

export interface StorePollResultsResult {
  storedCount: number;
}

// ---------------------------------------------------------------------------
// Task: store-raw-polls
// ---------------------------------------------------------------------------

export const storeRawPolls = task({
  id: "store-raw-polls",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { polls: RawPoll[] }): Promise<StoreRawPollsResult> => {
    const { polls } = payload;

    if (polls.length === 0) {
      logger.info("No raw polls to store");
      return { newPollIds: [] };
    }

    logger.info(`Storing ${polls.length} raw polls`);

    // Check which nesdc_ids already exist
    const nesdcIds = polls.map((p) => parseInt(p.nesdc_id, 10));
    const { data: existing, error: fetchError } = await supabase
      .from("raw_polls")
      .select("nesdc_id")
      .in("nesdc_id", nesdcIds);

    if (fetchError) {
      logger.error("Failed to check existing polls", { error: fetchError.message });
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    const existingIds = new Set((existing ?? []).map((e) => e.nesdc_id));
    const newPolls = polls.filter((p) => !existingIds.has(parseInt(p.nesdc_id, 10)));

    if (newPolls.length === 0) {
      logger.info("All polls already exist, skipping");
      return { newPollIds: [] };
    }

    const rows = newPolls.map((poll) => ({
      nesdc_id: parseInt(poll.nesdc_id, 10),
      election_type: "지방선거",
      pollster: poll.organization,        // organization -> pollster
      survey_start: poll.survey_period_start,  // survey_period_start -> survey_start
      survey_end: poll.survey_period_end,      // survey_period_end -> survey_end
      sample_size: poll.sample_size,
      margin_of_error: poll.margin_of_error,
      method: poll.method,
      raw_html: poll.raw_html,
      collected_at: poll.crawled_at,      // crawled_at -> collected_at
      is_analyzed: false,                 // is_processed -> is_analyzed
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("raw_polls")
      .upsert(rows, { onConflict: "nesdc_id", ignoreDuplicates: true })
      .select("nesdc_id");

    if (insertError) {
      logger.error("Failed to insert raw polls", { error: insertError.message });
      throw new Error(`Supabase insert error: ${insertError.message}`);
    }

    const newPollIds = (inserted ?? []).map((r) => String(r.nesdc_id));

    logger.info("Raw poll storage complete", { newCount: newPollIds.length });

    return { newPollIds };
  },
});

// ---------------------------------------------------------------------------
// Task: store-poll-results
// ---------------------------------------------------------------------------

export const storePollResults = task({
  id: "store-poll-results",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    results: StructuredPollResult[];
  }): Promise<StorePollResultsResult> => {
    const { results } = payload;

    if (results.length === 0) {
      logger.info("No poll results to store");
      return { storedCount: 0 };
    }

    logger.info(`Storing ${results.length} structured poll results`);

    let storedCount = 0;

    for (const result of results) {
      try {
        // 1. Resolve province_code -> province_id UUID
        const provinceId = await resolveProvinceId(
          result.province_code,
          result.province_name,
        );

        if (!provinceId) {
          logger.error(`Could not resolve province: ${result.province_code}`);
          continue;
        }

        // 2. Resolve raw_poll_id from nesdc_id
        const rawPollId = await resolveRawPollId(
          parseInt(result.poll_nesdc_id, 10),
        );

        // 3. Insert into polls table (using FK UUIDs)
        const { data: pollRow, error: pollError } = await supabase
          .from("polls")
          .insert({
            raw_poll_id: rawPollId,
            province_id: provinceId,
            pollster: result.source,
            survey_date: result.poll_date,
            sample_size: result.sample_size,
            margin_of_error: result.margin_of_error,
          })
          .select("id")
          .single();

        if (pollError) {
          logger.error(`Failed to insert poll ${result.poll_nesdc_id}`, {
            error: pollError.message,
          });
          continue;
        }

        const pollId = pollRow.id;

        // 4. Insert poll_results for each candidate (resolve name -> candidate_id)
        // Sort by percentage descending to assign rank
        const sortedCandidates = [...result.candidates].sort(
          (a, b) => b.percentage - a.percentage,
        );

        for (let rank = 0; rank < sortedCandidates.length; rank++) {
          const c = sortedCandidates[rank];

          // Try to resolve candidate_id
          const candidateId = await resolveCandidateId(
            provinceId,
            c.name,
            c.party,
          );

          if (!candidateId) {
            logger.warn(
              `Candidate not found in DB: ${c.name} (${c.party}) - ${result.province_code}, skipping poll_result`,
            );
            continue;
          }

          const { error: resultsError } = await supabase
            .from("poll_results")
            .upsert(
              {
                poll_id: pollId,
                candidate_id: candidateId,   // name -> candidate_id UUID
                percentage: c.percentage,
                rank: rank + 1,              // is_leading -> rank
              },
              { onConflict: "poll_id,candidate_id" },
            );

          if (resultsError) {
            logger.error(`Failed to insert poll result for ${c.name}`, {
              error: resultsError.message,
            });
          }
        }

        // 5. Call update_poll_trends_for_province() RPC
        const { error: rpcError } = await supabase.rpc(
          "update_poll_trends_for_province",
          { p_province_id: provinceId },
        );

        if (rpcError) {
          logger.warn(
            `RPC update_poll_trends_for_province failed for ${result.province_code}`,
            { error: rpcError.message },
          );
        }

        // 6. Mark raw poll as analyzed
        if (rawPollId) {
          const { error: markError } = await supabase
            .from("raw_polls")
            .update({ is_analyzed: true })   // is_processed -> is_analyzed
            .eq("nesdc_id", parseInt(result.poll_nesdc_id, 10));

          if (markError) {
            logger.warn(`Failed to mark raw poll ${result.poll_nesdc_id} as analyzed`, {
              error: markError.message,
            });
          }
        }

        storedCount++;
      } catch (err) {
        logger.error(`Unexpected error storing poll result`, {
          nesdcId: result.poll_nesdc_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Poll results storage complete", { storedCount });

    return { storedCount };
  },
});
