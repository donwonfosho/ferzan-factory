import "@/lib/factory/buffer-polyfill";
import "@/lib/zod-config";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { PrivyRoot } from "@/components/factory/privy-root";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Shell } from "@/components/factory/shell";
import appCss from "../styles.css?url";
import { LangRoot } from "@/components/factory/lang";

const APP_NAME = "Ferzan Factory";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Ferzan Factory. Launch a coin and trade the curve. Telegram bots for trading, launches, and chat.",
      },
      { name: "theme-color", content: "#000000" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap",
        media: "print",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: Root,
});

function Root() {
  const embed = useRouterState({ select: (s) => s.location.pathname.startsWith("/embed/") });
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.querySelectorAll('link[rel=stylesheet][media=print]').forEach(function(l){l.media='all'})",
          }}
        />
        {embed ? (
          <LangRoot>
            <main className="bg-bg p-2 text-fg">
              <Outlet />
            </main>
          </LangRoot>
        ) : (
          <>
            <PreviewHostBridge />
            <AuthProvider>
              <PrivyRoot>
                <LangRoot>
                  <Shell>
                    <Outlet />
                  </Shell>
                </LangRoot>
              </PrivyRoot>
            </AuthProvider>
          </>
        )}
        <Scripts />
      </body>
    </html>
  );
}
