// Code snippets storage
let codeSnippets = [];

// Hide content feature variables
let unlockedSnippets = new Set(); // Track which snippets are unlocked in this session
let decryptedContent = new Map(); // Cache decrypted content

// Auto-update variables
let autoUpdateInterval = null;
let lastUpdateHash = null;

// ===== Server-Side Encryption/Decryption Functions =====

// Legacy XOR decryption for backward compatibility with old encrypted content
function legacyDecrypt(encryptedText, password) {
    try {
        let key = password;
        while (key.length < 256) {
            key += password;
        }
        const encrypted = atob(encryptedText);
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            decrypted += String.fromCharCode(charCode);
        }
        return decodeURIComponent(decrypted);
    } catch (e) {
        return null;
    }
}

// Encrypt content using server-side API (AES-256-GCM)
async function encryptContent(text, password) {
    try {
        const response = await fetch('/.netlify/functions/crypto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'encrypt',
                content: text,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            console.error('Encryption failed:', data.error);
            return null;
        }
        
        return data.encrypted;
    } catch (e) {
        console.error('Encryption error:', e);
        return null;
    }
}

// Decrypt content using server-side API (with fallback to legacy XOR)
async function decryptContent(encryptedText, password) {
    // Guard against empty content
    if (!encryptedText || encryptedText.trim() === '') {
        console.error('Cannot decrypt: content is empty');
        return null;
    }
    
    // First, try server-side AES decryption
    try {
        const response = await fetch('/.netlify/functions/crypto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'decrypt',
                content: encryptedText,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return data.decrypted;
        }
    } catch (e) {
        console.error('Server decryption error:', e);
    }
    
    // Fallback to legacy XOR decryption for old content
    const legacyResult = legacyDecrypt(encryptedText, password);
    if (legacyResult) {
        return legacyResult;
    }
    
    return null;
}

// DOM elements
const searchInput = document.getElementById('searchInput');
const passwordInput = document.getElementById('passwordInput');
const titleInput = document.getElementById('titleInput');
const codeInput = document.getElementById('codeInput');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');
const hideContentToggle = document.getElementById('hideContentToggle');

// Content type management
let selectedFile = null;
let selectedContentType = 'text';

// Content type selector handler
document.querySelectorAll('input[name="contentType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        selectedContentType = e.target.value;
        updateInputVisibility();
    });
});

// File select button handler
fileSelectBtn.addEventListener('click', () => {
    fileInput.click();
});

