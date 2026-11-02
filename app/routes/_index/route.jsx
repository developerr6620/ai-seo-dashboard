import { redirect } from "react-router";
import { useEffect } from "react";
import { landingHtml } from "./landingHtml";

/**
 * Root Route:
 * - When accessed from inside Shopify Admin (has ?shop, ?host, ?embedded, ?id_token),
 *   seamlessly forwards to the embedded App Dashboard (/app).
 * - When visited directly in a web browser (https://seooptimizer.zooq.app/),
 *   serves the complete feature showcase website with the interactive "Install App" popup modal.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If inside Shopify Admin, send directly to the executive dashboard
  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded") ||
    url.searchParams.get("id_token")
  ) {
    return redirect(`/app${url.search}`);
  }

  // Standalone browser visitor -> serve full website with install popup
  return new Response(landingHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};

export default function LandingPage() {
  useEffect(() => {
    // Client-side fallback script initialization
    const modal = document.getElementById("installModal");
    const closeBtn = document.getElementById("closeInstallModal");
    const form = document.getElementById("installModalForm");
    const input = document.getElementById("modalShopDomain");
    const errorEl = document.getElementById("modalInstallError");

    function openModal() {
      if (!modal) return;
      modal.style.display = "flex";
      requestAnimationFrame(() => modal.classList.add("is-open"));
      if (input) setTimeout(() => input.focus(), 150);
      document.body.style.overflow = "hidden";
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove("is-open");
      setTimeout(() => {
        modal.style.display = "none";
        if (errorEl) errorEl.style.display = "none";
        document.body.style.overflow = "";
      }, 250);
    }

    const installBtns = document.querySelectorAll(".open-install-modal");
    installBtns.forEach((btn) => btn.addEventListener("click", openModal));

    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const onBackdropClick = (e) => {
      if (e.target === modal) closeModal();
    };
    if (modal) modal.addEventListener("click", onBackdropClick);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && modal && modal.classList.contains("is-open")) {
        closeModal();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const onSubmit = (e) => {
      e.preventDefault();
      if (errorEl) errorEl.style.display = "none";

      const raw = (input ? input.value : "").trim().toLowerCase();
      if (!raw) {
        if (errorEl) {
          errorEl.textContent = "Please enter your Shopify store domain.";
          errorEl.style.display = "block";
        }
        return;
      }

      let clean = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!clean.includes(".")) {
        clean = `${clean}.myshopify.com`;
      }

      if (!clean.includes(".myshopify.com")) {
        if (errorEl) {
          errorEl.textContent = "Please enter a valid myshopify.com domain (e.g. your-store.myshopify.com).";
          errorEl.style.display = "block";
        }
        return;
      }

      window.location.href = `/auth/login?shop=${encodeURIComponent(clean)}`;
    };

    if (form) form.addEventListener("submit", onSubmit);

    // FAQ Accordion
    const faqQuestions = document.querySelectorAll(".faq-question");
    const onFaqClick = function () {
      const parent = this.parentElement;
      const wasActive = parent.classList.contains("active");
      document.querySelectorAll(".faq-item").forEach((i) => i.classList.remove("active"));
      if (!wasActive) parent.classList.add("active");
    };
    faqQuestions.forEach((q) => q.addEventListener("click", onFaqClick));

    return () => {
      installBtns.forEach((btn) => btn.removeEventListener("click", openModal));
      if (closeBtn) closeBtn.removeEventListener("click", closeModal);
      if (modal) modal.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeyDown);
      if (form) form.removeEventListener("submit", onSubmit);
      faqQuestions.forEach((q) => q.removeEventListener("click", onFaqClick));
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: landingHtml }} />;
}
