import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/auth/callback${url.search}`);
};

export default function ApiAuth() {
  return null;
}
