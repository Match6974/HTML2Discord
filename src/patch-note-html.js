export function buildPatchNoteHtml({ testCardCount = 1, requestedPageFromWorker = 1, article = null, characterIndex = 0 } = {}) {
const patchNoteData = article ?? {
      articleId: 1573,
      date: "2026.11.11",
      category: "バトルスタイル調整",
      characters: [
        {
          name: "蛙吹梅雨",
          style: "フロッピホッパー",
          skills: [
            {
              title: "技β｜弾数調整",
              display: {
                segments: [
                {
                  scope: "低レベル時",
                  scopeType: "inferred",
                  before: 1,
                  after: 2,
                  unit: "発",
                  effect: "buff",
                  label: "強化",
                  beforeColor: "#111111",
                  afterColor: "#16A34A",
                  displayColor: "#16A34A",
                  evidence: {
                    source: "調整意図",
                    confidence: "explicit",
                  },
                },
                {
                  scope: "その他のレベル",
                  scopeType: "unresolved",
                  before: null,
                  after: 2,
                  unit: "発",
                  effect: "unknown",
                  label: "判定保留",
                  beforeColor: "#111111",
                  afterColor: null,
                  displayColor: null,
                  evidence: null,
                },
              ],
              },
            },
          ],
        },
      ],
    };
    const character = patchNoteData.characters[characterIndex];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const testSkills = article ? character.skills : Array.from(
      { length: testCardCount },
      (_, index) => character.skills.map((skill) => ({
        ...skill,
        title:
          testCardCount > 1
            ? skill.title + "（テスト " + (index + 1) + "）"
            : skill.title
      }))
    ).flat();
const skillCardsHtml = testSkills.map((skill) => {
      const segmentsHtml = skill.display.segments.map((segment) => {
        const beforeText =
          segment.before === null
            ? "変更前不明"
            : `${segment.before}${segment.unit}`;
        const afterText =
          segment.after === null
            ? "変更後不明"
            : `${segment.after}${segment.unit}`;
        const color = segment.displayColor || "#6B7280";
        const note =
          segment.evidence?.source === "調整意図"
            ? "※調整意図から補完した数値"
            : segment.scopeType === "unresolved"
              ? "※変更前の数値が確認できないため判定保留"
              : "";
        return `
          <div class="segment">
            <div class="segment-header">
              <span class="segment-scope">${esc(segment.scope)}</span>
              <span class="segment-label" style="color: ${color}">
                ${esc(segment.label)}
              </span>
            </div>
            ${segment.raw ? `<div class="raw-text">${esc(segment.raw)}</div>` : ""}
            ${segment.mode === "text" ? "" : `<div class="value-row">
              <span class="value-before">${esc(beforeText)}</span>
              <span class="value-arrow" style="color: ${color}">→</span>
              <span class="value-after" style="color: ${segment.afterColor || "#111111"}">
                ${esc(afterText)}
              </span>
            </div>`}
            ${note ? `<div class="note">${note}</div>` : ""}
          </div>
        `;
      }).join("");
      return `
        <section class="skill-card">
          <div class="skill-title">${esc(skill.title)}</div>
          ${segmentsHtml}
        </section>
      `;
    }).join("");
const html = `
  <!DOCTYPE html>
  <html lang="ja">
  <head>
  <meta charset="UTF-8">
  <style>
    * {
      box-sizing: border-box;
    }
    /* STEP2：フッターの位置を1920×1080基準で固定 */
    footer {
      position: absolute;
      bottom: 24px;
      left: 48px;
      right: 48px;
      box-sizing: border-box;
      background: #101827;
      z-index: 10;
    }
    body {
      margin: 0;
      width: 1920px;
      height: 1080px;
      padding: 48px;
      background: #101827;
      color: #ffffff;
      font-family: sans-serif;
      overflow: hidden;
      position: relative;
    }
    .page {
      height: 899px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 24px;
      min-height: 150px;
      border-bottom: 2px solid #34445d;
      padding-bottom: 20px;
    }
    .header-accent {
      width: 6px;
      height: 90px;
      background: #f59e0b;
    }
    .header-title {
      flex: 1;
    }
    h1 {
      margin: 0;
      font-size: 64px;
      line-height: 1.1;
    }
    .subtitle {
      margin-top: 12px;
      font-size: 29px;
      color: #cbd5e1;
    }
    .page-number {
      font-size: 28px;
      color: #cbd5e1;
    }
    .character-header {
      background: #23334e;
      padding: 24px 28px;
      border-radius: 6px;
    }
    .character-name {
      font-size: 52px;
      font-weight: bold;
    }
    .battle-style {
      margin-top: 8px;
      font-size: 29px;
      color: #cbd5e1;
    }
    .skill-card {
      background: #ffffff;
      color: #111827;
      border: 1px solid #dce3ec;
      border-radius: 6px;
      padding: 28px;
    }
    .raw-text { font-size: 30px; line-height: 1.35; overflow-wrap: anywhere; margin-top: 12px; }
    .skill-title {
      font-size: 38px;
      font-weight: bold;
    }
    .value-row {
      display: flex;
      align-items: center;
      gap: 28px;
      margin-top: 20px;
    }
    .value-before {
      font-size: 60px;
      color: #111111;
    }
    .value-arrow {
      font-size: 52px;
      color: #16a34a;
    }
    .value-after {
      font-size: 60px;
      font-weight: bold;
      color: #16a34a;
    }
    .note {
      margin-top: 16px;
      font-size: 24px;
      color: #64748b;
    }
    .reason-card {
      background: #23334e;
      padding: 24px 28px;
      border-radius: 6px;
    }
    .reason-title {
      font-size: 34px;
      font-weight: bold;
    }
    .reason-text {
      margin-top: 12px;
      font-size: 29px;
      line-height: 1.4;
      color: #cbd5e1;
    }
    .footer {
      margin-top: auto;
      border-top: 1px solid #34445d;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .source {
      font-size: 24px;
      color: #cbd5e1;
    }
    .disclaimer {
      margin-top: 6px;
      font-size: 20px;
      color: #94a3b8;
    }
    .footer-page {
      font-size: 28px;
    }
    .segment + .segment {
      border-top: 1px solid #e2e8f0;
      margin-top: 24px;
      padding-top: 24px;
    }
    .segment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 18px;
    }
    .segment-scope {
      font-size: 24px;
      color: #64748b;
    }
    .segment-label {
      font-size: 28px;
      font-weight: bold;
    }
    .segment .value-row {
      margin-top: 12px;
    }
    /* STEP5：複数ページ表示 */
    body.pagination-mode {
      height: auto;
      padding: 0;
      overflow: auto;
    }
    .pagination-canvas {
      position: relative;
      width: 1920px;
      height: 1080px;
      padding: 48px;
      background: #101827;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .pagination-canvas .page {
      width: 1824px;
      height: 899px;
      transform-origin: top left;
      position: relative;
      top: -4px;
    }
    .pagination-canvas footer {
      position: absolute;
      bottom: 24px;
      left: 48px;
      right: 48px;
    }
  </style>
  </head>
  <body>
    <div class="page">
      <header class="header">
        <div class="header-accent"></div>
        <div class="header-title">
          <h1>PATCH NOTES</h1>
          <div class="subtitle">
            ${esc(patchNoteData.category)}｜${esc(patchNoteData.date)}
          </div>
        </div>
        <div class="page-number">01 / 01</div>
      </header>
      <section class="character-header">
        <div class="character-name">${esc(character.name)}</div>
        <div class="battle-style">${esc(character.style)}</div>
      </section>
    ${skillCardsHtml}
      <section class="reason-card" ${article ? 'style="display:none"' : ""}>
        <div class="reason-title">調整意図</div>
        <div class="reason-text">
          ${article ? "※調整内容のみ掲載" : "日本語の長文が正しく表示されるか確認するためのテスト文章です。今後は公式記事から取得した調整意図を、省略せずに表示します。"}
        </div>
      </section>
    </div> <!-- .page をここで閉じる -->
      <footer class="footer">
        <div>
          <div class="source">出典：ヒロアカUR公式NEWS</div>
          <div class="disclaimer">
            ※一部の変更前数値は調整意図から補完しています。
          </div>
        </div>
        <div class="footer-page">01 / 01</div>
      </footer>
    <script>
      // STEP5-⑧-②：画像撮影用の描画完了フラグ
      window.renderReady = false;
      window.addEventListener("load", () => {
        // STEP5-⑧-②：Workerからページ番号を受け取る
        const requestedPage = ${JSON.stringify(requestedPageFromWorker)};
        const page = document.querySelector(".page");
        const footer = document.querySelector("footer");
        const availableHeight = page.clientHeight;
        const minimumScale = 0.70;
        const safetyGap = 24;
        // STEP3：本文の自動縮小
        page.style.transform = "";
        page.style.transformOrigin = "top left";
        const requiredHeight = page.scrollHeight;
        const scale = Math.min(1, availableHeight / requiredHeight);
        page.style.transform = "scale(" + scale + ")";
        // STEP4：表示範囲を検査
        const footerRect = footer.getBoundingClientRect();
        const rects = [...page.children].map(el => el.getBoundingClientRect());
        const contentBottom = Math.max(...rects.map(rect => rect.bottom));
        const contentRight = Math.max(...rects.map(rect => rect.right));
        const verticalOverflow = contentBottom > footerRect.top - safetyGap;
        const horizontalOverflow = contentRight > 1920 - 48 ||
          rects.some(rect => rect.left < 0);
        const belowMinimumScale = scale < minimumScale;
        window.layoutCheck = {
          scale: Number(scale.toFixed(3)),
          contentBottom: Math.round(contentBottom),
          footerTop: Math.round(footerRect.top),
          verticalOverflow,
          horizontalOverflow,
          belowMinimumScale,
          needsPagination: verticalOverflow || horizontalOverflow || belowMinimumScale
        };
        console.log("Layout check:", window.layoutCheck);
        // STEP5-⑧-③：改ページ不要な場合のページ番号チェック
        if (!window.layoutCheck.needsPagination) {
          // 改ページ不要なので総ページ数は1
          window.paginationResult = {
            totalPages: 1,
            pages: [{
              page: 1,
              cardCount: page.querySelectorAll(".skill-card").length,
              scale: Number(scale.toFixed(3)),
              belowMinimumScale: scale < minimumScale
            }]
          };
          if (requestedPage !== 1) {
            window.pageError = {
              code: "PAGE_OUT_OF_RANGE",
              requestedPage: requestedPage,
              totalPages: 1
            };
            // 存在しないページなので本文とフッターを非表示
            page.remove();
            footer.remove();
            window.selectedPage = null;
          } else {
            window.selectedPage = 1;
          }
          // STEP5-⑨：Workerが読み取るためのページ情報
          document.body.setAttribute(
            "data-total-pages",
            String(window.paginationResult?.totalPages ?? 1)
          );
          window.renderReady = true;
          document.body.setAttribute("data-render-ready", "true");
          return;
        }
        const originalCards = [...page.querySelectorAll(".skill-card")];
        if (originalCards.length === 0) return;
        // 元ページの内容をテンプレートとして保存する
        page.style.transform = "";
        const pageTemplate = page.cloneNode(true);
        const footerTemplate = footer.cloneNode(true);
        const pages = [];
        let current = [];
        // カード候補を一時的なページに配置し、実際の高さで判定
        const measure = (items) => {
          const testPage = pageTemplate.cloneNode(true);
          testPage.querySelectorAll(".skill-card").forEach(el => el.remove());
          const reason = testPage.querySelector(".reason-card");
          items.forEach(card => reason.before(card.cloneNode(true)));
          testPage.style.position = "absolute";
          testPage.style.left = "-10000px";
          testPage.style.top = "0";
          testPage.style.width = "1824px";
          testPage.style.height = "899px";
          testPage.style.transform = "none";
          document.body.appendChild(testPage);
          const height = testPage.scrollHeight;
          testPage.remove();
          return {height, scale: Math.min(1, availableHeight / height)};
        };
        for (const card of originalCards) {
          const candidate = [...current, card];
          if (current.length > 0 && measure(candidate).scale < minimumScale) {
            pages.push(current);
            current = [card];
          } else {
            current = candidate;
          }
        }
        if (current.length) pages.push(current);
        page.remove();
        footer.remove();
        document.body.classList.add("pagination-mode");
        const results = [];
        pages.forEach((items, index) => {
          const canvas = document.createElement("div");
          canvas.className = "pagination-canvas";
          const newPage = pageTemplate.cloneNode(true);
          newPage.querySelectorAll(".skill-card").forEach(el => el.remove());
          const reason = newPage.querySelector(".reason-card");
          items.forEach(card => reason.before(card.cloneNode(true)));
          const pageNumber = String(index + 1).padStart(2, "0") +
            " / " + String(pages.length).padStart(2, "0");
          newPage.querySelector(".page-number").textContent = pageNumber;
          const newFooter = footerTemplate.cloneNode(true);
          newFooter.querySelector(".footer-page").textContent = pageNumber;
          canvas.appendChild(newPage);
          canvas.appendChild(newFooter);
          document.body.appendChild(canvas);
          const height = newPage.scrollHeight;
          const pageScale = Math.min(1, availableHeight / height);
          newPage.style.transform = "scale(" + pageScale + ")";
          results.push({
            page: index + 1,
            cardCount: items.length,
            scale: Number(pageScale.toFixed(3)),
            belowMinimumScale: pageScale < minimumScale
          });
        });
        window.paginationResult = {totalPages: pages.length, pages: results};
        console.log("Pagination result:", window.paginationResult);
          if (
            Number.isInteger(requestedPage) &&
            requestedPage >= 1 &&
            requestedPage <= pages.length
          ) {
            const canvases = [
              ...document.querySelectorAll(
                ".pagination-canvas"
              )
            ];
            canvases.forEach((canvas, index) => {
              if (index !== requestedPage - 1) {
                canvas.remove();
              }
            });
            window.selectedPage = requestedPage;
            } else {
              window.selectedPage = null;
              // STEP5-⑧-③：存在しないページ番号を検出
              window.pageError = {
                code: "PAGE_OUT_OF_RANGE",
                requestedPage: requestedPage,
                totalPages: pages.length
              };
              // 範囲外の場合はページを表示しない
              document.querySelectorAll(".pagination-canvas")
                .forEach(canvas => canvas.remove());
            }
            // STEP5-⑨：Workerが読み取るためのページ情報
            document.body.setAttribute(
              "data-total-pages",
              String(window.paginationResult?.totalPages ?? 1)
            );
            // STEP5-⑧-②：改ページ・ページ選択完了
            window.renderReady = true;
            document.body.setAttribute("data-render-ready", "true");
      });
    </script>
  </body>
  </html>
`;
return html;
}
