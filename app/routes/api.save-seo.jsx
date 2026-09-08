import { authenticate } from "../shopify.server";
import { enforceSeoLimits } from "../lib/seoCopy";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const data = await request.json();

    // Check if this is a bulk request
    if (Array.isArray(data.items)) {
      const items = data.items;
      let successCount = 0;
      const errors = [];

      for (const item of items) {
        if (!item.productId || !item.seoTitle) continue;
        const limited = enforceSeoLimits({
          title: item.seoTitle,
          description: item.seoDescription || "",
        });

        try {
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
          } else {
            successCount++;
          }
        } catch (e) {
          errors.push({
            productId: item.productId,
            error: e.message || "Failed to update",
          });
        }
      }

      return Response.json({
        success: true,
        updatedCount: successCount,
        errors,
      });
    }

    // Single product update
    const { productId, seoTitle, seoDescription } = data;

    if (!productId || !seoTitle) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const limited = enforceSeoLimits({ title: seoTitle, description: seoDescription });

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

    return Response.json({
      success: true,
      product: responseJson?.data?.productUpdate?.product,
    });
  } catch (err) {
    console.error("API update error:", err);
    return Response.json({ success: false, error: String(err.message || "GraphQL update failed") }, { status: 500 });
  }
};
