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
        payloadDigest: null, pendingPost: null, sentMessages: [], lastError: null, retryCount: 0, completedAt: null
      };
      await tx.put(key, state);
      return { created: true, state };
    });
  }

  async get(articleId, destination) {
    return (await this.storage.get(articleKey(articleId, destination))) ?? null;
  }

  // Lease expiry never permits automatic takeover.
  async claim({ articleId, destination, workflowRunId, workflowRunAttempt }) {
    const key = articleKey(articleId, destination);
    if (typeof workflowRunId !== "string" || !/^[1-9][0-9]*$/.test(workflowRunId) ||
        !Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt < 1) {
      throw new Error("Invalid workflow identity");
    }
    const token = crypto.randomUUID();
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!state) throw new Error("Article not registered");
      if (state.lockToken || !["pending", "failed"].includes(state.status)) {
        return { acquired: false, reason: state.lockToken ? "locked" : state.status };
      }
      const now = Date.now();
      const next = { ...state, status: "processing", workflowRunId, workflowRunAttempt,
        lockToken: token, lockAcquiredAt: new Date(now).toISOString(),
        lockExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
        updatedAt: new Date(now).toISOString(), revision: state.revision + 1,
        retryCount: state.retryCount + (state.status === "failed" ? 1 : 0) };
      await tx.put(key, next);
      return { acquired: true, lockToken: token, revision: next.revision };
    });
  }

  ownsLock(state, lockToken) {
    return Boolean(state && typeof lockToken === "string" && lockToken &&
      state.lockToken === lockToken && ["processing", "posting"].includes(state.status) &&
      Date.parse(state.lockExpiresAt) > Date.now());
  }

  async validateLock({ articleId, destination, lockToken }) {
    return this.ownsLock(await this.get(articleId, destination), lockToken);
  }

  async renewLock({ articleId, destination, lockToken }) {
    const key = articleKey(articleId, destination);
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!this.ownsLock(state, lockToken)) throw new Error("Invalid or expired lock");
      const now = Date.now();
      const next = { ...state, lockExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
        updatedAt: new Date(now).toISOString(), revision: state.revision + 1 };
      await tx.put(key, next);
      return { revision: next.revision, lockExpiresAt: next.lockExpiresAt };
    });
  }

  async release({ articleId, destination, lockToken, status, lastError = null }) {
    const key = articleKey(articleId, destination);
    if (!["failed", "no-target"].includes(status)) throw new Error("Invalid release status");
    if (lastError !== null && (typeof lastError !== "string" || lastError.length > 2000))
      throw new Error("Invalid error");
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!this.ownsLock(state, lockToken)) throw new Error("Invalid or expired lock");
      if (state.status !== "processing" || (status === "no-target" && state.payloadDigest)) throw new Error("Invalid release state");
      const next = { ...state, status, lastError, lockToken: null,
        lockAcquiredAt: null, lockExpiresAt: null,
        updatedAt: new Date().toISOString(), revision: state.revision + 1 };
      await tx.put(key, next);
      return next;
    });
  }

  async mutateOwned(input, mutate) {
    const key = articleKey(input.articleId, input.destination);
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!this.ownsLock(state, input.lockToken)) throw new Error("Invalid or expired lock");
      const next = { ...state, ...mutate(state), revision: state.revision + 1,
        updatedAt: new Date().toISOString() };
      await tx.put(key, next);
      return next;
    });
  }

  async startPosting(input) {
    const { totalPages, payloadDigest } = input;
    if (!Number.isSafeInteger(totalPages) || totalPages < 0 ||
        typeof payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(payloadDigest))
      throw new Error("Invalid posting plan");
    return this.mutateOwned(input, state => {
      if (state.status !== "processing" || state.pendingPost ||
          (state.payloadDigest && (state.payloadDigest !== payloadDigest || state.totalPages !== totalPages)))
        throw new Error("Posting plan conflict");
      return { status: "posting", totalPages, payloadDigest };
    });
  }

  async beginPost(input) {
    const { kind, pages } = input;
    const operationId = crypto.randomUUID();
    return this.mutateOwned(input, state => {
      if (state.status !== "posting" || state.pendingPost) throw new Error("Post already pending or invalid state");
      if (!Array.isArray(pages) || !(
        (kind === "overview" && !state.overviewPosted && pages.length === 0) ||
        (kind === "pages" && state.overviewPosted && pages.length > 0 && pages.length <= 10 &&
          pages.every((p,i) => p === state.postedPages.length+i+1 && p <= state.totalPages))))
        throw new Error("Invalid post sequence");
      return { pendingPost: { operationId, kind, pages: [...pages] } };
    });
  }

  async confirmPost(input) {
    const { operationId, messageId } = input;
    if (typeof messageId !== "string" || !/^[1-9][0-9]*$/.test(messageId))
      throw new Error("Invalid message ID");
    return this.mutateOwned(input, state => {
      const pending = state.pendingPost;
      if (state.status !== "posting" || !pending || pending.operationId !== operationId)
        throw new Error("Invalid pending operation");
      const sent = state.sentMessages ?? [];
      if (sent.some(m => m.messageId === messageId)) throw new Error("Duplicate message ID");
      const postedPages = [...state.postedPages, ...pending.pages];
      const overviewPosted = state.overviewPosted || pending.kind === "overview";
      const done = overviewPosted && postedPages.length === state.totalPages;
      return { pendingPost: null, postedPages, overviewPosted,
        sentMessages: [...sent, { ...pending, messageId }],
        ...(done ? { status: "completed", completedAt: new Date().toISOString(),
          lockToken: null, lockAcquiredAt: null, lockExpiresAt: null } : {}) };
    });
  }

  // Internal only. The caller must obtain authoritative GitHub attempt status.
  // Snapshot revision and attempt prevent recovery of a changed owner.
  async recoverExpired(input) {
    const key = articleKey(input.articleId, input.destination);
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!state || !state.lockToken || !["processing","posting"].includes(state.status) ||
          !(Date.parse(state.lockExpiresAt) <= Date.now()))
        return { recovered: false, reason: "not-expired" };
      if (state.revision !== input.expectedRevision ||
          state.workflowRunId !== input.workflowRunId ||
          state.workflowRunAttempt !== input.workflowRunAttempt)
        return { recovered: false, reason: "snapshot-changed" };
      if (input.workflowStatus !== "completed")
        return { recovered: false, reason: "workflow-not-confirmed-ended" };
      const status = state.pendingPost ? "uncertain" : "failed";
      const next = { ...state, status, lockToken: null, lockAcquiredAt: null,
        lockExpiresAt: null, lastError: "Expired workflow lock: " + status,
        updatedAt: new Date().toISOString(), revision: state.revision + 1 };
      await tx.put(key, next);
      return { recovered: true, status };
    });
  }

  // Only pre-claim transitions are allowed here. Processing is entered
  // exclusively via claim and exited via release. Dispatch is not wired yet.
  async transition({ articleId, destination, expectedRevision, status }) {
    const key = articleKey(articleId, destination);
    return this.storage.transaction(async tx => {
      const state = await tx.get(key);
      if (!state) throw new Error("Article not registered");
      if (state.revision !== expectedRevision) throw new Error("Revision conflict");
      if (!transitions[state.status]?.includes(status)) throw new Error("Invalid transition");
      if (state.lockToken || !["pending", "failed"].includes(state.status) ||
          !["pending", "failed"].includes(status)) throw new Error("Transition not enabled");
      const next = { ...state, status, revision: state.revision + 1,
        updatedAt: new Date().toISOString() };
      await tx.put(key, next);
      return next;
    });
  }
}
