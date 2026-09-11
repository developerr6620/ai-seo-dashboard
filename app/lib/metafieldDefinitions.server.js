// In-memory cache of shops where the metafield definition has been verified
const verifiedShops = new Set();

/**
 * Ensures the "Target SEO Keywords" Product Metafield Definition
 * is created and pinned in the merchant's Shopify store.
 */
export async function ensureKeywordsMetafieldDefinition(admin, shop = "") {
  if (shop && verifiedShops.has(shop)) {
    return { success: true, cached: true };
  }

  const mutation = `#graphql
    mutation CreateKeywordsMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        definition: {
          name: "Target SEO Keywords",
          namespace: "seo",
          key: "keywords",
          description: "High-intent target search keywords managed by AI SEO Dashboard",
          ownerType: "PRODUCT",
          type: "list.single_line_text_field",
          pin: true,
          access: {
            storefront: "PUBLIC_READ",
          },
        },
      },
    });

    const json = await response.json();
    const userErrors = json?.data?.metafieldDefinitionCreate?.userErrors || [];

    if (userErrors.length > 0) {
      // If error is TAKEN or already exists, that's completely normal and means it's already there
      const isAlreadyTaken = userErrors.some(
        (e) =>
          e.code === "TAKEN" ||
          (e.message && e.message.toLowerCase().includes("taken")) ||
          (e.message && e.message.toLowerCase().includes("already exists"))
      );

      if (isAlreadyTaken) {
        if (shop) verifiedShops.add(shop);
        return { success: true, alreadyExisted: true };
      }

      // If access or pin caused an error, retry with basic definition
      const hasConfigError = userErrors.some(
        (e) => e.field && (e.field.includes("access") || e.field.includes("pin"))
      );

      if (hasConfigError) {
        console.warn("[MetafieldDefinition] Retrying with basic definition input without access/pin...");
        const fallbackRes = await admin.graphql(mutation, {
          variables: {
            definition: {
              name: "Target SEO Keywords",
              namespace: "seo",
              key: "keywords",
              description: "High-intent target search keywords managed by AI SEO Dashboard",
              ownerType: "PRODUCT",
              type: "list.single_line_text_field",
            },
          },
        });
        const fallbackJson = await fallbackRes.json();
        const fallbackErrors = fallbackJson?.data?.metafieldDefinitionCreate?.userErrors || [];
        if (
          fallbackErrors.length === 0 ||
          fallbackErrors.some(
            (e) =>
              e.code === "TAKEN" ||
              (e.message && e.message.toLowerCase().includes("taken")) ||
              (e.message && e.message.toLowerCase().includes("already exists"))
          )
        ) {
          if (shop) verifiedShops.add(shop);
          return {
            success: true,
            created: fallbackJson?.data?.metafieldDefinitionCreate?.createdDefinition,
          };
        }
      }

      console.warn("[MetafieldDefinition] User errors:", userErrors);
      return { success: false, errors: userErrors };
    }

    const created = json?.data?.metafieldDefinitionCreate?.createdDefinition;
    console.log("[MetafieldDefinition] Successfully created definition in store:", created);
    if (shop) verifiedShops.add(shop);
    return { success: true, created };
  } catch (err) {
    console.error("[MetafieldDefinition] Failed to create definition:", err.message);
    return { success: false, error: err.message };
  }
}
