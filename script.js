// =================================================================
// AYUDCRAFT - ENHANCED JAVASCRIPT FUNCTIONALITY
// Sistem ulasan lengkap dengan upload Cloudinary dan API integration
// =================================================================

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// =================================================================
// 1. KONFIGURASI & KONSTANTA
// =================================================================
const CONFIG = {
  cloudinary: {
    cloudName: 'daemnvfpi',
    uploadPreset: 'felisa',
    apiKey: '169471696182659'
  },
  api: {
    baseUrl: isLocal 
      ? 'http://localhost:3000/api'
      : 'felisa-adminside.vercel.app/api',
    reviewsEndpoint: '/reviews'
  },
  rating: {
    criteria: {
      B1: { weight: 0.10, name: 'Kualitas Bahan' },
      B2: { weight: 0.30, name: 'Desain & Kreativitas' },
      B3: { weight: 0.15, name: 'Ketepatan Waktu' },
      B4: { weight: 0.40, name: 'Kepuasan Keseluruhan' },
      B5: { weight: 0.05, name: 'Pelayanan Customer Service' }
    }
  },
};

// =================================================================
// 2. STATE MANAGEMENT
// =================================================================
let currentProductId = null;
let currentProductName = null;
let currentRatings = {
  B1: 0, B2: 0, B3: 0, B4: 0, B5: 0
};
let isSubmitting = false;

// =================================================================
// 3. UTILITY FUNCTIONS
// =================================================================

/**
 * Menghitung total score berdasarkan bobot SAW
 * @param {Object} ratings - Rating per kriteria (B1-B5)
 * @returns {number} - Total score (0-100)
 */
function calculateTotalScore(ratings) {
  let totalScore = 0;
  
  Object.keys(CONFIG.rating.criteria).forEach(criteriaKey => {
    const weight = CONFIG.rating.criteria[criteriaKey].weight;
    const rating = ratings[criteriaKey] || 0;
    totalScore += (rating * weight * 20); // *20 untuk konversi ke skala 0-100
  });
  
  return Math.round(totalScore * 100) / 100; // Round ke 2 desimal
}

/**
 * Validasi form sebelum submit
 * @param {Object} formData - Data form yang akan divalidasi
 * @returns {Object} - {isValid: boolean, errors: array}
 */
