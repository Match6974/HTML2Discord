import { DurableObject } from "cloudflare:workers";

import { ArticleRepository } from "./article-state.js";

export class ArticleState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.repository = new ArticleRepository(ctx.storage);
  }

  async fetch() {
    return Response.json({ status: "ok", service: "ArticleState" });
  }
}

export default {
  async fetch(request, env) {
    const articleStateBound = Boolean(env.ARTICLE_STATE);
    if (!articleStateBound) {
      return Response.json({ status: "error", articleStateBound }, { status: 503 });
    }
    const stub = env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName("health-check"));
    const response = await stub.fetch("https://internal/health");
    return Response.json({
      status: response.ok ? "ok" : "error",
      service: "mhaur-patchnote-discord",
      articleStateBound,
      articleStateReachable: response.ok
    }, { status: response.ok ? 200 : 503 });
  }
};
