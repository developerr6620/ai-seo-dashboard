import { authenticate } from "../shopify.server";
import { enforceSeoLimits } from "../lib/seoCopy";
import { updateAuditStatsOnSave } from "../lib/storeAudit.server";

function formatKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop;

  try {
    const data = await request.json();

    // Check if this is a bulk request
    if (Array.isArray(data.items)) {
      const items = data.items;
      let successCount = 0;
      let keywordsUpdatedCount = 0;
      const errors = [];

      for (const item of items) {
        if (!item.productId || !item.seoTitle) continue;
        const limited = enforceSeoLimits({
          title: item.seoTitle,
          description: item.seoDescription || "",
        });

        try {
          // 1. Update product SEO title & description
          const response = await admin.graphql(
            `#graphql
            mutation updateProductSeo($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  title
                  seo {
                    title
                    description
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                input: {
                  id: item.productId,
                  seo: {
                    title: limited.title,
                    description: limited.description,
                  },
                },
              },
            }
          );

          const resJson = await response.json();
          const userErrors = resJson?.data?.productUpdate?.userErrors || [];
          if (userErrors.length > 0) {
            errors.push({
              productId: item.productId,
              error: userErrors.map((e) => e.message).join(", "),
            });
            continue;
          }

          successCount++;

          // 2. Save Target SEO Keywords as Product Metafield if provided
          const keywordsList = formatKeywords(item.keywords);
          if (keywordsList.length > 0) {
            try {
              const metaRes = await admin.graphql(
                `#graphql
                mutation saveProductKeywords($metafields: [MetafieldsSetInput!]!) {
                  metafieldsSet(metafields: $metafields) {
                    metafields {
                      id
                      key
                      value
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }`,
                {
                  variables: {
                    metafields: [
                      {
                        ownerId: item.productId,
                        namespace: "seo",
                        key: "keywords",
                        type: "list.single_line_text_field",
                        value: JSON.stringify(keywordsList),
                      },
                    ],
                  },
                }
              );
              const metaJson = await metaRes.json();
              const metaErrors = metaJson?.data?.metafieldsSet?.userErrors || [];
              if (metaErrors.length === 0) {
                keywordsUpdatedCount++;
              }
            } catch (metaErr) {
              console.warn(`Could not save keywords metafield for ${item.productId}:`, metaErr.message);
            }
          }
        } catch (e) {
          errors.push({
            productId: item.productId,
            error: e.message || "Failed to update",
          });
        }
      }

      if (successCount > 0 && shop) {
        updateAuditStatsOnSave(shop, {
          addedTitles: successCount,
          addedDescs: successCount,
          addedOptimal: successCount,
          addedKeywords: keywordsUpdatedCount,
        });
      }

      return Response.json({
        success: true,
        updatedCount: successCount,
        keywordsCount: keywordsUpdatedCount,
        errors,
      });
    }

    // Single product update
    const { productId, seoTitle, seoDescription, keywords } = data;

    if (!productId || !seoTitle) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const limited = enforceSeoLimits({ title: seoTitle, description: seoDescription });

    // 1. Update product SEO title & description
    const response = await admin.graphql(
      `#graphql
      mutation updateProductSeo($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            seo {
              title
              description
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            id: productId,
            seo: {
              title: limited.title,
              description: limited.description,
            },
          },
        },
      }
    );

    const responseJson = await response.json();
    const userErrors = responseJson?.data?.productUpdate?.userErrors || [];

    if (userErrors.length > 0) {
      return Response.json({
        success: false,
        error: userErrors.map((e) => e.message).join(", "),
      });
    }

    // 2. Save Target SEO Keywords as Product Metafield if provided
    let hasKeywords = false;
    const keywordsList = formatKeywords(keywords);
    if (keywordsList.length > 0) {
      try {
        const metaRes = await admin.graphql(
          `#graphql
          mutation saveProductKeywords($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              metafields: [
                {
                  ownerId: productId,
                  namespace: "seo",
                  key: "keywords",
                  type: "list.single_line_text_field",
                  value: JSON.stringify(keywordsList),
                },
              ],
            },
          }
        );
        const metaJson = await metaRes.json();
        const metaErrors = metaJson?.data?.metafieldsSet?.userErrors || [];
        if (metaErrors.length === 0) {
          hasKeywords = true;
        }
      } catch (metaErr) {
        console.warn(`Could not save keywords metafield for ${productId}:`, metaErr.message);
      }
    }

    if (shop) {
      updateAuditStatsOnSave(shop, {
        addedTitles: 1,
        addedDescs: seoDescription ? 1 : 0,
        addedOptimal: 1,
        addedKeywords: hasKeywords ? 1 : 0,
      });
    }

    return Response.json({
      success: true,
      product: responseJson?.data?.productUpdate?.product,
      keywordsSaved: hasKeywords ? keywordsList : null,
    });
  } catch (err) {
    console.error("API update error:", err);
    return Response.json({ success: false, error: String(err.message || "GraphQL update failed") }, { status: 500 });
  }
};
