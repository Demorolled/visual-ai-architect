export function filterImagesByTag(images: { id: number, src: string, tags: string[] }, tag: string): { id: number, src: string }[] {
  return images.filter(img => img.tags.includes(tag)).map(img => ({ id: img.id, src: img.src }));
}

export function openLightbox(imageId: number, images: { id: number, src: string }[]): void {
  const clickedImage = images.find(img => img.id === imageId);
  if (clickedImage) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    const img = document.createElement('img');
    img.src = clickedImage.src;
    img.className = 'lightbox-image';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => closeLightbox(lightbox);
    lightbox.appendChild(closeBtn);
    lightbox.appendChild(img);
    document.body.appendChild(lightbox);
  }
}

export function closeLightbox(lightbox: HTMLDivElement): void {
  lightbox.remove();
}