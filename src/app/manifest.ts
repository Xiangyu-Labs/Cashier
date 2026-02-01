import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Cashier - AI 记账助手',
        short_name: 'Cashier',
        description: 'AI 驱动的智能记账工具',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#10a37f',
        icons: [
            {
                src: '/icon.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icon.png',
                sizes: '512x512',
                type: 'image/png',
            },
            {
                src: '/apple-icon.png',
                sizes: '180x180',
                type: 'image/png',
            },
        ],
    }
}
