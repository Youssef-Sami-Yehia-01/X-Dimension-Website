import './globals.css'

export const metadata = {
  title: 'X-Dimension — Reality, Captured',
  description:
    'X-Dimension turns Egypt’s built world into millimetre-accurate data. ' +
    '3D laser scanning, Scan-to-BIM, heritage documentation and as-built drawings, from Cairo.',
  icons: { icon: '/logo-white.svg' },
  openGraph: {
    title: 'X-Dimension — Reality, Captured',
    description: 'Laser scanning & BIM engineering for Egypt’s built world.',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Space Grotesk loaded at runtime via CDN — keeps the production
            build from depending on Google Fonts being reachable at build time
            (a common cause of failed Vercel builds). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
