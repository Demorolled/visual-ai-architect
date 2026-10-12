import { filterImagesByTag, openLightbox, closeLightbox } from './gallery';

function handleFilterChange(event: Event): void {
  const selectedTags = (event.target as HTMLSelectElement).value.split(',').map(tag => tag.trim());
  const gallery = document.getElementById('gallery') as HTMLDivElement;
  gallery.innerHTML = '';
  filterImagesByTag(selectedTags, images)
    .forEach(img => {
      const imgElement = document.createElement('img');
      imgElement.src = img.src;
      imgElement.onclick = () => openLightbox(img);
      gallery.appendChild(imgElement);
    });
}

function handleClickOutside(event: Event): void {
  if (event.target === lightbox) {
    closeLightbox();
  }
}

declare const images: { src: string, tags: string[] }[];
declare const filterImagesByTag: (tags: string[], images: { src: string, tags: string[] }[]) => { src: string, tags: string[] }[];
declare const openLightbox: (imgData: { src: string, tags: string[] }) => void;
declare const closeLightbox: () => void;
declare const lightbox: HTMLDivElement;

export function setupImageGallery(): void {
  const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
  filterSelect.onchange = handleFilterChange;
  window.onclick = handleClickOutside;
}