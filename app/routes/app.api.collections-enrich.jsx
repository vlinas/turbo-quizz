import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * POST action — fetches first 20 products for each collection ID
 * Called from the AI wizard after merchant picks collections.
 */
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const collectionIds = JSON.parse(formData.get("collectionIds") || "[]");

  if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
    return json({ collections: [] });
  }

  const results = await Promise.all(
    collectionIds.map(async (gid) => {
      try {
        const response = await admin.graphql(
          `#graphql
          query CollectionProducts($id: ID!) {
            collection(id: $id) {
              id
              title
              handle
              image { url }
              products(first: 20, sortKey: BEST_SELLING) {
                edges {
                  node {
                    title
                    description
                    tags
                    priceRangeV2 { minVariantPrice { amount } }
                    featuredImage { url }
                  }
                }
              }
            }
          }`,
          { variables: { id: gid } }
        );

        const data = await response.json();
        const col = data?.data?.collection;
        if (!col) return null;

        return {
          id: gid,
          title: col.title,
          handle: col.handle || "",
          image: col.image?.url || null,
          products: col.products.edges.map(({ node: p }) => ({
            title: p.title,
            description: (p.description || "").substring(0, 150),
            tags: p.tags || [],
            image: p.featuredImage?.url || null,
            price: p.priceRangeV2?.minVariantPrice?.amount || "0",
          })),
        };
      } catch (err) {
        console.error("[collections-enrich] Error for", gid, err.message);
        return null;
      }
    })
  );

  return json({ collections: results.filter(Boolean) });
}
