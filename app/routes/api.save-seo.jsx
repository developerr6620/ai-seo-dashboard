import { authenticate } from "../shopify.server";
import { enforceSeoLimits } from "../lib/seoCopy";
import { updateAuditStatsOnSave } from "../lib/storeAudit.server";
import { ensureKeywordsMetafieldDefinition } from "../lib/metafieldDefinitions.server";

function formatKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
  return String(raw)
    .split(/[,\n\r]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Saves Target SEO Keywords as a Product Metafield (type: multi_line_text_field, comma-separated string).
 * If Shopify returns a type mismatch error (e.g. expected list.single_line_text_field from legacy definition),
 * it forces migration of the definition to multi_line_text_field and retries the mutation.
 */
async function saveProductKeywordsMetafield(admin, productId, commaSeparatedKeywords, shop) {
  const mutation = `#graphql
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
          code
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: productId,
        namespace: "seo",
        key: "keywords",
        type: "multi_line_text_field",
        value: commaSeparatedKeywords,
      },
    ],
  };

  let res = await admin.graphql(mutation, { variables });
  let json = await res.json();
  let userErrors = json?.data?.metafieldsSet?.userErrors || [];

  // Check for type mismatch error
  const isTypeMismatch = userErrors.some(
    (e) =>
      e.message?.toLowerCase().includes("type does not match") ||
      e.message?.toLowerCase().includes("expected") ||
      e.message?.toLowerCase().includes("definition")
  );

  if (isTypeMismatch) {
    console.log(
      `[SaveSeo] Type mismatch for product ${productId}. Re-syncing metafield definition to multi_line_text_field with force=true...`
    );
    // Force delete old list definition and recreate as multi_line_text_field
    const syncResult = await ensureKeywordsMetafieldDefinition(admin, shop, true);

    if (syncResult.success) {
      console.log(`[SaveSeo] Definition migrated successfully. Retrying metafieldsSet for ${productId}...`);
      // Retry metafieldsSet
      res = await admin.graphql(mutation, { variables });
      json = await res.json();
      userErrors = json?.data?.metafieldsSet?.userErrors || [];
    } else {
      return {
        success: false,
        error:
          syncResult.error ||
          "Store has conflicting metafield definition. Please delete 'Target SEO Keywords' under Shopify Admin → Settings → Custom data → Products.",
      };
    }
  }

  if (userErrors.length > 0) {
    const msg = userErrors.map((e) => e.message).join("; ");
    console.warn(`[SaveSeo] MetafieldsSet user errors for ${productId}:`, msg);
    return { success: false, error: msg };
  }

  return { success: true, metafield: json?.data?.metafieldsSet?.metafields?.[0] };
}

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop;

  // Guarantee that the Target SEO Keywords definition is registered & pinned in Shopify
  await ensureKeywordsMetafieldDefinition(admin, shop);

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
              field: "seo",
              error: userErrors.map((e) => e.message).join(", "),
            });
            continue;
          }

          successCount++;

          // 2. Save Target SEO Keywords as Product Metafield (comma-separated multiline text)
          const keywordsList = formatKeywords(item.keywords);
          if (keywordsList.length > 0) {
            const commaSeparatedKeywords = keywordsList.join(", ");
            try {
              const metaResult = await saveProductKeywordsMetafield(
                admin,
                item.productId,
                commaSeparatedKeywords,
                shop
              );

              if (metaResult.success) {
                keywordsUpdatedCount++;
              } else {
                errors.push({
                  productId: item.productId,
                  field: "keywords",
                  error: `Keywords not saved: ${metaResult.error}`,
                });
              }
            } catch (metaErr) {
              console.warn(`Could not save keywords metafield for ${item.productId}:`, metaErr.message);
              errors.push({
                productId: item.productId,
                field: "keywords",
                error: `Keywords error: ${metaErr.message}`,
              });
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

      const hasKeywordsErrors = errors.some((e) => e.field === "keywords");
      const keywordsErrorMessage = hasKeywordsErrors
        ? errors.find((e) => e.field === "keywords")?.error
        : null;

      return Response.json({
        success: successCount > 0,
        updatedCount: successCount,
        keywordsCount: keywordsUpdatedCount,
        keywordsError: keywordsErrorMessage,
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
      }
    `,
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

    // 2. Save Target SEO Keywords as Product Metafield (comma-separated multiline text)
    let hasKeywords = false;
    let keywordsError = null;
    const keywordsList = formatKeywords(keywords);
    if (keywordsList.length > 0) {
      const commaSeparatedKeywords = keywordsList.join(", ");
      try {
        const metaResult = await saveProductKeywordsMetafield(
          admin,
          productId,
          commaSeparatedKeywords,
          shop
        );

        if (metaResult.success) {
          hasKeywords = true;
        } else {
          keywordsError = metaResult.error;
        }
      } catch (metaErr) {
        console.warn(`Could not save keywords metafield for ${productId}:`, metaErr.message);
        keywordsError = metaErr.message;
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
      keywordsError,
    });
  } catch (err) {
    console.error("API update error:", err);
    return Response.json({ success: false, error: String(err.message || "GraphQL update failed") }, { status: 500 });
  }
};
