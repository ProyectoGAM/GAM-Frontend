// Leaflet 1.9 ships ESM JavaScript without a module entry or declarations at that path.
// Reuse the installed @types contract; only the runtime import changes.
declare module 'leaflet/dist/leaflet-src.esm.js' {
  export * from 'leaflet';
}
