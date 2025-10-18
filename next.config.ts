import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // 為 Electron 打包設置正確的資源路徑
  assetPrefix: './',
  basePath: '',
};

export default nextConfig;