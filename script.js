// Code snippets storage
let codeSnippets = [];
let githubToken = '';
let gistId = '';
let isSyncing = false;
let autoSyncEnabled = true;
let isNetlifyDeployment = false;

// Hide content feature variables
let unlockedSnippets = new Set(); // Track which snippets are unlocked in this session

// DOM elements
const searchInput = document.getElementById('searchInput');
const passwordInput = document.getElementById('passwordInput');
const titleInput = document.getElementById('titleInput');
const codeInput = document.getElementById('codeInput');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');
const hideContentToggle = document.getElementById('hideContentToggle');

// Initialize app
initializeApp();

// Add event listener for Add button
addBtn.addEventListener('click', addCode);

// Add event listener for search input
searchInput.addEventListener('input', renderCodeList);

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
function addCode() {
    const password = passwordInput.value.trim();
    const title = titleInput.value.trim();
    const code = codeInput.value.trim();
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
    
    if (code === '') {
        alert('Please enter some code!');
        codeInput.focus();
        return;
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        code: code,
        password: password,
        timestamp: new Date().toLocaleString(),
        hidden: hideContent,
        protectionPassword: hideContent ? password : null  // Store protection password per snippet
    };
    
    codeSnippets.unshift(snippet);
    passwordInput.value = '';
    titleInput.value = '';
    codeInput.value = '';
    hideContentToggle.checked = false;
    passwordInput.focus();
    
    renderCodeList();
    
    // Auto-sync to GitHub after adding
    if (githubToken && gistId && autoSyncEnabled) {
        autoSyncToGitHub();
    }
}

// Delete code function
function deleteCode(id) {
    const snippet = codeSnippets.find(s => s.id === id);
    if (!snippet) return;
    
    const enteredPassword = prompt('Enter password to delete this snippet:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        alert('Incorrect password! Cannot delete snippet.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this snippet?')) {
        return;
    }
    
    codeSnippets = codeSnippets.filter(snippet => snippet.id !== id);
    renderCodeList();
    
    // Auto-sync to GitHub after deleting
    if (githubToken && gistId && autoSyncEnabled) {
        autoSyncToGitHub();
    }
}

