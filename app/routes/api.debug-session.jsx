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

    if (offlineSession?.shop) {
      try {
        const { admin } = await unauthenticated.admin(offlineSession.shop);
        const pRes = await admin.graphql(`
          query getPagesSeo {
            pages(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
                  bodySummary
                  seo {
                    title
                    description
                  }
                }
              }
            }
          }
        `);
        pagesQuery = await pRes.json();
      } catch (err) {
        pagesQuery = { error: err.message };
      }

      try {
        const { admin } = await unauthenticated.admin(offlineSession.shop);
        const aRes = await admin.graphql(`
          query getArticlesSeo {
            articles(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
                  summary
                  blog {
                    title
                  }
                  image {
                    url
                  }
                  seo {
                    title
                    description
                  }
                }
              }
            }
          }
        `);
        articlesQuery = await aRes.json();
      } catch (err) {
        articlesQuery = { error: err.message };
      }
    }

    return Response.json({
      sessions,
      pagesQuery,
      articlesQuery,
      themesQuery,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