// File input handler
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
        filePreview.style.display = 'block';
        
        if (file.type.startsWith('image/')) {
            filePreview.innerHTML = `
                <div class="file-preview-container">
                    <img src="${event.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px;">
                    <p>📁 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                    <button type="button" onclick="clearFileSelection()" class="btn-clear-file">✕ Remove</button>
                </div>
            `;
        } else if (file.type === 'application/pdf') {
            filePreview.innerHTML = `
                <div class="file-preview-container">
                    <p>📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                    <button type="button" onclick="clearFileSelection()" class="btn-clear-file">✕ Remove</button>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.style.display = 'none';
    filePreview.innerHTML = '';
}

function updateInputVisibility() {
    if (selectedContentType === 'text') {
        codeInput.style.display = 'block';
        fileUploadArea.style.display = 'none';
        clearFileSelection();
    } else {
        codeInput.style.display = 'none';
        fileUploadArea.style.display = 'block';
        fileInput.accept = selectedContentType === 'image' ? 'image/*' : '.pdf';
    }
}

// Initialize app
initializeApp();

// Add event listener for Add button
addBtn.addEventListener('click', addCode);

// Add event listener for search input
searchInput.addEventListener('input', renderCodeList);

// Pause auto-update when user is typing
[passwordInput, titleInput, codeInput].forEach(input => {
    input.addEventListener('input', pauseAutoUpdateTemporarily);
});

// Add event listener for Enter key in password (Enter to focus on title)
passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.focus();
    }
});

// Add event listener for Enter key in title (Enter to focus on code)
titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        codeInput.focus();
    }
});

// Add event listener for Enter key (Ctrl/Cmd + Enter to add)
codeInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        addCode();
    }
});

// Add code function
async function addCode() {
    const password = passwordInput.value.trim();
    const title = titleInput.value.trim();
    const hideContent = hideContentToggle.checked;
    
    if (password === '') {
        alert('Please enter a password!');
        passwordInput.focus();
        return;
    }
    
    if (title === '') {
        alert('Please enter a title!');
        titleInput.focus();
        return;
    }
    
    let content = '';
    let contentType = selectedContentType;
    
    // Handle different content types
    if (contentType === 'text') {
        const code = codeInput.value.trim();
        if (code === '') {
            alert('Please enter some text/code!');
            codeInput.focus();
            return;
        }
        content = code;
    } else if (contentType === 'image' || contentType === 'pdf') {
        if (!selectedFile) {
            alert('Please select a file!');
            return;
        }
        
        // Read file as base64
        try {
            content = await readFileAsBase64(selectedFile);
        } catch (error) {
            alert('Failed to read file!');
            return;
        }
    }
    
    // Encrypt content if hidden (using server-side encryption)
    let finalContent = content;
    if (hideContent) {
        addBtn.disabled = true;
        addBtn.textContent = 'Encrypting...';
        finalContent = await encryptContent(content, password);
        addBtn.disabled = false;
        addBtn.textContent = 'Add Snippet';
        
        if (!finalContent) {
            alert('Failed to encrypt content!');
            return;
        }
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        contentType: contentType,
        content: finalContent,
        fileName: selectedFile ? selectedFile.name : null,
        fileType: selectedFile ? selectedFile.type : null,
        password: password,
        timestamp: new Date().toLocaleString(),
        hidden: hideContent,
        isEncrypted: hideContent
    };
    
    // Save to database (files uploaded to Supabase Storage)
    try {
        addBtn.disabled = true;
        addBtn.textContent = contentType === 'text' ? 'Saving...' : 'Uploading...';
        
        const response = await fetch('/.netlify/functions/save-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippet: snippet })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save');
        }
        
        const result = await response.json();
        
        // Add saved snippet to local array (with storage path if file)
        const savedSnippet = result.snippet || snippet;
        codeSnippets.unshift(savedSnippet);
        
    } catch (error) {
        alert('⚠️ Failed to save to database. Please try again.');
        addBtn.disabled = false;
        addBtn.textContent = 'Add Snippet';
        return;
    }
    
    addBtn.disabled = false;
    addBtn.textContent = 'Add Snippet';
    
    // Reset form
    passwordInput.value = '';
    titleInput.value = '';
    codeInput.value = '';
    hideContentToggle.checked = false;
    clearFileSelection();
    document.querySelector('input[name="contentType"][value="text"]').checked = true;
    selectedContentType = 'text';
    updateInputVisibility();
    passwordInput.focus();
    
    renderCodeList();
}

// Helper function to read file as base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Delete code function
async function deleteCode(id) {
    // Use loose comparison (==) to match both string and number types
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        alert('❌ Snippet not found!');
        return;
    }
    
    const enteredPassword = prompt('Enter password to delete this snippet:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        alert('❌ Incorrect password! Cannot delete snippet.');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to delete this snippet? This action cannot be undone.')) {
        return;
    }
    
    // Delete from database (and storage if file)
    try {
        const response = await fetch(`/.netlify/functions/save-data?id=${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete from database');
        }
        
        // Remove from local array
        codeSnippets = codeSnippets.filter(s => s.id != id);
        
        // Remove from unlocked cache if present
        unlockedSnippets.delete(id);
        decryptedContent.delete(id);
        
        // Update GUI
        renderCodeList();
        
        // Show success feedback
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:10000;font-family:Arial,sans-serif;';
        tempDiv.textContent = '✓ Snippet deleted!';
        document.body.appendChild(tempDiv);
        setTimeout(() => tempDiv.remove(), 2000);
        
    } catch (error) {
        alert('⚠️ Failed to delete from database. Please try again.');
    }
}

// Copy to clipboard function
async function copyToClipboard(id, button) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        alert('❌ Snippet not found!');
        return;
    }
    
    // Use content property or fallback to code for backward compatibility
    let contentToCopy = snippet.content || snippet.code || '';
    
    // Check if snippet is encrypted and needs decryption
    if (snippet.isEncrypted) {
        // Check if already decrypted in cache (snippet is unlocked)
        if (decryptedContent.has(id)) {
            contentToCopy = decryptedContent.get(id);
        } else {
            // Need password to decrypt
            const enteredPassword = prompt('🔒 Enter password to copy:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                alert('❌ Incorrect password! Cannot copy content.');
                return;
            }
            
            // Try to decrypt with the correct password (server-side)
            button.textContent = '⏳ Decrypting...';
            const decrypted = await decryptContent(contentToCopy, enteredPassword);
            if (!decrypted) {
                button.textContent = '📋 Copy';
                alert('❌ Failed to decrypt content!');
                return;
            }
            
            contentToCopy = decrypted;
            // Don't cache it since we're not unlocking the view
        }
    }
    
    navigator.clipboard.writeText(contentToCopy).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        alert('Failed to copy to clipboard');
    });
}

