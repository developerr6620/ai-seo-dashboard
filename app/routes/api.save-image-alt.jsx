import { authenticate } from "../shopify.server";
import { fitWords, ALT_MAX } from "../lib/imageAltCopy";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const data = await request.json();
    const resourceType = data.resourceType || (data.collectionId ? "collection" : data.fileId || data.files ? "file" : "product");

    // ==========================================
    // 1. STORE FILES (Content -> Files)
    // ==========================================
    if (resourceType === "file") {
      let filesToUpdate = [];
      if (Array.isArray(data.files)) {
        filesToUpdate = data.files.map((f) => ({
          id: f.id,
          alt: fitWords(f.alt || "", ALT_MAX),
        }));
      } else if (data.fileId) {
        filesToUpdate = [{ id: data.fileId, alt: fitWords(data.altText || "", ALT_MAX) }];
      }

      if (filesToUpdate.length === 0) {
        return Response.json({ success: false, error: "No files provided to update" }, { status: 400 });
      }

      const fileMutation = `#graphql
        mutation updateFileAlt($files: [FileUpdateInput!]!) {
          fileUpdate(files: $files) {
            files {
              id
              alt
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;

      const res = await admin.graphql(fileMutation, {
        variables: { files: filesToUpdate },
      });
      const resJson = await res.json();
      const userErrors = resJson?.data?.fileUpdate?.userErrors || [];

      if (userErrors.length > 0) {
        const errorMsg = userErrors.map((e) => e.message).join("; ");
        return Response.json({ success: false, error: errorMsg }, { status: 422 });
      }

      const updated = resJson?.data?.fileUpdate?.files || [];
      return Response.json({
        success: true,
        resourceType: "file",
        updatedCount: updated.length,
        files: updated,
      });
    }

    // ==========================================
    // 2. COLLECTION BANNERS
    // ==========================================
    if (resourceType === "collection") {
      let collectionsToUpdate = [];
      if (Array.isArray(data.items)) {
        collectionsToUpdate = data.items;
      } else if (data.collectionId) {
        collectionsToUpdate = [{ id: data.collectionId, altText: data.altText, imageUrl: data.imageUrl || data.url }];
      }

      if (collectionsToUpdate.length === 0) {
        return Response.json({ success: false, error: "No collections provided to update" }, { status: 400 });
      }

      const colMutation = `#graphql
        mutation updateCollectionImageAlt($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              image {
                altText
              }
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `;

      let updatedCount = 0;
      const errors = [];

      for (const col of collectionsToUpdate) {
        const alt = fitWords(col.altText || col.alt || "", ALT_MAX);
        const numericId = (col.id || "").replace(/\D/g, "");
        let savedSuccess = false;
        let lastError = null;

        // Clean image URL if provided (strip query parameters like ?v=...)
        const rawUrl = col.imageUrl || col.url || col.src || "";
        const cleanUrl = rawUrl ? rawUrl.split("?")[0] : "";

        // Attempt 1: Try GraphQL collectionUpdate with cleaned URL
        if (cleanUrl) {
          try {
            const input = {
              id: col.id.startsWith("gid://") ? col.id : `gid://shopify/Collection/${col.id}`,
              image: {
                altText: alt,
                src: cleanUrl,
              },
            };
            const res = await admin.graphql(colMutation, { variables: { input } });
            const resJson = await res.json();
            const userErrors = resJson?.data?.collectionUpdate?.userErrors || [];

            if (userErrors.length === 0 && resJson?.data?.collectionUpdate?.collection) {
              savedSuccess = true;
              updatedCount++;
            } else if (userErrors.length > 0) {
              lastError = userErrors.map((e) => e.message).join("; ");
              console.warn(`[SaveImageAlt] GraphQL collectionUpdate failed for ${col.id}: ${lastError}`);
            }
          } catch (e) {
            lastError = e.message;
            console.warn(`[SaveImageAlt] GraphQL collectionUpdate exception for ${col.id}:`, e.message);
          }
        }

        // Attempt 2: Fallback to Shopify REST Admin API (custom_collections or smart_collections)
        // REST directly updates the image's alt property without re-downloading or re-processing the image asset
        if (!savedSuccess && numericId && session?.shop && session?.accessToken) {
          try {
            // First try custom_collections endpoint
            const restUrlCustom = `https://${session.shop}/admin/api/2025-01/custom_collections/${numericId}.json`;
            const customRes = await fetch(restUrlCustom, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": session.accessToken,
              },
              body: JSON.stringify({
                custom_collection: {
                  id: Number(numericId),
                  image: {
                    alt: alt,
                  },
                },
              }),
            });

            if (customRes.ok) {
              savedSuccess = true;
              updatedCount++;
            } else if (customRes.status === 404) {
              // 404 means this is a smart (automated) collection; update via smart_collections endpoint
              const restUrlSmart = `https://${session.shop}/admin/api/2025-01/smart_collections/${numericId}.json`;
              const smartRes = await fetch(restUrlSmart, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": session.accessToken,
                },
                body: JSON.stringify({
                  smart_collection: {
                    id: Number(numericId),
                    image: {
                      alt: alt,
                    },
                  },
                }),
              });

              if (smartRes.ok) {
                savedSuccess = true;
                updatedCount++;
              } else {
                const errText = await smartRes.text();
                lastError = `REST smart_collection failed (${smartRes.status}): ${errText}`;
                console.error(`[SaveImageAlt] REST smart_collections error for ${col.id}:`, lastError);
              }
            } else {
              const errText = await customRes.text();
              lastError = `REST custom_collection failed (${customRes.status}): ${errText}`;
              console.error(`[SaveImageAlt] REST custom_collections error for ${col.id}:`, lastError);
            }
          } catch (restErr) {
            lastError = `REST exception: ${restErr.message}`;
            console.error(`[SaveImageAlt] REST exception for ${col.id}:`, restErr);
          }
        }

        if (!savedSuccess) {
          errors.push({ id: col.id, error: lastError || "Failed to update collection banner ALT text" });
        }
      }

      return Response.json({
        success: updatedCount > 0,
        resourceType: "collection",
        updatedCount,
        failedCount: errors.length,
        errors,
      });
    }

    // ==========================================
    // 3. PRODUCT IMAGES (Existing)
    // ==========================================
    const updateProductMediaAlt = async (productId, mediaItems) => {
      if (!productId || !Array.isArray(mediaItems) || mediaItems.length === 0) {
        return { success: false, error: "Missing productId or media items" };
      }

      const formattedMedia = mediaItems
        .filter((m) => m && m.id)
        .map((m) => ({
          id: m.id,
          alt: fitWords(m.alt || "", ALT_MAX),
        }));

      if (formattedMedia.length === 0) {
        return { success: true, updatedCount: 0 };
      }

      const mutation = `#graphql
        mutation updateMediaAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            media {
              id
              alt
            }
            mediaUserErrors {
              code
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation, {
        variables: {
          productId,
          media: formattedMedia,
        },
      });

      const resJson = await response.json();
      const mediaUserErrors = resJson?.data?.productUpdateMedia?.mediaUserErrors || [];

      if (mediaUserErrors.length > 0) {
        const errorMsg = mediaUserErrors.map((e) => e.message).join("; ");
        return { success: false, error: errorMsg };
      }

      const updatedMedia = resJson?.data?.productUpdateMedia?.media || [];
      return { success: true, updatedCount: updatedMedia.length, media: updatedMedia };
    };

    // Bulk product request
    if (Array.isArray(data.items)) {
      let totalUpdatedImages = 0;
      let totalUpdatedProducts = 0;
      const errors = [];

      for (const item of data.items) {
        try {
          const res = await updateProductMediaAlt(item.productId, item.media);
          if (res.success) {
            totalUpdatedImages += res.updatedCount;
            totalUpdatedProducts++;
          } else {
            errors.push({
              productId: item.productId,
              error: res.error,
            });
          }
        } catch (itemErr) {
          errors.push({
            productId: item.productId,
            error: itemErr.message || "Failed to update product media",
          });
        }
      }

      return Response.json({
        success: totalUpdatedProducts > 0 || errors.length === 0,
        resourceType: "product",
        updatedProductsCount: totalUpdatedProducts,
        updatedImagesCount: totalUpdatedImages,
        errors,
      });
    }

    // Single product update
    const productId = data.productId;
    let mediaItems = [];

    if (Array.isArray(data.media)) {
      mediaItems = data.media;
    } else if (data.mediaId) {
      mediaItems = [{ id: data.mediaId, alt: data.altText || "" }];
    }

    if (!productId || mediaItems.length === 0) {
      return Response.json(
        { success: false, error: "Product ID and media items are required" },
        { status: 400 }
      );
    }

    const singleResult = await updateProductMediaAlt(productId, mediaItems);
    if (!singleResult.success) {
      return Response.json({ success: false, error: singleResult.error }, { status: 422 });
    }

    return Response.json({
      success: true,
      resourceType: "product",
      updatedCount: singleResult.updatedCount,
      media: singleResult.media,
    });
  } catch (err) {
    console.error("[SaveImageAlt] API Error:", err);
    return Response.json(
      { success: false, error: err.message || "Internal server error updating media alt text" },
      { status: 500 }
    );
  }
};
