/**
 * Filters a list of images by a specific tag.
 *
 * @param images - An array of image objects, each with an id, src, and tags array.
 * @param tag - The tag to filter by.
 * @returns An array of image objects that contain the specified tag.
 */
export function filterImagesByTag(images: { id: number, src: string, tags: string[] }[], tag: string): { id: number, src: string }[] {
  return images.filter((img) => img.tags.includes(tag)).map((img) => ({ id: img.id, src: img.src }));
}

/**
 * Opens a lightbox with the specified image.
 *
 * @param imageId - The ID of the image to open in the lightbox.
 * @param images - An array of image objects.
 */
export function openLightbox(imageId: number, images: { id: number, src: string }[]): void {
  const clickedImage = images.find((img) => img.id === imageId);
  if (!clickedImage) {
    return;
  }

  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  const img = document.createElement('img');
  img.src = clickedImage.src;
  img.className = 'lightbox-image';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => {
    if (lightbox.parentElement) {
      lightbox.parentElement.removeChild(lightbox);
    }
  };
  lightbox.appendChild(closeBtn);
  lightbox.appendChild(img);
  document.body.appendChild(lightbox);
}

/**
 * Closes the lightbox.
 */
export function closeLightbox(): void {
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    if (lightbox.parentElement) {
      lightbox.parentElement.removeChild(lightbox);
    }
  }
}