// Download file function (for images and PDFs)
async function downloadFile(id) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        alert('❌ Snippet not found!');
        return;
    }
    
    // Check if snippet is encrypted and needs decryption
    if (snippet.isEncrypted) {
        // Check if already decrypted in cache
        if (decryptedContent.has(id)) {
            const fileContent = decryptedContent.get(id);
            downloadBase64File(fileContent, snippet.fileName || `file-${snippet.id}`);
            return;
        } else {
            // Need password to decrypt
            const enteredPassword = prompt('🔒 Enter password to download:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                alert('❌ Incorrect password! Cannot download file.');
                return;
            }
            
            // If file is in storage, download and decrypt
            if (snippet.storagePath) {
                const loadingDiv = document.createElement('div');
                loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
                loadingDiv.textContent = '📥 Downloading encrypted file...';
                document.body.appendChild(loadingDiv);
                
                try {
                    const response = await fetch(`/.netlify/functions/get-data?id=${id}&getContent=true`);
                    if (!response.ok) {
                        loadingDiv.remove();
                        alert('❌ Failed to download encrypted file');
                        return;
                    }
                    
                    const data = await response.json();
                    const rawContent = data.content;
                    
                    if (!rawContent) {
                        loadingDiv.remove();
                        alert('❌ No encrypted content found');
                        return;
                    }
                    
                    loadingDiv.textContent = '🔓 Decrypting...';
                    
                    const decrypted = await decryptContent(rawContent, enteredPassword);
                    loadingDiv.remove();
                    
                    if (!decrypted) {
                        alert('❌ Failed to decrypt file!');
                        return;
                    }
                    
                    // Cache decrypted content
                    decryptedContent.set(id, decrypted);
                    downloadBase64File(decrypted, snippet.fileName || `file-${snippet.id}`);
                    return;
                } catch (e) {
                    loadingDiv.remove();
                    alert('❌ Failed to download file: ' + e.message);
                    return;
                }
            }
            
            // Try to decrypt from content (text/inline)
            const rawContent = snippet.content || snippet.code || '';
            const decrypted = await decryptContent(rawContent, enteredPassword);
            if (!decrypted) {
                alert('❌ Failed to decrypt file!');
                return;
            }
            
            downloadBase64File(decrypted, snippet.fileName || `file-${snippet.id}`);
            return;
        }
    }
    
    // If file is in Supabase Storage, get signed URL and download
    if (snippet.storagePath) {
        try {
            const response = await fetch(`/.netlify/functions/get-data?id=${id}&getUrl=true`);
            if (!response.ok) throw new Error('Failed to get file URL');
            
            const data = await response.json();
            if (data.fileUrl) {
                // Fetch the file and trigger download
                const fileResponse = await fetch(data.fileUrl);
                const blob = await fileResponse.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = snippet.fileName || `file-${snippet.id}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return;
            }
        } catch (error) {
            alert('❌ Failed to download file. Please try again.');
            return;
        }
    }
    
    // Fallback: use content directly (base64)
    const fileContent = snippet.content || snippet.code || '';
    downloadBase64File(fileContent, snippet.fileName || `file-${snippet.id}`);
}

// Helper to download base64 content
function downloadBase64File(base64Content, fileName) {
    const link = document.createElement('a');
    link.href = base64Content;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Render code list
function renderCodeList() {
    if (codeSnippets.length === 0) {
        codeList.innerHTML = '<div class="empty-state">No snippets yet. Add your first snippet above!</div>';
        return;
    }
    
    // Get search query
    const searchQuery = searchInput.value.trim().toLowerCase();
    
    // Filter snippets based on search query
    // Supports: title, date, or both with + (e.g. "report + jan" matches title AND date)
    let filteredSnippets = codeSnippets;
    
    if (searchQuery !== '') {
        // Check if using AND operator (+)
        if (searchQuery.includes('+')) {
            const terms = searchQuery.split('+').map(t => t.trim()).filter(t => t !== '');
            filteredSnippets = codeSnippets.filter(snippet => {
                const title = snippet.title.toLowerCase();
                const timestamp = (snippet.timestamp || '').toLowerCase();
                const combined = title + ' ' + timestamp;
                // All terms must match somewhere in title or timestamp
                return terms.every(term => combined.includes(term));
            });
        } else {
            // Simple OR search (matches title OR timestamp)
            filteredSnippets = codeSnippets.filter(snippet => 
                snippet.title.toLowerCase().includes(searchQuery) ||
                (snippet.timestamp && snippet.timestamp.toLowerCase().includes(searchQuery))
            );
        }
    }
    
    // Check if no results found
    if (filteredSnippets.length === 0) {
        codeList.innerHTML = '<div class="no-results">No snippets found matching your search.</div>';
        return;
    }
    
    codeList.innerHTML = filteredSnippets.map(snippet => {
        // Support both old 'code' and new 'content' properties
        const contentType = snippet.contentType || 'text';
        const rawContent = snippet.content || snippet.code || '';
        const hasStoragePath = !!snippet.storagePath;
        
        // Highlight search term in title
        const highlightedTitle = searchQuery === ''
            ? escapeHtml(snippet.title)
            : highlightText(escapeHtml(snippet.title), searchQuery);
        
        // Determine if content should be protected
        const isProtected = snippet.hidden && !unlockedSnippets.has(snippet.id);
        
        // Get the display content (decrypted if unlocked, encrypted if locked)
        let displayContent = rawContent;
        if (snippet.isEncrypted && unlockedSnippets.has(snippet.id)) {
            displayContent = decryptedContent.get(snippet.id) || rawContent;
        }
        
        // Check if file URL is loaded (for Supabase Storage files)
        const fileUrl = snippet.fileUrl || displayContent;
        
        // Render content based on type
        let contentHtml = '';
        const contentClass = isProtected ? 'snippet-content protected' : 'snippet-content';
        
        // Check if we have decrypted content cached for this snippet
        const hasDecryptedContent = decryptedContent.has(snippet.id);
        
        if (contentType === 'image') {
            if (isProtected) {
                contentHtml = `<div class="snippet-content protected">
                    <div style="font-size: 48px; margin-bottom: 10px;">🖼️</div>
                    <div>🔒 Image is hidden</div>
                </div>`;
            } else if (hasDecryptedContent) {
                // Decrypted content is available (for encrypted files)
                contentHtml = `<div class="snippet-content">
                    <img src="${displayContent}" alt="${escapeHtml(snippet.fileName || 'Image')}" style="max-width: 100%; border-radius: 8px;">
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            } else if (hasStoragePath && !snippet.fileUrl) {
                // File stored in Supabase Storage - auto-load for non-encrypted, show loading
                contentHtml = `<div class="snippet-content" data-snippet-id="${snippet.id}" data-auto-load="true">
                    <div style="font-size: 48px; margin-bottom: 10px;">🖼️</div>
                    <div class="loading-text">⏳ Loading image...</div>
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            } else {
                contentHtml = `<div class="snippet-content">
                    <img src="${fileUrl}" alt="${escapeHtml(snippet.fileName || 'Image')}" style="max-width: 100%; border-radius: 8px;">
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            }
        } else if (contentType === 'pdf') {
            if (isProtected) {
                contentHtml = `<div class="snippet-content protected">
                    <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <div>🔒 PDF is hidden</div>
                </div>`;
            } else if (hasDecryptedContent) {
                // Decrypted PDF content available
                contentHtml = `<div class="snippet-content">
                    <div class="pdf-container">
                        <embed src="${displayContent}" type="application/pdf" width="100%" height="400px" />
                        <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                    </div>
                </div>`;
            } else if (hasStoragePath && !snippet.fileUrl) {
                // File stored in Supabase Storage - auto-load for non-encrypted, show loading
                contentHtml = `<div class="snippet-content" data-snippet-id="${snippet.id}" data-auto-load="true">
                    <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <div class="loading-text">⏳ Loading PDF...</div>
                    <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                </div>`;
            } else {
                contentHtml = `<div class="snippet-content">
                    <div class="pdf-container">
                        <embed src="${fileUrl}" type="application/pdf" width="100%" height="400px" />
                        <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                    </div>
                </div>`;
            }
        } else {
            // Text/code content
            if (isProtected) {
                contentHtml = `<div class="code-content protected">🔒 Content is hidden</div>`;
            } else {
                contentHtml = `<div class="code-content">${escapeHtml(displayContent)}</div>`;
            }
        }
        
        // Create eye button for hidden content
        let eyeButton = '';
        if (snippet.hidden) {
            if (isProtected) {
                eyeButton = `<button class="eye-unlock-btn" data-action="unlock" data-id="${snippet.id}">
                    <span class="eye-text">🔓 Unlock</span>
                </button>`;
            } else {
                eyeButton = `<button class="eye-unlock-btn" data-action="lock" data-id="${snippet.id}">
                    <span class="eye-text">🔒 Hide</span>
                </button>`;
            }
        }
        
        // Content type badge
        let typeBadge = '';
        if (contentType === 'image') {
            typeBadge = '<span class="type-badge">🖼️ Image</span>';
        } else if (contentType === 'pdf') {
            typeBadge = '<span class="type-badge">📄 PDF</span>';
        } else {
            typeBadge = '<span class="type-badge">📝 Text</span>';
        }
        
        // Action buttons
        let actionButtons = '';
        if (contentType === 'text') {
            actionButtons = `<button class="btn btn-copy" data-action="copy" data-id="${snippet.id}">
                📋 Copy
            </button>`;
        } else {
            actionButtons = `<button class="btn btn-download" data-action="download" data-id="${snippet.id}">
                💾 Download
            </button>`;
        }
        
        return `
            <div class="code-item" data-snippet-id="${snippet.id}">
                <div class="snippet-header">
                    <div class="code-title">${highlightedTitle}</div>
                    ${typeBadge}
                </div>
                <div class="timestamp">Added: ${snippet.timestamp}</div>
                <div class="code-content-wrapper">
                    ${eyeButton}
                    ${contentHtml}
                </div>
                <div class="code-actions">
                    ${actionButtons}
                    <button class="btn btn-delete" data-action="delete" data-id="${snippet.id}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Auto-load files that need URLs (non-encrypted files in storage)
    autoLoadFiles();
}

// Auto-load file URLs for non-encrypted files
async function autoLoadFiles() {
    const autoLoadElements = document.querySelectorAll('[data-auto-load="true"]');
    
    for (const element of autoLoadElements) {
        const snippetId = parseInt(element.dataset.snippetId, 10);
        const snippet = codeSnippets.find(s => s.id === snippetId || s.id == snippetId);
        
        if (snippet && !snippet.fileUrl) {
            // Load the URL in background
            loadFileUrl(snippetId);
        }
    }
}

// Event delegation for buttons
codeList.addEventListener('click', async function(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const action = button.dataset.action;
    // Keep ID as string first, then try to match
    const idStr = button.dataset.id;
    const idNum = parseInt(idStr, 10);
    
    // Find snippet with either string or number comparison
    let snippet = codeSnippets.find(s => s.id == idStr || s.id === idNum);
    
    if (action === 'delete') {
        await deleteCode(snippet ? snippet.id : idNum);
    } else if (action === 'copy') {
        if (snippet) {
            copyToClipboard(snippet.id, button);
        }
    } else if (action === 'download') {
        if (snippet) {
            downloadFile(snippet.id);
        }
    } else if (action === 'unlock') {
        unlockContent(snippet ? snippet.id : idNum);
    } else if (action === 'lock') {
        lockContent(snippet ? snippet.id : idNum);
    }
});

// Load file URL from Supabase Storage
async function loadFileUrl(snippetId) {
    try {
        const response = await fetch(`/.netlify/functions/get-data?id=${snippetId}&getUrl=true`);
        if (!response.ok) {
            throw new Error('Failed to get file URL');
        }
        
        const data = await response.json();
        
        // Update snippet in local array with file URL
        const index = codeSnippets.findIndex(s => s.id === snippetId);
        if (index !== -1 && data.fileUrl) {
            codeSnippets[index].fileUrl = data.fileUrl;
            renderCodeList();
        }
    } catch (error) {
        console.error('Failed to load file URL:', error);
        alert('❌ Failed to load file. Please try again.');
        renderCodeList(); // Re-render to reset button
    }
}

// Highlight matching text in search results
function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape for JavaScript string
function escapeForJS(text) {
    return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ===== Hide Content Feature =====

// Unlock content (called when clicking on protected content)
async function unlockContent(id) {
    const snippet = codeSnippets.find(s => s.id == id);
    if (!snippet) return;
    
    const enteredPassword = prompt('🔒 Enter password to view content:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        alert('❌ Incorrect password! Content remains hidden.');
        return;
    }
    
    // Try to decrypt the content (server-side)
    if (snippet.isEncrypted) {
        let rawContent = snippet.content || snippet.code || '';
        
        // If content is empty and it's an encrypted file in storage
        if (!rawContent && snippet.storagePath) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
            loadingDiv.textContent = '📥 Downloading encrypted file...';
            document.body.appendChild(loadingDiv);
            
            try {
                // Fetch encrypted file content from storage
                const response = await fetch(`/.netlify/functions/get-data?id=${snippet.id}&getContent=true`);
                if (!response.ok) {
                    loadingDiv.remove();
                    const err = await response.json();
                    alert('❌ Failed to download encrypted file: ' + (err.error || 'Unknown error'));
                    return;
                }
                
                const data = await response.json();
                rawContent = data.content;
                
                if (!rawContent) {
                    loadingDiv.remove();
                    alert('❌ No encrypted content found in file');
                    return;
                }
                
                loadingDiv.textContent = '🔓 Decrypting...';
                
                // Decrypt the file content
                const decrypted = await decryptContent(rawContent, enteredPassword);
                
                loadingDiv.remove();
                
                if (!decrypted) {
                    alert('❌ Failed to decrypt file! Incorrect password or corrupted data.');
                    return;
                }
                
                // Cache the decrypted content (this is now base64 of the original file)
                decryptedContent.set(id, decrypted);
                unlockedSnippets.add(id);
                renderCodeList();
                return;
            } catch (e) {
                loadingDiv.remove();
                console.error('Failed to load/decrypt file:', e);
                alert('❌ Failed to load encrypted file: ' + e.message);
                return;
            }
        }
        
        // Text content - decrypt normally
        if (rawContent) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
            loadingDiv.textContent = '🔓 Decrypting...';
            document.body.appendChild(loadingDiv);
            
            const decrypted = await decryptContent(rawContent, enteredPassword);
            
            loadingDiv.remove();
            
            if (!decrypted) {
                alert('❌ Failed to decrypt! Content remains hidden.');
                return;
            }
            // Cache the decrypted content
            decryptedContent.set(id, decrypted);
        }
    }
    
    // Unlock this snippet for this session
    unlockedSnippets.add(id);
    renderCodeList();
}

// Lock content (hide again)
function lockContent(id) {
    // Remove from unlocked set to hide it again
    unlockedSnippets.delete(id);
    // Clear decrypted cache
    decryptedContent.delete(id);
    renderCodeList();
}

// Initial render
renderCodeList();

// ===== Database Storage Functions =====

// ===== Database Storage Functions =====

let isSaving = false;
let saveQueue = [];

// Save to database only
async function saveToDatabaseJSON() {
    // If already saving, wait for it to finish then save again
    if (isSaving) {
        return new Promise((resolve, reject) => {
            saveQueue.push({ resolve, reject });
        });
    }
    
    isSaving = true;
    
    try {
        const response = await fetch('/.netlify/functions/save-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(codeSnippets)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save data: ${errorText}`);
        }
        
        // Process queued saves
        if (saveQueue.length > 0) {
            const queued = saveQueue.slice();
            saveQueue = [];
            isSaving = false;
            
            // Save again with the latest data
            try {
                await saveToDatabaseJSON();
                queued.forEach(q => q.resolve());
            } catch (error) {
                queued.forEach(q => q.reject(error));
            }
        }
    } catch (error) {
        alert('⚠️ Failed to save data to database. Please try again.');
        throw error;
    } finally {
        isSaving = false;
    }
}