function validateForm(formData) {
  const errors = [];
  
  // Validasi nama
  if (!formData.reviewerName || formData.reviewerName.trim().length < 2) {
    errors.push('Nama reviewer harus diisi minimal 2 karakter');
  }
  
  // Validasi komentar
  if (!formData.comment || formData.comment.trim().length < 10) {
    errors.push('Komentar harus diisi minimal 10 karakter');
  }
  
  // Validasi rating - semua kriteria harus terisi
  Object.keys(CONFIG.rating.criteria).forEach(criteriaKey => {
    if (!formData.ratings[criteriaKey] || formData.ratings[criteriaKey] < 1) {
      const criteriaName = CONFIG.rating.criteria[criteriaKey].name;
      errors.push(`Rating untuk ${criteriaName} harus diisi`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Menampilkan loading state
 * @param {boolean} show - Show/hide loading
 */
function toggleLoading(show) {
  const submitBtn = document.querySelector('.submit-btn');
  if (!submitBtn) return;
  
  if (show) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Mengirim...</span>';
    submitBtn.style.opacity = '0.7';
  } else {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Kirim Ulasan';
    submitBtn.style.opacity = '1';
  }
}

/**
 * Menampilkan notifikasi
 * @param {string} message - Pesan notifikasi
 * @param {string} type - Type: 'success', 'error', 'info'
 */
function showNotification(message, type = 'info') {
  // Buat elemen notifikasi
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.innerHTML = `
    <div class="notification__content">
      <span class="notification__icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span class="notification__message">${message}</span>
    </div>
  `;
  
  // Tambahkan CSS untuk notifikasi
  const style = document.createElement('style');
  style.textContent = `
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }
    .notification--success { background: #10c065; color: white; }
    .notification--error { background: #ff4757; color: white; }
    .notification--info { background: #3742fa; color: white; }
    .notification__content { display: flex; align-items: center; gap: 10px; }
    .notification.show { transform: translateX(0); }
  `;
  
  if (!document.querySelector('#notification-styles')) {
    style.id = 'notification-styles';
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Animasi masuk
  setTimeout(() => notification.classList.add('show'), 100);
  
  // Hapus setelah 4 detik
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// =================================================================
// 4. CLOUDINARY UPLOAD FUNCTION
// =================================================================

/**
 * Upload file ke Cloudinary
 * @param {File} file - File yang akan diupload
 * @returns {Promise<string>} - URL hasil upload
 */
async function uploadToCloudinary(file) {
  try {
    // Validasi file
    if (!file) {
      throw new Error('No file provided');
    }
    
    // Validasi ukuran file (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size must be less than 5MB');
    }
    
    // Validasi tipe file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('File type not supported. Please use JPEG, PNG, GIF, or WebP');
    }
    
    // Siapkan form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CONFIG.cloudinary.uploadPreset);
    formData.append('folder', 'ayudcraft/avatars'); // Organisasi folder
    
    // Upload ke Cloudinary
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message || 'Upload error');
    }
    
    return result.secure_url;
    
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
}

// =================================================================
// 5. API FUNCTIONS
// =================================================================

/**
 * Mengirim data ulasan ke API
 * @param {Object} reviewData - Data ulasan yang akan dikirim
 * @returns {Promise<Object>} - Response dari API
 */
async function sendReviewToAPI(reviewData) {
  try {
    const response = await fetch(`${CONFIG.api.baseUrl}${CONFIG.api.reviewsEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(reviewData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('API request error:', error);
    throw new Error(`Failed to send review: ${error.message}`);
  }
}

// =================================================================
// 6. RATING SYSTEM
// =================================================================

/**
 * Inisialisasi sistem rating bintang
 * @param {string} criteriaId - ID kriteria (B1-B5)
 */
function initializeStarRating(criteriaId) {
  const starsContainer = document.querySelector(`[data-criteria="${criteriaId}"] .stars`);
  if (!starsContainer) return;
  
  const stars = starsContainer.querySelectorAll('.star');
  
  stars.forEach((star, index) => {
    star.addEventListener('click', () => {
      const rating = index + 1;
      currentRatings[criteriaId] = rating;
      
      // Update visual state
      updateStarDisplay(criteriaId, rating);
      
      console.log(`Rating ${criteriaId}: ${rating}/5`);
    });
    
    // Hover effect
    star.addEventListener('mouseenter', () => {
      const rating = index + 1;
      updateStarDisplay(criteriaId, rating, true);
    });
  });
  
  // Reset hover effect
  starsContainer.addEventListener('mouseleave', () => {
    updateStarDisplay(criteriaId, currentRatings[criteriaId]);
  });
}

/**
 * Update tampilan bintang
 * @param {string} criteriaId - ID kriteria
 * @param {number} rating - Rating yang dipilih
 * @param {boolean} isHover - Apakah sedang hover
 */
function updateStarDisplay(criteriaId, rating, isHover = false) {
  const starsContainer = document.querySelector(`[data-criteria="${criteriaId}"] .stars`);
  if (!starsContainer) return;
  
  const stars = starsContainer.querySelectorAll('.star');
  
  stars.forEach((star, index) => {
    star.classList.remove('selected', 'hover');
    
    if (index < rating) {
      star.classList.add(isHover ? 'hover' : 'selected');
    }
  });
}

// =================================================================
// 7. MODAL SYSTEM
// =================================================================

/**
 * Membuka modal ulasan
 * @param {string} productId - ID produk
 * @param {string} productName - Nama produk
 */
function openReviewModal(productId, productName) {
  currentProductId = productId;
  currentProductName = productName;
  
  // Reset ratings
  currentRatings = { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 };
  
  const modal = document.getElementById('review-modal');
  const modalContent = document.getElementById('modal-content-wrapper');
  
  if (!modal || !modalContent) return;
  
  // Generate form HTML
  modalContent.innerHTML = generateReviewFormHTML(productName);
  
  // Tampilkan modal
  modal.classList.add('active');
  
  // Inisialisasi event listeners
  initializeModalEvents();
}

/**
 * Menutup modal
 */
function closeModal() {
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.classList.remove('active');
    
    // Reset state
    currentProductId = null;
    currentProductName = null;
    currentRatings = { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 };
    isSubmitting = false;
  }
}

/**
 * Generate HTML form ulasan
 * @param {string} productName - Nama produk
 * @returns {string} - HTML string
 */
function generateReviewFormHTML(productName) {
  const criteriaHTML = Object.entries(CONFIG.rating.criteria)
    .map(([key, criteria]) => `
      <div class="criterion" data-criteria="${key}">
        <label>${criteria.name}</label>
        <div class="stars">
          ${Array.from({length: 5}, (_, i) => `<span class="star" data-rating="${i + 1}">★</span>`).join('')}
        </div>
      </div>
    `).join('');
  
  return `
    <button class="modal-close-btn" onclick="closeModal()">&times;</button>
    <div class="review-form-container">
      <h3>Berikan Ulasan untuk ${productName}</h3>
      <form id="feedback-form">
        <div class="form-group">
          <label for="reviewer-name">Nama Anda *</label>
          <input type="text" id="reviewer-name" name="reviewerName" required 
                 placeholder="Masukkan nama Anda" maxlength="100">
        </div>
        
        <div class="form-group">
          <label for="avatar-upload">Foto Profil (Opsional)</label>
          <input type="file" id="avatar-upload" name="avatar" 
                 accept="image/jpeg,image/png,image/gif,image/webp">
          <small style="color: #666;">Max 5MB. Format: JPG, PNG, GIF, WebP</small>
        </div>
        
        <div class="form-group">
          <label>Berikan Rating *</label>
          <div class="criteria-list">
            ${criteriaHTML}
          </div>
        </div>
        
        <div class="form-group">
          <label for="comment">Komentar Anda *</label>
          <textarea id="comment" name="comment" required 
                    placeholder="Ceritakan pengalaman Anda dengan produk ini..." 
                    rows="4" maxlength="500"></textarea>
          <small id="char-count" style="color: #666;">0/500 karakter</small>
        </div>
        
        <button type="submit" class="submit-btn">Kirim Ulasan</button>
      </form>
    </div>
  `;
}

/**
 * Inisialisasi event listeners untuk modal
 */
function initializeModalEvents() {
  // Form submit
  const form = document.getElementById('feedback-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
  
  // Star ratings
  Object.keys(CONFIG.rating.criteria).forEach(criteriaId => {
    initializeStarRating(criteriaId);
  });
  
  // Character counter
  const commentTextarea = document.getElementById('comment');
  const charCount = document.getElementById('char-count');
  if (commentTextarea && charCount) {
    commentTextarea.addEventListener('input', () => {
      const length = commentTextarea.value.length;
      charCount.textContent = `${length}/500 karakter`;
      charCount.style.color = length > 450 ? '#ff4757' : '#666';
    });
  }
  
  // Modal close on overlay click
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  
  // ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

// =================================================================
// 8. MAIN FORM SUBMISSION HANDLER
// =================================================================

/**
 * Handle form submission
 * @param {Event} event - Form submit event
 */
// GANTI SELURUH FUNGSI ANDA DENGAN INI
async function handleSubmit(event) {
  event.preventDefault();
  
  if (isSubmitting) return;
  
  isSubmitting = true;
  toggleLoading(true);
  
  try {
    // Ambil data dari form
    const formData = new FormData(event.target);
    
    // 1. Buat data ulasan dengan avatarUrl di-set ke null pada awalnya
    const reviewData = {
      productId: currentProductId,
      productName: currentProductName,
      reviewerName: formData.get('reviewerName').trim(),
      comment: formData.get('comment').trim(),
      ratings: { ...currentRatings },
      avatarUrl: null, // <-- NILAI AWALNYA KOSONG/NULL
      timestamp: new Date().toISOString()
    };
    
    // Validasi form
    const validation = validateForm(reviewData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('\n'));
    }
    
    // Hitung total score
    reviewData.totalScore = calculateTotalScore(reviewData.ratings);
    
    // 2. Cek apakah ada file yang diunggah
    const avatarFile = formData.get('avatar');
    if (avatarFile && avatarFile.size > 0) {
      showNotification('Mengupload foto profil...', 'info');
      // 3. JIKA ADA, upload dan timpa nilai avatarUrl yang tadinya null
      reviewData.avatarUrl = await uploadToCloudinary(avatarFile);
    }
    
    // Log data untuk debugging
    console.log('Final Review Data to be sent:', reviewData);
    
    // 4. Kirim data yang sudah final ke API
    showNotification('Mengirim ulasan...', 'info');
    const response = await sendReviewToAPI(reviewData);
    
    // Sukses
    console.log('Review submitted successfully:', response);
    showNotification('Ulasan berhasil dikirim! Terima kasih atas feedback Anda.', 'success');
    
    // Tutup modal setelah delay
    setTimeout(() => {
      closeModal();
    }, 2000);
    
  } catch (error) {
    console.error('Submit error:', error);
    showNotification(error.message || 'Terjadi kesalahan saat mengirim ulasan.', 'error');
  } finally {
    isSubmitting = false;
    toggleLoading(false);
  }
}

// =================================================================
// 9. INITIALIZATION
// =================================================================

/**
 * Inisialisasi aplikasi
 */
function initializeApp() {
  // Event listeners untuk tombol produk
  document.querySelectorAll('.bucket-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const productId = btn.dataset.productId;
      const productName = btn.dataset.productName;
      
      if (productId && productName) {
        openReviewModal(productId, productName);
      }
    });
  });
  
  console.log('AyudCraft Enhanced JavaScript initialized successfully!');
}

// =================================================================
// 10. GLOBAL FUNCTIONS (untuk akses dari HTML)
// =================================================================

// Expose functions globally
window.openReviewModal = openReviewModal;
window.closeModal = closeModal;
window.handleSubmit = handleSubmit;
window.uploadToCloudinary = uploadToCloudinary;
window.calculateTotalScore = calculateTotalScore;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// =================================================================
// 11. ADDITIONAL ENHANCEMENTS
// =================================================================

/**
 * Fungsi untuk menampilkan preview avatar
 */
function setupAvatarPreview() {
  const avatarInput = document.getElementById('avatar-upload');
  if (!avatarInput) return;
  
  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validasi ukuran
    if (file.size > 5 * 1024 * 1024) {
      showNotification('Ukuran file terlalu besar. Maksimal 5MB.', 'error');
      e.target.value = '';
      return;
    }
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      // Tambahkan preview image jika belum ada
      let preview = document.getElementById('avatar-preview');
      if (!preview) {
        preview = document.createElement('img');
        preview.id = 'avatar-preview';
        preview.style.cssText = 'width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-top: 10px; border: 2px solid var(--primary-color);';
        avatarInput.parentNode.appendChild(preview);
      }
      preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Setup preview setelah modal dibuka
const originalOpenReviewModal = window.openReviewModal;
window.openReviewModal = function(productId, productName) {
  originalOpenReviewModal(productId, productName);
  
  // Setup preview setelah modal terbuka
  setTimeout(() => {
    setupAvatarPreview();
  }, 100);
};

// =================================================================
// 12. ERROR HANDLING & RECOVERY
// =================================================================

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  if (isSubmitting) {
    showNotification('Terjadi kesalahan sistem. Silakan coba lagi.', 'error');
    isSubmitting = false;
    toggleLoading(false);
  }
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  if (isSubmitting) {
    showNotification('Terjadi kesalahan jaringan. Silakan coba lagi.', 'error');
    isSubmitting = false;
    toggleLoading(false);
  }
});

console.log('🚀 AyudCraft Enhanced JavaScript loaded successfully!');
console.log('📊 Rating system with SAW method ready');
console.log('☁️ Cloudinary integration ready');
console.log('🔗 API integration ready');

// =================================================================
// 13. GET INITIAL + API REVIEW
// =================================================================

function getInitials(fullName) {
    if (!fullName) return '';
    const names = fullName.split(' ');
    let initials = '';
    for (let i = 0; i < names.length; i++) {
        if (names.length > 0 && names [i]) {
            initials += names [i].charAt(0).toUpperCase();
        }
        if (initials.length >= 2) break; // Ambil maksimal 2 inisial
    }
    return initials;
}

// Fungsi untuk memuat testimoni dari API
async function loadTestimonials() {
    const testimonialContainer = document.querySelector('#testimonials .scroller__inner');
    if (!testimonialContainer) return; // Hentikan jika kontainer tidak ditemukan

    try {
        // Panggil API yang sudah kita buat
        const response = await fetch('http://localhost:3000/api/reviews/public');
        if (!response.ok) {
            throw new Error('Gagal memuat data testimoni');
        }

        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            let testimonialsHTML = '';
            
            // Buat HTML untuk setiap testimoni
            result.data.forEach(review => {
                const starCount = Math.round(review.total_score / 20);
                let starsHTML = '';
                for (let i = 0; i < 5; i++) {
                    starsHTML += i < starCount ? '★' : '☆';
                }

                testimonialsHTML += `
                    <article class="testimonial-card">
                        <figure>
                            <blockquote><p>"${review.comment}"</p></blockquote>
                          <figcaption>
                              ${(review.avatar_url && review.avatar_url.startsWith('http')) ? 
                                  // JIKA avatar_url ADA dan dimulai dengan 'http'
                                  `<img src="${review.avatar_url}" alt="Avatar ${review.reviewer_name}" />` : 
                                  // JIKA TIDAK, tampilkan inisial
                                  `<div class="avatar-initial">${getInitials(review.reviewer_name)}</div>`
                              }
                              <span>${review.reviewer_name}</span>
                          </figcaption>
                        </figure>
                        <div class="testimonial-card__rating">${starsHTML}</div>
                    </article>
                `;
            });
            
            // Tampilkan HTML di kontainer
            testimonialContainer.innerHTML = testimonialsHTML;

            // Duplikasi konten agar animasi scroll berjalan mulus (sesuai CSS Anda)
            const clonedContent = testimonialContainer.cloneNode(true);
            testimonialContainer.parentElement.appendChild(clonedContent);

        } else {
            testimonialContainer.innerHTML = '<p style="text-align:center;">Belum ada testimoni.</p>';
        }

    } catch (error) {
        console.error('Error:', error);
        testimonialContainer.innerHTML = '<p style="text-align:center;">Gagal memuat testimoni.</p>';
    }
}

// Panggil fungsi saat halaman selesai dimuat
document.addEventListener('DOMContentLoaded', loadTestimonials);