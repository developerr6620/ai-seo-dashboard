/**
 * Shopify API helper functions for pagination and data fetching
 */

/**
 * Fetch all products using pagination
 * @param {Object} admin - Shopify admin API client
 * @param {Number} batchSize - Number of products per page (default: 250)
 * @returns {Promise<Array>} - Array of all products
 */
export async function fetchAllProducts(admin, batchSize = 250) {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              description
              status
              featuredImage {
                url
                altText
              }
              seo {
                title
                description
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = {
      first: batchSize,
      after: cursor,
    };

    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    const products = data?.data?.products?.edges || [];
    const pageInfo = data?.data?.products?.pageInfo || {};

    // Extract products and add to array
    allProducts = [...allProducts, ...products.map((edge) => edge.node)];

    // Check if there are more pages
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;

    // Safety limit to prevent infinite loops
    if (allProducts.length > 10000) {
      console.warn("Reached safety limit of 10,000 products");
      break;
    }
  }

  return allProducts;
}

/**
 * Fetch products with pagination for UI components
 * @param {Object} admin - Shopify admin API client
 * @param {Number} page - Page number (1-based)
 * @param {Number} perPage - Products per page (default: 250)
 * @returns {Promise<Object>} - Object with products and pagination info
 */
export async function fetchPaginatedProducts(admin, page = 1, perPage = 250) {
  const query = `
    query getProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            description
            status
            featuredImage {
              url
              altText
            }
            seo {
              title
              description
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          endCursor
          startCursor
        }
      }
    }
  `;

  // For simplicity, we'll fetch in batches until we reach the desired page
  // This is not the most efficient but works with GraphQL cursors
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  let currentPage = 1;
  let targetPageProducts = [];
  let pageInfo = {};

  while (hasNextPage && currentPage <= page) {
    const response = await admin.graphql(query, {
      variables: { first: perPage, after: cursor },
    });
    const data = await response.json();

    const products = data?.data?.products?.edges || [];
    pageInfo = data?.data?.products?.pageInfo || {};

    if (currentPage === page) {
      targetPageProducts = products.map((edge) => edge.node);
    } else {
      allProducts = [...allProducts, ...products.map((edge) => edge.node)];
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
    currentPage++;

    // Safety limit
    if (allProducts.length + targetPageProducts.length > 10000) {
      console.warn("Reached safety limit");
      break;
    }
  }

  return {
    products: targetPageProducts,
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      hasPreviousPage: page > 1,
      currentPage: page,
      perPage,
      totalFetched: allProducts.length + targetPageProducts.length,
    },
  };
}

/**
 * Get total product count
 * @param {Object} admin - Shopify admin API client
 * @returns {Promise<Number>} - Total number of products
 */
export async function getTotalProductCount(admin) {
  const query = `
    query getProductCount {
      productsCount {
        count
      }
    }
  `;

  const response = await admin.graphql(query);
  const data = await response.json();
  return data?.data?.productsCount?.count || 0;
}