// Load from database only
async function loadFromDatabaseJSON() {
    try {
        const response = await fetch('/.netlify/functions/get-data');
        
        if (response.ok) {
            const data = await response.json();
            
            // Handle paginated response
            let snippetsArray = [];
            if (data.snippets) {
                snippetsArray = data.snippets;
            } else if (Array.isArray(data)) {
                snippetsArray = data;
            }
            
            if (snippetsArray.length > 0) {
                // Normalize IDs to numbers to ensure consistency
                codeSnippets = snippetsArray.map(snippet => ({
                    ...snippet,
                    id: typeof snippet.id === 'string' ? parseInt(snippet.id, 10) : snippet.id
                }));
            }
        }
    } catch (error) {
        alert('⚠️ Failed to load data from database. Please check your connection.');
    }
}

// Initialize the app
async function initializeApp() {
    await loadFromDatabaseJSON();
    renderCodeList();
    startAutoUpdate();
}

// ===== Auto-Update Functions =====

// Generate a simple hash from snippets for change detection
function generateDataHash(snippets) {
    const str = JSON.stringify(snippets.map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp })));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// Check for updates from server
async function checkForUpdates() {
    try {
        const response = await fetch('/.netlify/functions/get-data');
        
        if (response.ok) {
            const data = await response.json();
            
            // Handle paginated response
            let snippetsArray = [];
            if (data.snippets) {
                snippetsArray = data.snippets;
            } else if (Array.isArray(data)) {
                snippetsArray = data;
            }
            
            // Normalize IDs to numbers
            const normalizedData = snippetsArray.map(snippet => ({
                ...snippet,
                id: typeof snippet.id === 'string' ? parseInt(snippet.id, 10) : snippet.id
            }));
            
            // Calculate hash of new data
            const newHash = generateDataHash(normalizedData);
            
            // Check if data has changed
            if (lastUpdateHash !== null && newHash !== lastUpdateHash) {
                // Data has changed - update the UI
                const oldLength = codeSnippets.length;
                const change = normalizedData.length - oldLength;
                
                codeSnippets = normalizedData;
                lastUpdateHash = newHash;
                renderCodeList();
                
                // Show notification only if there's a meaningful change
                if (change !== 0) {
                    showUpdateNotification(change);
                }
            } else if (lastUpdateHash === null) {
                // First check, just store the hash
                lastUpdateHash = newHash;
            }
        }
    } catch (error) {
        // Silently fail - don't disrupt user experience
        console.error('Auto-update check failed:', error);
    }
}

