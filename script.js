const gallery = document.querySelector('.gallery');
const lightbox = document.querySelector('.lightbox');
const lightboxImg = lightbox.querySelector('.lightbox-img');
const lightboxTitle = lightbox.querySelector('.lightbox-text h2');
const lightboxDesc = lightbox.querySelector('.lightbox-text p');
const lightboxTech = lightbox.querySelector('.lightbox-text .tech-stack');
const close = document.querySelector('.close');
const prev = document.querySelector('.prev');
const next = document.querySelector('.next');
let currentIndex = 0;
const galleryItems = document.querySelectorAll('.gallery-item');

gallery.addEventListener('click', (e) => {
    const galleryItem = e.target.closest('.gallery-item');
    if (galleryItem) {
        lightbox.classList.add('active');
        currentIndex = Array.from(galleryItems).indexOf(galleryItem);
        updateLightbox();
    }
});

function updateLightbox() {
    const currentItem = galleryItems[currentIndex];
    lightboxImg.src = currentItem.querySelector('img').src;
    const details = currentItem.querySelector('.item-details');
    lightboxTitle.textContent = details.querySelector('h1').textContent;
    lightboxDesc.textContent = details.querySelector('p').textContent;
    lightboxTech.textContent = details.querySelector('.tech-stack').textContent;
}

close.addEventListener('click', () => {
    lightbox.classList.remove('active');
});

prev.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
    updateLightbox();
});

next.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % galleryItems.length;
    updateLightbox();
});

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        lightbox.classList.remove('active');
    }
});
