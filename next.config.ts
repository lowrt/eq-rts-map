import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  // Electron 需要使用相對路徑
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
  images: {
    unoptimized: true,
  },
  // 確保 trailing slash 為 false
  trailingSlash: false,
  // 為 Electron 優化
  distDir: 'out',
  // 建置優化設定
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  // 優化 bundle 大小
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-slot'],
  },
  // Webpack 優化
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 優化客戶端 bundle
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              enforce: true,
            },
          },
        },
      }
    }
    return config
  },
}

export default nextConfig
