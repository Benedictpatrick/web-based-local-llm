import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://navoai.space";
const SITE_TITLE = "Navo AI: Private Offline AI Assistant";
const SITE_DESCRIPTION =
  "Navo AI, founded by Benedict Patrick and Saidharshan, is a private, offline AI assistant that runs entirely in your browser: no server, no signup, no internet needed after setup. Chat, run code, and download open models like Llama, Gemma, and Qwen.";
const FOUNDERS = [
  { "@type": "Person", name: "Benedict Patrick" },
  { "@type": "Person", name: "Saidharshan" },
];

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Navo AI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any modern web browser",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: FOUNDERS,
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Navo AI",
  url: SITE_URL,
  logo: `${SITE_URL}/navo-wordmark.png`,
  founder: FOUNDERS,
  sameAs: ["https://github.com/Benedictpatrick/Web-based-local-OfflineLLM"],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Navo AI",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Navo AI",
  keywords: [
    "Navo AI",
    "Navo",
    "offline AI",
    "offline AI assistant",
    "offline AI chat",
    "private AI assistant",
    "on device AI",
    "local AI chat",
    "AI study assistant",
    "run AI without internet",
    "browser based AI chat",
    "who founded Navo AI",
    "Navo AI founders",
    "Benedict Patrick Saidharshan",
  ],
  authors: [{ name: "Benedict Patrick" }, { name: "Saidharshan" }],
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Navo AI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#212121" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Warms the connection to the model-download hosts before the user
       * even opens the model picker, so the first download request doesn't
       * pay for DNS + TLS negotiation. */}
      <link rel="preconnect" href="https://huggingface.co" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://raw.githubusercontent.com" crossOrigin="anonymous" />
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        {/* Applied before first paint so an explicit Light/Dark choice doesn't
         * flash the system-preference theme first. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('navo-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
