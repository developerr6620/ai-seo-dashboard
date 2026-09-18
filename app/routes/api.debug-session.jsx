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
          query testPages {
            pages(first: 5) {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
          }
        `);
        pagesQuery = await pRes.json();

        const aRes = await admin.graphql(`
          query testArticles {
            articles(first: 5) {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
          }
        `);
        articlesQuery = await aRes.json();

        const tRes = await admin.graphql(`
          query testThemes {
            themes(first: 5) {
              edges {
                node {
                  id
                  name
                  role
                }
              }
            }
          }
        `);
        themesQuery = await tRes.json();
      } catch (err) {
        pagesQuery = { error: err.message };
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
