(() => {
  function deliveryUrl(image, transformation) {
    try {
      const url = new URL(image.url);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !image.publicId) return null;
      const pathname = decodeURIComponent(url.pathname);
      const uploadIndex = pathname.indexOf("/image/upload/");
      if (uploadIndex < 0) return null;
      const prefix = pathname.slice(0, uploadIndex + "/image/upload/".length);
      const rest = pathname.slice(prefix.length);
      const assetIndex = rest.lastIndexOf(image.publicId + ".");
      if (assetIndex < 0 || (assetIndex > 0 && rest[assetIndex - 1] !== "/")) return null;
      const asset = rest.slice(assetIndex);
      if (!/\.(?:jpeg|jpg|png|webp|avif)$/i.test(asset)) return null;
      const version = rest.slice(0, assetIndex).match(/(?:^|\/)(v\d+)\/$/)?.[1];
      url.pathname = prefix + [transformation, version, asset].filter(Boolean).join("/");
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch { return null; }
  }
  function thumbnail(image) {
    return deliveryUrl(image, "c_limit,w_420,h_588,q_auto:good,f_auto") || image.url;
  }
  function download(image) {
    const name = String(image.name || "madds-original").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "madds-original";
    return deliveryUrl(image, "fl_attachment:" + name);
  }
  const exports = { thumbnail, download };
  if (typeof module !== "undefined" && module.exports) module.exports = exports;
  else window.MaddsRawImageLibrary = exports;
})();
