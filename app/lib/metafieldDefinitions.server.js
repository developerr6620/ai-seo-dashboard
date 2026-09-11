// In-memory cache of shops where the metafield definition has been verified as multi_line_text_field
const verifiedShops = new Set();

export function clearVerifiedShops(shop = "") {
  if (shop) verifiedShops.delete(shop);
  else verifiedShops.clear();
}

/**
 * Ensures the "Target SEO Keywords" Product Metafield Definition
 * is created as multi_line_text_field and pinned in the merchant's Shopify store.
 * If an older definition exists with a conflicting type (e.g. list.single_line_text_field),
 * it deletes it and recreates it with multi_line_text_field.
 */
export async function ensureKeywordsMetafieldDefinition(admin, shop = "", force = false) {
  if (shop && !force && verifiedShops.has(shop)) {
    return { success: true, cached: true };
  }

  try {
    // 1. Fetch existing definitions on PRODUCT (up to 250)
    const checkQuery = `#graphql
      query GetMetafieldDefinitions {
        metafieldDefinitions(first: 250, ownerType: PRODUCT) {
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

    // Check all definitions that could conflict
    const existingSeo = edges.find(
      (e) => e.node?.namespace === "seo" && e.node?.key === "keywords"
    )?.node;

    const existingByName = edges.find(
      (e) => e.node?.name === "Target SEO Keywords" && !(e.node?.namespace === "seo" && e.node?.key === "keywords")
    )?.node;

    // If seo.keywords already exists and is multi_line_text_field, we are golden!
    if (existingSeo && existingSeo.type?.name === "multi_line_text_field") {
      if (shop) verifiedShops.add(shop);
      return { success: true, alreadyExisted: true, id: existingSeo.id, type: "multi_line_text_field" };
    }

    // List all conflicting definitions that need deletion
    const toDelete = [];
    if (existingSeo && existingSeo.type?.name !== "multi_line_text_field") {
      toDelete.push(existingSeo);
    }
    if (existingByName && existingByName.type?.name !== "multi_line_text_field") {
      toDelete.push(existingByName);
    }

    // Delete any conflicting definition
    for (const def of toDelete) {
      console.log(
        `[MetafieldDefinition] Found conflicting definition "${def.namespace}.${def.key}" (Type: "${def.type?.name}"). Deleting...`
      );

      const deleteMutation = `#graphql
        mutation DeleteMetafieldDefinition($id: ID!) {
          metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: true) {
            deletedDefinitionId
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const delRes = await admin.graphql(deleteMutation, { variables: { id: def.id } });
      const delJson = await delRes.json();
      const delErrors = delJson?.data?.metafieldDefinitionDelete?.userErrors || [];

      if (delErrors.length > 0) {
        const errMsg = delErrors.map((e) => e.message).join("; ");
        console.warn(`[MetafieldDefinition] Could not delete definition ${def.id}:`, errMsg);
        return {
          success: false,
          needsManualDelete: true,
          currentType: def.type?.name,
          error: `Your Shopify store has an existing '${def.type?.name || "Single line list"}' definition for Target SEO Keywords (${def.namespace}.${def.key}) that Shopify locked from automatic API deletion. In Shopify Admin: go to Settings → Custom data → Products → click "${def.name}" → click Delete. Then click 'Force Sync Metafield'.`,
        };
      }
    }

    if (toDelete.length > 0) {
      // Wait 2.5 seconds for Shopify asynchronous background cleanup of deleted definition
      console.log("[MetafieldDefinition] Waiting 2.5s for Shopify background cleanup...");
      await new Promise((r) => setTimeout(r, 2500));
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

    const createVariables = {
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
    };

    let response = await admin.graphql(createMutation, { variables: createVariables });
    let json = await response.json();
    let userErrors = json?.data?.metafieldDefinitionCreate?.userErrors || [];

    // If taken (Shopify background deletion still finishing up), wait 2.5s and retry
    if (
      userErrors.some(
        (e) =>
          e.code === "TAKEN" ||
          e.message?.toLowerCase().includes("taken") ||
          e.message?.toLowerCase().includes("already exists")
      )
    ) {
      console.log("[MetafieldDefinition] Key taken, waiting 2.5s before retry...");
      await new Promise((r) => setTimeout(r, 2500));
      response = await admin.graphql(createMutation, { variables: createVariables });
      json = await response.json();
      userErrors = json?.data?.metafieldDefinitionCreate?.userErrors || [];
    }

    // If storefront access or pin failed, fallback to basic multi_line_text_field
    if (
      userErrors.length > 0 &&
      userErrors.some((e) => e.field && (e.field.includes("access") || e.field.includes("pin")))
    ) {
      console.warn("[MetafieldDefinition] Retrying with basic definition input without pin/access...");
      response = await admin.graphql(createMutation, {
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
      json = await response.json();
      userErrors = json?.data?.metafieldDefinitionCreate?.userErrors || [];
    }

    if (userErrors.length > 0) {
      // Re-check existing definitions to see if it actually exists as multi_line_text_field now
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

      console.warn("[MetafieldDefinition] Definition creation user errors:", userErrors);
      return {
        success: false,
        needsManualDelete: true,
        currentType: currentDef?.type?.name,
        error: `Definition creation error: ${userErrors.map((e) => e.message).join("; ")}. Please check Shopify Admin → Settings → Custom data → Products.`,
      };
    }

    const created = json?.data?.metafieldDefinitionCreate?.createdDefinition;
    console.log("[MetafieldDefinition] Successfully created multi_line_text_field definition:", created);
    if (shop) verifiedShops.add(shop);
    return { success: true, created, type: "multi_line_text_field" };
  } catch (err) {
    console.error("[MetafieldDefinition] Failed to ensure definition:", err.message);
    return { success: false, error: err.message };
  }
}
