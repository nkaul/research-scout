/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }, ...['/login', '/account'].map(source => ({
      source,
      // GIS validates the site origin; never send the path or query to Google.
      headers: [{ key: 'Referrer-Policy', value: 'strict-origin' }],
    }))];
  },
  async rewrites() {
    const api = (process.env.SCOUT_API_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
