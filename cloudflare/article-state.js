// Internal state repository. No public mutation endpoint.
const transitions = {
  baseline: [], pending: ["queued", "processing", "failed"],
  queued: ["processing", "failed", "uncertain"],
  processing: ["posting", "no-target", "failed"],
  posting: ["completed", "failed", "uncertain"],
  failed: ["pending", "processing"], completed: [],
  "no-target": [], uncertain: []
};

export function articleKey(articleId, destination) {
  if (typeof articleId !== "string" || !/^[1-9][0-9]*$/.test(articleId) ||
      !["test", "production"].includes(destination)) {
    throw new Error("Invalid article identity");
  }
  return destination + ":" + articleId;
}

export class ArticleRepository {
  constructor(storage) { this.storage = storage; }

  async register({ articleId, articleUrl, destination, baseline = false }) {
    const key = articleKey(articleId, destination);
    const url = new URL(articleUrl);
    if (url.origin !== "https://mhaur.bn-ent.net" ||
        url.pathname !== "/news/" || url.searchParams.getAll("p").length !== 1 ||
        url.searchParams.get("p") !== articleId || url.username || url.password) {
      throw new Error("Invalid article URL");
    }
    if (typeof baseline !== "boolean") throw new Error("Invalid baseline flag");
    return this.storage.transaction(async tx => {
      const existing = await tx.get(key);
      if (existing) return { created: false, state: existing };
      const now = new Date().toISOString();
      const state = {
        articleId, articleUrl: url.href, destination,
        status: baseline ? "baseline" : "pending",
        detectedAt: now, updatedAt: now, revision: 0,
        workflowRunId: null, workflowRunAttempt: null,
        lockToken: null, lockAcquiredAt: null, lockExpiresAt: null,
        overviewPosted: false, postedPages: [], totalPages: null,
        payloadDigest: null, lastError: null, retryCount: 0, completedAt: null
      };
      await tx.put(key, state);
      return { created: true, state };
    });
  }

  async get(articleId, destination) {
    return (await this.storage.get(articleKey(articleId, destination))) ?? null;
  }

  // Preliminary internal transition primitive; ownership and delivery
  // invariants must be enforced before wiring this to workflow callers.
  async transition({ articleId, destination, expectedRevision, status }) {
    const key = articleKey(articleId, destination);
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!state) throw new Error("Article not registered");
      if (state.revision !== expectedRevision) throw new Error("Revision conflict");
      if (!transitions[state.status]?.includes(status)) throw new Error("Invalid transition");
      // Posting and recovery transitions require the next implementation stage.
      if (["posting", "completed", "uncertain"].includes(status) ||
          state.status === "posting") throw new Error("Delivery transition not enabled");
      const next = { ...state, status, revision: state.revision + 1,
        updatedAt: new Date().toISOString() };
      await tx.put(key, next);
      return next;
    });
  }
}
