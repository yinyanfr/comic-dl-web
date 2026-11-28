// Install before HydratedRouter starts manifest discovery, navigation or fetcher
// requests. Only the server's explicit auth response triggers a document login.
export function installAuthRedirect() {
  const originalFetch = window.fetch.bind(window);
  let redirecting = false;
  document.addEventListener("submit", (event) => {
    if (
      event.target instanceof HTMLFormElement &&
      new URL(event.target.action).pathname === "/auth/logout"
    ) {
      // Logout closes SSE before its document response arrives. Let the form's
      // own redirect win over the resulting background authentication probe.
      redirecting = true;
    }
  });
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = new URL(response.url, window.location.href);
    if (
      url.origin === window.location.origin &&
      response.status === 401 &&
      response.headers.get("X-Comic-Dl-Auth") === "required"
    ) {
      if (!redirecting) {
        redirecting = true;
        const next = location.pathname + location.search + location.hash;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      }
      // A document navigation is underway. Do not let React Router replace the
      // page with an error boundary before the login document arrives.
      return new Promise<Response>(() => {});
    }
    return response;
  };
}
