import { task, logger, retry } from "@trigger.dev/sdk/v3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BigKindsClassification {
  category: string;
  confidence: number;
}

interface BigKindsEntity {
  text: string;
  type: string; // PER, ORG, LOC, DAT, etc.
  offset: number;
}

interface BigKindsSummary {
  summary: string;
}

interface BigKindsKeywords {
  keywords: Array<{ word: string; weight: number }>;
}

export interface BigKindsAnalysisResult {
  classification: BigKindsClassification | null;
  entities: BigKindsEntity[];
  keywords: BigKindsKeywords | null;
  summary: BigKindsSummary | null;
}

interface BigKindsPayload {
  /** The article text to analyze. Max recommended length: 10 000 chars. */
  text: string;
  /** Optional title – appended to the text sent for classification. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIGKINDS_BASE_NLP = "http://api2.bigkindslab.or.kr:5002";
const BIGKINDS_BASE_KW = "http://api.bigkindslab.or.kr:5002";

const BIGKINDS_ACCESS_KEY = process.env.BIGKINDS_ACCESS_KEY ?? "";

async function callBigKindsApi<T>(
  url: string,
  body: Record<string, unknown>,
  label: string,
): Promise<T | null> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(BIGKINDS_ACCESS_KEY
            ? { Authorization: `Bearer ${BIGKINDS_ACCESS_KEY}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.warn(`BigKinds ${label} HTTP ${response.status}`, {
          attempt,
          body: text.slice(0, 500),
        });
        if (attempt === maxRetries) return null;
        await delay(attempt * 2000);
        continue;
      }

      const json = (await response.json()) as T;
      return json;
    } catch (error) {
      logger.warn(`BigKinds ${label} attempt ${attempt} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxRetries) return null;
      await delay(attempt * 2000);
    }
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Task: bigkinds-nlp-analyze
// ---------------------------------------------------------------------------

export const bigkindsNlpAnalyze = task({
  id: "bigkinds-nlp-analyze",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: BigKindsPayload): Promise<BigKindsAnalysisResult> => {
    const { text, title } = payload;

    if (!text || text.trim().length === 0) {
      logger.error("Empty text provided to bigkinds-nlp-analyze");
      return {
        classification: null,
        entities: [],
        keywords: null,
        summary: null,
      };
    }

    const analysisText = truncateText(text, 10_000);
    const classificationText = title
      ? truncateText(`${title}. ${text}`, 10_000)
      : analysisText;

    logger.info("Starting BigKinds NLP analysis", {
      textLength: analysisText.length,
      hasTitle: !!title,
    });

    // Run all four API calls concurrently
    const [classification, nerResult, keywords, summary] = await Promise.all([
      // 1. Classification
      callBigKindsApi<{ result: BigKindsClassification }>(
        `${BIGKINDS_BASE_NLP}/get_cls`,
        { text: classificationText },
        "classification",
      ),

      // 2. Named Entity Recognition
      callBigKindsApi<{ result: BigKindsEntity[] }>(
        `${BIGKINDS_BASE_NLP}/get_ner`,
        { text: analysisText },
        "NER",
      ),

      // 3. Keyword Extraction
      callBigKindsApi<{ result: BigKindsKeywords }>(
        `${BIGKINDS_BASE_KW}/get_keyword`,
        { text: analysisText },
        "keywords",
      ),

      // 4. Summary
      callBigKindsApi<{ result: BigKindsSummary }>(
        `${BIGKINDS_BASE_KW}/get_summary`,
        { text: analysisText },
        "summary",
      ),
    ]);

    const result: BigKindsAnalysisResult = {
      classification: classification?.result ?? null,
      entities: nerResult?.result ?? [],
      keywords: keywords?.result ?? null,
      summary: summary?.result ?? null,
    };

    logger.info("BigKinds NLP analysis complete", {
      hasClassification: !!result.classification,
      entityCount: result.entities.length,
      hasKeywords: !!result.keywords,
      hasSummary: !!result.summary,
    });

    return result;
  },
});