// Copy to clipboard function
function copyToClipboard(id, code, button) {
    const snippet = codeSnippets.find(s => s.id === id);
    
    // Check if snippet is hidden and not unlocked
    if (snippet && snippet.hidden && !unlockedSnippets.has(id)) {
        const enteredPassword = prompt('Enter password to copy:');
        
        if (enteredPassword === null) {
            return; // User cancelled
        }
        
        if (enteredPassword !== snippet.protectionPassword) {
            alert('Incorrect password! Cannot copy content.');
            return;
        }
        
        // Password correct, proceed with copying (but don't unlock the view)
    }
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Render code list
function renderCodeList() {
    if (codeSnippets.length === 0) {
        codeList.innerHTML = '<div class="empty-state">No code snippets yet. Add your first snippet above!</div>';
        return;
    }
    
    // Get search query
    const searchQuery = searchInput.value.trim().toLowerCase();
    
    // Filter snippets based on search query
    const filteredSnippets = searchQuery === '' 
        ? codeSnippets 
        : codeSnippets.filter(snippet => 
            snippet.title.toLowerCase().includes(searchQuery)
          );
    
    // Check if no results found
    if (filteredSnippets.length === 0) {
        codeList.innerHTML = '<div class="no-results">No snippets found matching your search.</div>';
        return;
    }
    
    codeList.innerHTML = filteredSnippets.map(snippet => {
        // Highlight search term in title
        const highlightedTitle = searchQuery === ''
            ? escapeHtml(snippet.title)
            : highlightText(escapeHtml(snippet.title), searchQuery);
        
        // Determine if content should be protected
        const isProtected = snippet.hidden && !unlockedSnippets.has(snippet.id);
        const contentClass = isProtected ? 'code-content protected' : 'code-content';
        
        // Create eye button for hidden content (both locked and unlocked)
        let eyeButton = '';
        if (snippet.hidden) {
            if (isProtected) {
                // Locked - show closed eye
                eyeButton = `<button class="eye-unlock-btn" onclick="unlockContent(${snippet.id})">
                    <span class="eye-text">Unlock</span>
                </button>`;
            } else {
                // Unlocked - show open eye to hide again
                eyeButton = `<button class="eye-unlock-btn" onclick="lockContent(${snippet.id})">
                    <span class="eye-text">Hide</span>
                </button>`;
            }
        }
        
        return `
            <div class="code-item">
                <div class="code-title">${highlightedTitle}</div>
                <div class="timestamp">Added: ${snippet.timestamp}</div>
                <div class="code-content-wrapper">
                    ${eyeButton}
                    <div class="${contentClass}">${escapeHtml(snippet.code)}</div>
                </div>
                <div class="code-actions">
                    <button class="btn btn-copy" onclick="copyToClipboard(${snippet.id}, \`${escapeForJS(snippet.code)}\`, this)">
                        📋 Copy to Clipboard
                    </button>
                    <button class="btn btn-delete" onclick="deleteCode(${snippet.id})">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
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
function unlockContent(id) {
    const snippet = codeSnippets.find(s => s.id === id);
    if (!snippet) return;
    
    const enteredPassword = prompt('Enter password to view content:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.protectionPassword) {
        alert('Incorrect password! Content remains hidden.');
        return;
    }
    
    // Unlock this snippet for this session
    unlockedSnippets.add(id);
    renderCodeList();
}

// Lock content (hide again)
function lockContent(id) {
    // Remove from unlocked set to hide it again
    unlockedSnippets.delete(id);
    renderCodeList();
}

// Initial render
renderCodeList();

// ===== GitHub Gist Functions =====

// Initialize the app
async function initializeApp() {
    // Check if running on Netlify
    if (window.location.hostname.includes('netlify.app') || 
        window.location.hostname.includes('.netlify.app')) {
        isNetlifyDeployment = true;
        await loadTokenFromNetlify();
    } else {
        loadGitHubConfig();
    }
}

// Load token from Netlify function
async function loadTokenFromNetlify() {
    try {
        const response = await fetch('/.netlify/functions/get-token');
        
        if (!response.ok) {
            throw new Error('Token not configured in Netlify');
        }
        
        const data = await response.json();
        
        if (data.success && data.token) {
            githubToken = data.token;
            // Also load gistId from localStorage if exists
            gistId = localStorage.getItem('gistId') || '';
            
            // Load or create gist
            await loadOrCreateGist();
        } else {
            throw new Error('Invalid token response');
        }
    } catch (error) {
        console.error('Error loading token from Netlify:', error);
        console.error('⚠️ GitHub token not configured in Netlify');
    }
}

function loadGitHubConfig() {
    try {
        githubToken = localStorage.getItem('githubToken') || '';
        gistId = localStorage.getItem('gistId') || '';
    } catch (error) {
        console.error('Error loading GitHub config:', error);
    }
}

// Auto-sync function (silent, no alerts)
async function autoSyncToGitHub() {
    if (!githubToken || !gistId || isSyncing) {
        return;
    }
    
    isSyncing = true;
    
    try {
        await updateGist();
    } catch (error) {
        console.error('Auto-sync error:', error);
    } finally {
        isSyncing = false;
    }
}

async function createGist() {
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            description: 'Code Manager - My Code Snippets',
            public: false,
            files: {
                'code-snippets.json': {
                    content: JSON.stringify(codeSnippets, null, 2)
                }
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create gist');
    }
    
    const data = await response.json();
    gistId = data.id;
    localStorage.setItem('gistId', gistId);
}

async function updateGist() {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            files: {
                'code-snippets.json': {
                    content: JSON.stringify(codeSnippets, null, 2)
                }
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update gist');
    }
}

async function loadFromGist() {
    if (!githubToken || !gistId) return false;
    
    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load from gist');
        }
        
        const data = await response.json();
        const content = data.files['code-snippets.json'].content;
        const cloudSnippets = JSON.parse(content);
        
        codeSnippets = cloudSnippets;
        renderCodeList();
        
        return true;
    } catch (error) {
        console.error('Error loading from gist:', error);
        return false;
    }
}

async function loadOrCreateGist() {
    // Try to find existing gist
    try {
        const response = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const gists = await response.json();
            const existingGist = gists.find(g => 
                g.description === 'Code Manager - My Code Snippets' && 
                g.files['code-snippets.json']
            );
            
            if (existingGist) {
                gistId = existingGist.id;
                localStorage.setItem('gistId', gistId);
                await loadFromGist();
                return;
            }
        }
    } catch (error) {
        console.error('Error checking existing gists:', error);
    }
    
    // Create new gist if none exists
    try {
        await createGist();
    } catch (error) {
        console.error('Error creating gist:', error);
        console.error('❌ Failed to setup - Try again');
    }
}

// Load from GitHub on startup if configured
if (githubToken && gistId) {
    loadFromGist().then(success => {
        if (!success) {
            renderCodeList();
        }
    });
} else if (githubToken && !gistId) {
    loadOrCreateGist();
} else {
    renderCodeList();
}