// PWA manifest — makes the app installable from the browser (a soft launch
// channel before the Capacitor store builds, which will reuse these assets).
export default function manifest() {
  return {
    name: 'Προσφορές Παντού',
    short_name: 'Προσφορές',
    description: 'Όλες οι προσφορές σούπερ μάρκετ σε ένα μέρος — σύγκρινε τιμές και γλίτωσε χρήματα.',
    start_url: '/',
    display: 'standalone',
    lang: 'el',
    background_color: '#F4F9F2',
    theme_color: '#0F5132',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
