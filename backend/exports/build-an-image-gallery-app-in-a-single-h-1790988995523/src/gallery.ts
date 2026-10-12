import './lightbox.css';

function filterImagesByTag(tags: string[], images: { id: number; src: string; tags: string[] }[]): { id: number; src: string; tags: string[] }[] {
  return images.filter(img => tags.every(tag => img.tags.includes(tag)));
}

function openLightbox(imgData: { id: number; src: string; tags: string[] }): void {
  const lightbox = document.createElement('div');
  lightbox.classList.add('lightbox');
  lightbox.innerHTML = `<img src="${imgData.src}" onclick="closeLightbox();">`;
  document.body.appendChild(lightbox);
}

function closeLightbox(): void {
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    document.body.removeChild(lightbox);
  }
}

export { filterImagesByTag, openLightbox, closeLightbox };