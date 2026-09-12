'use strict';

// Only these destinations may be opened by the renderer, never arbitrary URLs.
// The support link remains the original author's; this fork keeps attribution
// while its code/releases links point at the Pre-SR project.
const links = Object.freeze({
  github: 'https://github.com/DoubleSixun/DLSS5-PreSR-Swapper',
  releases: 'https://github.com/DoubleSixun/DLSS5-PreSR-Swapper/releases/latest',
  coffee: 'https://buymeacoffee.com/rakanki911'
});
function projectUrl(key) {
  return typeof key === 'string' && Object.hasOwn(links, key) ? links[key] : null;
}
module.exports = { links, projectUrl };