// Show a subtle notification when data updates
function showUpdateNotification(change) {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    
    let message = '🔄 Data updated';
    if (change > 0) {
        message += ` (+${change} new)`;
    } else if (change < 0) {
        message += ` (${Math.abs(change)} removed)`;
    }
    
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notificationDiv.style.opacity = '0';
        notificationDiv.style.transform = 'translateX(400px)';
        notificationDiv.style.transition = 'all 0.3s ease-out';
        setTimeout(() => {
            notificationDiv.remove();
            style.remove();
        }, 300);
    }, 3000);
}

// Start automatic updates
function startAutoUpdate(intervalMs = 5000) {
    // Clear any existing interval
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
    // Set initial hash
    lastUpdateHash = generateDataHash(codeSnippets);
    
    // Start checking for updates every intervalMs (default: 5 seconds)
    autoUpdateInterval = setInterval(checkForUpdates, intervalMs);
    
    // Update indicator
    updateIndicatorStatus(true);
    
    console.log(`Auto-update started (checking every ${intervalMs / 1000}s)`);
}

// Stop automatic updates (useful for testing or manual control)
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        
        // Update indicator
        updateIndicatorStatus(false);
        
        console.log('Auto-update stopped');
    }
}

// Update the indicator status
function updateIndicatorStatus(isActive) {
    const indicator = document.getElementById('autoUpdateIndicator');
    if (!indicator) return;
    
    const dot = indicator.querySelector('.pulse-dot');
    const text = indicator.querySelector('.indicator-text');
    
    if (isActive) {
        dot.style.background = '#4CAF50';
        text.textContent = 'Live';
        indicator.title = 'Auto-update is active';
    } else {
        dot.style.background = '#FF9800';
        text.textContent = 'Paused';
        indicator.title = 'Auto-update is paused';
    }
}

// Pause auto-update when user is actively editing
let userActivityTimeout = null;
function pauseAutoUpdateTemporarily() {
    stopAutoUpdate();
    clearTimeout(userActivityTimeout);
    userActivityTimeout = setTimeout(() => {
        startAutoUpdate();
    }, 10000); // Resume after 10 seconds of inactivity
}

// Make functions available globally for manual control via console
window.codeManagerControls = {
    startAutoUpdate,
    stopAutoUpdate,
    checkForUpdates,
    getCurrentInterval: () => autoUpdateInterval ? 'Active' : 'Paused',
    setUpdateInterval: (seconds) => {
        stopAutoUpdate();
        startAutoUpdate(seconds * 1000);
    }
};