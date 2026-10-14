/** @type {import('next').NextConfig} */
const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'}
];
const nextConfig={
  poweredByHeader:false,
  experimental:{serverActions:{bodySizeLimit:'1mb'}},
  async headers(){return [{source:'/:path*',headers:securityHeaders}];}
};
export default nextConfig;
