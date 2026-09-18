// In-memory cache of verified owner types per shop: Map<shopDomain, Set<ownerType>>
const verifiedOwners = new Map();

export function clearVerifiedShops(shop = "") {
  if (shop) verifiedOwners.delete(shop);
  else verifiedOwners.clear();
}

/**
 * Creates or verifies a single Metafield Definition for a given ownerType (COLLECTION, PAGE, ARTICLE).
 */
export async function ensureDefinitionForType(admin, ownerType, shop = "", force = false) {
  if (shop && !force && verifiedOwners.get(shop)?.has(ownerType)) {
    return { success: true, cached: true };
  }

  try {
    const checkQuery = `#graphql
      query GetDefinitions($ownerType: MetafieldOwnerType!) {
        metafieldDefinitions(first: 50, ownerType: $ownerType) {
          edges {
            node {
              id
              name
              namespace
              key
              pinnedPosition
              type { name }
            }
          }
        }
      }
    `;

    const checkRes = await admin.graphql(checkQuery, { variables: { ownerType } });
    const checkJson = await checkRes.json();
    const edges = checkJson?.data?.metafieldDefinitions?.edges || [];
    const exists = edges.find((e) => e.node?.namespace === "seo" && e.node?.key === "keywords");

    if (exists) {
      if (shop) {
        if (!verifiedOwners.has(shop)) verifiedOwners.set(shop, new Set());
        verifiedOwners.get(shop).add(ownerType);
      }
      return { success: true, alreadyExisted: true, id: exists.node?.id };
    }

    const createMutation = `#graphql
      mutation CreateDef($definition: MetafieldDefinitionInput!) {
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

    // Attempt 1: Full definition with pin & storefront access
    let createRes = await admin.graphql(createMutation, {
      variables: {
        definition: {
          name: "Target SEO Keywords",
          namespace: "seo",
          key: "keywords",
          description: "Comma-separated target search keywords for SEO",
          ownerType,
          type: "multi_line_text_field",
          pin: true,
          access: {
            storefront: "PUBLIC_READ",
          },
        },
      },
    });
    let createJson = await createRes.json();
    let userErrors = createJson?.data?.metafieldDefinitionCreate?.userErrors || [];

    // Attempt 2: Without storefront access if not supported on this ownerType
    if (userErrors.length > 0) {
      console.warn(`[MetafieldDefinition] Retrying ${ownerType} definition without storefront access...`);
      createRes = await admin.graphql(createMutation, {
        variables: {
          definition: {
            name: "Target SEO Keywords",
            namespace: "seo",
            key: "keywords",
            description: "Comma-separated target search keywords for SEO",
            ownerType,
            type: "multi_line_text_field",
            pin: true,
          },
        },
      });
      createJson = await createRes.json();
      userErrors = createJson?.data?.metafieldDefinitionCreate?.userErrors || [];
    }

    // Attempt 3: Basic definition without pin
    if (userErrors.length > 0) {
      console.warn(`[MetafieldDefinition] Retrying ${ownerType} definition basic...`);
      createRes = await admin.graphql(createMutation, {
        variables: {
          definition: {
            name: "Target SEO Keywords",
            namespace: "seo",
            key: "keywords",
            description: "Comma-separated target search keywords for SEO",
            ownerType,
            type: "multi_line_text_field",
          },
        },
      });
      createJson = await createRes.json();
      userErrors = createJson?.data?.metafieldDefinitionCreate?.userErrors || [];
    }

    if (userErrors.length > 0) {
      console.warn(`[MetafieldDefinition] All creation attempts failed for ${ownerType}:`, JSON.stringify(userErrors));
      return { success: false, errors: userErrors };
    }

    const created = createJson?.data?.metafieldDefinitionCreate?.createdDefinition;
    console.log(`[MetafieldDefinition] Successfully created ${ownerType} definition:`, created);

    if (shop) {
      if (!verifiedOwners.has(shop)) verifiedOwners.set(shop, new Set());
      verifiedOwners.get(shop).add(ownerType);
    }

    return { success: true, created };
  } catch (err) {
    console.error(`[MetafieldDefinition] Error ensuring definition for ${ownerType}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Ensures the "Target SEO Keywords" Product Metafield Definition
 * is created as multi_line_text_field and pinned in the merchant's Shopify store.
 * Also runs self-healing migration if an old conflicting list definition exists,
 * and ensures COLLECTION, PAGE, and ARTICLE definitions are created.
 */
export async function ensureKeywordsMetafieldDefinition(admin, shop = "", force = false) {
  // 1. Ensure definitions for COLLECTION, PAGE, ARTICLE
  for (const owner of ["COLLECTION", "PAGE", "ARTICLE"]) {
    await ensureDefinitionForType(admin, owner, shop, force);
  }

  // 2. Ensure PRODUCT definition with self-healing check
  if (shop && !force && verifiedOwners.get(shop)?.has("PRODUCT")) {
    return { success: true, cached: true };
  }

  try {
    const checkQuery = `#graphql
      query GetProductMetafieldDefinitions {
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

    const existingSeo = edges.find(
      (e) => e.node?.namespace === "seo" && e.node?.key === "keywords"
    )?.node;

    const existingByName = edges.find(
      (e) => e.node?.name === "Target SEO Keywords" && !(e.node?.namespace === "seo" && e.node?.key === "keywords")
    )?.node;

    // If seo.keywords already exists and is multi_line_text_field, we are golden!
    if (existingSeo && existingSeo.type?.name === "multi_line_text_field") {
      if (shop) {
        if (!verifiedOwners.has(shop)) verifiedOwners.set(shop, new Set());
        verifiedOwners.get(shop).add("PRODUCT");
      }
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
        `[MetafieldDefinition] Found conflicting product definition "${def.namespace}.${def.key}" (Type: "${def.type?.name}"). Deleting...`
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
          error: `Your Shopify store has an existing '${def.type?.name || "Single line list"}' definition for Target SEO Keywords (${def.namespace}.${def.key}) that Shopify locked from automatic API deletion. In Shopify Admin: go to Settings → Custom data → Products → click "${def.name}" → click Delete.`,
        };
      }
    }

    if (toDelete.length > 0) {
      await new Promise((r) => setTimeout(r, 2500));
    }

    // Create the multi_line_text_field definition for PRODUCT
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

    if (
      userErrors.some(
        (e) =>
          e.code === "TAKEN" ||
          e.message?.toLowerCase().includes("taken") ||
          e.message?.toLowerCase().includes("already exists")
      )
    ) {
      await new Promise((r) => setTimeout(r, 2500));
      response = await admin.graphql(createMutation, { variables: createVariables });
      json = await response.json();
      userErrors = json?.data?.metafieldDefinitionCreate?.userErrors || [];
    }

    if (
      userErrors.length > 0 &&
      userErrors.some((e) => e.field && (e.field.includes("access") || e.field.includes("pin")))
    ) {
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
      const recheckRes = await admin.graphql(checkQuery);
      const recheckJson = await recheckRes.json();
      const recheckEdges = recheckJson?.data?.metafieldDefinitions?.edges || [];
      const currentDef = recheckEdges.find(
        (e) => e.node?.namespace === "seo" && e.node?.key === "keywords"
      )?.node;

      if (currentDef?.type?.name === "multi_line_text_field") {
        if (shop) {
          if (!verifiedOwners.has(shop)) verifiedOwners.set(shop, new Set());
          verifiedOwners.get(shop).add("PRODUCT");
        }
        return { success: true, alreadyExisted: true, id: currentDef.id, type: "multi_line_text_field" };
      }

      return {
        success: false,
        error: `Product definition creation error: ${userErrors.map((e) => e.message).join("; ")}`,
      };
    }

    const created = json?.data?.metafieldDefinitionCreate?.createdDefinition;
    console.log("[MetafieldDefinition] Successfully created product definition:", created);
    if (shop) {
      if (!verifiedOwners.has(shop)) verifiedOwners.set(shop, new Set());
      verifiedOwners.get(shop).add("PRODUCT");
    }
    return { success: true, created, type: "multi_line_text_field" };
  } catch (err) {
    console.error("[MetafieldDefinition] Failed to ensure product definition:", err.message);
    return { success: false, error: err.message };
  }
}
