import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  async redirects() {
    return [
      // each section opens on its hands-on tab
      { source: "/rag", destination: "/rag/chat", permanent: false },
      { source: "/agent", destination: "/agent/demo", permanent: false },
      // the pages before the /rag merge
      { source: "/chat", destination: "/rag/chat", permanent: true },
      { source: "/overview", destination: "/rag/overview", permanent: true },
    ];
  },
};

export default nextConfig;
