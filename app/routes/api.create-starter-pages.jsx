import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json().catch(() => ({}));
    const storeName = data.storeName || "Our Store";

    if (data.resourceType === "article") {
      // Find or create default blog
      const blogsRes = await admin.graphql(
        `#graphql
        query getBlogs {
          blogs(first: 1) {
            edges {
              node {
                id
                title
              }
            }
          }
        }`
      );
      const blogsData = await blogsRes.json();
      let blogId = blogsData?.data?.blogs?.edges?.[0]?.node?.id;

      if (!blogId) {
        const createBlogRes = await admin.graphql(
          `#graphql
          mutation createBlog($blog: BlogCreateInput!) {
            blogCreate(blog: $blog) {
              blog {
                id
              }
              userErrors {
                message
              }
            }
          }`,
          { variables: { blog: { title: "News" } } }
        );
        const createBlogJson = await createBlogRes.json();
        blogId = createBlogJson?.data?.blogCreate?.blog?.id;
      }

      if (!blogId) {
        return Response.json({ success: false, error: "Could not create or find blog" }, { status: 400 });
      }

      const articleRes = await admin.graphql(
        `#graphql
        mutation createArticle($article: ArticleCreateInput!) {
          articleCreate(article: $article) {
            article {
              id
              title
              handle
              summary
              blog {
                title
              }
              seo {
                title
                description
              }
            }
            userErrors {
              message
            }
          }
        }`,
        {
          variables: {
            article: {
              blogId,
              title: `${storeName} Guide: Top Trends & Essential Advice`,
              body: `<p>Welcome to our official store blog! In this post, we share our favorite tips, product recommendations, and expert advice from the <strong>${storeName}</strong> team.</p>`,
              summary: `Essential tips, styling guides, and buying advice from ${storeName}.`,
              isPublished: true,
              seo: {
                title: `${storeName} Guide: Top Trends & Tips`,
                description: `Discover top buyer tips, product guides, and insider advice from the experts at ${storeName}.`,
              },
            },
          },
        }
      );

      const articleJson = await articleRes.json();
      const userErrors = articleJson?.data?.articleCreate?.userErrors || [];
      if (userErrors.length > 0) {
        return Response.json({ success: false, error: userErrors.map((e) => e.message).join(", ") });
      }

      const createdArticle = articleJson?.data?.articleCreate?.article;
      return Response.json({
        success: true,
        createdCount: 1,
        articles: [
          {
            id: createdArticle.id,
            title: createdArticle.title,
            handle: createdArticle.handle,
            summary: createdArticle.summary || "",
            blogTitle: createdArticle.blog?.title || "News",
            seoTitle: createdArticle.seo?.title || "",
            seoDescription: createdArticle.seo?.description || "",
            hasCustomSeoTitle: true,
          },
        ],
      });
    }

    const starterPages = [
      {
        title: "About Us",
        body: `<p>Welcome to <strong>${storeName}</strong>! We are dedicated to providing high-quality products and an exceptional shopping experience for our customers. Our team is passionate about craftsmanship, reliability, and delivering value to our community.</p>`,
        seo: {
          title: `About Us | ${storeName}`,
          description: `Learn about ${storeName}, our brand story, mission, and our commitment to providing top quality products.`,
        },
      },
      {
        title: "Contact Us",
        body: `<p>Have questions about your order, shipping, or our products? We're here to help! Please reach out to our customer support team and we will get back to you within 24–48 business hours.</p>`,
        seo: {
          title: `Contact Us | Customer Support | ${storeName}`,
          description: `Have questions? Contact the customer support team at ${storeName} for fast, friendly assistance.`,
        },
      },
      {
        title: "Frequently Asked Questions (FAQ)",
        body: `<p>Find quick answers to common questions regarding shipping times, tracking your order, return policies, and payment options at <strong>${storeName}</strong>.</p>`,
        seo: {
          title: `FAQ - Frequently Asked Questions | ${storeName}`,
          description: `Find quick answers to common questions about shipping, returns, tracking, and ordering from ${storeName}.`,
        },
      },
      {
        title: "Privacy Policy",
        body: `<p>At <strong>${storeName}</strong>, we respect your privacy and are committed to protecting any personal information you share with us. This policy outlines how we collect, use, and protect your data.</p>`,
        seo: {
          title: `Privacy Policy | ${storeName}`,
          description: `Read the official Privacy Policy for ${storeName}. Learn how we protect your personal information and ensure secure shopping.`,
        },
      },
    ];

    let createdCount = 0;
    const errors = [];
    const createdPages = [];

    for (const pageInput of starterPages) {
      try {
        const res = await admin.graphql(
          `#graphql
          mutation createPage($page: PageCreateInput!) {
            pageCreate(page: $page) {
              page {
                id
                title
                handle
                bodySummary
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
              page: {
                title: pageInput.title,
                body: pageInput.body,
                isPublished: true,
                seo: pageInput.seo,
              },
            },
          }
        );

        const resJson = await res.json();
        const userErrors = resJson?.data?.pageCreate?.userErrors || [];
        if (userErrors.length > 0) {
          errors.push({
            title: pageInput.title,
            error: userErrors.map((e) => e.message).join(", "),
          });
        } else if (resJson?.data?.pageCreate?.page) {
          createdCount++;
          createdPages.push(resJson.data.pageCreate.page);
        }
      } catch (err) {
        errors.push({ title: pageInput.title, error: err.message });
      }
    }

    return Response.json({
      success: createdCount > 0,
      createdCount,
      pages: createdPages,
      errors,
    });
  } catch (error) {
    console.error("Create starter pages error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
