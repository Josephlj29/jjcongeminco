// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Habilitar importaciones de módulos ESM del workspace
  transpilePackages: ["@congeminco/shared"],
};

// En desarrollo, integrar el adaptador Cloudflare para emular el entorno Workers
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = await import(
    "@opennextjs/cloudflare"
  );
  await initOpenNextCloudflareForDev();
}

export default nextConfig;
