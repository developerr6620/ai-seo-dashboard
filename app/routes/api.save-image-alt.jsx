import { authenticate } from "../shopify.server";
import { fitWords, ALT_MAX } from "../lib/imageAltCopy";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const data = await request.json();

    // Helper to run productUpdateMedia mutation
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

    // 1. Bulk request: { items: [ { productId, media: [ { id, alt } ] } ] }
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
        updatedProductsCount: totalUpdatedProducts,
        updatedImagesCount: totalUpdatedImages,
        errors,
      });
    }

    // 2. Single product update: { productId, media: [ { id, alt } ] } OR { productId, mediaId, altText }
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
