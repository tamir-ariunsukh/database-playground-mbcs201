/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },

  /*
   * Next.js 16 нь Turbopack-ийг default bundler болгосон.
   * alasql нь сонголтоор react-native модулиудыг шаарддаг — эдгээр нь
   * Flow синтакс ашигладаг тул browser build-д орох боломжгүй.
   */
  turbopack: {
    resolveAlias: {
      'react-native': './empty-module.js',
      'react-native-fs': './empty-module.js',
      'react-native-sqlite-storage': './empty-module.js',
      'react-native-fetch-blob': './empty-module.js',
    },
  },

  // Webpack fallback (next build --webpack)
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': false,
      'react-native-fs$': false,
      'react-native-sqlite-storage$': false,
      'react-native-fetch-blob$': false,
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true }

    /*
     * ⚠️ `mingo/init/system` нь SIDE-EFFECT module — тэр нь зөвхөн
     * бүх pipeline operator-ийг ($group, $sort, $lookup, ...)
     * бүртгэж, ямар ч export буцаадаггүй.
     *
     * Webpack нь production build-д "usedExports" болон
     * "sideEffects" дүрмээр модулийг ашиглагдаагүй гэж үзээд
     * хаяж болно. Ингэвэл `$group` нь "unregistered pipeline
     * operator" алдаа өгнө. `sideEffects: true` нь тухайн
     * модулийг ЗААВАЛ ачаалахыг хэлнэ.
     */
    config.module = config.module ?? { rules: [] }
    config.module.rules = config.module.rules ?? []
    config.module.rules.push({
      test: /mingo[\\/](esm|cjs)[\\/]init[\\/]system\.js$/,
      sideEffects: true,
    })

    return config
  },
}

export default nextConfig
