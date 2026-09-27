// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { passthroughImageService } from 'astro/config';

import mdx from '@astrojs/mdx';
import { serverHelpers } from 'astro/runtime/client/dev-toolbar/helpers.js';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.hypernova.fi',
  base: '/',
  trailingSlash: 'always',
  build: {
    inlineStylesheets: 'always'
  },
  image: {
    service: passthroughImageService(),
    domains: ['i.pravatar.cc']
  },
  redirects: {
    "/lainuri-self-checkout-machine/": "/lainuri-checkout-machine/",
    "/fi/lainuri-lainausautomaatti/": "/lainuri-checkout-machine/?l=fi",
  },
  vite: {
    plugins: [tailwindcss()]
  },
  output: 'server',
  integrations: [mdx()],
  server: {
    allowedHosts: ['homepagenew.lxd']
  },
  fonts: [  
    {
      provider: fontProviders.local(),
      name: "OCR-A",
      cssVariable: "--font-ocra",
      formats: ["woff2"],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/ocra.woff2'],
            weight: 'normal',
            style: 'normal'
          }
        ]
      }
    }
  ]
});
