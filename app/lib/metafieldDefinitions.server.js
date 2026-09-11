// In-memory cache of shops where the metafield definition has been verified
const verifiedShops = new Set();

export function clearVerifiedShops(shop = "") {
  if (shop) verifiedShops.delete(shop);
  else verifiedShops.clear();
}

/**
 * Ensures the "Target SEO Keywords" Product Metafield Definition
 * is created and pinned in the merchant's Shopify store.
 */
export async function ensureKeywordsMetafieldDefinition(admin, shop = "") {
  if (shop && verifiedShops.has(shop)) {
    return { success: true, cached: true };
  }

  try {
    // 1. Check existing definitions on PRODUCT
    const checkQuery = `#graphql
      query GetMetafieldDefinitions {
        metafieldDefinitions(first: 50, ownerType: PRODUCT) {
          edges {
            node {
              id
              name
              namespace
              key
              pinnedPosition
              type {
                name
              }
            }
          }
        }
      }
    `;

    const checkRes = await admin.graphql(checkQuery);
    const checkJson = await checkRes.json();
    const edges = checkJson?.data?.metafieldDefinitions?.edges || [];
    const existing = edges.find(
      (e) => e.node?.namespace === "seo" && e.node?.key === "keywords"
    )?.node;

    // If definition exists and is ALREADY multi_line_text_field, we are done!
    if (existing && existing.type?.name === "multi_line_text_field") {
      if (shop) verifiedShops.add(shop);
      return { success: true, alreadyExisted: true, id: existing.id };
    }

    // If definition exists but is NOT multi_line_text_field (e.g. legacy list.single_line_text_field),
    // attempt deletion so we can recreate it with multi_line_text_field
    if (existing && existing.type?.name !== "multi_line_text_field") {
      console.log(
        `[MetafieldDefinition] Found legacy definition type "${existing.type?.name}". Deleting to migrate to multi_line_text_field...`
      );
      const deleteMutation = `#graphql
        mutation DeleteMetafieldDefinition($id: ID!) {
          metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: true) {
            deletedDefinitionId
            userErrors {
              field
              message
            }
          }
        }
      `;
      const delRes = await admin.graphql(deleteMutation, { variables: { id: existing.id } });
      const delJson = await delRes.json();
      console.log("[MetafieldDefinition] Delete result:", JSON.stringify(delJson));
      const delErrors = delJson?.data?.metafieldDefinitionDelete?.userErrors || [];
      if (delErrors.length > 0) {
        const errMsg = delErrors.map((e) => e.message).join("; ");
        console.warn("[MetafieldDefinition] Could not delete old definition:", errMsg);
        return {
          success: false,
          needsManualDelete: true,
          error: `Shopify blocked automated deletion of the old list metafield: "${errMsg}". In your Shopify Admin, go to Settings -> Custom data -> Products -> "Target SEO Keywords" and click Delete. Then click 'Force Sync Metafield'.`,
        };
      }

      // Wait 1.5 seconds for Shopify background processing
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 2. Create the multi_line_text_field definition
    const createMutation = `#graphql
      mutation CreateKeywordsMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    const response = await admin.graphql(createMutation, {
      variables: {
        definition: {
          name: "Target SEO Keywords",
          namespace: "seo",
          key: "keywords",
          description: "Comma-separated target search keywords for SEO",
          ownerType: "PRODUCT",
          type: "multi_line_text_field",
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
      const isAlreadyTaken = userErrors.some(
        (e) =>
          e.code === "TAKEN" ||
          (e.message && e.message.toLowerCase().includes("taken")) ||
          (e.message && e.message.toLowerCase().includes("already exists"))
      );

      if (isAlreadyTaken) {
        // Re-check existing definitions to see if it actually became multi_line_text_field
        const recheckRes = await admin.graphql(checkQuery);
        const recheckJson = await recheckRes.json();
        const recheckEdges = recheckJson?.data?.metafieldDefinitions?.edges || [];
        const currentDef = recheckEdges.find(
          (e) => e.node?.namespace === "seo" && e.node?.key === "keywords"
        )?.node;

        if (currentDef?.type?.name === "multi_line_text_field") {
          if (shop) verifiedShops.add(shop);
          return { success: true, alreadyExisted: true, id: currentDef.id, type: "multi_line_text_field" };
        }

        return {
          success: false,
          needsManualDelete: true,
          error: `The metafield definition in your store is still registered as "${currentDef?.type?.name || "list"}". Please open Shopify Admin -> Settings -> Custom data -> Products -> "Target SEO Keywords", click Delete, then click 'Force Sync Metafield'.`,
        };
      }

      // Retry without access/pin if rejected
      const hasConfigError = userErrors.some(
        (e) => e.field && (e.field.includes("access") || e.field.includes("pin"))
      );

      if (hasConfigError) {
        console.warn("[MetafieldDefinition] Retrying with basic multi_line_text_field input...");
        const fallbackRes = await admin.graphql(createMutation, {
          variables: {
            definition: {
              name: "Target SEO Keywords",
              namespace: "seo",
              key: "keywords",
              description: "Comma-separated target search keywords for SEO",
              ownerType: "PRODUCT",
              type: "multi_line_text_field",
            },
          },
        });
        const fallbackJson = await fallbackRes.json();
        const fallbackErrors = fallbackJson?.data?.metafieldDefinitionCreate?.userErrors || [];
        if (fallbackErrors.length === 0) {
          if (shop) verifiedShops.add(shop);
          return {
            success: true,
            created: fallbackJson?.data?.metafieldDefinitionCreate?.createdDefinition,
          };
        }
      }

      console.warn("[MetafieldDefinition] User errors creating definition:", userErrors);
      return { success: false, errors: userErrors };
    }

    const created = json?.data?.metafieldDefinitionCreate?.createdDefinition;
    console.log("[MetafieldDefinition] Successfully created multi_line_text_field definition:", created);
    if (shop) verifiedShops.add(shop);
    return { success: true, created };
  } catch (err) {
    console.error("[MetafieldDefinition] Failed to ensure definition:", err.message);
    return { success: false, error: err.message };
  }
}
