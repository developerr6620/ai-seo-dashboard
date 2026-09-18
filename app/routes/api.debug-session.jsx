import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    const sessions = await prisma.session.findMany({
      select: {
        id: true,
        shop: true,
        isOnline: true,
        scope: true,
        expires: true,
      },
    });

    const offlineSession = sessions.find((s) => !s.isOnline);
    let pagesQuery = null;
    let articlesQuery = null;
    let themesQuery = null;

    let pErr = null;
    let aErr = null;

    if (offlineSession?.shop) {
      try {
        const { admin } = await unauthenticated.admin(offlineSession.shop);
        const pRes = await admin.graphql(`
          query getPagesTest {
            pages(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
                  bodySummary
                  seoTitle: metafield(namespace: "global", key: "title_tag") { value }
                  seoDesc: metafield(namespace: "global", key: "description_tag") { value }
                }
              }
            }
          }
        `);
        pagesQuery = await pRes.json();
      } catch (err) {
        pErr = err.message;
      }

      try {
        const { admin } = await unauthenticated.admin(offlineSession.shop);
        const aRes = await admin.graphql(`
          query getArticlesTest {
            articles(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
                  summary
                  blog { title }
                  seoTitle: metafield(namespace: "global", key: "title_tag") { value }
                  seoDesc: metafield(namespace: "global", key: "description_tag") { value }
                }
              }
            }
          }
        `);
        articlesQuery = await aRes.json();
      } catch (err) {
        aErr = err.message;
      }
    }

    return Response.json({
      sessions,
      pagesQuery,
      articlesQuery,
      pErr,
      aErr,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
