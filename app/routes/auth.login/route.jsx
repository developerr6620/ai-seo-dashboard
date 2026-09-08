import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const clone = request.clone();
  try {
    const formData = await clone.formData();
    let shop = formData.get("shop");
    if (shop && typeof shop === "string" && !shop.includes(".")) {
      formData.set("shop", `${shop.trim()}.myshopify.com`);
    }
  } catch (e) {
    // Ignore formData clone issues
  }

  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData || {};

  const handleDomainSubmit = () => {
    let cleanShop = shop.trim();
    if (cleanShop && !cleanShop.includes(".")) {
      cleanShop = `${cleanShop}.myshopify.com`;
      setShop(cleanShop);
    }
  };

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post" onSubmit={handleDomainSubmit}>
          <input type="hidden" name="shop" value={shop.includes(".") ? shop : `${shop}.myshopify.com`} />
          <s-section heading="⚡ Log in to AI SEO Content Master">
            <s-text-field
              name="shop"
              label="Shopify Store Domain"
              details="e.g. develops-test-store.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors?.shop}
            ></s-text-field>
            <s-button type="submit">Log in to Store</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
