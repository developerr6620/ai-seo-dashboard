import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const data = await request.json();
    const { productId, seoTitle, seoDescription } = data;

    if (!productId || !seoTitle) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

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
              title: seoTitle,
              description: seoDescription,
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
